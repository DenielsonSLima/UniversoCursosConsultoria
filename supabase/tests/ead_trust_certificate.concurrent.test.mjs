import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  newTrustCertificateDatabase, seedFinancial, grant, submit, state, scalar, pay, validate,
  alumno, enrollment,
} from './ead_trust_certificate.fixture.mjs';
import { newTrustPostgresDatabase, waitForPostgresLock } from './fixtures/ead-trust-postgres-adapter.mjs';

const enabled = Boolean(process.env.EAD_TEST_DATABASE_URL);
const sqlTest = (name, run) => test(name, { skip: !enabled, timeout: 45000 }, run);
const studentContext = db => db.query(
  "SELECT set_config('test.aluno_id',$1,false),set_config('test.actor',$1,false),set_config('test.gestor','false',false)",
  [alumno],
);
async function setup(t) {
  const postgres = await newTrustPostgresDatabase();
  t.after(() => postgres.close());
  const db = await newTrustCertificateDatabase({ database: postgres.database });
  await seedFinancial(db, { managed: true });
  await grant(db);
  return { postgres, db };
}
const ledger = db => scalar(db, 'SELECT to_jsonb(issue) AS value FROM internal_academic.ead_trust_certificate_issues issue');
const withoutTransactionControl = db => ({
  ...db,
  exec: sql => /^(BEGIN|COMMIT|ROLLBACK)$/i.test(sql.trim()) ? Promise.resolve() : db.exec(sql),
});
const observe = promise => promise.then(value => ({ value }), error => ({ error }));
const resolveObserved = async promise => {
  const result = await promise;
  if (result.error) throw result.error;
  return result.value;
};
const expireSyntheticGrant = db => db.exec(`BEGIN;
  UPDATE internal_academic.ead_trust_access_audit
    SET granted_at=statement_timestamp()-interval '24 hours 1 second',expires_at=statement_timestamp()-interval '1 second';
  UPDATE public.matriculas SET acesso_temporario_ate=statement_timestamp()-interval '1 second';
  UPDATE internal_academic.ead_trust_certificate_issues SET deadline=statement_timestamp()-interval '1 second';
  COMMIT;`);

sqlTest('PostgreSQL: concurrent quiz conclusions serialize to one temporary certificate', async t => {
  const { postgres, db } = await setup(t);
  const first = await postgres.connect('ead_trust_quiz_first');
  const second = await postgres.connect('ead_trust_quiz_second');
  await studentContext(first); await studentContext(second);
  await first.exec('BEGIN');
  await submit(first);
  const secondResult = observe(submit(second));
  // Real independent sessions: the second quiz must wait on the enrollment.
  await waitForPostgresLock(db, 'ead_trust_quiz_second');
  await first.exec('COMMIT');
  await resolveObserved(secondResult);
  const current = await state(db);
  assert.equal(current.enrollment.status, 'PENDENTE');
  assert.equal(current.certificates.length, 1);
  assert.equal(current.documents.length, 1);
  assert.equal(current.certificates[0].status, 'FINALIZADO');
  assert.equal((await ledger(db)).state, 'TEMPORARY');
});

sqlTest('PostgreSQL: expiry holding enrollment lock and canonical payment produce one replacement', async t => {
  const { postgres, db } = await setup(t);
  await studentContext(db); await submit(db);
  const initial = await state(db);
  const oldCode = initial.certificates[0].codigo_validacao;
  // Move this synthetic grant as a whole, preserving its exact 24-hour duration.
  await expireSyntheticGrant(db);
  const worker = await postgres.connect('ead_trust_expiry_worker');
  const payer = await postgres.connect('ead_trust_late_payer');
  await worker.exec('BEGIN');
  assert.equal(await scalar(worker, 'SELECT internal_academic.process_expired_ead_trust_certificates(100) AS value'), 1);
  const paymentResult = observe(pay(payer, { managed: true, backdated: true }));
  await waitForPostgresLock(db, 'ead_trust_late_payer');
  await worker.exec('COMMIT');
  await resolveObserved(paymentResult);
  const current = await state(db);
  const issue = await ledger(db);
  assert.equal(current.certificates.length, 1);
  assert.equal(current.documents.length, 2);
  assert.equal(issue.state, 'REISSUED');
  assert.notEqual(current.certificates[0].codigo_validacao, oldCode);
  assert.equal((await validate(db, oldCode)).status, 'REVOKED');
  assert.equal((await validate(db, current.certificates[0].codigo_validacao)).status, 'ACTIVE');
  assert.equal(current.documents.find(document => document.codigo === oldCode).status, 'REVOGADO');
  await pay(payer, { managed: true, backdated: true });
  assert.equal((await state(db)).documents.length, 2, 'Repeated financial callbacks cannot create another code.');
});

sqlTest('PostgreSQL: expiry skips an expired enrollment held by payment and the callback replaces the revoked code', async t => {
  const { postgres, db } = await setup(t);
  await studentContext(db); await submit(db);
  const oldCode = (await state(db)).certificates[0].codigo_validacao;
  await expireSyntheticGrant(db);
  const payer = await postgres.connect('ead_trust_early_payer');
  const worker = await postgres.connect('ead_trust_skip_worker');
  await payer.exec('BEGIN');
  await payer.query('SELECT id FROM public.matriculas WHERE id=$1 FOR UPDATE', [enrollment]);
  await pay(withoutTransactionControl(payer), { managed: true });
  assert.equal(await scalar(worker, 'SELECT internal_academic.process_expired_ead_trust_certificates(100) AS value'), 0);
  await payer.exec('COMMIT');
  assert.equal((await ledger(db)).state, 'REISSUED');
  const current = await state(db);
  assert.notEqual(current.certificates[0].codigo_validacao, oldCode);
  assert.equal(current.documents.length, 2);
  assert.equal((await validate(db, oldCode)).status, 'REVOKED');
  assert.equal((await validate(db, current.certificates[0].codigo_validacao)).status, 'ACTIVE');
  assert.equal(await scalar(worker, 'SELECT internal_academic.process_expired_ead_trust_certificates(100) AS value'), 0);
});
