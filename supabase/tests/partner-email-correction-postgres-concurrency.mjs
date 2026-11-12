import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { installPartnerEmailCorrectionPostgres } from './fixtures/partner-email-correction-postgres-harness.mjs';
import { correct, delivery, ids, correctionRequest } from './fixtures/partner-email-correction-harness.mjs';
if (!process.env.PORTAL_PG_MODULE || !process.env.PORTAL_TEST_DATABASE_URL) {
  throw new Error('Requires PORTAL_PG_MODULE and PORTAL_TEST_DATABASE_URL pointing to an empty disposable PostgreSQL17 database.');
}
const databaseUrl = new URL(process.env.PORTAL_TEST_DATABASE_URL);
if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)
  || !['localhost', '127.0.0.1'].includes(databaseUrl.hostname)
  || databaseUrl.pathname !== '/partner_email_correction_test'
  || databaseUrl.search || databaseUrl.hash) {
  throw new Error('PostgreSQL fixture requires a local partner_email_correction_test database without connection overrides.');
}
const module = await import(pathToFileURL(process.env.PORTAL_PG_MODULE).href);
const { Client } = module.default ?? module;
const clients = await Promise.all([0,1,2].map(async () => {
  const client = new Client({ connectionString: process.env.PORTAL_TEST_DATABASE_URL });
  await client.connect(); return client;
}));
const [admin,a,b] = clients;
const one = async (client, sql) => (await client.query(sql)).rows[0];
try {
  assert.equal(Math.floor(Number((await one(admin, 'SHOW server_version_num')).server_version_num) / 10000), 17);
  await installPartnerEmailCorrectionPostgres(admin);
  for (const client of clients) await client.query("SELECT set_config('request.jwt.claim.role','service_role',false); SET statement_timeout='2s'");
  await a.query('BEGIN');
  await a.query('SELECT 1 FROM public.parceiros WHERE id=$1 FOR UPDATE', [ids.student]);
  await assert.rejects(correct(b), error => error.code === '55P03');
  await a.query('ROLLBACK');

  await a.query('BEGIN');
  const result = (await correct(a)).rows[0].result;
  assert.equal(result.userId, ids.auth);
  await assert.rejects(correct(b), error => error.code === '55P03');
  assert.equal((await one(b, `SELECT email FROM auth.users WHERE id='${ids.auth}'`)).email, 'aluno@example.com');
  await a.query('COMMIT');
  assert.deepEqual((await correct(b)).rows[0].result, result);
  assert.equal((await one(b, 'SELECT count(*)::int n FROM private.portal_partner_email_corrections')).n, 1);
  assert.equal((await one(b, 'SELECT count(*)::int n FROM auth.one_time_tokens')).n, 0);

  await a.query('BEGIN');
  const claim = (await delivery(a, 'CLAIM')).rows[0].result;
  assert.equal(claim.claimed, true);
  // No blocking lock inversion with concurrent profile assignment, even before the lease is visible.
  await assert.rejects(b.query(`INSERT INTO public.parceiros(id,tipo,email,auth_user_id,auth_login_email,cpf_cnpj)
    VALUES($1,'Professor','corrigido@example.com',$2,'corrigido@example.com','52998224725')`, [ids.other,ids.auth]),
  error => error.code === '40001');
  await a.query('COMMIT');
  await assert.rejects(b.query(`INSERT INTO public.parceiros(id,tipo,email)
    VALUES($1,'Professor','  CORRIGIDO@EXAMPLE.COM  ')`, [ids.other]), error => error.code === '40001');
  await assert.rejects(b.query(`UPDATE auth.users SET email='another@example.com' WHERE id=$1`, [ids.auth]), error => error.code === '40001');
  assert.equal((await delivery(b, 'CLAIM')).rows[0].result.claimed, false);

  await delivery(a, 'FINISH', { nonce: claim.deliveryNonce, sent: false, definitiveFailure: false });
  await admin.query(`UPDATE private.portal_partner_email_corrections SET delivery_lease_until=now()-interval '1 second',
    retry_at=now()-interval '1 second' WHERE request_id=$1`, [correctionRequest]);
  const retry = (await delivery(b, 'CLAIM')).rows[0].result;
  assert.notEqual(retry.deliveryNonce, claim.deliveryNonce); assert.equal(retry.userId, ids.auth);
  await assert.rejects(delivery(a, 'FINISH', { nonce: claim.deliveryNonce, sent: true, definitiveFailure: false }), error => error.code === '40001');
  await delivery(b, 'FINISH', { nonce: retry.deliveryNonce, sent: true, definitiveFailure: false });
  await admin.query(`UPDATE auth.users SET recovery_token='new-link' WHERE id=$1`, [ids.auth]);
  assert.equal((await correct(a)).rows[0].result.emailSent, true);
  assert.equal((await one(admin, `SELECT recovery_token FROM auth.users WHERE id='${ids.auth}'`)).recovery_token, 'new-link');
  console.log('PASS PostgreSQL17: NOWAIT, concurrent CAS/replay, advisory profile fence, normalized destination lease, old-token deletion and nonce expiry.');
} finally {
  await Promise.all(clients.map(async client => { try { await client.query('ROLLBACK'); } finally { await client.end(); } }));
}
