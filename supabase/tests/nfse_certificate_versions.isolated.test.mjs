import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.NFSE_TEST_PGLITE_MODULE;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const original = await readFile(new URL('../migrations/20261109020012_nfse_certificate_store.sql', import.meta.url), 'utf8');
const migration = await readFile(new URL('../migrations/20261111023830_nfse_certificate_immutable_vault_versions.sql', import.meta.url), 'utf8');
const scope = { contextKey: id(10), poloId: id(1), environment: 'HOMOLOGACAO', month: '2026-11' };
const material = tag => ({ privateKeyPem: `-----BEGIN RSA PRIVATE KEY-----\nsynthetic-${tag}`,
  certificatePem: `-----BEGIN CERTIFICATE-----\nsynthetic-${tag}`, chainPem: '' });
const metadata = tag => ({ fingerprint: tag.repeat(64), cnpj: '00000000000100', chainVerified: true,
  revocationStatus: 'UNKNOWN', representationVerified: false,
  notBefore: '2020-01-01T00:00:00Z', expiresAt: '2199-12-31T23:59:59Z' });

test('certificate upload versions preserve shared historical Vault references without changing another environment', async t => {
  const db = new PGlite();
  const store = async ({ request = 80, tag = 'a', environment = 'HOMOLOGACAO', actor = 11, version = 1 } = {}) =>
    (await db.query('SELECT public.store_nfse_certificate_internal($1,$2,$3,$4,$5,$6,$7,$8,$9) result',
      [id(actor), scope.contextKey, scope.poloId, environment, scope.month, id(request), version, metadata(tag), material(tag)])).rows[0].result;
  const secretCount = async () => (await db.query('SELECT count(*)::int n FROM vault.test_secrets')).rows[0].n;
  const references = async () => (await db.query('SELECT environment,vault_secret_id,fingerprint FROM private.nfse_certificates ORDER BY environment')).rows;
  try {
    // Minimal server-owned authorization fixture; no real keys or decrypted Vault access.
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA private; CREATE SCHEMA auth; CREATE SCHEMA vault;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
        $$SELECT nullif(current_setting('request.jwt.claim.role',true),'')$$;
      CREATE TABLE public.polos(id uuid PRIMARY KEY);
      INSERT INTO public.polos VALUES('${scope.poloId}');
      CREATE TABLE private.nfse_configurations(polo_id uuid,environment text,credential_polo_id uuid,definition jsonb,version int);
      CREATE TABLE vault.test_secrets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),value text,name text UNIQUE);
      CREATE FUNCTION vault.create_secret(text,text,text) RETURNS uuid LANGUAGE sql AS
        $$INSERT INTO vault.test_secrets(value,name) VALUES($1,$2) RETURNING id$$;
      CREATE FUNCTION vault.update_secret(uuid,text) RETURNS void LANGUAGE sql AS
        $$UPDATE vault.test_secrets SET value=$2 WHERE id=$1$$;
    `);
    // Original authorization body references other tables only when invoked; replace
    // it below with an explicit scoped fixture while testing the original store body.
    await db.exec(original);
    await db.exec(`
      CREATE OR REPLACE FUNCTION public.authorize_nfse_certificate_upload_secure(
        p_context_key uuid,p_polo_id uuid,p_environment text,p_month text)
      RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
      DECLARE v_actor uuid := nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
      BEGIN
        IF v_actor IS DISTINCT FROM '${id(11)}'::uuid OR $1 <> '${scope.contextKey}'::uuid
          OR $2 <> '${scope.poloId}'::uuid OR $3 NOT IN ('HOMOLOGACAO','PRODUCAO') OR $4 <> '2026-11'
          OR current_setting('test.revoked',true) = 'true' THEN
          RAISE EXCEPTION 'Scope denied' USING ERRCODE='42501';
        END IF;
        RETURN jsonb_build_object('actorId',v_actor,'credentialPoloId',$2,'cnpj','00000000000100','configurationVersion',1);
      END; $$;
      SET request.jwt.claim.role='service_role';
    `);
    await store();
    await db.exec(`INSERT INTO private.nfse_certificates SELECT polo_id,'PRODUCAO',vault_secret_id,
      fingerprint,cnpj,not_before,expires_at,updated_by,updated_at FROM private.nfse_certificates;
      CREATE TABLE private.test_old_operation AS SELECT vault_secret_id FROM private.nfse_certificates LIMIT 1;`);
    const before = await references();
    assert.equal(before[0].vault_secret_id, before[1].vault_secret_id);
    await db.exec(migration);

    await t.test('HOMO rotation creates one new secret and leaves PROD and old operation bytes intact', async () => {
      await store({ request: 81, tag: 'b' });
      const after = await references();
      assert.notEqual(after[0].vault_secret_id, before[0].vault_secret_id);
      assert.equal(after[1].vault_secret_id, before[1].vault_secret_id);
      assert.equal(after[1].fingerprint, 'a'.repeat(64));
      const historical = (await db.query(`SELECT s.value,s.id FROM private.test_old_operation o
        JOIN vault.test_secrets s ON s.id=o.vault_secret_id`)).rows[0];
      assert.deepEqual(JSON.parse(historical.value), material('a'));
      assert.equal(historical.id, before[1].vault_secret_id); assert.equal(await secretCount(), 2);
    });
    await t.test('same request replays without allocating and a new same-material upload still creates a version', async () => {
      const replay = await store({ request: 81, tag: 'b' });
      assert.equal(replay.configured, true); assert.equal(await secretCount(), 2);
      await store({ request: 82, tag: 'b' });
      assert.equal(await secretCount(), 3);
      const names = (await db.query('SELECT name FROM vault.test_secrets')).rows.map(row => row.name);
      assert.equal(new Set(names).size, 3);
      const current = await references();
      assert.equal(current[1].vault_secret_id, before[1].vault_secret_id);
    });
    await t.test('PROD rotation affects its own row and never overwrites HOMO version', async () => {
      const homo = (await references())[0];
      await store({ request: 83, tag: 'c', environment: 'PRODUCAO' });
      const current = await references();
      assert.deepEqual(current[0], homo); assert.notEqual(current[1].vault_secret_id, before[1].vault_secret_id);
      assert.equal(await secretCount(), 4);
    });
    await t.test('authorization and expected configuration are checked before replay or secret allocation', async () => {
      await db.exec("SET test.revoked='true'");
      await assert.rejects(store({ request: 81, tag: 'b' }), e => e.code === '42501');
      await db.exec("SET test.revoked='false'");
      await assert.rejects(store({ request: 84, actor: 99 }), e => e.code === '42501');
      await assert.rejects(store({ request: 84, version: 2 }), e => e.code === '22023');
      await assert.rejects(store({ request: 81, tag: 'c' }), e => e.code === '22023');
      await db.exec("SET request.jwt.claim.role='authenticated'");
      await assert.rejects(store({ request: 84 }), e => e.code === '42501');
      await db.exec("SET request.jwt.claim.role='service_role'");
      assert.equal(await secretCount(), 4);
    });
    await t.test('failed audit insertion rolls back new secret and certificate metadata atomically', async () => {
      const beforeFailure = await references();
      await db.exec(`CREATE FUNCTION private.test_reject_request() RETURNS trigger LANGUAGE plpgsql AS
        $$BEGIN RAISE EXCEPTION 'synthetic audit failure'; END;$$;
        CREATE TRIGGER reject_request BEFORE INSERT ON private.nfse_certificate_requests
        FOR EACH ROW EXECUTE FUNCTION private.test_reject_request();`);
      await assert.rejects(store({ request: 85, tag: 'd' }), /synthetic audit failure/);
      assert.deepEqual(await references(), beforeFailure); assert.equal(await secretCount(), 4);
    });
    await t.test('ACL and audit remain server-only, with no material serialized in request metadata', async () => {
      const acl = (await db.query(`SELECT
        has_function_privilege('authenticated','public.store_nfse_certificate_internal(uuid,uuid,uuid,text,text,uuid,integer,jsonb,jsonb)','EXECUTE') authenticated,
        has_function_privilege('anon','public.store_nfse_certificate_internal(uuid,uuid,uuid,text,text,uuid,integer,jsonb,jsonb)','EXECUTE') anon,
        has_function_privilege('service_role','public.store_nfse_certificate_internal(uuid,uuid,uuid,text,text,uuid,integer,jsonb,jsonb)','EXECUTE') service,
        has_table_privilege('authenticated','private.nfse_certificates','SELECT') direct_read`)).rows[0];
      assert.deepEqual(acl, { authenticated: false, anon: false, service: true, direct_read: false });
      const audit = JSON.stringify((await db.query('SELECT payload,response FROM private.nfse_certificate_requests')).rows);
      assert.equal(/PRIVATE KEY|CERTIFICATE|privateKeyPem|chainPem|synthetic-|password/.test(audit), false);
      assert.equal(migration.includes('vault.update_secret'), false);
      assert.equal(migration.includes('decrypted_secrets'), false);
    });
  } finally { await db.close(); }
});
