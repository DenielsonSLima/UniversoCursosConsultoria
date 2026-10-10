import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCopyFixture, syntheticCopyReceipt } from './fixtures/proesc-v2-copy.fixture.mjs';

const f = await createCopyFixture();
const template = readFileSync(new URL('../review-drafts/proesc-v2-growth/invoke-copy-pilot.template.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../migrations/20261002010400_proesc_v2_worker_and_cycle_readers.sql', import.meta.url), 'utf8');
const authorizer = migration.slice(migration.indexOf('CREATE FUNCTION public.proesc_v2_worker_service'),
  migration.indexOf('$function$;') + '$function$;'.length);
const batch = f.id(4900);
const execute = (id = batch) => f.db.exec(template.replace('REPLACE_WITH_APPROVED_BATCH_UUID', id));
const rejected = async (action, pattern) => { await assert.rejects(action, pattern); await f.db.exec('ROLLBACK'); };
let checks = 0;
try {
  // All fixture-only: no pg_net extension, HTTP, Vault encryption, real credentials or production.
  await f.db.exec(authorizer.replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION'));
  await f.db.exec(`
    INSERT INTO vault.decrypted_secrets VALUES('proesc_sync_worker_secret',repeat('a',64));
    CREATE SCHEMA net; CREATE TABLE net.synthetic_requests(id bigserial PRIMARY KEY,url text,body jsonb,headers jsonb,timeout integer);
    CREATE FUNCTION net.http_post(url text,body jsonb DEFAULT '{}',params jsonb DEFAULT '{}',
      headers jsonb DEFAULT '{}',timeout_milliseconds integer DEFAULT 5000) RETURNS bigint LANGUAGE plpgsql AS $$
      DECLARE v_id bigint; BEGIN
      INSERT INTO net.synthetic_requests(url,body,headers,timeout) VALUES(url,body,headers,timeout_milliseconds) RETURNING id INTO v_id;
      RETURN v_id; END; $$;`);
  assert.equal(await f.scalar(`SELECT md5(prosrc) value FROM pg_proc WHERE oid='public.proesc_v2_worker_service(text,jsonb)'::regprocedure`),
    '27e224bb4306865752b2b611fad456a3'); checks++;
  await rejected(() => f.db.exec(template), /invalid input syntax.*uuid/); checks++;
  await rejected(() => execute(), /Approved copy plan/); checks++;
  await f.db.query('SELECT internal_proesc.v2_prepare_copy_archive($1,$2,$3,$4::uuid[])', [f.id(4901), f.run, '3145', f.observationIds]);
  await rejected(() => execute(f.id(4901)), /exactly one observation/); checks++;
  await f.db.query('SELECT internal_proesc.v2_prepare_copy_archive($1,$2,$3,$4::uuid[])', [batch, f.run, '3145', [f.observationIds[0]]]);
  await rejected(() => f.db.exec('BEGIN; SET ROLE authenticated;' + template.slice(template.indexOf("SET LOCAL lock_timeout"))), /Database operator required/); checks++;
  await f.db.exec("UPDATE vault.decrypted_secrets SET decrypted_secret='synthetic-invalid'");
  await rejected(() => execute(), /identity unavailable/); checks++;
  await f.db.exec("UPDATE vault.decrypted_secrets SET decrypted_secret=repeat('a',64)");
  await f.db.exec("CREATE OR REPLACE FUNCTION public.proesc_v2_worker_service(p_action text,p_payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql AS $$BEGIN RETURN '{}'; END$$");
  await rejected(() => execute(), /authorization changed/); checks++;
  await f.db.exec(authorizer.replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION'));
  assert.equal(await f.scalar('SELECT count(*)::int value FROM net.synthetic_requests'), 0); checks++;
  const results = await execute();
  assert.ok(results.some((r) => r.rows.some((row) => row.request_id === 1))); checks++;
  const request = (await f.db.query('SELECT * FROM net.synthetic_requests')).rows[0];
  assert.equal(request.url, 'https://kfekgwyqozhicpfuunpo.supabase.co/functions/v1/proesc-v2-copy-archive');
  assert.deepEqual(request.body, { batchId: batch });
  assert.deepEqual(request.headers, { 'Content-Type': 'application/json', 'X-Proesc-Sync-Secret': 'a'.repeat(64) });
  assert.equal(request.timeout, 90000); checks++;
  const source = await f.scalar('SELECT public.proesc_v2_export_copy_service($1) value', [batch]);
  await f.db.query('SELECT public.proesc_v2_record_copy_receipt_service($1,$2::jsonb)', [batch, JSON.stringify(syntheticCopyReceipt(source))]);
  await rejected(() => execute(), /Receipt already exists/);
  assert.equal(await f.scalar('SELECT count(*)::int value FROM net.synthetic_requests'), 1); checks++;
  console.log(JSON.stringify({ result: 'PASS', checks, scope: 'Invocation template with synthetic net/Vault; no network' }));
} finally { await f.db.close(); }
