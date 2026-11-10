import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const modulePath = process.env.NFSE_TEST_PGLITE_MODULE;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const migrationNames = ['20261108225453_nfse_models_private_store.sql',
  '20261108225459_nfse_models_save_rpc.sql', '20261108233250_nfse_model_reference_month.sql',
  '20261110212829_nfse_model_service_presets.sql'];
const migrations = await Promise.all(migrationNames.map((name) => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8')));
const fixture = await readFile(new URL('./nfse_model_presets.fixture.sql', import.meta.url), 'utf8');
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const serviceOptions = { version: 1, countryCode: 'BRA', municipalityCode: '3550308',
  exportResultCountryCode: null, includeIbsCbs: false, governmentPurchase: null, governmentEntityType: null, operationType: null };
const model = { name: 'Pré-modelo sintético', active: true, nationalServiceCode: '080201', nbsCode: '122020000',
  operationIndicatorCode: '', serviceDescription: 'Serviço educacional sintético', issTreatment: 'TRIBUTAVEL',
  immunityType: null, technicalResponsibilityDocument: '', referenceDocument: '', complementaryInfo: '', orderReference: '' };

test('service presets validate catalogs and conditional national fields without emission data', async (t) => {
  const db = new PGlite();
  const normalize = async (options = serviceOptions, treatment = 'TRIBUTAVEL', service = '080201', indicator = '') =>
    (await db.query('SELECT private.normalize_nfse_model_service_options($1,$2,$3,$4) value',
      [options, treatment, service, indicator])).rows[0].value;
  try {
    await db.exec(fixture);
    await db.exec(`INSERT INTO public.test_context VALUES('${id(10)}','${id(11)}',true,false,ARRAY['${id(1)}'::uuid]);
      INSERT INTO public.polos VALUES('${id(1)}','ativo'); SET test.actor='${id(11)}';`);
    for (const migration of migrations) await db.exec(migration);
    await t.test('uses explicit active country and municipality without inserting a unit default', async () => {
      assert.deepEqual(await normalize(), serviceOptions);
      assert.deepEqual(await normalize({ ...serviceOptions, countryCode: ' prt ', municipalityCode: null }),
        { ...serviceOptions, countryCode: 'PRT', municipalityCode: null });
      for (const invalid of [
        { countryCode: 'BR' }, { countryCode: 'ZZZ' }, { countryCode: 'AAA' },
        { municipalityCode: null }, { municipalityCode: '9999999' }, { municipalityCode: '355030' },
        { countryCode: 'PRT', municipalityCode: '3550308' }, { countryLabel: 'Rótulo não confiável' },
      ]) await assert.rejects(normalize({ ...serviceOptions, ...invalid }), (error) => error.code === '22023');
    });
    await t.test('export-result country is separate from the place of service and conditional on export', async () => {
      const exported = { ...serviceOptions, exportResultCountryCode: 'USA' };
      assert.deepEqual(await normalize(exported, 'EXPORTACAO'), exported);
      await assert.rejects(normalize(serviceOptions, 'EXPORTACAO'), (error) => error.code === '22023');
      await assert.rejects(normalize(exported), (error) => error.code === '22023');
      await assert.rejects(normalize({ ...exported, exportResultCountryCode: 'ZZZ' }, 'EXPORTACAO'), (error) => error.code === '22023');
    });
    await t.test('IBS/CBS requires its indicator and government choices have explicit dependencies', async () => {
      const enabled = { ...serviceOptions, includeIbsCbs: true, governmentPurchase: false };
      assert.deepEqual(await normalize(enabled, 'TRIBUTAVEL', '080201', '010101'), enabled);
      await assert.rejects(normalize(enabled), (error) => error.code === '22023');
      await assert.rejects(normalize({ ...enabled, governmentPurchase: null }, 'TRIBUTAVEL', '080201', '010101'), (error) => error.code === '22023');
      await assert.rejects(normalize(serviceOptions, 'TRIBUTAVEL', '080201', '010101'), (error) => error.code === '22023');
      const government = { ...enabled, governmentPurchase: true, governmentEntityType: '1', operationType: '1' };
      assert.deepEqual(await normalize(government, 'TRIBUTAVEL', '080201', '010101'), government);
      for (const operationType of ['1', '2', '3', '4', '5']) {
        const option = { ...government, operationType };
        assert.deepEqual(await normalize(option, 'TRIBUTAVEL', '080201', '010101'), option);
      }
      for (const invalid of [
        { governmentEntityType: null }, { governmentEntityType: '5' }, { operationType: null }, { operationType: '6' },
      ]) await assert.rejects(normalize({ ...government, ...invalid }, 'TRIBUTAVEL', '080201', '010101'), (error) => error.code === '22023');
      await assert.rejects(normalize({ ...enabled, governmentEntityType: '1' }, 'TRIBUTAVEL', '080201', '010101'), (error) => error.code === '22023');
      await assert.rejects(normalize({ ...serviceOptions, governmentPurchase: false }), (error) => error.code === '22023');
    });
    await t.test('operation type is required only for government or the four declared service subitems', async () => {
      const enabled = { ...serviceOptions, includeIbsCbs: true, governmentPurchase: false };
      for (const code of ['250501', '150901', '171201', '100501']) {
        await assert.rejects(normalize(enabled, 'TRIBUTAVEL', code, '010101'), (error) => error.code === '22023');
        assert.equal((await normalize({ ...enabled, operationType: '5' }, 'TRIBUTAVEL', code, '010101')).operationType, '5');
      }
      await assert.rejects(normalize({ ...enabled, operationType: '1' }, 'TRIBUTAVEL', '080201', '010101'), (error) => error.code === '22023');
    });
    await t.test('rejects person identity, dates, DPS numbers, concrete references and values inside service options', async () => {
      for (const key of ['recipient', 'cpf', 'cnpj', 'competenceDate', 'serviceDate', 'series', 'number',
        'nfseAccessKeys', 'serviceAmount', 'issRate', 'issValue']) {
        await assert.rejects(normalize({ ...serviceOptions, [key]: 'SYNTHETIC_SENTINEL' }), (error) => error.code === '22023');
      }
      assert.equal(await normalize(null), null);
      assert.equal((await normalize({ ...serviceOptions, includeIbsCbs: null })).includeIbsCbs, null);
    });
    await t.test('description and preview accept 2000 characters but enforce the expanded limit', async () => {
      const render = async (description, month = '2026-11') => (await db.query(
        'SELECT public.preview_nfse_model_description_secure($1,$2,$3,$4,$5) value',
        [id(10), id(1), 'HOMOLOGACAO', month, description])).rows[0].value.data.description;
      assert.equal((await render('x'.repeat(2000))).length, 2000);
      await assert.rejects(render('x'.repeat(2001)), (error) => error.code === '22023');
      const label = 'fevereiro de 2026';
      const token = '{{mes_referencia}}';
      const fits = 'x'.repeat(2000 - token.length) + token;
      assert.equal(fits.length, 2000);
      assert.equal((await render(fits, '2026-02')).length, 2000 - token.length + label.length);
      await assert.rejects(render('{{mes_referencia}}'.repeat(118), '2026-02'), (error) => error.code === '22023');
      await assert.rejects(render('{{nome_aluno}}'), (error) => error.code === '22023');
    });
    await t.test('read adds trusted labels only and preserves legacy models without fabricated options', async () => {
      await db.query(`INSERT INTO private.nfse_models(id,polo_id,environment,definition,created_by,updated_by)
        VALUES($1,$2,'HOMOLOGACAO',$3,$4,$4),($5,$2,'HOMOLOGACAO',$6,$4,$4)`,
      [id(60), id(1), { ...model, serviceOptions }, id(11), id(61), { ...model, name: 'Modelo legado sintético' }]);
      const stored = (await db.query('SELECT definition FROM private.nfse_models WHERE id=$1', [id(60)])).rows[0].definition;
      assert.equal('countryLabel' in stored.serviceOptions, false);
      const rows = (await db.query('SELECT public.get_nfse_models_secure($1,$2,$3,$4) value',
        [id(10), id(1), 'HOMOLOGACAO', '2026-11'])).rows[0].value.data.rows;
      const enriched = rows.find((row) => row.id === id(60));
      assert.equal(enriched.serviceOptions.countryLabel, 'Brasil');
      assert.equal(enriched.serviceOptions.municipalityLabel, 'São Paulo / SP');
      assert.equal(enriched.serviceOptions.exportResultCountryLabel, null);
      assert.equal('serviceOptions' in rows.find((row) => row.id === id(61)), false);
      await db.exec('UPDATE public.test_context SET allowed=false');
      await assert.rejects(db.query('SELECT public.get_nfse_models_secure($1,$2,$3,$4)',
        [id(10), id(1), 'HOMOLOGACAO', '2026-11']), (error) => error.code === '42501');
    });
  } finally { await db.close(); }
});
