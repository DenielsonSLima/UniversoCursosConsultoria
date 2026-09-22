import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Optional local dependency; no connection string, network or persisted database.
// PGLITE_MODULE_PATH may point to an existing @electric-sql/pglite/dist/index.js.
const modulePath = process.env.PGLITE_MODULE_PATH;
const packageUrl = modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite';
const cryptoUrl = modulePath
  ? new URL('./contrib/pgcrypto.js', packageUrl).href
  : '@electric-sql/pglite/contrib/pgcrypto';
const { PGlite } = await import(packageUrl);
const { pgcrypto } = await import(cryptoUrl);
const db = new PGlite({ extensions: { pgcrypto } });
const root = resolve(import.meta.dirname, '../..');
const read = (path) => readFile(resolve(root, path), 'utf8');
const coreSignature = 'public.get_caixa_prestacao_mensal_v2_core(uuid,date,integer)';
const wrapperSignature = 'public.get_caixa_prestacao_mensal_secure(uuid,date,integer)';
const coreMigration = await read('supabase/migrations/20260922013628_optimize_caixa_monthly_core.sql');
const wrapperMigration = await read('supabase/migrations/20260922013637_reuse_caixa_monthly_evidence.sql');

function functionDefinition(source, qualifiedName) {
  const escaped = qualifiedName.replaceAll('.', '\\.');
  const start = source.search(new RegExp(`create(?: or replace)? function ${escaped}\\(`, 'i'));
  assert.ok(start >= 0, `Function source found: ${qualifiedName}`);
  const tail = source.slice(start);
  const bodyStart = /\bAS\s+(\$[a-z_]*\$)/i.exec(tail);
  assert.ok(bodyStart, `Function body found: ${qualifiedName}`);
  const end = tail.indexOf(`${bodyStart[1]};`, bodyStart.index + bodyStart[0].length);
  assert.ok(end >= 0, `Function end found: ${qualifiedName}`);
  return tail.slice(0, end + bodyStart[1].length + 1);
}

function guardedReplacement(source, old, replacement) {
  assert.equal(source.split(old).length, 2, 'Historical patch target is unique');
  return source.replace(old, replacement);
}

async function signatureHash(signature) {
  const { rows } = await db.query(
    "SELECT encode(extensions.digest(pg_get_functiondef($1::regprocedure),'sha256'),'hex') AS hash",
    [signature],
  );
  return rows[0].hash;
}

async function call(polo, month, history, fn = 'get_caixa_prestacao_mensal_secure') {
  const { rows } = await db.query(`SELECT public.${fn}($1::uuid,$2::date,$3::integer) AS result`,
    [polo, month, history]);
  return rows[0].result;
}

async function helperCalls() {
  const { rows } = await db.query(`SELECT
    (SELECT CASE WHEN is_called THEN last_value + 1 ELSE 0 END FROM test_caixa.position_calls) AS positions,
    (SELECT CASE WHEN is_called THEN last_value + 1 ELSE 0 END FROM test_caixa.evidence_calls) AS evidence`);
  return rows[0];
}

async function resetCalls() {
  await db.exec("SELECT setval('test_caixa.position_calls',0,false), setval('test_caixa.evidence_calls',0,false)");
}

async function expectCode(action, code) {
  await assert.rejects(action, (error) => error.code === code);
}

try {
  await db.exec(await read('supabase/tests/caixa_monthly_optimization.fixture.sql'));
  const originalCore = functionDefinition(
    await read('supabase/migrations/20260827040000_add_margem_inadimplencia_to_caixa_compromissos.sql'),
    'public.get_caixa_prestacao_mensal_v2_core',
  );
  const seriesMigration = await read('supabase/migrations/20260913011000_caixa_monthly_delinquency_series.sql');
  const openMigration = await read('supabase/migrations/20260913132033_caixa_open_receivables_evidence.sql');
  let originalWrapper = functionDefinition(seriesMigration, 'public.get_caixa_prestacao_mensal_secure');
  originalWrapper = guardedReplacement(originalWrapper,
    /\$old\$([\s\S]*?)\$old\$/.exec(openMigration)[1],
    /\$new\$([\s\S]*?)\$new\$/.exec(openMigration)[1]);
  await db.exec(originalCore);
  await db.exec(functionDefinition(seriesMigration, 'internal_contas.caixa_monthly_chart_series'));
  await db.exec(originalWrapper);
  await db.exec(`REVOKE ALL ON FUNCTION ${coreSignature} FROM PUBLIC,anon,authenticated;
    GRANT EXECUTE ON FUNCTION ${coreSignature} TO service_role;
    REVOKE ALL ON FUNCTION ${wrapperSignature} FROM PUBLIC,anon,authenticated,service_role;
    GRANT EXECUTE ON FUNCTION ${wrapperSignature} TO authenticated,service_role;`);
  assert.equal(await signatureHash(coreSignature),
    '692e631b234a84079005f1f838ee89e2b15006a1882fe14f0918aa4a5b9cd8b4');
  assert.equal(await signatureHash(wrapperSignature),
    '614a26b7e75f87f6c284815fdba05280383477a625b8802982950f239a4fd705');

  // A drifted function must never receive a text patch intended for another body.
  await db.exec('BEGIN');
  await db.exec(`ALTER FUNCTION ${coreSignature} VOLATILE`);
  await assert.rejects(() => db.exec(coreMigration), /review and rebase/);
  await db.exec('ROLLBACK');
  await db.exec('BEGIN');
  await db.exec(`ALTER FUNCTION ${wrapperSignature} VOLATILE`);
  await assert.rejects(() => db.exec(wrapperMigration), /review and rebase/);
  await db.exec('ROLLBACK');

  // One transaction freezes now(), so full old/new JSON can be compared exactly.
  await db.exec('BEGIN');
  const cases = [];
  const scopes = [null, ...[1, 2, 3].map((n) => `00000000-0000-0000-0000-00000000000${n}`)];
  for (const polo of scopes) {
    for (const month of ['2026-08-01', '2026-09-01', '2026-09-19', '2026-10-01']) {
      for (const history of [1, 6, 12]) {
        cases.push({ polo, month, history, before: await call(polo, month, history) });
      }
    }
  }
  await resetCalls();
  await call(scopes[1], '2026-09-19', 6);
  assert.deepEqual(await helperCalls(), { positions: 2, evidence: 7 });
  await db.exec(coreMigration);
  await db.exec(wrapperMigration);
  for (const testCase of cases) {
    const after = await call(testCase.polo, testCase.month, testCase.history);
    assert.deepEqual(after, testCase.before, 'Full financial payload remains identical');
    assert.equal(after.saldos_hoje.nao_atribuido, 30, 'Shared NULL-scope balance is preserved');
    assert.ok(after.compromissos.inadimplencia_mensal.base_elegivel > 0,
      'Commitments retain fields intentionally omitted from chart points');
    assert.equal(after.compromissos.receitas_futuras.quantidade_em_conferencia, 1,
      'Open-receivable evidence is still merged');
  }
  const empty = await call(scopes[3], '2026-09-01', 6);
  assert.equal(empty.contas.length, 0);
  assert.equal(empty.saldos_hoje.nao_atribuido, 30, 'Empty scope cannot erase global unassigned balance');
  const scopedA = await call(scopes[1], '2026-09-01', 6);
  assert.equal(scopedA.saldos_hoje.registrado_total, 70);
  const scopedB = await call(scopes[2], '2026-09-01', 6);
  assert.equal(scopedB.saldos_hoje.registrado_total, 60);
  const global = await call(null, '2026-09-01', 6);
  assert.equal(global.saldos_hoje.registrado_total, 160);
  await resetCalls();
  await call(scopes[1], '2026-09-19', 6);
  assert.deepEqual(await helperCalls(), { positions: 1, evidence: 6 });
  await db.exec('COMMIT');

  // Real guards in the optimized function reject unauthorized and invalid calls.
  await db.exec('UPDATE test_caixa.access_state SET global_allowed=false,scoped_allowed=false');
  await expectCode(() => call(null, '2026-09-01', 6), '42501');
  await expectCode(() => call(scopes[1], '2026-09-01', 6), '42501');
  await db.exec('UPDATE test_caixa.access_state SET role_name=null');
  await expectCode(() => call(scopes[1], '2026-09-01', 6), '42501');
  await db.exec("UPDATE test_caixa.access_state SET global_allowed=true,scoped_allowed=true,role_name='authenticated'");
  await expectCode(() => call(scopes[1], null, 6), '22023');
  await expectCode(() => call(scopes[1], '2026-09-01', 0), '22023');
  await expectCode(() => call(scopes[1], '2026-09-01', 13), '22023');
  const { rows: privileges } = await db.query(`SELECT
    has_function_privilege('anon','${wrapperSignature}','EXECUTE') AS anon_wrapper,
    has_function_privilege('authenticated','${wrapperSignature}','EXECUTE') AS authenticated_wrapper,
    has_function_privilege('authenticated','${coreSignature}','EXECUTE') AS authenticated_core,
    has_function_privilege('service_role','${coreSignature}','EXECUTE') AS service_core`);
  assert.deepEqual(privileges[0], {
    anon_wrapper: false, authenticated_wrapper: true, authenticated_core: false, service_core: true,
  });
  console.log(JSON.stringify({
    passed: true,
    equivalentCases: cases.length,
    helperCallsBefore: { positions: 2, evidence: 7 },
    helperCallsAfter: { positions: 1, evidence: 6 },
    coreHash: await signatureHash(coreSignature),
    wrapperHash: await signatureHash(wrapperSignature),
    limitation: 'Proof, banking and authorization dependencies are isolated local stubs; authenticated production smoke remains required.',
  }));
} finally {
  await db.close();
}
