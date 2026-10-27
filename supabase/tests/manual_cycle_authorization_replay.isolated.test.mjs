import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const modulePath = process.env.PGLITE_MODULE_PATH
  ? pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href
  : '@electric-sql/pglite';
const { PGlite } = await import(modulePath);
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const fixture = await read('./fixtures/manual-cycle-authorization-replay.sql');
const original = await read('./fixtures/canonical-authorize_technical_manual_receivable_issuance_secure.sql');
const firstClaim = await read('./fixtures/canonical-guard_manual_technical_receivable_first_bank_claim.sql');
const patch = await read('../migrations/20261027133000_allow_audited_manual_cycle_authorization_resume.sql');
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const scope = { receivable: id(1), enrollment: id(2), turma: id(3), polo: id(4),
  payer: id(5), request: id(6), cycleRequest: id(7), originalActor: id(8), nextActor: id(9) };
const signature = 'public.authorize_technical_manual_receivable_issuance_secure(uuid,uuid)';
const call = async (db, request = scope.request) => (await db.query(
  `SELECT public.authorize_technical_manual_receivable_issuance_secure($1,$2) AS result`,
  [scope.receivable, request],
)).rows[0].result;
const actor = async (db, overrides = {}) => {
  await db.exec('RESET ROLE');
  const state = { uid: scope.nextActor, role: 'authenticated', finance: 'true',
    polo: scope.polo, protected: 'false', reviewed: 'true', ...overrides };
  for (const [key, value] of Object.entries(state)) {
    await db.query('SELECT set_config($1,$2,true)', [`test.${key}`, value]);
  }
  assert.ok(['authenticated', 'anon', 'service_role'].includes(state.role));
  await db.exec(`SET LOCAL ROLE ${state.role}`);
  assert.equal((await db.query('SELECT current_user AS role')).rows[0].role, state.role);
};
const denied = async (db, action, code, detail) => {
  await db.exec('SAVEPOINT denied');
  await assert.rejects(action, (error) => error.code === code
    && (!detail || error.detail === detail));
  await db.exec('ROLLBACK TO SAVEPOINT denied; RELEASE SAVEPOINT denied');
};
const snapshot = async (db) => {
  await db.exec('RESET ROLE');
  return (await db.query(`SELECT
    (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.contas_receber r) AS receivables,
    (SELECT jsonb_agg(to_jsonb(a) ORDER BY receivable_id)
      FROM internal_academic.technical_manual_receivable_issuance_authorizations a) AS authorizations,
    (SELECT jsonb_agg(to_jsonb(r) ORDER BY request_id)
      FROM internal_academic.technical_manual_cycle_runs r) AS runs`)).rows[0];
};
const seed = async (db) => {
  await db.query(`INSERT INTO public.matriculas VALUES ($1,$2,'ATIVO')`, [scope.enrollment,scope.turma]);
  await db.query(`INSERT INTO public.contas_receber
    (id,matricula_id,turma_id,polo_id,cliente_id,tipo_lancamento,parcela_numero,
      origem_cronograma_id,descricao,valor,data_vencimento,status,regra_financeira_tecnica_snapshot)
    VALUES ($1,$2,$3,$4,$5,'PARCELA',1,'synthetic-origin','Mensalidade sintética',260,
      '2026-12-01','PENDENTE',$6::jsonb)`,
  [scope.receivable,scope.enrollment,scope.turma,scope.polo,scope.payer,JSON.stringify({
    destinoCobranca:'BANESE',cicloManual:{requestId:scope.cycleRequest},
  })]);
  await db.query(`INSERT INTO internal_academic.technical_manual_cycle_runs
    VALUES ($1,$2,2,'LOCAL_CREATED',ARRAY[$3::uuid],$4,$5)`,
  [scope.enrollment,scope.turma,scope.receivable,scope.cycleRequest,scope.originalActor]);
};
const database = async (patched = true) => {
  const db = new PGlite();
  await db.exec(fixture);
  await db.exec(original.trimEnd() + ';');
  await db.exec(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC,anon,service_role;
    GRANT EXECUTE ON FUNCTION ${signature} TO authenticated`);
  const metadata = (await db.query(`SELECT to_jsonb(p)-'prosrc' AS data FROM pg_proc p
    WHERE oid=$1::regprocedure`,[signature])).rows[0].data;
  if (patched) await db.exec(patch);
  assert.deepEqual((await db.query(`SELECT to_jsonb(p)-'prosrc' AS data FROM pg_proc p
    WHERE oid=$1::regprocedure`,[signature])).rows[0].data, metadata);
  await db.exec('BEGIN');
  await seed(db);
  await actor(db,{uid:scope.originalActor});
  assert.equal((await call(db)).authorized,true);
  return db;
};
const close = async (db) => { await db.exec('ROLLBACK'); await db.close(); };

test('canonical SQL reproduces PT422 for another actor and changed fingerprint before patch', async () => {
  const db = await database(false);
  try {
    await actor(db);
    await denied(db,()=>call(db),'PT422');
    await db.exec('RESET ROLE');
    await db.exec('UPDATE public.contas_receber SET valor=261');
    await actor(db,{uid:scope.originalActor});
    await denied(db,()=>call(db),'PT422');
  } finally { await close(db); }
});

test('authorized handoff preserves authorization and receivable, audit occurs once per resuming actor', async () => {
  const db = await database();
  try {
    const before = await snapshot(db);
    await actor(db);
    assert.equal((await call(db)).replayed,true);
    assert.equal((await call(db)).authorized,true);
    assert.deepEqual(await snapshot(db),before);
    const audits = (await db.query(`SELECT * FROM public.historico_turma_financeira
      WHERE evento='CICLO_TECNICO_MANUAL_RETOMADA_OUTRO_GESTOR'`)).rows;
    assert.equal(audits.length,1);
    assert.equal(audits[0].regra.originalAuthorizedBy,scope.originalActor);
    assert.equal(audits[0].regra.resumedBy,scope.nextActor);
    await actor(db,{uid:scope.originalActor});
    assert.equal((await call(db)).replayed,true);
    await db.exec('RESET ROLE');
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.historico_turma_financeira
      WHERE evento='CICLO_TECNICO_MANUAL_RETOMADA_OUTRO_GESTOR'`)).rows[0].n,1);
  } finally { await close(db); }
});

test('missing identity, denied or nullable finance/polo permission and anon/service are rejected', async () => {
  const db = await database();
  try {
    const before = await snapshot(db);
    for (const state of [
      {uid:''},{finance:'false'},{finance:''},{polo:''},{polo:id(99)},
      {role:'anon',uid:''},{role:'service_role',uid:''},
    ]) {
      await actor(db,state);
      await denied(db,()=>call(db),'42501');
    }
    assert.deepEqual(await snapshot(db),before);
  } finally { await close(db); }
});

test('fingerprint changes remain blocked for original and replacement actors without audit', async () => {
  const db = await database();
  try {
    for (const mutation of ["valor=261", "data_vencimento='2026-12-02'", "descricao='Alterada'"]) {
      await db.exec('RESET ROLE; SAVEPOINT mutation');
      await db.exec(`UPDATE public.contas_receber SET ${mutation}`);
      const before = await snapshot(db);
      for (const uid of [scope.originalActor,scope.nextActor]) {
        await actor(db,{uid});
        await denied(db,()=>call(db),'PT422','CYCLE_AUTHORIZATION_FINGERPRINT_MISMATCH');
      }
      assert.deepEqual(await snapshot(db),before);
      await db.exec('ROLLBACK TO SAVEPOINT mutation; RELEASE SAVEPOINT mutation');
    }
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.historico_turma_financeira
      WHERE evento='CICLO_TECNICO_MANUAL_RETOMADA_OUTRO_GESTOR'`)).rows[0].n,0);
  } finally { await close(db); }
});

test('authorization scope and cycle snapshot identity must match even with unchanged fingerprint', async () => {
  const db = await database();
  try {
    for (const mutation of [
      `UPDATE internal_academic.technical_manual_receivable_issuance_authorizations SET matricula_id='${id(99)}'`,
      `UPDATE internal_academic.technical_manual_receivable_issuance_authorizations SET turma_id='${id(99)}'`,
      `UPDATE internal_academic.technical_manual_receivable_issuance_authorizations SET cycle_number=1`,
      `UPDATE public.contas_receber SET regra_financeira_tecnica_snapshot='{"destinoCobranca":"BANESE"}'`,
    ]) {
      await db.exec('RESET ROLE; SAVEPOINT mutation');
      await db.exec(mutation);
      await actor(db);
      await denied(db,()=>call(db),'PT422','CYCLE_AUTHORIZATION_CONTEXT_MISMATCH');
      await db.exec('RESET ROLE; ROLLBACK TO SAVEPOINT mutation; RELEASE SAVEPOINT mutation');
    }
  } finally { await close(db); }
});

test('academic, local-only, imported protection and reviewed-snapshot guards still apply', async () => {
  const db = await database();
  try {
    for (const [mutation,state,code] of [
      ["UPDATE public.matriculas SET status='TRANCADO'",{},'P0001'],
      ["UPDATE public.contas_receber SET status='PAGO'",{},'P0001'],
      ["UPDATE internal_academic.technical_manual_cycle_runs SET state='PROTECTED_EXISTING'",{},'42501'],
      [null,{protected:'true'},'42501'],[null,{reviewed:'false'},'23514'],
      ["UPDATE public.contas_receber SET regra_financeira_tecnica_snapshot=jsonb_set(regra_financeira_tecnica_snapshot,'{destinoCobranca}','\"LOCAL\"')",{},'23514'],
    ]) {
      await db.exec('RESET ROLE; SAVEPOINT mutation');
      if (mutation) await db.exec(mutation);
      await actor(db,state);
      await denied(db,()=>call(db),code);
      await db.exec('RESET ROLE; ROLLBACK TO SAVEPOINT mutation; RELEASE SAVEPOINT mutation');
    }
  } finally { await close(db); }
});

test('ambiguous reserved title retains token, banking status and authorization during handoff', async () => {
  const db = await database();
  try {
    await db.exec('RESET ROLE');
    await db.query(`UPDATE public.contas_receber SET gateway_creation_token=$1,
      gateway_submission_channel='API',gateway_submission_status='API_AMBIGUOUS',
      gateway_status='CREATING',gateway_boleto_nosso_numero='123456789'`,[scope.request]);
    const before = await snapshot(db);
    await actor(db);
    assert.equal((await call(db)).authorized,true);
    assert.deepEqual(await snapshot(db),before);
    // No network-capable code is loaded; authorization grants no additional POST.
  } finally { await close(db); }
});

test('canonical downstream first-claim trigger accepts the preserved original authorization after handoff', async () => {
  const db = await database();
  try {
    await actor(db);
    assert.equal((await call(db)).authorized,true);
    await db.exec('RESET ROLE');
    await db.exec(firstClaim.trimEnd() + ';');
    await db.exec(`CREATE TRIGGER synthetic_first_claim
      BEFORE UPDATE OF gateway_creation_token,gateway_cnab_file_id,
        gateway_submission_channel,gateway_submission_status ON public.contas_receber
      FOR EACH ROW EXECUTE FUNCTION internal_academic.guard_manual_technical_receivable_first_bank_claim();
      GRANT SELECT,UPDATE ON public.contas_receber TO service_role;
      CREATE POLICY synthetic_service_claim ON public.contas_receber TO service_role USING(true) WITH CHECK(true);`);
    await actor(db,{role:'service_role'});
    await db.query('UPDATE public.contas_receber SET gateway_creation_token=$1 WHERE id=$2',
      [scope.request,scope.receivable]);
    await db.exec('RESET ROLE');
    const authorization = (await db.query(`SELECT * FROM
      internal_academic.technical_manual_receivable_issuance_authorizations`)).rows[0];
    assert.equal(authorization.authorized_by,scope.originalActor);
    assert.equal(authorization.request_id,scope.request);
    assert.equal(authorization.claim_count,1);
    assert.ok(authorization.first_claimed_at);
    assert.equal((await db.query('SELECT gateway_creation_token AS token FROM public.contas_receber')).rows[0].token,scope.request);
  } finally { await close(db); }
});
