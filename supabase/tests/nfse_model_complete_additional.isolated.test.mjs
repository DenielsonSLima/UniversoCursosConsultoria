import assert from 'node:assert/strict';
import test from 'node:test';
import { createDatabase, client, clone, definition, additionalOptions, ibsDefinition, fixed, deferred, id } from './nfse_model_complete_presets.fixture.mjs';
const invalid = (promise) => assert.rejects(promise, (e) => e.code === '22023');
const key = '0'.repeat(6) + 'A'.repeat(14) + '0'.repeat(30);
const address = { postalCode: '00000000', street: 'RUA SINTÉTICA', number: '1', complement: null,
  district: 'BAIRRO SINTÉTICO', city: null, stateProvince: null };
const comex = () => ({ provisionMode: '1', relationship: '0', currencyCode: '220', serviceAmount: deferred(),
  providerSupport: '01', recipientSupport: '01', temporaryGoods: '1', importDeclaration: null, exportRegistration: null, shareWithMdic: false });

test('additional People and Service choices obey the Web scenario without copying participants', async (t) => {
  const db = await createDatabase(); const c = client(db);
  try {
    await t.test('complete nullable defaults work but unknown fields and inactive NIF/people branches do not', async () => {
      assert.deepEqual(await c.additional(), additionalOptions);
      for (const field of ['cpf', 'cnpj', 'name', 'providerPartnerLabel']) {
        const value = clone(additionalOptions); value.people[field] = 'SYNTHETIC'; await invalid(c.additional(value));
      }
      const value = clone(additionalOptions); value.people.personalUse = true; await invalid(c.additional(value));
      value.people.personalUse = null; value.people.nif.recipient = { policy: 'WITHOUT_NIF', absenceReason: '1' };
      await invalid(c.additional(value));
    });
    await t.test('recipient/intermediary issuers require an authorized provider strategy, location and emission reason', async () => {
      const value = clone(additionalOptions); const model = clone(definition); model.peopleOptions.issuerRole = 'RECIPIENT';
      await invalid(c.additional(value, model)); value.people.providerPartner = fixed(id(30));
      value.people.providerLocation = 'BRASIL'; value.people.emissionReason = '1';
      assert.equal((await c.additional(value, model)).people.providerPartner.value, id(30));
      for (const partner of [32, 33, 34, 99]) {
        value.people.providerPartner = fixed(id(partner)); await invalid(c.additional(value, model));
      }
      value.people.providerPartner = deferred(); value.people.providerLocation = 'FROM_PARTNER';
      assert.equal((await c.additional(value, model)).service.foreignTrade, null);
      value.people.emissionReason = '4'; await invalid(c.additional(value, model));
      value.people.rejectedInvoiceReference = fixed(key);
      assert.equal((await c.additional(value, model)).people.rejectedInvoiceReference.value, key);
      value.people.rejectedInvoiceReference.value = '0'.repeat(49); await invalid(c.additional(value, model));
    });
    await t.test('foreign trade requires explicit known foreign facts, NIF policy and a catalog currency', async () => {
      const value = clone(additionalOptions); const model = clone(definition); model.peopleOptions.recipientLocation = 'EXTERIOR';
      await invalid(c.additional(value, model)); value.people.nif.recipient = { policy: 'FROM_PARTNER', absenceReason: null };
      await invalid(c.additional(value, model)); value.service.foreignTrade = comex();
      assert.equal((await c.additional(value, model)).service.foreignTrade.currencyCode, '220');
      value.service.foreignTrade.currencyCode = '000'; await invalid(c.additional(value, model));
      value.service.foreignTrade.currencyCode = '220'; value.service.foreignTrade.temporaryGoods = '2';
      await invalid(c.additional(value, model)); value.service.foreignTrade.importDeclaration = deferred();
      assert.equal((await c.additional(value, model)).service.foreignTrade.temporaryGoods, '2');
      value.service.foreignTrade.exportRegistration = deferred(); await invalid(c.additional(value, model));
      value.service.foreignTrade.exportRegistration = null; value.service.foreignTrade.providerSupport = '00'; await invalid(c.additional(value, model));
    });
    await t.test('construction and event rules follow the selected service and validate fixed dates/addresses', async () => {
      const value = clone(additionalOptions); const model = clone(definition); model.nationalServiceCode = '070201';
      await invalid(c.additional(value, model)); value.service.construction = deferred();
      assert.equal((await c.additional(value, model)).service.construction.source, 'AT_ISSUANCE');
      value.service.construction = fixed({ propertyTaxRegistration: null,
        identification: { kind: 'ADDRESS', workCode: null, cib: null, address } });
      assert.equal((await c.additional(value, model)).service.construction.value.identification.kind, 'ADDRESS');
      value.service.construction.value.identification.address = { ...address, district: null }; await invalid(c.additional(value, model));
      value.service.construction = null; model.nationalServiceCode = '120101'; await invalid(c.additional(value, model));
      value.service.event = fixed({ description: 'EVENTO SINTÉTICO', startDate: '2026-01-02', endDate: '2026-01-01',
        identification: { kind: 'MUNICIPAL_ID', municipalId: 'SYNTHETIC', address: null } });
      await invalid(c.additional(value, model)); value.service.event.value.endDate = '2026-01-03';
      assert.equal((await c.additional(value, model)).service.event.value.endDate, '2026-01-03');
      value.service.event.value.startDate = '2026-02-31'; await invalid(c.additional(value, model));
    });
    await t.test('property uses one Web unit and rejects original-due-date, multiunit and movable-asset API groups', async () => {
      const value = clone(additionalOptions); const model = ibsDefinition(); model.operationIndicatorCode = '020101';
      await invalid(c.additional(value, model));
      const unit = { unitKey: id(70), propertyTaxRegistration: null, identification: { kind: 'CIB', cib: 'ABCDEFG1', address: null } };
      value.service.property = { municipality: fixed('3550308'), units: fixed([unit]), originalDueDate: null };
      assert.equal((await c.additional(value, model)).service.property.units.value.length, 1);
      value.service.property.units.value.push({ ...unit, unitKey: id(71) }); await invalid(c.additional(value, model));
      value.service.property.units = deferred(); value.service.property.originalDueDate = deferred(); await invalid(c.additional(value, model));
      value.service.property.originalDueDate = null; value.service.rentedMovableAssets = deferred(); await invalid(c.additional(value, model));
    });
    await t.test('previous-invoice references and order items obey their own list and text limits', async () => {
      const value = clone(additionalOptions); const model = ibsDefinition(); model.serviceOptions.operationType = '2';
      await invalid(c.additional(value, model)); value.service.operationReferences = fixed([key]);
      assert.equal((await c.additional(value, model)).service.operationReferences.value[0], key);
      value.service.operationReferences.value.push(key); await invalid(c.additional(value, model));
      value.service.operationReferences = deferred(); value.service.orderItems = fixed(Array.from({ length: 99 }, () => 'ITEM SINTÉTICO'));
      assert.equal((await c.additional(value, model)).service.orderItems.value.length, 99);
      value.service.orderItems.value.push('EXCESSO'); await invalid(c.additional(value, model));
    });
    await t.test('municipal codes cannot bypass the missing authorized municipal catalog', async () => {
      const value = clone(additionalOptions); value.service.municipalServiceCode = fixed('123');
      await invalid(c.additional(value)); value.service.municipalServiceCode = deferred();
      assert.equal((await c.additional(value)).service.municipalServiceCode.source, 'AT_ISSUANCE');
      const model = clone(definition); model.peopleOptions.simpleNationalOption = '2'; model.peopleOptions.simpleNationalAssessment = null;
      await invalid(c.additional(value, model));
    });
  } finally { await db.close(); }
});
