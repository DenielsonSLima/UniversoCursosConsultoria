import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createDatabase, client, clone, definition, ibsDefinition, documentRule, fixed, deferred, id } from './nfse_model_complete_presets.fixture.mjs';
const migrations = ['20261110223449_nfse_model_people_operation_sources.sql',
  '20261110223451_nfse_model_operation_additional_rules.sql', '20261110223454_nfse_model_operation_values_rules.sql',
  '20261110223456_nfse_model_operation_presets_save.sql'];
const inheritedNif = () => ({ policy: 'FROM_PARTNER', absenceReason: null });
const v2 = (source = definition) => {
  const value = clone(source), old = value.peopleOptions;
  value.peopleOptions = { version: 2, competenceMode: old.competenceMode, competenceDate: old.competenceDate,
    dpsSeriesMode: old.dpsSeriesMode, dpsSeries: old.dpsSeries, issuerRole: old.issuerRole,
    simpleNationalOption: old.simpleNationalOption, simpleNationalAssessment: old.simpleNationalAssessment,
    recipientSource: 'AT_ISSUANCE', recipientAddressSource: 'FROM_PARTNER', recipientIsDestination: old.recipientIsDestination,
    destinationSource: old.recipientIsDestination === false ? 'AT_ISSUANCE' : null, intermediarySource: 'NONE' };
  value.additionalOptions.people.nif.recipient = inheritedNif();
  return value;
};
const comex = () => ({ provisionMode: '1', relationship: '0', currencyCode: '220', serviceAmount: deferred(),
  providerSupport: '01', recipientSupport: '01', temporaryGoods: '1', importDeclaration: null, exportRegistration: null, shareWithMdic: false });
const invalid = (promise, code = '22023') => assert.rejects(promise, (error) => error.code === code);

test('operation-source pre-models preserve v1 history while rejecting fixed parties and per-note references on new writes', async (t) => {
  const db = await createDatabase(); const c = client(db);
  const old = ibsDefinition(); old.peopleOptions.issuerRole = 'RECIPIENT';
  old.additionalOptions.people.providerPartner = fixed(id(30)); old.additionalOptions.people.providerLocation = 'BRASIL';
  old.additionalOptions.people.emissionReason = '1';
  old.valuesOptions.deduction = { mode: 'DOCUMENTS', value: null, documents: [{ ...documentRule(),
    supplierSource: 'FIXED_PARTNER', supplierPartnerId: id(31) }] };
  const historical = await c.save(old, 40);
  const oldRead = (await c.get()).find((r) => r.id === historical.data.id);
  for (const name of migrations) await db.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
  try {
    await t.test('historical GET and request replay retain their exact old shape and labels', async () => {
      assert.deepEqual((await c.get()).find((r) => r.id === historical.data.id), oldRead);
      assert.deepEqual(await c.save(old, 40), historical);
      await invalid(c.save(old, 41));
      await invalid(c.save(old, 42, historical.data.id, 1));
      const absent = clone(definition); delete absent.peopleOptions; await invalid(c.save(absent, 43));
      const basic = clone(definition);
      for (const field of ['peopleOptions', 'additionalOptions', 'valuesOptions', 'serviceOptions']) delete basic[field];
      assert.equal((await c.save(basic, 44)).data.version, 1); // Production's published basic form stays compatible.
    });
    await t.test('new models persist only v2 people strategies and GET adds no participant labels to Peoplev2', async () => {
      const value = v2(); const saved = await c.save(value, 50);
      const row = (await c.get()).find((r) => r.id === saved.data.id);
      assert.deepEqual(row.peopleOptions, value.peopleOptions);
      for (const key of ['recipientLocation', 'recipientIncludeAddress', 'destinationPartnerId', 'intermediaryPartnerId',
        'destinationPartnerLabel', 'intermediaryPartnerLabel', 'name', 'cnpj', 'address']) assert.equal(key in row.peopleOptions, false);
      const stored = (await db.query('SELECT definition FROM private.nfse_models WHERE id=$1', [saved.data.id])).rows[0].definition;
      assert.deepEqual(stored, value); assert.equal(JSON.stringify(stored).includes(id(30)), false);
      assert.equal(JSON.stringify(stored).includes(id(31)), false);
      assert.deepEqual(await c.save(value, 50), saved);
      const loss = clone(value); delete loss.peopleOptions; await invalid(c.save(loss, 51, saved.data.id, 1), '40001');
    });
    await t.test('participant identities, locations, address data and invalid strategy enums cannot be reintroduced', async () => {
      for (const changes of [{ recipientLocation: 'BRASIL' }, { recipientAddress: 'SYNTHETIC' },
        { destinationPartnerId: id(30) }, { intermediaryPartnerId: id(31) }, { recipientSource: 'FIXED' }]) {
        const value = v2(); Object.assign(value.peopleOptions, changes); await invalid(c.save(value, 60));
      }
      const value = v2(ibsDefinition()); value.peopleOptions.recipientIsDestination = false;
      await invalid(c.save(value, 61)); value.peopleOptions.destinationSource = 'AT_ISSUANCE';
      value.additionalOptions.people.destinationLocation = 'FROM_PARTNER';
      value.additionalOptions.people.nif.destination = inheritedNif();
      assert.equal((await c.save(value, 61)).data.version, 1);
    });
    await t.test('third-party providers and rejected invoice references are always resolved at issuance', async () => {
      const value = v2(); value.peopleOptions.issuerRole = 'RECIPIENT';
      value.additionalOptions.people.providerPartner = deferred(); value.additionalOptions.people.providerLocation = 'FROM_PARTNER';
      value.additionalOptions.people.emissionReason = '4'; value.additionalOptions.people.rejectedInvoiceReference = deferred();
      value.additionalOptions.people.nif.provider = inheritedNif();
      assert.equal((await c.save(value, 70)).data.version, 1);
      value.additionalOptions.people.providerPartner = fixed(id(30)); await invalid(c.save(value, 71));
      value.additionalOptions.people.providerPartner = deferred(); value.additionalOptions.people.providerLocation = 'BRASIL'; await invalid(c.save(value, 71));
      value.additionalOptions.people.providerLocation = 'FROM_PARTNER'; value.additionalOptions.people.rejectedInvoiceReference = fixed('0'.repeat(50));
      await invalid(c.save(value, 71));
    });
    await t.test('NIF only inherits registration; no fixed reason or personal absence is stored', async () => {
      const value = v2(); value.additionalOptions.people.nif.recipient = { policy: 'WITHOUT_NIF', absenceReason: '1' };
      await invalid(c.save(value, 80)); value.additionalOptions.people.nif.recipient = { policy: 'FROM_PARTNER', absenceReason: '2' };
      await invalid(c.save(value, 80));
    });
    await t.test('operation references, DI and RE cannot be fixed and unknown party country does not imply domestic or foreign', async () => {
      const value = v2(ibsDefinition()); value.serviceOptions.operationType = '2';
      value.serviceOptions.governmentPurchase = true; value.serviceOptions.governmentEntityType = '1';
      value.additionalOptions.service.operationReferences = deferred();
      assert.equal((await c.save(value, 90)).data.version, 1);
      value.additionalOptions.service.operationReferences = fixed(['0'.repeat(50)]); await invalid(c.save(value, 91));
      value.additionalOptions.service.operationReferences = deferred(); value.additionalOptions.service.foreignTrade = comex();
      assert.equal((await c.save(value, 91)).data.version, 1); // Conditional rule; no party country is guessed.
      value.additionalOptions.service.foreignTrade.temporaryGoods = '2'; value.additionalOptions.service.foreignTrade.importDeclaration = fixed('SYNTHETIC');
      await invalid(c.save(value, 92)); value.additionalOptions.service.foreignTrade.importDeclaration = deferred();
      assert.equal((await c.save(value, 92)).data.version, 1);
      value.additionalOptions.service.foreignTrade.temporaryGoods = '3'; value.additionalOptions.service.foreignTrade.importDeclaration = null;
      value.additionalOptions.service.foreignTrade.exportRegistration = fixed('SYNTHETIC'); await invalid(c.save(value, 93));
    });
    await t.test('government-recipient country is deferred while ISS retention checks operation source strategies', async () => {
      const value = v2(ibsDefinition()); value.serviceOptions.governmentPurchase = true;
      value.serviceOptions.governmentEntityType = '1'; value.serviceOptions.operationType = '1';
      value.valuesOptions.iss.retention = 'RECIPIENT'; assert.equal((await c.save(value, 100)).data.version, 1);
      value.valuesOptions.iss.retention = 'INTERMEDIARY'; await invalid(c.save(value, 101));
      value.peopleOptions.intermediarySource = 'AT_ISSUANCE'; value.additionalOptions.people.nif.intermediary = inheritedNif();
      assert.equal((await c.save(value, 101)).data.version, 1);
    });
    await t.test('document suppliers come from linked documents or are omitted, never from a fixed partner', async () => {
      const value = v2(); value.valuesOptions.deduction = { mode: 'DOCUMENTS', value: null, documents: [documentRule()] };
      assert.equal((await c.save(value, 110)).data.version, 1);
      value.valuesOptions.deduction.documents[0].supplierSource = 'OMIT'; assert.equal((await c.save(value, 111)).data.version, 1);
      value.valuesOptions.deduction.documents[0].supplierSource = 'FIXED_PARTNER'; value.valuesOptions.deduction.documents[0].supplierPartnerId = id(31);
      await invalid(c.save(value, 112)); value.valuesOptions.deduction.documents[0].supplierSource = 'DOCUMENT'; await invalid(c.save(value, 112));
      const ibs = v2(ibsDefinition()); ibs.valuesOptions.ibscbs.reimbursementDocuments = [{ ...documentRule(), categoryCode: '101',
        supplierSource: 'FIXED_PARTNER', supplierPartnerId: id(31) }]; await invalid(c.save(ibs, 113));
    });
    await t.test('a reviewed edit explicitly upgrades v1 strategies without rewriting historical request payloads', async () => {
      const reviewed = v2(old); reviewed.additionalOptions.people.providerPartner = deferred();
      reviewed.additionalOptions.people.providerLocation = 'FROM_PARTNER'; reviewed.additionalOptions.people.nif.provider = inheritedNif();
      reviewed.valuesOptions.deduction.documents[0].supplierSource = 'DOCUMENT';
      reviewed.valuesOptions.deduction.documents[0].supplierPartnerId = null;
      const upgraded = await c.save(reviewed, 115, historical.data.id, 1); assert.equal(upgraded.data.version, 2);
      assert.deepEqual((await c.get()).find((r) => r.id === historical.data.id).peopleOptions, reviewed.peopleOptions);
      assert.deepEqual(await c.save(old, 40), historical);
      const intent = (await db.query('SELECT payload FROM private.nfse_model_requests WHERE actor_id=$1 AND request_id=$2',
        [id(11), id(40)])).rows[0].payload;
      assert.equal(intent.definition.peopleOptions.version, 1);
      assert.equal(intent.definition.additionalOptions.people.providerPartner.value, id(30));
    });
    await t.test('authorization still precedes historical replay and version guards', async () => {
      await db.exec('UPDATE public.test_context SET allowed=false');
      await invalid(c.save(old, 40), '42501'); await invalid(c.save(v2(), 120), '42501'); await invalid(c.get(), '42501');
    });
  } finally { await db.close(); }
});
