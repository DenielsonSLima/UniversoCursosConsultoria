import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const modulePath = process.env.NFSE_TEST_PGLITE_MODULE;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const migration = await readFile(new URL('../migrations/20261110185118_nfse_homologation_relay_config.sql', import.meta.url), 'utf8');
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const url = 'https://universo-cursos-consultoria-test-fixture.vercel.app/api/nfse-homologation-relay';
const config = { url, key: '11'.repeat(32), protectionBypass: 'SYNTHETIC_BYPASS_TOKEN' };

test('relay getter is server-only, reauthorized, matrix homologation and exact Preview pin', async (t) => {
  const db = new PGlite();
  const get = async (overrides = {}) => (await db.query(
    'SELECT public.get_nfse_homologation_relay_config_internal($1,$2,$3,$4,$5) value',
    Object.values({ actor: id(11), context: id(10), polo: id(1), environment: 'HOMOLOGACAO', month: '2026-11', ...overrides }),
  )).rows[0].value;
  const put = async (value) => { await db.exec('DELETE FROM vault.decrypted_secrets');
    await db.query('INSERT INTO vault.decrypted_secrets VALUES($1,$2)', ['nfse_homologation_relay_config', JSON.stringify(value)]); };
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth; CREATE SCHEMA private; CREATE SCHEMA vault;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
        $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','authenticated')$$;
      CREATE TABLE public.test_authorization(allowed boolean); INSERT INTO public.test_authorization VALUES(true);
      CREATE FUNCTION private.authorize_nfse_configuration_scope(uuid,uuid,text,text) RETURNS uuid
      LANGUAGE plpgsql STABLE AS $$BEGIN
        IF auth.uid() IS DISTINCT FROM '${id(11)}'::uuid OR auth.role()<>'authenticated'
          OR $1<>'${id(10)}'::uuid OR $4 !~ '^2026-[0-9]{2}$'
          OR NOT (SELECT allowed FROM public.test_authorization)
          THEN RAISE EXCEPTION 'denied' USING ERRCODE='42501'; END IF;
        RETURN '${id(1)}'::uuid;
      END$$;
      CREATE TABLE vault.decrypted_secrets(name text,decrypted_secret text);
    `);
    await db.exec(migration);
    await t.test('browser roles have no EXECUTE, service JWT alone never bypasses actor scope', async () => {
      const privileges = (await db.query(`SELECT
        has_function_privilege('anon','public.get_nfse_homologation_relay_config_internal(uuid,uuid,uuid,text,text)','EXECUTE') anon,
        has_function_privilege('authenticated','public.get_nfse_homologation_relay_config_internal(uuid,uuid,uuid,text,text)','EXECUTE') authenticated,
        has_function_privilege('service_role','public.get_nfse_homologation_relay_config_internal(uuid,uuid,uuid,text,text)','EXECUTE') service`)).rows[0];
      assert.deepEqual(privileges, { anon: false, authenticated: false, service: true });
      await assert.rejects(get(), (error) => error.code === '42501');
      await db.exec(`SET request.jwt.claims='{"role":"service_role"}'; SET request.jwt.claim.sub='${id(90)}'`);
      await assert.rejects(get(), (error) => error.code === '22023');
      for (const invalid of [{ environment: 'PRODUCAO' }, { polo: id(2) }, { actor: id(99) }, { context: id(99) }]) {
        await assert.rejects(get(invalid), (error) => error.code === '42501');
      }
    });
    await t.test('unreviewed URL is blocked even when it resembles the Universo project hostname', async () => {
      await put(config);
      await assert.rejects(get(), (error) => error.code === '22023');
    });
    // The fixture fills the otherwise fail-closed deployment allowlist with one
    // synthetic Preview URL. This never changes the real Vault or migration source.
    const pinned = migration.replace('CREATE FUNCTION public.', 'CREATE OR REPLACE FUNCTION public.')
      .replace(/v_approved_urls constant text\[\]:=ARRAY\[[^\n]*\]::text\[\];/,
        `v_approved_urls constant text[]:=ARRAY['${url}']::text[];`);
    await db.exec(pinned);
    await t.test('returns reviewed server configuration without requiring or reading any A1 table', async () => {
      assert.deepEqual(await get(), config);
      const claims = (await db.query('SELECT auth.role() role,auth.uid() actor')).rows[0];
      assert.deepEqual(claims, { role: 'service_role', actor: id(90) });
      await db.exec('UPDATE public.test_authorization SET allowed=false');
      await assert.rejects(get(), (error) => error.code === '42501');
      await db.exec('UPDATE public.test_authorization SET allowed=true');
    });
    await t.test('rejects changed alias, external URL, weak key, extra secret fields and header injection', async () => {
      for (const invalid of [
        { ...config, url: url.replace('test-fixture', 'other-deployment') },
        { ...config, url: 'https://evil.test/api/nfse-homologation-relay' },
        { ...config, url: url + '?target=production' }, { ...config, key: '11'.repeat(16) },
        { ...config, privateKeyPem: 'PRIVATE_KEY_SENTINEL' },
        { ...config, protectionBypass: 'token\r\nheader: injected' },
      ]) {
        await put(invalid);
        await assert.rejects(get(), (error) => error.code === '22023' && !error.message.includes('SENTINEL'));
      }
    });
  } finally { await db.close(); }
});
