// Dedicated synthetic PostgreSQL 17 only. Never reads .env, URLs or production credentials.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { relative, resolve } from 'node:path';
import { setImmediate as yieldTurn } from 'node:timers/promises';
import {
  ids, invokeCas, loadStudentInvitePostgres, snapshot, studentRow,
} from './fixtures/student-invite-postgres-harness.mjs';

assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Requires the GitHub ephemeral service');
assert.equal(process.env.STUDENT_INVITE_EPHEMERAL_POSTGRES, 'synthetic-postgres-17-only');
assert.ok(process.env.RUNNER_TEMP, 'Requires runner temp');
const deps = resolve(process.env.STUDENT_INVITE_PG_MODULE ?? '');
const underTemp = relative(resolve(process.env.RUNNER_TEMP), deps);
assert.ok(underTemp && !underTemp.startsWith('..') && !underTemp.startsWith('/'));
const { Client } = createRequire(import.meta.url)(deps);
// Every connection field is explicit: PGHOST/PGUSER/PGPASSWORD/URL cannot redirect this test.
const config = {
  host: '127.0.0.1', port: 5432, user: 'student_invite_ci',
  password: 'synthetic_ephemeral_ci_only', database: 'student_invite_concurrency_ci', ssl: false,
  connectionTimeoutMillis: 10000, query_timeout: 25000, statement_timeout: 20000,
  lock_timeout: 15000, application_name: 'student-invite-synthetic-concurrency',
};
const clients = new Set();
const scalar = async (db, sql, args = []) => (await db.query(sql, args)).rows[0].value;
async function connect(database = config.database) {
  assert.match(database, /^student_invite_concurrency_ci(?:_case_\d+)?$/);
  const db = new Client({ ...config, database });
  await db.connect();
  clients.add(db);
  assert.equal(await scalar(db, 'SELECT session_user AS value'), config.user);
  await db.query("SELECT set_config('request.jwt.claim.role','service_role',false)");
  return db;
}
function pending(promise) {
  const state = { done: false };
  state.result = promise.then(result => { state.done = true; return { result }; },
    error => { state.done = true; return { error }; });
  return state;
}
async function blocked(observer, waiter, holder, state) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const { rows } = await observer.query(`SELECT wait_event_type,pg_blocking_pids(pid) blockers
      FROM pg_stat_activity WHERE pid=$1`, [waiter.processID]);
    if (rows[0]?.wait_event_type === 'Lock' && rows[0].blockers.includes(holder.processID)) return;
    if (state.done) {
      const result = await state.result;
      throw new Error(`Expected a genuine server lock wait, got ${result.error?.code ?? 'success'}`);
    }
    // Only yields scheduling; the correctness barrier is the server's actual lock graph.
    await yieldTurn();
  }
  throw new Error('Timed out waiting for the PostgreSQL lock graph');
}
async function succeeds(state) {
  const result = await state.result;
  if (result.error) throw result.error;
  return result.result;
}
const denies = (operation, code) => assert.rejects(operation, error => error.code === code);
const inherited = async db => {
  await db.query('INSERT INTO public.perfis_acesso(id,permissoes) VALUES ($1,$2::jsonb)',
    [ids.other, JSON.stringify({ modules: ['parceiros'] })]);
  await db.query('UPDATE public.usuarios_sistema SET perfil_acesso_id=$1 WHERE id=$2',
    [ids.other, ids.actorRecord]);
};
const matrix = async db => {
  await db.query('INSERT INTO public.polos(id,is_matriz,status) VALUES ($1,true,$2)', [ids.other, 'Ativo']);
  await db.query('UPDATE public.usuarios_sistema SET context=$1 WHERE id=$2', [ids.other, ids.actorRecord]);
};
const sources = [
  { name: 'actor', table: 'usuarios_sistema', id: ids.actorRecord, setup: async () => {},
    revoke: db => db.query('UPDATE public.usuarios_sistema SET status=$1 WHERE id=$2', ['Inativo', ids.actorRecord]) },
  { name: 'inherited profile', table: 'perfis_acesso', id: ids.other, setup: inherited,
    revoke: db => db.query('UPDATE public.perfis_acesso SET permissoes=$1::jsonb WHERE id=$2',
      [JSON.stringify({ modules: [] }), ids.other]) },
  { name: 'matrix polo', table: 'polos', id: ids.other, setup: matrix,
    revoke: db => db.query('UPDATE public.polos SET is_matriz=false WHERE id=$1', [ids.other]) },
];
let sequence = 0;
const admin = await connect();
try {
  const version = await scalar(admin, "SELECT current_setting('server_version_num')::int AS value");
  assert.ok(version >= 170000 && version < 180000, 'Requires ephemeral PostgreSQL 17');
  await loadStudentInvitePostgres(admin);
  await admin.end(); clients.delete(admin);
  const control = new Client({ ...config, database: 'postgres' });
  await control.connect(); clients.add(control);
  async function scenario(name, run) {
    const database = `student_invite_concurrency_ci_case_${++sequence}`;
    await control.query(`CREATE DATABASE ${database} TEMPLATE student_invite_concurrency_ci`);
    const group = [];
    try {
      for (let index = 0; index < 3; index++) group.push(await connect(database));
      assert.equal(new Set(group.map(db => db.processID)).size, 3);
      await run(...group);
      console.log(`PASS ${sequence}: ${name}`);
    } finally {
      for (const db of group) {
        await db.query('ROLLBACK').catch(() => {});
        await db.end(); clients.delete(db);
      }
      await control.query(`DROP DATABASE ${database}`);
    }
  }

  await scenario('actual service-only ACL and checkpoint without UPDATE', async (a, b, o) => {
    const signature = 'public.portal_atualizar_acesso_aluno_por_gestor_cas(uuid,uuid,jsonb,jsonb)';
    const { rows } = await o.query(`SELECT has_function_privilege('anon',$1,'EXECUTE') anon,
      has_function_privilege('authenticated',$1,'EXECUTE') authenticated,
      has_function_privilege('service_role',$1,'EXECUTE') service`, [signature]);
    assert.deepEqual(rows[0], { anon: false, authenticated: false, service: true });
    await a.query(`CREATE TABLE public.test_updates(n integer); INSERT INTO public.test_updates VALUES(0);
      CREATE FUNCTION public.test_count_update() RETURNS trigger LANGUAGE plpgsql AS $body$
      BEGIN UPDATE public.test_updates SET n=n+1; RETURN NEW; END;$body$;
      CREATE TRIGGER test_count_update AFTER UPDATE ON public.parceiros FOR EACH ROW EXECUTE FUNCTION public.test_count_update();`);
    const before = await studentRow(o);
    assert.deepEqual(await invokeCas(b, snapshot(before)), before);
    assert.equal(await scalar(o, 'SELECT n AS value FROM public.test_updates'), 0);
    await b.query('SET ROLE authenticated');
    await denies(() => b.query(`SELECT public.portal_atualizar_acesso_aluno_por_gestor_cas($1,$2,$3::jsonb,'{}')`,
      [ids.actor, ids.student, JSON.stringify(snapshot(before))]), '42501');
    await b.query('RESET ROLE');
    assert.deepEqual(await studentRow(o), before);
  });

  for (const source of [{ name: 'student', table: 'parceiros', id: ids.student, setup: async () => {} }, ...sources]) {
    await scenario(`${source.name} row contention rejects NOWAIT without mutation`, async (a, b, o) => {
      await source.setup(a);
      const before = await studentRow(o);
      await a.query('BEGIN');
      await a.query(`SELECT 1 FROM public.${source.table} WHERE id=$1 FOR UPDATE`, [source.id]);
      await denies(() => invokeCas(b, snapshot(before), { acesso_status: 'processando' }), '55P03');
      assert.deepEqual(await studentRow(o), before);
      await a.query('ROLLBACK');
      assert.deepEqual(await invokeCas(b, snapshot(before)), before);
    });
  }

  for (const source of sources) {
    await scenario(`checkpoint holds ${source.name} until commit; committed revocation denies final CAS`, async (a, b, o) => {
      await source.setup(a);
      const before = await studentRow(o);
      await a.query('BEGIN');
      assert.deepEqual(await invokeCas(a, snapshot(before)), before);
      const revocation = pending(source.revoke(b));
      await blocked(o, b, a, revocation);
      assert.deepEqual(await studentRow(o), before);
      await a.query('COMMIT');
      await succeeds(revocation);
      await denies(() => invokeCas(b, snapshot(before), { acesso_status: 'convite_enviado' }), '42501');
      assert.deepEqual(await studentRow(o), before);
    });
  }

  for (const prefix of ['portal-temporary-password-auth:', 'portal-auth-identity:']) {
    await scenario(`foreign ${prefix} advisory rejects instead of waiting/deadlocking`, async (a, b, o) => {
      const before = await studentRow(o);
      await a.query('BEGIN');
      await a.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [prefix + ids.auth]);
      await denies(() => invokeCas(b, snapshot(before), { acesso_status: 'processando' }), '40001');
      assert.deepEqual(await studentRow(o), before);
      await a.query('ROLLBACK');
      assert.deepEqual(await invokeCas(b, snapshot(before)), before);
    });
  }

  await scenario('one concurrent CAS wins; old snapshot fails after the winner commits', async (a, b, o) => {
    const before = await studentRow(o);
    await a.query('BEGIN');
    await invokeCas(a, snapshot(before), { acesso_status: 'processando' });
    await denies(() => invokeCas(b, snapshot(before), { acesso_status: 'convite_enviado' }), '55P03');
    await a.query('COMMIT');
    await denies(() => invokeCas(b, snapshot(before), { acesso_status: 'convite_enviado' }), '40001');
    const after = await studentRow(o);
    assert.deepEqual(after, { ...before, acesso_status: 'processando' });
  });

  await scenario('Auth holding identity advisory first cannot deadlock the student-first CAS', async (a, b, o) => {
    const before = await studentRow(o);
    await a.query('BEGIN');
    await a.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['portal-auth-identity:' + ids.auth]);
    await denies(() => invokeCas(b, snapshot(before), { acesso_status: 'processando' }), '40001');
    await a.query('UPDATE auth.users SET encrypted_password=$1 WHERE id=$2', ['synthetic-own-password-proof', ids.auth]);
    await a.query('COMMIT');
    const after = await studentRow(o);
    assert.equal(after.troca_senha_obrigatoria, false);
    assert.equal(after.acesso_status, 'ativo');
    assert.equal(after.aceitou_termos_uso, before.aceitou_termos_uso);
    await denies(() => invokeCas(b, snapshot(before), { acesso_status: 'pendente' }), '40001');
    assert.deepEqual(await studentRow(o), after);
  });

  // Pause after the actual initial STABLE helper read, with a session advisory barrier.
  // The RPC remains unchanged; another backend commits revocation before its locked reread.
  for (const source of sources.slice(1)) {
    await scenario(`second locked context rereads committed ${source.name} revocation`, async (a, b, o) => {
      await source.setup(a);
      const before = await studentRow(o);
      await a.query(`ALTER FUNCTION public.portal_identidade_exigir_service_role_actor(uuid) RENAME TO test_original_actor;
        CREATE FUNCTION public.portal_identidade_exigir_service_role_actor(p_actor uuid) RETURNS jsonb
        LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $body$
        DECLARE context jsonb; BEGIN context:=public.test_original_actor(p_actor);
          IF current_setting('test.pause_first_actor',true)='yes' THEN
            PERFORM set_config('test.pause_first_actor','no',false);
            PERFORM pg_advisory_lock(907311);
            PERFORM pg_advisory_unlock(907311);
          END IF; RETURN context; END;$body$;`);
      await a.query('SELECT pg_advisory_lock(907311)');
      await b.query("SELECT set_config('test.pause_first_actor','yes',false)");
      const invocation = pending(invokeCas(b, snapshot(before), { acesso_status: 'processando' }));
      await blocked(o, b, a, invocation);
      await source.revoke(a); // Autocommit is complete while the other backend still has the old context.
      await a.query('SELECT pg_advisory_unlock(907311)');
      const result = await invocation.result;
      assert.equal(result.error?.code, '42501');
      assert.deepEqual(await studentRow(o), before);
    });
  }
  console.log(`Verified ${sequence} independent-session PostgreSQL 17 student-invite scenarios.`);
} finally {
  for (const db of clients) await db.end().catch(() => {});
}
