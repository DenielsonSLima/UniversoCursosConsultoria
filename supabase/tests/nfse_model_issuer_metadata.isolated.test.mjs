import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.NFSE_TEST_PGLITE_MODULE;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const readMigration = (name) => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const modelStore = await readMigration('20261108225453_nfse_models_private_store.sql');
const configurationStore = await readMigration('20261109015954_nfse_configuration_store.sql');
const academicStore = await readMigration('20261109020017_nfse_academic_queue_store.sql');
const snapshotStart = academicStore.indexOf('CREATE FUNCTION private.nfse_issuer_preparation_snapshot');
const snapshotEnd = academicStore.indexOf('COMMENT ON TABLE private.nfse_queue_documents', snapshotStart);
assert.ok(snapshotStart >= 0 && snapshotEnd > snapshotStart, 'Use the actual owning snapshot helper');
const snapshotSql = academicStore.slice(snapshotStart, snapshotEnd);
const migration = await readMigration('20261110214625_nfse_model_issuer_metadata.sql');
const fixture = await readFile(new URL('./nfse_model_issuer_metadata.fixture.sql', import.meta.url), 'utf8');
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const scope = { context: id(10), polo: id(1), environment: 'HOMOLOGACAO', month: '2026-11' };
const fiscal = { municipalityCode: '3550308', municipalRegistration: 'SYNTHETIC-IM',
  opSimpNac: '3', regApTribSN: '1', regEspTrib: '0', ignoredCredentialSentinel: 'NEVER_RETURN' };

test('issuer form metadata is scoped, read-only and never borrows a different establishment identity', async (t) => {
  const db = new PGlite();
  const get = async (changes = {}) => (await db.query(
    'SELECT public.get_nfse_model_issuer_metadata_secure($1,$2,$3,$4) value',
    Object.values({ ...scope, ...changes }))).rows[0].value;
  const counts = async () => (await db.query(`SELECT jsonb_build_object(
    'models',(SELECT count(*) FROM private.nfse_models),
    'requests',(SELECT count(*) FROM private.nfse_model_requests),
    'configurations',(SELECT count(*) FROM private.nfse_configurations),
    'configurationRequests',(SELECT count(*) FROM private.nfse_configuration_requests)) value`)).rows[0].value;
  try {
    await db.exec(fixture);
    await db.exec(`INSERT INTO public.empresas(id,cnpj,razao_social,endereco,telefone,email)
      VALUES('${id(20)}','00.000.000/0001-00','RAZÃO SOCIAL SINTÉTICA','ENDEREÇO DA EMPRESA','EMPRESA-PHONE','EMPRESA-EMAIL');
      INSERT INTO public.polos(id,company_id,status,cnpj,nome,endereco,numero,complemento,bairro,cidade,estado,cep,telefone,email)
      VALUES('${id(1)}','${id(20)}','ativo','00.000.000/0001-00',' NOME CADASTRADO ',' RUA DO POLO ',' 10 ',' SALA ',
        ' BAIRRO ',' MUNICÍPIO ',' SP ',' 00000-000 ',' POLO-PHONE ',' POLO-EMAIL '),
      ('${id(2)}','${id(20)}','ativo','00.000.000/0002-00','FILIAL SINTÉTICA',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
      ('${id(3)}','${id(20)}','ativo',' ','POLO SEM CNPJ',NULL,NULL,NULL,NULL,NULL,NULL,NULL,' ',' '),
      ('${id(4)}','${id(20)}','ativo',NULL,'POLO FORA DO ESCOPO',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL);
      INSERT INTO public.test_context VALUES('${id(10)}','${id(11)}',true,false,
        ARRAY['${id(1)}'::uuid,'${id(2)}'::uuid,'${id(3)}'::uuid]); SET test.actor='${id(11)}';`);
    await db.exec(modelStore); await db.exec(configurationStore); await db.exec(snapshotSql);
    await db.query(`INSERT INTO private.nfse_configurations(polo_id,environment,credential_polo_id,definition,version,updated_by)
      VALUES($1,'HOMOLOGACAO',$1,$2,2,$3),($1,'PRODUCAO',$1,$4,4,$3)`,
    [id(1), fiscal, id(11), { ...fiscal, municipalityCode: '3304557', municipalRegistration: 'PROD-IM' }]);
    await db.exec(migration);

    await t.test('returns the approved envelope with own address, contacts and environment-specific fiscal codes', async () => {
      const value = await get();
      assert.deepEqual(value.scope, { contextKey: id(10), poloId: id(1), environment: 'HOMOLOGACAO', month: '2026-11' });
      assert.equal(value.version, 1);
      assert.deepEqual(value.data, { poloId: id(1), name: 'NOME CADASTRADO', legalName: 'RAZÃO SOCIAL SINTÉTICA',
        cnpj: '00000000000100', address: { street: 'RUA DO POLO', number: '10', complement: 'SALA', district: 'BAIRRO',
          city: 'MUNICÍPIO', state: 'SP', postalCode: '00000-000' }, phone: 'POLO-PHONE', email: 'POLO-EMAIL',
        municipalityCode: '3550308', municipalRegistration: 'SYNTHETIC-IM', opSimpNac: '3', regApTribSN: '1',
        regEspTrib: '0', configurationVersion: 2 });
      const production = (await get({ environment: 'PRODUCAO' })).data;
      assert.equal(production.configurationVersion, 4); assert.equal(production.municipalityCode, '3304557');
      assert.equal(production.municipalRegistration, 'PROD-IM');
      assert.equal(JSON.stringify(value).includes('NEVER_RETURN'), false);
    });
    await t.test('a filial never borrows the company legal name, address or contacts; missing fields stay null', async () => {
      const data = (await get({ polo: id(2) })).data;
      assert.equal(data.name, 'FILIAL SINTÉTICA'); assert.equal(data.cnpj, '00000000000200');
      for (const key of ['legalName', 'phone', 'email', 'municipalityCode', 'municipalRegistration', 'opSimpNac',
        'regApTribSN', 'regEspTrib', 'configurationVersion']) assert.equal(data[key], null, key);
      assert.deepEqual(data.address, { street: null, number: null, complement: null, district: null,
        city: null, state: null, postalCode: null });
      const empty = (await get({ polo: id(3) })).data;
      assert.equal(empty.cnpj, null); assert.equal(empty.legalName, null); assert.equal(empty.phone, null); assert.equal(empty.email, null);
    });
    await t.test('metadata follows current registration and does not create models, audit requests or fiscal settings', async () => {
      const before = await counts();
      await db.query('UPDATE public.polos SET telefone=$1 WHERE id=$2', ['UPDATED-PHONE', id(1)]);
      assert.equal((await get()).data.phone, 'UPDATED-PHONE');
      await get(); assert.deepEqual(await counts(), before);
      assert.deepEqual((await db.query("SELECT tablename FROM pg_tables WHERE schemaname='private' ORDER BY tablename")).rows
        .map((row) => row.tablename), ['nfse_configuration_requests', 'nfse_configurations', 'nfse_model_requests', 'nfse_models']);
    });
    await t.test('authorization and scope precede reading the existing snapshot helper', async () => {
      await db.exec(`CREATE OR REPLACE FUNCTION private.nfse_issuer_preparation_snapshot(p_polo_id uuid)
        RETURNS jsonb LANGUAGE plpgsql STABLE AS $$BEGIN RAISE EXCEPTION 'READ_SENTINEL'; END$$;`);
      for (const changes of [{ context: id(99) }, { polo: id(4) }]) {
        await assert.rejects(get(changes), (error) => error.code === '42501');
      }
      for (const changes of [{ environment: 'INVALID' }, { month: '2026-13' }]) {
        await assert.rejects(get(changes), (error) => error.code === '22023');
      }
      await db.exec('UPDATE public.test_context SET allowed=false');
      await assert.rejects(get(), (error) => error.code === '42501');
      await db.exec('UPDATE public.test_context SET allowed=true');
      await assert.rejects(get(), /READ_SENTINEL/);
    });
    await t.test('only the authenticated public RPC is granted; the identity helper remains private', async () => {
      const grants = (await db.query(`SELECT
        has_function_privilege('authenticated','public.get_nfse_model_issuer_metadata_secure(uuid,uuid,text,text)','EXECUTE') authenticated,
        has_function_privilege('anon','public.get_nfse_model_issuer_metadata_secure(uuid,uuid,text,text)','EXECUTE') anon,
        has_function_privilege('service_role','public.get_nfse_model_issuer_metadata_secure(uuid,uuid,text,text)','EXECUTE') service,
        has_function_privilege('authenticated','private.nfse_issuer_preparation_snapshot(uuid)','EXECUTE') helper`)).rows[0];
      assert.deepEqual(grants, { authenticated: true, anon: false, service: false, helper: false });
    });
  } finally { await db.close(); }
});
