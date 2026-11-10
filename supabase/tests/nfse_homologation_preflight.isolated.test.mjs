import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const modulePath = process.env.NFSE_TEST_PGLITE_MODULE;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const migration = await readFile(new URL('../migrations/20261110182740_nfse_homologation_preflight_material.sql', import.meta.url), 'utf8');
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

test('server getter reauthorizes identity and restricts material to matrix homologation', async (t) => {
  const db = new PGlite();
  const material = { certificatePem: '-----BEGIN CERTIFICATE-----\nSYNTHETIC', chainPem: '',
    privateKeyPem: '-----BEGIN RSA PRIVATE KEY-----\nSYNTHETIC' };
  const get = async (overrides = {}) => (await db.query(
    'SELECT public.get_nfse_preflight_material_internal($1,$2,$3,$4,$5) value',
    Object.values({ actor: id(11), context: id(10), polo: id(1), environment: 'HOMOLOGACAO', month: '2026-11', ...overrides }),
  )).rows[0].value;
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth; CREATE SCHEMA private; CREATE SCHEMA vault;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
        $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','authenticated')$$;
      CREATE FUNCTION public.is_active_status(text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$SELECT $1='ativo'$$;
      CREATE TABLE public.test_authorization(allowed boolean); INSERT INTO public.test_authorization VALUES(true);
      CREATE FUNCTION private.authorize_nfse_configuration_scope(uuid,uuid,text,text) RETURNS uuid
      LANGUAGE plpgsql STABLE AS $$BEGIN
        IF auth.uid() IS DISTINCT FROM '${id(11)}'::uuid OR auth.role()<>'authenticated'
          OR $1<>'${id(10)}'::uuid OR $4 !~ '^2026-[0-9]{2}$'
          OR NOT (SELECT allowed FROM public.test_authorization)
          THEN RAISE EXCEPTION 'denied' USING ERRCODE='42501'; END IF;
        RETURN '${id(1)}'::uuid;
      END$$;
      CREATE TABLE public.polos(id uuid PRIMARY KEY,cnpj text,status text);
      INSERT INTO public.polos VALUES('${id(1)}','00000000000100','ativo'),('${id(2)}','00000000000200','ativo');
      CREATE TABLE private.nfse_configurations(polo_id uuid,environment text,credential_polo_id uuid,definition jsonb,version int);
      INSERT INTO private.nfse_configurations VALUES('${id(1)}','HOMOLOGACAO','${id(1)}',
        '{"municipalityCode":"2803401","portalAccess":"CERTIFICATE","opSimpNac":"1","regEspTrib":"0","regApTribSN":null}',1);
      CREATE TABLE private.nfse_certificates(polo_id uuid,environment text,vault_secret_id uuid,cnpj text,not_before timestamptz,expires_at timestamptz,fingerprint text);
      INSERT INTO private.nfse_certificates VALUES('${id(1)}','HOMOLOGACAO','${id(50)}','00000000000100',now()-interval '1 day',now()+interval '1 year',repeat('a',64));
      CREATE TABLE vault.decrypted_secrets(id uuid,decrypted_secret text);
    `);
    await db.query('INSERT INTO vault.decrypted_secrets VALUES($1,$2)', [id(50), JSON.stringify(material)]);
    await db.exec(migration);
    await t.test('browser roles cannot execute and regular JWT role is rejected', async () => {
      const privileges = (await db.query(`SELECT
        has_function_privilege('anon','public.get_nfse_preflight_material_internal(uuid,uuid,uuid,text,text)','EXECUTE') anon,
        has_function_privilege('authenticated','public.get_nfse_preflight_material_internal(uuid,uuid,uuid,text,text)','EXECUTE') authenticated,
        has_function_privilege('service_role','public.get_nfse_preflight_material_internal(uuid,uuid,uuid,text,text)','EXECUTE') service`)).rows[0];
      assert.deepEqual(privileges, { anon: false, authenticated: false, service: true });
      await assert.rejects(get(), (error) => error.code === '42501');
    });
    await db.exec(`SET request.jwt.claims='{"role":"service_role"}'; SET request.jwt.claim.sub='${id(90)}'`);
    await t.test('valid executor obtains only resolved material and claims are restored', async () => {
      const result = await get();
      assert.deepEqual(result.material, material); assert.equal(result.issuer.cnpj, '00000000000100');
      assert.equal(result.issuer.municipalityCode, '2803401'); assert.equal(result.environment, 'HOMOLOGACAO');
      assert.equal(result.certificate.fingerprint, 'a'.repeat(64));
      assert.equal('vault_secret_id' in result, false);
      assert.equal((await db.query('SELECT auth.role() role,auth.uid() actor')).rows[0].role, 'service_role');
      assert.equal((await db.query('SELECT auth.uid() actor')).rows[0].actor, id(90));
    });
    await t.test('denies production, filial, wrong identity/context and revoked access', async () => {
      for (const invalid of [{ environment: 'PRODUCAO' }, { polo: id(2) }, { actor: id(99) }, { context: id(99) }]) {
        await assert.rejects(get(invalid), (error) => error.code === '42501');
      }
      await db.exec('UPDATE public.test_authorization SET allowed=false');
      await assert.rejects(get(), (error) => error.code === '42501');
      await db.exec('UPDATE public.test_authorization SET allowed=true');
    });
    await t.test('denies stale CNPJ, expired certificate and missing Vault material', async () => {
      await db.exec("UPDATE public.polos SET cnpj='99999999000100'");
      await assert.rejects(get(), (error) => error.code === '22023');
      await db.exec("UPDATE public.polos SET cnpj='00000000000100'; UPDATE private.nfse_certificates SET expires_at=now()-interval '1 day'");
      await assert.rejects(get(), (error) => error.code === '22023');
      await db.exec("UPDATE private.nfse_certificates SET expires_at=now()+interval '1 year'; DELETE FROM vault.decrypted_secrets");
      await assert.rejects(get(), (error) => error.code === '22023');
    });
  } finally { await db.close(); }
});
