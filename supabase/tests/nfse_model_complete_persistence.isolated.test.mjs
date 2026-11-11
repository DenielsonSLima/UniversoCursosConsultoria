import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { createDatabase, applyExpanded, client, clone, definition, ibsDefinition, documentRule, fixed, id } from './nfse_model_complete_presets.fixture.mjs';
const invalid = (promise, code = '22023') => assert.rejects(promise, (e) => e.code === code);

test('model save protects historical intent while adding complete scoped pre-model groups', async (t) => {
  const db = await createDatabase(false); const c = client(db);
  const legacy = clone(definition); delete legacy.additionalOptions; delete legacy.valuesOptions;
  const historical = await c.save(legacy, 40); await applyExpanded(db);
  const counts = async () => (await db.query('SELECT count(*)::integer models FROM private.nfse_models')).rows[0].models;
  let saved; let live;
  try {
    await t.test('historical requests replay byte-equivalent responses without fabricated objects', async () => {
      assert.deepEqual(await c.save(legacy, 40), historical);
      const row = (await c.get()).find((r) => r.id === historical.data.id);
      assert.equal('additionalOptions' in row, false); assert.equal('valuesOptions' in row, false);
    });
    await t.test('new complete inactive models save and reopen; only scoped labels are enriched on read', async () => {
      live = ibsDefinition(); live.peopleOptions.issuerRole = 'RECIPIENT';
      live.additionalOptions.people.providerPartner = fixed(id(30)); live.additionalOptions.people.providerLocation = 'BRASIL';
      live.additionalOptions.people.emissionReason = '1';
      const rule = { ...documentRule(), supplierSource: 'FIXED_PARTNER', supplierPartnerId: id(31) };
      live.valuesOptions.deduction = { mode: 'DOCUMENTS', value: null, documents: [rule] };
      live.valuesOptions.ibscbs.reimbursementDocuments = [{ ...rule, categoryCode: '101' }];
      saved = await c.save(live, 50);
      const row = (await c.get()).find((r) => r.id === saved.data.id);
      assert.equal(row.active, false); assert.equal(row.additionalOptions.people.providerPartnerLabel, 'PARCEIRO LOCAL SINTÉTICO');
      assert.equal(row.valuesOptions.deduction.documents[0].supplierPartnerLabel, 'PARCEIRO GLOBAL SINTÉTICO');
      assert.equal(row.valuesOptions.ibscbs.reimbursementDocuments[0].supplierPartnerLabel, 'PARCEIRO GLOBAL SINTÉTICO');
      const stored = (await db.query('SELECT definition FROM private.nfse_models WHERE id=$1', [saved.data.id])).rows[0].definition;
      assert.deepEqual(stored, live); assert.equal(JSON.stringify(stored).includes('PartnerLabel'), false);
      for (const field of ['additionalOptions', 'valuesOptions', 'peopleOptions', 'serviceOptions']) {
        const erased = clone(live); delete erased[field]; await invalid(c.save(erased, 70, saved.data.id, 1), '40001');
      }
      const labels = clone(live); labels.additionalOptions.people.providerPartnerLabel = 'NOME INJETADO';
      await invalid(c.save(labels, 71));
    });
    await t.test('expired catalogs and changed/inactive partners do not break GET or replay; new writes revalidate', async () => {
      await db.exec(`UPDATE public.parceiros SET status='inativo' WHERE id='${id(31)}';
        UPDATE public.parceiros SET polo_id='${id(2)}' WHERE id='${id(30)}';
        UPDATE private.nfse_fiscal_classifications SET definition=definition||'{"validUntil":"2025-01-01"}' WHERE code='000001';`);
      const row = (await c.get()).find((r) => r.id === saved.data.id);
      assert.equal(row.additionalOptions.people.providerPartnerLabel, null);
      assert.equal(row.valuesOptions.deduction.documents[0].supplierPartnerLabel, null);
      assert.equal(row.valuesOptions.ibscbs.classificationCode, '000001');
      assert.deepEqual(await c.save(live, 50), saved); await invalid(c.save(live, 51));
      await db.exec(`UPDATE public.parceiros SET status='ativo' WHERE id='${id(31)}';
        UPDATE public.parceiros SET polo_id='${id(1)}' WHERE id='${id(30)}';`);
      await invalid(c.save(live, 51));
      await db.exec("UPDATE private.nfse_fiscal_classifications SET definition=definition||'{\"validUntil\":null}' WHERE code='000001'");
    });
    await t.test('catalog existence is authoritative for new service, NBS and operation codes without guessed correlation', async () => {
      for (const changes of [{ nationalServiceCode: '999998' }, { nbsCode: '999999998' }, { operationIndicatorCode: '010101' }]) {
        await invalid(c.save({ ...live, ...changes }, 80));
      }
      const codes = clone(definition); codes.valuesOptions.iss.benefitId = '00000000000000'; await invalid(c.save(codes, 81));
      codes.valuesOptions.iss.benefitId = null; codes.additionalOptions.service.municipalServiceCode = fixed('123');
      await invalid(c.save(codes, 82));
    });
    await t.test('explicit payload and rule limits admit legitimate models above32k and reject above1MiB', async () => {
      const large = clone(definition); const rule = { ...documentRule(), categoryDescription: 'X'.repeat(150), documentDescription: 'Y'.repeat(255) };
      large.valuesOptions.deduction = { mode: 'DOCUMENTS', value: null, documents: Array.from({ length: 1000 }, () => rule) };
      assert.ok(Buffer.byteLength(JSON.stringify(large)) > 32000);
      const before = await counts(); await c.save(large, 90); assert.equal(await counts(), before + 1);
      const oversized = ibsDefinition(); oversized.valuesOptions.deduction = large.valuesOptions.deduction;
      oversized.valuesOptions.ibscbs.reimbursementDocuments = Array.from({ length: 1000 }, () => ({ ...rule, categoryCode: '101' }));
      assert.ok(Buffer.byteLength(JSON.stringify(oversized)) > 1048576); await invalid(c.save(oversized, 91));
      assert.equal(await counts(), before + 1);
    });
    await t.test('authorization still precedes replay, and divergent request IDs do not create extra models', async () => {
      const before = await counts(); await invalid(c.save({ ...live, name: 'DIVERGENTE' }, 50));
      await db.exec('UPDATE public.test_context SET allowed=false'); await invalid(c.save(live, 50), '42501');
      await invalid(c.get(), '42501'); assert.equal(await counts(), before);
      assert.deepEqual((await db.query("SELECT tablename FROM pg_tables WHERE schemaname='private' AND tablename LIKE '%nfse%' ORDER BY tablename")).rows
        .map((r) => r.tablename), ['nfse_configuration_requests', 'nfse_configurations', 'nfse_currency_catalog',
          'nfse_fiscal_catalog_releases', 'nfse_fiscal_classifications', 'nfse_fiscal_credits', 'nfse_model_requests',
          'nfse_models', 'nfse_service_code_catalog']);
    });
  } finally { await db.close(); }
});
