import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const modulePath = process.env.NFSE_TEST_PGLITE_MODULE;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const migration = await readFile(new URL('../migrations/20261110183131_nfse_homologation_pilot_ledger.sql', import.meta.url), 'utf8');
const id = (n) => `00000000-0000-0000-0000-000000000${String(n).padStart(3, '0')}`;
const issuer = '00000000000100';
const synthetic = {
  fiscalInput: { environment: 'HOMOLOGACAO', issuerMunicipalityCode: '2803401',
    issuer: { taxId: { type: 'CNPJ', value: issuer }, simpleNationalOption: '1', specialTaxRegime: '0' },
    recipient: { taxId: { type: 'CNPJ', value: issuer }, name: 'TOMADOR SINTETICO - TESTE SEM VALOR FISCAL' },
    values: { serviceAmount: '1.00' }, review: { ibscbs: 'SYNTHETIC_PILOT_OMISSION' } },
  preview: { synthetic: true, serviceDescription: 'TESTE TECNICO SEM VALOR FISCAL' },
};

test('pilot ledger owns stable DPS identity, replay, authorization and uncertain recovery', async (t) => {
  const db = new PGlite();
  const command = async (action, options = {}) => (await db.query(
    'SELECT public.nfse_homologation_pilot_internal($1,$2,$3,$4,$5,$6,$7,$8,$9) value',
    Object.values({ actor: id(11), context: id(10), polo: id(1), environment: 'HOMOLOGACAO',
      month: '2026-11', request: id(80), action, preview: null, input: null, ...options }),
  )).rows[0].value;
  const preview = (options = {}) => command('PREVIEW', { input: synthetic, ...options });
  const finish = (row, state, options = {}) => command('FINISH', { preview: row.previewId,
    input: { state, dpsId: `DPS28034012${issuer}${row.fiscalInput.series}${row.fiscalInput.number.padStart(15, '0')}`,
      message: 'Resultado sintético do ensaio isolado', ...options } });
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth; CREATE SCHEMA private;
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
      CREATE TABLE public.polos(id uuid PRIMARY KEY,cnpj text);
      INSERT INTO public.polos VALUES('${id(1)}','${issuer}'),('${id(2)}','00000000000200');
      CREATE TABLE private.nfse_configurations(polo_id uuid,environment text,credential_polo_id uuid,definition jsonb,version int);
      INSERT INTO private.nfse_configurations VALUES('${id(1)}','HOMOLOGACAO','${id(1)}',
        '{"municipalityCode":"2803401","opSimpNac":"1","regEspTrib":"0","regApTribSN":null}',1);
      CREATE TABLE private.nfse_certificates(polo_id uuid,environment text,cnpj text,not_before timestamptz,expires_at timestamptz,fingerprint text);
      INSERT INTO private.nfse_certificates VALUES('${id(1)}','HOMOLOGACAO','${issuer}',now()-interval '1 day',now()+interval '1 year',repeat('a',64));
    `);
    await db.exec(migration);
    await t.test('only service executor is granted access and regular JWT cannot create pilots', async () => {
      const privileges = (await db.query(`SELECT
        has_function_privilege('anon','public.nfse_homologation_pilot_internal(uuid,uuid,uuid,text,text,uuid,text,uuid,jsonb)','EXECUTE') anon,
        has_function_privilege('authenticated','public.nfse_homologation_pilot_internal(uuid,uuid,uuid,text,text,uuid,text,uuid,jsonb)','EXECUTE') authenticated,
        has_function_privilege('service_role','public.nfse_homologation_pilot_internal(uuid,uuid,uuid,text,text,uuid,text,uuid,jsonb)','EXECUTE') service,
        has_table_privilege('authenticated','private.nfse_homologation_pilots','SELECT') browser_read`)).rows[0];
      assert.deepEqual(privileges, { anon: false, authenticated: false, service: true, browser_read: false });
      await assert.rejects(preview(), (error) => error.code === '42501');
    });
    await db.exec(`SET request.jwt.claims='{"role":"service_role"}'; SET request.jwt.claim.sub='${id(90)}'`);
    await t.test('production, filial, wrong/revoked identity are rejected before lookup or write', async () => {
      await assert.rejects(preview({ environment: 'PRODUCAO' }), (error) => error.code === '22023');
      for (const invalid of [{ polo: id(2) }, { actor: id(99) }, { context: id(99) }]) {
        await assert.rejects(preview(invalid), (error) => error.code === '42501');
      }
      await db.exec('UPDATE public.test_authorization SET allowed=false');
      await assert.rejects(preview(), (error) => error.code === '42501');
      await db.exec('UPDATE public.test_authorization SET allowed=true');
      assert.equal((await db.query('SELECT count(*)::int n FROM private.nfse_homologation_pilots')).rows[0].n, 0);
    });
    let row;
    await t.test('preview has durable reservation and rejects divergent replay or actual-receipt payload', async () => {
      row = await preview(); const replay = await preview();
      assert.equal(replay.previewId, row.previewId); assert.equal(replay.fiscalInput.number, row.fiscalInput.number);
      assert.equal(row.fiscalInput.series, '49999'); assert.equal(row.state, 'PREVIEWED');
      assert.equal(row.dispatch, false);
      const divergent = globalThis.structuredClone(synthetic); divergent.preview.serviceDescription = 'DIVERGENT';
      await assert.rejects(preview({ input: divergent }), (error) => error.code === '22023');
      const realAmount = globalThis.structuredClone(synthetic); realAmount.fiscalInput.values.serviceAmount = '260.00';
      await assert.rejects(preview({ request: id(81), input: realAmount }), (error) => error.code === '22023');
      await assert.rejects(preview({ input: { ...synthetic, receiptId: id(99) } }), (error) => error.code === '22023');
      assert.equal((await db.query('SELECT count(*)::int n FROM private.nfse_homologation_pilots')).rows[0].n, 1);
      assert.equal((await db.query('SELECT auth.role() role,auth.uid() actor')).rows[0].actor, id(90));
    });
    await t.test('claim detects configuration or certificate drift and expires stale previews', async () => {
      await db.exec('UPDATE private.nfse_configurations SET version=2');
      await assert.rejects(command('CLAIM', { preview: row.previewId }), (error) => error.code === '40001');
      await db.exec("UPDATE private.nfse_configurations SET version=1; UPDATE private.nfse_certificates SET fingerprint=repeat('b',64)");
      await assert.rejects(command('CLAIM', { preview: row.previewId }), (error) => error.code === '40001');
      await db.exec("UPDATE private.nfse_certificates SET fingerprint=repeat('a',64)");
      const stale = await preview({ request: id(82) });
      await db.query("UPDATE private.nfse_homologation_pilots SET expires_at=now()-interval '1 second' WHERE id=$1", [stale.previewId]);
      await assert.rejects(command('CLAIM', { request: id(82), preview: stale.previewId }), (error) => error.code === '40001');
    });
    await t.test('only first claim dispatches; lost response and uncertain state recover by consultation', async () => {
      const first = await command('CLAIM', { preview: row.previewId });
      const replay = await command('CLAIM', { preview: row.previewId });
      assert.equal(first.dispatch, true); assert.equal(first.state, 'PROCESSING');
      assert.equal(replay.dispatch, false); assert.equal(replay.state, 'PROCESSING');
      const uncertain = await finish(row, 'AWAITING_CONFIRMATION');
      assert.equal(uncertain.state, 'AWAITING_CONFIRMATION');
      const consult = await command('READ', { preview: row.previewId });
      const repeated = await command('CLAIM', { preview: row.previewId });
      assert.equal(consult.dispatch, false); assert.equal(repeated.dispatch, false);
      assert.equal(consult.fiscalInput.number, first.fiscalInput.number);
      assert.equal(consult.fiscalInput.issuedAt, first.fiscalInput.issuedAt);
    });
    await t.test('finish binds DPS identity and requires proof; authorization remains immutable', async () => {
      await assert.rejects(finish(row, 'AUTHORIZED'), (error) => error.code === '22023');
      await assert.rejects(finish(row, 'AUTHORIZED', { dpsId: 'DPS_WRONG', accessKey: '1'.repeat(50),
        authorizedXml: '<NFSe>synthetic proof sentinel</NFSe>' }), (error) => error.code === '22023');
      await assert.rejects(finish(row, 'AUTHORIZED', { accessKey: '1'.repeat(50),
        authorizedXml: '<!DOCTYPE NFSe><NFSe>unsafe</NFSe>' }), (error) => error.code === '22023');
      // This fixture tests SQL envelope guards. Cryptographic/schema/identity proof
      // of the authorized XML belongs to the dedicated provider tests.
      const authorized = await finish(row, 'AUTHORIZED', { accessKey: '1'.repeat(50),
        authorizedXml: '<NFSe>synthetic proof sentinel</NFSe>', signedDpsXml: '<DPS>not retained in result</DPS>' });
      assert.equal(authorized.state, 'AUTHORIZED');
      assert.equal('authorizedXml' in authorized.result, false);
      assert.equal('signedDpsXml' in authorized.result, false);
      assert.equal(JSON.stringify(authorized).includes('synthetic proof sentinel'), false);
      await assert.rejects(finish(row, 'AUTHORIZED', { accessKey: '2'.repeat(50),
        authorizedXml: '<NFSe>different</NFSe>' }), (error) => error.code === '40001');
      const replay = await command('CLAIM', { preview: row.previewId });
      assert.equal(replay.dispatch, false); assert.equal(replay.state, 'AUTHORIZED');
      await db.exec('UPDATE public.test_authorization SET allowed=false');
      await assert.rejects(command('READ', { preview: row.previewId }), (error) => error.code === '42501');
    });
  } finally { await db.close(); }
});
