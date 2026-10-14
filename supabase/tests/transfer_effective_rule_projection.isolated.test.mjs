import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

// Ephemeral PostgreSQL only: no credentials, network or banking functions.
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH
  ? pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href
  : '@electric-sql/pglite');
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const migration = await read('../migrations/20261014143702_fix_transfer_schedule_effective_due_date.sql');
const previous = await read('../migrations/20261010190040_external_transfer_schedule_projection.sql');
const start = previous.indexOf('create function internal_academic.technical_financial_effective_rule(');
assert.ok(start >= 0, 'The original production helper must remain available.');
const end = previous.indexOf('$function$;', start);
assert.ok(end > start);
const originalHelper = previous.slice(start, end + '$function$;'.length);
const signature = 'internal_academic.technical_financial_effective_rule(uuid)';
const uuid = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const one = async (db, sql, args = []) => (await db.query(sql, args)).rows[0];
const project = async (db, id) => (await one(db,
  'select internal_academic.technical_financial_effective_rule($1::uuid) as value', [id])).value;
const snapshot = async (db) => ({
  plans: (await db.query('select to_jsonb(p) as value from internal_academic.technical_transfer_entry_plans p order by matricula_id')).rows,
  titles: (await db.query('select to_jsonb(r) as value from public.contas_receber r order by id')).rows,
});
const attributes = (db) => one(db,
  'select prosecdef, provolatile, proconfig, proacl::text as acl, pg_get_userbyid(proowner) as owner from pg_proc where oid=$1::regprocedure',
  [signature]);

const fixtureRule = {
  revisao: 1, fingerprint: 'class-rule', primeiroVencimentoSugerido: '2098-01-05',
  identidade: { turmaRevisao: 1, turmaFingerprint: 'class-rule', overrideRevisao: null,
    overrideFingerprint: null, efetivaFingerprint: 'class-rule' },
  vencimento: { diaBase: 5, primeiroVencimentoSugerido: '2098-01-05' },
  cobranca: { matricula: { habilitada: false, valor: '0.00' },
    mensalidade: { habilitada: true, quantidade: 12, valor: '250.00' },
    rematricula: { habilitada: true, valor: '150.00' } },
  encargos: { descontoPontualidade: '20.00', jurosAtrasoPercentual: '1.000000',
    multaAtrasoPercentual: '2.000000' },
  continuidade: { maxCiclos: 2 }, cronogramaCiclo: [{ tipo: 'MENSALIDADE', dataVencimento: '2098-01-05' }],
};
const plan = (version, cycle, due) => ({ versao: version, itens: [
  { itemId: uuid(101 + cycle), cicloNumero: cycle, tipo: 'PARCELA', ordem: 1,
    vencimento: due, valor: '250.00', descontoPontualidade: '20.00',
    jurosAtrasoPercentual: '1.000000', multaAtrasoPercentual: '2.000000' },
] });

const database = async () => {
  const db = new PGlite();
  await db.exec([
    'create role anon; create role authenticated; create role service_role;',
    'create schema internal_academic; create schema extensions;',
    'grant usage on schema internal_academic to anon,authenticated,service_role;',
    // PGlite uses PostgreSQL SHA-256 with the same signature as pgcrypto for this helper.
    "create function extensions.digest(p_input text,p_algorithm text) returns bytea language plpgsql immutable as $$ begin if p_algorithm <> 'sha256' then raise exception 'Unexpected digest algorithm'; end if; return sha256(convert_to(p_input,'UTF8')); end; $$;",
    'create table internal_academic.technical_transfer_entry_plans (matricula_id uuid primary key, request_id uuid not null, rule_snapshot jsonb not null, financial_plan jsonb not null, first_due_date date not null);',
    'create table public.contas_receber (id uuid primary key, matricula_id uuid not null, origem text not null, status text not null, nosso_numero text, valor numeric not null, vencimento date not null);',
    "create function internal_academic.technical_financial_effective_rule_before_transfer_schedule(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$ select jsonb_build_object('legacy',true,'matriculaId',p_id,'primeiroVencimentoSugerido','2098-01-05'); $$;",
  ].join('\n'));
  await db.exec(originalHelper);
  await db.exec('revoke all on function ' + signature + ' from public,anon,authenticated,service_role;');
  for (const [id, version, cycle, due] of [[1, 3, 1, '2099-03-18'], [2, 3, 2, '2099-08-31'], [3, 2, 1, '2099-04-05']]) {
    await db.query('insert into internal_academic.technical_transfer_entry_plans values ($1,$2,$3::jsonb,$4::jsonb,$5::date)',
      [uuid(id), uuid(id + 10), JSON.stringify(fixtureRule), JSON.stringify(plan(version, cycle, due)), due]);
  }
  await db.query('insert into public.contas_receber values ($1,$2,$3,$4,$5,$6,$7),($8,$9,$10,$11,$12,$13,$14)',
    [uuid(201), uuid(3), 'PROESC', 'PAGO', null, 250, '2098-01-05',
      uuid(202), uuid(4), 'BANESE_IMPORTADO', 'PENDENTE', '00000000123', 300, '2098-02-05']);
  return db;
};

test('real migration repairs transfer projection coherence without changing saved plans or legacy titles', async () => {
  const db = await database();
  try {
    const sourceBefore = await snapshot(db);
    const aclBefore = await attributes(db);
    const beforeC1 = await project(db, uuid(1));
    const beforeC2 = await project(db, uuid(2));
    const legacy = await project(db, uuid(3));
    const noTransfer = await project(db, uuid(4));
    assert.notEqual(beforeC1.primeiroVencimentoSugerido, beforeC1.vencimento.primeiroVencimentoSugerido,
      'Reproduce the mismatch rejected by the real workspace parser.');
    assert.notEqual(beforeC2.primeiroVencimentoSugerido, beforeC2.vencimento.primeiroVencimentoSugerido);

    await db.exec(migration);
    for (const [id, before, due] of [[1, beforeC1, '2099-03-18'], [2, beforeC2, '2099-08-31']]) {
      const after = await project(db, uuid(id));
      assert.equal(after.primeiroVencimentoSugerido, due);
      assert.equal(after.vencimento.primeiroVencimentoSugerido, due);
      const expected = structuredClone(before);
      expected.vencimento.primeiroVencimentoSugerido = due;
      assert.deepEqual(after, expected, 'Only the inconsistent projected date changes.');
      assert.equal(after.identidade.efetivaFingerprint, before.identidade.efetivaFingerprint);
      assert.equal(after.fonte, 'INDIVIDUAL');
      assert.equal(after.cronogramaEntradaVersao, 3);
      assert.deepEqual(await project(db, uuid(id)), after, 'Repeated reads remain deterministic.');
    }
    assert.deepEqual(await project(db, uuid(3)), legacy, 'Legacy transfer version delegates unchanged.');
    assert.deepEqual(await project(db, uuid(4)), noTransfer, 'Enrollment without a transfer delegates unchanged.');
    assert.deepEqual(await snapshot(db), sourceBefore, 'No obligation, payment, bank identity or plan is rewritten.');
    assert.deepEqual(await attributes(db), aclBefore, 'Owner, ACL, STABLE and SECURITY DEFINER remain unchanged.');
    assert.equal(aclBefore.prosecdef, true);
    assert.equal(aclBefore.provolatile, 's');
    assert.deepEqual(aclBefore.proconfig, ['search_path=""']);
    for (const role of ['anon', 'authenticated', 'service_role']) {
      assert.equal((await one(db, "select has_function_privilege($1,$2,'EXECUTE') as allowed",
        [role, signature])).allowed, false);
      await db.exec('set role ' + role);
      try { await assert.rejects(() => project(db, uuid(1)), /permission denied/); }
      finally { await db.exec('reset role'); }
    }
  } finally { await db.close(); }
});

test('migration refuses a concurrent helper change and leaves the prior function and data intact', async () => {
  const db = await database();
  try {
    const concurrent = originalHelper.replace('create function', 'create or replace function')
      .replace('declare v_entry', '-- Concurrent change must require review.\ndeclare v_entry');
    await db.exec(concurrent);
    const definitionBefore = await one(db, 'select pg_get_functiondef($1::regprocedure) as definition', [signature]);
    const sourceBefore = await snapshot(db);
    await assert.rejects(() => db.exec(migration), /A projeção financeira mudou/);
    await db.exec('rollback');
    assert.deepEqual(await one(db, 'select pg_get_functiondef($1::regprocedure) as definition', [signature]), definitionBefore);
    assert.deepEqual(await snapshot(db), sourceBefore);
    assert.notEqual((await project(db, uuid(1))).primeiroVencimentoSugerido,
      (await project(db, uuid(1))).vencimento.primeiroVencimentoSugerido);
  } finally { await db.close(); }
});
