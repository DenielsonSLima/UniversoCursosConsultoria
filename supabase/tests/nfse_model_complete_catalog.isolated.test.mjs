import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createDatabase, client, definition, clone, id } from './nfse_model_complete_presets.fixture.mjs';

const json = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
test('private fiscal catalogs retain pinned official domains, flags and both validity intervals', async (t) => {
  const db = await createDatabase();
  try {
    await t.test('SVRS and BCB seed data equal the versioned official source snapshots', async () => {
      const expected = (await Promise.all(Array.from({ length: 10 }, (_, i) => json(
        `../../modules/gestor/emissor-nfse/modelos/catalogs/classifications-${String(i + 1).padStart(2, '0')}.json`)))).flat();
      const actual = (await db.query('SELECT definition FROM private.nfse_fiscal_classifications ORDER BY code')).rows.map((r) => r.definition);
      assert.equal(actual.length, 73); assert.equal(new Set(actual.map((r) => r.cst)).size, 12);
      assert.deepEqual(actual, expected.sort((a, b) => a.classificationCode.localeCompare(b.classificationCode)));
      const credits = (await db.query('SELECT definition FROM private.nfse_fiscal_credits ORDER BY code')).rows.map((r) => r.definition);
      assert.equal(credits.length, 13);
      assert.deepEqual(credits, await json('../../modules/gestor/emissor-nfse/modelos/catalogs/presumed-credits.json'));
      const currencies = (await db.query('SELECT definition FROM private.nfse_currency_catalog ORDER BY code')).rows.map((r) => r.definition);
      const source = await json('../../modules/gestor/emissor-nfse/modelos/catalogos/generated/nfse-additional-domains.json');
      assert.equal(currencies.length, 249); assert.deepEqual(currencies, source.currencies.sort((a, b) => a.code.localeCompare(b.code)));
      const provenance = (await db.query('SELECT provenance FROM private.nfse_fiscal_catalog_releases')).rows[0].provenance;
      assert.equal(provenance.classifications.derivedJsonSha256, '83db57138a1d0c5f87f975d83425e0a802055f51035ddec121cea993107a6b1b');
      assert.equal(provenance.credits.derivedJsonSha256, 'f32d99b1dddcb2ae3dcef65afcc9759b637dc60cb1aa70ed33035d9731c5e30d');
      const mainCodes = await json('../../modules/gestor/emissor-nfse/modelos/catalogos/generated/nfse-fiscal-catalogs.json');
      for (const [kind, key] of [['NATIONAL', 'nationalServices'], ['NBS', 'nbs'], ['OPERATION', 'operationIndicators']]) {
        const seeded = (await db.query('SELECT definition FROM private.nfse_service_code_catalog WHERE kind=$1 ORDER BY code', [kind]))
          .rows.map((r) => r.definition);
        assert.deepEqual(seeded, mainCodes[key].sort((a, b) => a.code.localeCompare(b.code)));
      }
    });
    await t.test('classification validates CST, NFS-e flag and inclusive class/CST validity independently', async () => {
      const check = (date, cst = '000', code = '000001') => db.query('SELECT private.nfse_preset_classification($1,$2,$3)', [cst, code, date]);
      await check('2025-05-05');
      await assert.rejects(check('2025-05-04'), (e) => e.code === '22023');
      await assert.rejects(check('2026-11-10', '200'), (e) => e.code === '22023');
      await db.exec('BEGIN');
      try {
        await db.exec(`UPDATE private.nfse_fiscal_classifications SET definition=definition
          ||' {"cstValidFrom":"2026-01-01","cstValidUntil":"2026-01-31","validFrom":"2026-01-02","validUntil":"2026-01-30"}' WHERE code='000001'`);
        await check('2026-01-02'); await check('2026-01-30');
        for (const date of ['2025-12-31', '2026-01-01', '2026-01-31', '2026-02-01']) {
          await db.exec('SAVEPOINT check_failure');
          await assert.rejects(check(date), (e) => e.code === '22023');
          await db.exec('ROLLBACK TO check_failure');
        }
        await db.exec(`UPDATE private.nfse_fiscal_classifications SET definition=jsonb_set(definition,
          '{classificationFlags,IndNfse}','false') WHERE code='000001'`);
        await assert.rejects(check('2026-01-10'), (e) => e.code === '22023');
      } finally { await db.exec('ROLLBACK'); }
    });
    await t.test('credits require document appropriation, supported tax flags and valid dates', async () => {
      const credit = async (code, date) => (await db.query('SELECT private.nfse_preset_credit_eligible($1,$2) value', [code, date])).rows[0].value;
      assert.equal(await credit('01', '2027-01-01'), false); // Official NFS-e entries use events, not this DFe field.
      assert.equal(await credit('04', '2027-01-01'), false); assert.equal(await credit('99', '2027-01-01'), false);
      await db.exec('BEGIN');
      try {
        await db.exec(`UPDATE private.nfse_fiscal_credits SET definition=definition
          ||'{"appropriationByDfe":true,"ibsValidUntil":"2027-01-31","cbs":false}' WHERE code='01'`);
        assert.equal(await credit('01', '2026-12-31'), false);
        assert.equal(await credit('01', '2027-01-01'), true); assert.equal(await credit('01', '2027-01-31'), true);
        assert.equal(await credit('01', '2027-02-01'), false);
      } finally { await db.exec('ROLLBACK'); }
    });
    await t.test('competence uses a fixed choice or the current Maceio date, never the received-payment month', async () => {
      const context = async (model) => (await db.query('SELECT private.nfse_preset_context($1,$2,$3) value',
        [model, id(1), 'HOMOLOGACAO'])).rows[0].value;
      const today = (await db.query("SELECT ((now() AT TIME ZONE 'America/Maceio')::date)::text today")).rows[0].today;
      assert.equal((await context(definition)).competenceDate, today);
      const fixed = clone(definition); fixed.peopleOptions.competenceMode = 'FIXED_DATE'; fixed.peopleOptions.competenceDate = '2026-01-02';
      assert.equal((await context(fixed)).competenceDate, '2026-01-02');
      fixed.peopleOptions.simpleNationalOption = '3'; fixed.peopleOptions.simpleNationalAssessment = null;
      assert.equal((await context(fixed)).simpleNationalAssessment, null);
      fixed.peopleOptions.simpleNationalAssessment = 'FROM_ESTABLISHMENT';
      assert.equal((await context(fixed)).simpleNationalAssessment, '1');
      await assert.rejects(client(db).values(definition.valuesOptions, { ...fixed, peopleOptions: { ...fixed.peopleOptions,
        simpleNationalAssessment: null } }), (e) => e.code === '22023');
    });
    await t.test('no client role can read the catalog tables or execute their internal validators directly', async () => {
      for (const role of ['anon', 'authenticated', 'service_role']) {
        const row = (await db.query(`SELECT has_table_privilege($1,'private.nfse_fiscal_classifications','SELECT') classes,
          has_table_privilege($1,'private.nfse_fiscal_credits','SELECT') credits,
          has_table_privilege($1,'private.nfse_currency_catalog','SELECT') currencies,
          has_table_privilege($1,'private.nfse_service_code_catalog','SELECT') services,
          has_function_privilege($1,'private.nfse_preset_classification(text,text,date)','EXECUTE') helper`, [role])).rows[0];
        assert.deepEqual(row, { classes: false, credits: false, currencies: false, services: false, helper: false });
      }
    });
  } finally { await db.close(); }
});
