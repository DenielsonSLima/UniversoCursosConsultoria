import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { actor, patch, read, setup } from './lgpd_profile_photos.fixture.mjs';

const { PGlite } = await import(process.env.PGLITE_MODULE_PATH
  ? pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href : '@electric-sql/pglite');
const reason = 'Operação MCP sintética autorizada para teste';
const gatewayJwt = 'eyJzeW50aGV0aWMi.eyJyb2xlIjoiYW5vbiJ9.cHVibGljLWZpeHR1cmU';
const signature = 'internal_privacy.dispatch_profile_photo_migration_operation(boolean,text,text)';

async function build() {
  const db = new PGlite();
  await setup(db); await patch(db);
  await db.exec(`
    CREATE SCHEMA net;
    CREATE TABLE net.calls(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      url text, headers jsonb, body jsonb, timeout_milliseconds integer);
    CREATE FUNCTION net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds integer)
    RETURNS bigint LANGUAGE plpgsql SET search_path = '' AS $$
    DECLARE v_id bigint;
    BEGIN
      INSERT INTO net.calls(url, headers, body, timeout_milliseconds)
      VALUES ($1,$2,$3,$4) RETURNING id INTO v_id;
      RETURN v_id;
    END;
    $$;
  `);
  await db.exec(await read('../migrations/20261101030954_lgpd_profile_photo_operations.sql'));
  return db;
}
const close = async db => { await db.exec('RESET ROLE'); await db.close(); };
const dispatch = async (db, dryRun = true, customReason = reason) => {
  await db.exec('RESET ROLE');
  return (await db.query('SELECT internal_privacy.dispatch_profile_photo_migration_operation($1,$2,$3) value',
    [dryRun, customReason, gatewayJwt])).rows[0].value;
};
const token = async db => {
  await db.exec('RESET ROLE');
  return (await db.query("SELECT headers->>'x-lgpd-operation-token' value FROM net.calls ORDER BY id DESC LIMIT 1")).rows[0].value;
};
const claim = async (db, value) => {
  await actor(db, { role: 'service_role' });
  return (await db.query('SELECT public.claim_profile_photo_migration_operation($1) value', [value])).rows[0].value;
};

test('dispatch somente proprietário: URL fixa, capability curta e só hash persistido/retorno sem token', async () => {
  const db = await build();
  try {
    const queued = await dispatch(db);
    assert.deepEqual(Object.keys(queued).sort(), ['dryRun', 'operationId', 'requestId']);
    const row = (await db.query('SELECT * FROM internal_privacy.profile_photo_operations')).rows[0];
    const request = (await db.query('SELECT * FROM net.calls')).rows[0];
    const raw = request.headers['x-lgpd-operation-token'];
    assert.match(raw, /^[0-9a-f]{64}$/);
    assert.notEqual(row.token_hash, raw);
    assert.equal(row.token_hash, (await db.query("SELECT encode(sha256(convert_to($1,'UTF8')),'hex') value", [raw])).rows[0].value);
    assert.equal((await db.query('SELECT extract(epoch FROM expires_at-created_at)::integer ttl FROM internal_privacy.profile_photo_operations')).rows[0].ttl, 300);
    assert.equal(request.url, 'https://kfekgwyqozhicpfuunpo.supabase.co/functions/v1/profile-photo-migration');
    assert.equal(request.headers.Authorization, `Bearer ${gatewayJwt}`);
    assert.deepEqual(request.body, {});
    assert.equal(request.timeout_milliseconds, 90000);
    assert.equal(row.request_id, request.id);
    assert.equal(JSON.stringify(queued).includes(raw), false);
    const security = (await db.query('SELECT prosecdef,proconfig FROM pg_proc WHERE oid=$1::regprocedure', [signature])).rows[0];
    assert.equal(security.prosecdef, false);
    assert.deepEqual(security.proconfig, ['search_path=""']);
  } finally { await close(db); }
});

test('anon, authenticated e service_role não criam capabilities nem leem sua tabela', async () => {
  const db = await build();
  try {
    await dispatch(db);
    for (const role of ['anon', 'authenticated', 'service_role']) {
      await actor(db, { role });
      await assert.rejects(() => db.query('SELECT internal_privacy.dispatch_profile_photo_migration_operation($1,$2,$3)', [true, reason, gatewayJwt]), /permission denied/);
      await assert.rejects(() => db.query('SELECT * FROM internal_privacy.profile_photo_operations'), /permission denied/);
      if (role !== 'service_role') {
        await assert.rejects(() => db.query('SELECT public.claim_profile_photo_migration_operation($1)', ['f'.repeat(64)]), /permission denied/);
        await assert.rejects(() => db.query('SELECT public.finish_profile_photo_migration_operation($1,$2)', ['00000000-0000-4000-8000-000000000001', '{}']), /permission denied/);
      }
    }
  } finally { await close(db); }
});

test('claim é single-use e entrega identidade de operação, motivo e modo somente da tabela', async () => {
  const db = await build();
  try {
    const queued = await dispatch(db, false);
    const raw = await token(db);
    const claimed = await claim(db, raw);
    assert.deepEqual(claimed, { actorId: queued.operationId, reason, dryRun: false });
    await assert.rejects(() => db.query('SELECT public.claim_profile_photo_migration_operation($1)', [raw]), /não autorizada/);
    for (const invalid of [null, '', 'f'.repeat(63), 'f'.repeat(65), 'f'.repeat(64)]) {
      await assert.rejects(() => db.query('SELECT public.claim_profile_photo_migration_operation($1)', [invalid]), /não autorizada/);
    }
    await db.exec('RESET ROLE');
    assert.ok((await db.query('SELECT claimed_at FROM internal_privacy.profile_photo_operations')).rows[0].claimed_at);
  } finally { await close(db); }
});

test('duas tentativas de claim não reutilizam token nem geram dois consumidores', async () => {
  const db = await build();
  try {
    await dispatch(db);
    const raw = await token(db);
    await actor(db, { role: 'service_role' });
    const results = await Promise.allSettled([1, 2].map(() => db.query('SELECT public.claim_profile_photo_migration_operation($1)', [raw])));
    assert.equal(results.filter(value => value.status === 'fulfilled').length, 1);
    assert.equal(results.filter(value => value.status === 'rejected').length, 1);
  } finally { await close(db); }
});

test('segundo lote aguarda finish; resultado retém apenas contadores inteiros permitidos', async () => {
  const db = await build();
  try {
    const queued = await dispatch(db);
    const raw = await token(db);
    await assert.rejects(() => dispatch(db), /operação em andamento/);
    await claim(db, raw);
    await db.query('SELECT public.finish_profile_photo_migration_operation($1,$2::jsonb)', [queued.operationId,
      JSON.stringify({ pending: 3, completed: 1, failed: -1, quarantined: 1.5, publicSourcesRemaining: '0', reason: 'synthetic', paths: [] })]);
    await assert.rejects(() => db.query('SELECT public.finish_profile_photo_migration_operation($1,$2::jsonb)', [queued.operationId, '{}']), /não autorizada/);
    await db.exec('RESET ROLE');
    assert.deepEqual((await db.query('SELECT result FROM internal_privacy.profile_photo_operations WHERE id=$1', [queued.operationId])).rows[0].result,
      { pending: 3, completed: 1 });
    assert.notEqual((await dispatch(db)).operationId, queued.operationId);
  } finally { await close(db); }
});

test('expiração permite nova tentativa, mas nunca revalida token antigo', async () => {
  const db = await build();
  try {
    const queued = await dispatch(db);
    const old = await token(db);
    await db.query("UPDATE internal_privacy.profile_photo_operations SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [queued.operationId]);
    const fresh = await dispatch(db);
    await assert.rejects(() => claim(db, old), /não autorizada/);
    assert.notEqual(fresh.operationId, queued.operationId);
    const current = await token(db);
    assert.notEqual(current, old);
    assert.equal((await claim(db, current)).actorId, fresh.operationId);
  } finally { await close(db); }
});

test('falha ao enfileirar não deixa capability órfã válida na tabela', async () => {
  const db = await build();
  try {
    await db.exec(`CREATE OR REPLACE FUNCTION net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds integer)
      RETURNS bigint LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic net failure'; END; $$;`);
    await assert.rejects(() => dispatch(db), /synthetic net failure/);
    assert.equal((await db.query('SELECT count(*)::integer total FROM internal_privacy.profile_photo_operations')).rows[0].total, 0);
  } finally { await close(db); }
});
