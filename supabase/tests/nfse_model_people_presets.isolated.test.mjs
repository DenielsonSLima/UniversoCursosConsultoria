import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const modulePath = process.env.NFSE_TEST_PGLITE_MODULE;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const readMigration = (name) => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const legacyMigrations = await Promise.all(['20261108225453_nfse_models_private_store.sql',
  '20261108225459_nfse_models_save_rpc.sql', '20261108233250_nfse_model_reference_month.sql'].map(readMigration));
const newMigrations = await Promise.all(['20261110212829_nfse_model_service_presets.sql',
  '20261110212831_nfse_model_people_presets_and_save.sql',
  '20261110213318_nfse_model_partner_display_labels.sql'].map(readMigration));
const fixture = await readFile(new URL('./nfse_model_presets.fixture.sql', import.meta.url), 'utf8');
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const scope = { context: id(10), polo: id(1), environment: 'HOMOLOGACAO', month: '2026-11' };
const serviceOptions = { version: 1, countryCode: 'BRA', municipalityCode: '3550308', exportResultCountryCode: null,
  includeIbsCbs: false, governmentPurchase: null, governmentEntityType: null, operationType: null };
const peopleOptions = { version: 1, competenceMode: 'ISSUE_DATE', competenceDate: null,
  dpsSeriesMode: 'AUTOMATIC', dpsSeries: null, issuerRole: 'PROVIDER', simpleNationalOption: 'FROM_ESTABLISHMENT',
  simpleNationalAssessment: 'FROM_ESTABLISHMENT', recipientLocation: 'BRASIL', recipientIncludeAddress: false,
  recipientIsDestination: null, destinationPartnerId: null, intermediaryLocation: 'NOT_INFORMED', intermediaryPartnerId: null };
const legacyDefinition = { name: 'Modelo legado sintético', active: true, nationalServiceCode: '080201', nbsCode: '122020000',
  operationIndicatorCode: '', serviceDescription: 'SERVIÇO EDUCACIONAL SINTÉTICO', issTreatment: 'TRIBUTAVEL',
  immunityType: null, technicalResponsibilityDocument: '', referenceDocument: '', complementaryInfo: '', orderReference: '' };
const definition = { ...legacyDefinition, name: 'Pré-modelo completo sintético', serviceOptions, peopleOptions };

test('pre-model RPC persists reusable People and Service choices without copying partner identities', async (t) => {
  const db = new PGlite();
  const save = async (changes = {}, changesScope = {}) => (await db.query(
    'SELECT public.save_nfse_model_secure($1,$2,$3,$4,$5,$6,$7,$8) value',
    [...Object.values({ ...scope, ...changesScope }), changes.request ?? id(50), changes.model ?? null,
      changes.expected ?? null, changes.definition ?? definition])).rows[0].value;
  const get = async () => (await db.query('SELECT public.get_nfse_models_secure($1,$2,$3,$4) value',
    Object.values(scope))).rows[0].value.data.rows;
  const search = async (term = '', partner = null, changes = {}) => (await db.query(
    'SELECT public.search_nfse_model_partners_secure($1,$2,$3,$4,$5,$6) value',
    [...Object.values({ ...scope, ...changes }), term, partner])).rows[0].value;
  const normalize = async (options = peopleOptions, svc = serviceOptions) => (await db.query(
    'SELECT private.normalize_nfse_model_people_options($1,$2,$3) value', [options, svc, scope.polo])).rows[0].value;
  let old; let full;
  try {
    await db.exec(fixture);
    await db.exec(`INSERT INTO public.test_context VALUES('${id(10)}','${id(11)}',true,false,ARRAY['${id(1)}'::uuid]);
      INSERT INTO public.polos VALUES('${id(1)}','ativo'),('${id(2)}','ativo'); SET test.actor='${id(11)}';
      INSERT INTO public.parceiros VALUES
        ('${id(30)}','ALUNO LOCAL SINTETICO','Aluno','ativo','${id(1)}',ARRAY[]::uuid[]),
        ('${id(31)}','PARCEIRO GLOBAL SINTETICO','PJ','ativo',NULL,ARRAY[]::uuid[]),
        ('${id(32)}','PARCEIRO OUTRO POLO SINTETICO','PF','ativo','${id(2)}',ARRAY[]::uuid[]),
        ('${id(33)}','ALUNO SEM POLO SINTETICO','Aluno','ativo',NULL,ARRAY[]::uuid[]),
        ('${id(34)}','PARCEIRO INATIVO SINTETICO','PF','inativo','${id(1)}',ARRAY[]::uuid[]),
        ('${id(35)}','ALUNO VINCULADO SINTETICO','ALUNO','ativo',NULL,ARRAY['${id(1)}'::uuid]),
        ('${id(36)}','PARCEIRO MULTIPOLO SINTETICO','PJ','ativo','${id(2)}',ARRAY['${id(1)}'::uuid]);`);
    for (const migration of legacyMigrations) await db.exec(migration);
    old = await save({ definition: legacyDefinition });
    for (const migration of newMigrations) await db.exec(migration);
    await t.test('historical requests replay unchanged; old models gain no invented defaults', async () => {
      assert.deepEqual(await save({ definition: legacyDefinition }), old);
      const row = (await get()).find((entry) => entry.id === old.data.id);
      assert.equal('peopleOptions' in row, false); assert.equal('serviceOptions' in row, false);
      const changed = await save({ request: id(51), model: old.data.id, expected: 1,
        definition: { ...legacyDefinition, serviceDescription: 'x'.repeat(2000) } });
      assert.equal(changed.data.version, 2);
      assert.deepEqual(await save({ definition: legacyDefinition }), old);
    });
    await t.test('new request persists complete versioned preferences and returns labels only on read', async () => {
      full = await save({ request: id(60), definition: { ...definition, serviceDescription: 'x'.repeat(2000) } });
      const row = (await get()).find((entry) => entry.id === full.data.id);
      assert.equal(row.serviceDescription.length, 2000);
      assert.equal(row.serviceOptions.countryLabel, 'Brasil');
      assert.equal(row.serviceOptions.municipalityLabel, 'São Paulo / SP');
      assert.equal(row.peopleOptions.destinationPartnerLabel, null);
      assert.equal(row.peopleOptions.intermediaryPartnerLabel, null);
      const stored = (await db.query('SELECT definition FROM private.nfse_models WHERE id=$1', [full.data.id])).rows[0].definition;
      assert.deepEqual(stored.peopleOptions, peopleOptions); assert.deepEqual(stored.serviceOptions, serviceOptions);
      assert.equal(/PartnerLabel|countryLabel|municipalityLabel|cpf|cnpj|endereco|issuedAt/.test(JSON.stringify(stored)), false);
      await assert.rejects(save({ request: id(61), definition: { ...definition, serviceDescription: 'x'.repeat(2001) } }), (error) => error.code === '22023');
    });
    await t.test('dates and series store a rule or an explicit valid value, never auto-filled execution values', async () => {
      assert.deepEqual(await normalize(), peopleOptions);
      const fixed = { ...peopleOptions, competenceMode: 'FIXED_DATE', competenceDate: '2026-11-09',
        dpsSeriesMode: 'CUSTOM', dpsSeries: '00001' };
      assert.deepEqual(await normalize(fixed), fixed);
      for (const invalid of [
        { competenceMode: 'FIXED_DATE' }, { competenceMode: 'FIXED_DATE', competenceDate: '2026-02-31' },
        { competenceMode: 'FIXED_DATE', competenceDate: '0000-01-01' },
        { competenceDate: '2026-11-09' }, { dpsSeriesMode: 'CUSTOM' },
        { dpsSeriesMode: 'CUSTOM', dpsSeries: '0' }, { dpsSeriesMode: 'CUSTOM', dpsSeries: '50000' },
        { dpsSeriesMode: 'CUSTOM', dpsSeries: '123456' }, { dpsSeries: '1' },
      ]) await assert.rejects(normalize({ ...peopleOptions, ...invalid }), (error) => error.code === '22023');
      for (const issuerRole of ['PROVIDER', 'RECIPIENT', 'INTERMEDIARY']) {
        assert.equal((await normalize({ ...peopleOptions, issuerRole })).issuerRole, issuerRole);
      }
    });
    await t.test('Simples preference, recipient visibility and IBS/CBS destination follow explicit dependencies', async () => {
      for (const simpleNationalOption of ['1', '2']) {
        assert.equal((await normalize({ ...peopleOptions, simpleNationalOption, simpleNationalAssessment: null })).simpleNationalOption, simpleNationalOption);
        await assert.rejects(normalize({ ...peopleOptions, simpleNationalOption }), (error) => error.code === '22023');
      }
      await assert.rejects(normalize({ ...peopleOptions, simpleNationalOption: '3', simpleNationalAssessment: null }), (error) => error.code === '22023');
      assert.equal((await normalize({ ...peopleOptions, simpleNationalOption: '3', simpleNationalAssessment: '1' })).simpleNationalAssessment, '1');
      assert.equal((await normalize({ ...peopleOptions, simpleNationalAssessment: null })).simpleNationalAssessment, null);
      await assert.rejects(normalize({ ...peopleOptions, recipientLocation: 'NOT_INFORMED', recipientIncludeAddress: true }), (error) => error.code === '22023');
      await assert.rejects(normalize({ ...peopleOptions, recipientIsDestination: true }), (error) => error.code === '22023');
      const ibs = { ...serviceOptions, includeIbsCbs: true, governmentPurchase: false };
      const fixedIbs = { ...peopleOptions, competenceMode: 'FIXED_DATE', competenceDate: '2026-01-01', recipientIsDestination: true };
      assert.equal((await normalize(fixedIbs, ibs)).competenceDate, '2026-01-01');
      await assert.rejects(normalize({ ...fixedIbs, competenceDate: '2025-12-31' }, ibs),
        (error) => error.code === '22023' && error.message.includes('01/01/2026'));
      await assert.rejects(normalize(peopleOptions, ibs), (error) => error.code === '22023');
      assert.equal((await normalize({ ...peopleOptions, recipientIsDestination: true }, ibs)).recipientIsDestination, true);
      await assert.rejects(normalize({ ...peopleOptions, recipientIsDestination: true, destinationPartnerId: id(30) }, ibs), (error) => error.code === '22023');
      const destination = { ...peopleOptions, recipientIsDestination: false, destinationPartnerId: id(30) };
      assert.equal((await normalize(destination, ibs)).destinationPartnerId, id(30));
    });
    await t.test('government purchases require a recipient located in Brazil', async () => {
      const government = { ...serviceOptions, includeIbsCbs: true, governmentPurchase: true,
        governmentEntityType: '1', operationType: '1' };
      const recipient = { ...peopleOptions, recipientIsDestination: true };
      assert.equal((await normalize(recipient, government)).recipientLocation, 'BRASIL');
      for (const recipientLocation of ['EXTERIOR', 'NOT_INFORMED']) {
        await assert.rejects(normalize({ ...recipient, recipientLocation }, government),
          (error) => error.code === '22023' && error.message.includes('tomador localizado no Brasil'));
      }
    });
    await t.test('partner references enforce active status and current polo for students and other partners', async () => {
      for (const allowed of [30, 31, 35, 36]) {
        assert.equal((await normalize({ ...peopleOptions, intermediaryLocation: 'BRASIL', intermediaryPartnerId: id(allowed) })).intermediaryPartnerId, id(allowed));
      }
      for (const denied of [32, 33, 34, 99]) await assert.rejects(normalize({ ...peopleOptions,
        intermediaryLocation: 'BRASIL', intermediaryPartnerId: id(denied) }), (error) => error.code === '22023');
      await assert.rejects(normalize({ ...peopleOptions, intermediaryLocation: 'BRASIL' }), (error) => error.code === '22023');
      await assert.rejects(normalize({ ...peopleOptions, intermediaryPartnerId: id(31) }), (error) => error.code === '22023');
    });
    await t.test('partner search caps results, resolves one selected ID and never leaks documents or foreign records', async () => {
      const own = (await search('', id(30))).data.rows;
      assert.deepEqual(own, [{ id: id(30), label: 'ALUNO LOCAL SINTETICO' }]);
      for (const denied of [32, 33, 34, 99]) assert.deepEqual((await search('', id(denied))).data.rows, []);
      assert.deepEqual((await search('a')).data.rows, []);
      assert.deepEqual((await search('%%')).data.rows, []);
      assert.deepEqual((await search('x'.repeat(100))).data.rows, []);
      await assert.rejects(search('x'.repeat(101)), (error) => error.code === '22023');
      for (let index = 100; index < 125; index++) await db.query('INSERT INTO public.parceiros VALUES($1,$2,$3,$4,NULL,ARRAY[]::uuid[])',
        [id(index), `PARCEIRO LIMITE SINTETICO ${index}`, 'PF', 'ativo']);
      const limited = await search('LIMITE'); assert.equal(limited.data.rows.length, 20);
      assert.equal(limited.data.pageSize, 20);
      for (const row of limited.data.rows) assert.deepEqual(Object.keys(row).sort(), ['id', 'label']);
      await assert.rejects(search('ALUNO', null, { polo: id(2) }), (error) => error.code === '42501');
    });
    await t.test('labels re-resolve within scope and stored references never copy partner snapshots', async () => {
      const withIntermediary = { ...definition, peopleOptions: { ...peopleOptions,
        intermediaryLocation: 'BRASIL', intermediaryPartnerId: id(31) } };
      const saved = await save({ request: id(70), definition: withIntermediary });
      assert.equal((await get()).find((entry) => entry.id === saved.data.id).peopleOptions.intermediaryPartnerLabel, 'PARCEIRO GLOBAL SINTETICO');
      await db.exec(`UPDATE public.parceiros SET polo_id='${id(2)}' WHERE id='${id(31)}'`);
      assert.equal((await get()).find((entry) => entry.id === saved.data.id).peopleOptions.intermediaryPartnerLabel, null);
      assert.deepEqual(await save({ request: id(70), definition: withIntermediary }), saved);
      await assert.rejects(save({ request: id(71), model: saved.data.id, expected: 1, definition: withIntermediary }), (error) => error.code === '22023');
      await db.exec(`UPDATE public.parceiros SET polo_id=NULL WHERE id='${id(31)}'`);
      const raw = (await db.query('SELECT definition FROM private.nfse_models WHERE id=$1', [saved.data.id])).rows[0].definition;
      assert.equal(JSON.stringify(raw).includes('PARCEIRO GLOBAL'), false);
    });
    await t.test('long partner names are bounded only for display without changing the saved reference', async () => {
      const name = 'PARCEIRO SINTÉTICO '.repeat(30);
      await db.query('UPDATE public.parceiros SET nome=$1 WHERE id=$2', [name,id(31)]);
      const result = await search('',id(31));
      assert.equal(result.data.rows[0].label,name.slice(0,300));
      const saved = await save({ request:id(72), definition:{...definition,peopleOptions:{...peopleOptions,
        intermediaryLocation:'BRASIL',intermediaryPartnerId:id(31)}} });
      const row = (await get()).find(entry=>entry.id===saved.data.id);
      assert.equal(row.peopleOptions.intermediaryPartnerLabel,name.slice(0,300));
      assert.equal(row.peopleOptions.intermediaryPartnerId,id(31));
    });
    await t.test('old clients cannot erase either configured object and replay remains scoped and immutable', async () => {
      for (const dropped of [
        { ...definition, peopleOptions: undefined }, { ...definition, serviceOptions: undefined },
        { ...definition, peopleOptions: null }, { ...definition, serviceOptions: null },
      ]) await assert.rejects(save({ request: id(80), model: full.data.id, expected: 1, definition: dropped }), (error) => error.code === '40001');
      await assert.rejects(save({ request: id(60), definition: { ...definition, serviceDescription: 'DIVERGENTE' } }), (error) => error.code === '22023');
      await db.exec('UPDATE public.test_context SET allowed=false');
      await assert.rejects(save({ definition: legacyDefinition }), (error) => error.code === '42501');
      await assert.rejects(search('x'.repeat(101)), (error) => error.code === '42501');
      await db.exec('UPDATE public.test_context SET allowed=true');
    });
    await t.test('rejects copied identities, read labels, DPS numbers and future Values inputs', async () => {
      for (const key of ['name', 'cpf', 'cnpj', 'address', 'dpsNumber', 'serviceAmount', 'issRate', 'destinationPartnerLabel']) {
        await assert.rejects(normalize({ ...peopleOptions, [key]: 'SYNTHETIC_SENTINEL' }), (error) => error.code === '22023');
      }
      await assert.rejects(save({ request: id(90), definition: { ...definition, values: { serviceAmount: '260.00' } } }), (error) => error.code === '22023');
      const grants = (await db.query(`SELECT
        has_function_privilege('authenticated','public.search_nfse_model_partners_secure(uuid,uuid,text,text,text,uuid)','EXECUTE') authenticated,
        has_function_privilege('anon','public.search_nfse_model_partners_secure(uuid,uuid,text,text,text,uuid)','EXECUTE') anon,
        has_function_privilege('authenticated','private.normalize_nfse_model_people_options(jsonb,jsonb,uuid)','EXECUTE') helper`)).rows[0];
      assert.deepEqual(grants, { authenticated: true, anon: false, helper: false });
      assert.deepEqual((await db.query("SELECT tablename FROM pg_tables WHERE schemaname='private' ORDER BY tablename")).rows.map((row) => row.tablename),
        ['nfse_model_requests', 'nfse_models']);
    });
  } finally { await db.close(); }
});
