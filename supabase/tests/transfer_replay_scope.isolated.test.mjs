import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Local, ephemeral PostgreSQL runtime. No Supabase connection or credentials.
const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath
  ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const db = new PGlite();
const root = resolve(import.meta.dirname, '../..');
const read = (path) => readFile(resolve(root, path), 'utf8');
const uuid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const signature = 'public.registrar_transferencia_conta(uuid,uuid,uuid,uuid,numeric,date,text,uuid)';
const baseline = [uuid(1), uuid(10), uuid(2), uuid(10), 50, '2026-10-03', 'rateio', uuid(100)];
const call = async (args = baseline) => (await one(`SELECT
  public.registrar_transferencia_conta($1,$2,$3,$4,$5,$6,$7,$8) id`, args)).id;
const count = async () => Number((await one('SELECT count(*) n FROM public.transferencias_contas')).n);
function functionDefinition(source, name) {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.ok(start >= 0);
  const end = source.indexOf('\n$$;', start) + 4;
  return source.slice(start, end);
}
const denied = async (args = baseline) => {
  const before = await count();
  await assert.rejects(() => call(args), (error) => error.code === '42501');
  assert.equal(await count(), before);
};

try {
  await db.exec(await read('supabase/tests/transfer_replay_scope.fixture.sql'));
  const old = await read('supabase/migrations/20260727212018_shared_bank_accounts_canonical_cash_and_expense_rpcs.sql');
  await db.exec(functionDefinition(old, 'registrar_transferencia_conta'));
  await db.exec(functionDefinition(old, 'editar_transferencia_conta'));
  await db.exec(functionDefinition(old, 'excluir_transferencia_conta'));
  const first = await call();
  await db.exec('UPDATE test_transfer.access_state SET module_allowed=false');
  assert.equal(await call(), first, 'Reproduz replay legado indevido sem permissão');

  await db.exec(await read('supabase/migrations/20261003180000_authorize_transfer_replay_before_lookup.sql'));
  await denied();
  await denied([...baseline.slice(0, 4), 75, ...baseline.slice(5)]);
  await db.exec('UPDATE test_transfer.access_state SET module_allowed=true');
  assert.equal(await call(), first, 'Replay autorizado mantém a identidade');
  assert.equal(await count(), 1);
  for (const [index, replacement] of [[0, uuid(2)], [1, uuid(20)], [2, uuid(1)],
    [3, uuid(20)], [4, 75], [5, '2026-10-04'], [6, 'outra observação']]) {
    const args = [...baseline]; args[index] = replacement;
    await assert.rejects(() => call(args), /dados diferentes/);
  }
  await db.exec(`UPDATE test_transfer.access_state SET allowed_polos=ARRAY['${uuid(1)}'::uuid]`);
  await denied();
  await db.exec(`UPDATE test_transfer.access_state SET allowed_polos=ARRAY['${uuid(2)}'::uuid]`);
  await denied();
  await db.exec(`UPDATE test_transfer.access_state SET allowed_polos=ARRAY['${uuid(1)}'::uuid,'${uuid(2)}'::uuid], actor=NULL`);
  await denied();
  await db.exec(`UPDATE test_transfer.access_state SET actor='${uuid(99)}', role_name=NULL, module_allowed=NULL`);
  await denied();
  await db.exec("UPDATE test_transfer.access_state SET role_name='authenticated',module_allowed=true");

  const physical = [...baseline]; physical[3] = uuid(20); physical[7] = uuid(101);
  const physicalId = await call(physical);
  assert.equal((await one('SELECT tipo FROM public.transferencias_contas WHERE id=$1', [physicalId])).tipo, 'FISICA');
  assert.equal((await one('SELECT tipo FROM public.transferencias_contas WHERE id=$1', [first])).tipo, 'RATEIO_INTERNO');
  const sameScope = [...baseline]; sameScope[2] = uuid(1); sameScope[7] = uuid(102);
  await assert.rejects(() => call(sameScope), /polos de origem e destino devem ser diferentes/);
  const unavailable = [...baseline]; unavailable[1] = uuid(20); unavailable[7] = uuid(102);
  await assert.rejects(() => call(unavailable), /não está disponível/);
  for (const value of [0, -1, null]) {
    const invalid = [...baseline]; invalid[4] = value; invalid[7] = uuid(102);
    await assert.rejects(() => call(invalid), /maior que zero/);
  }
  const missingRequest = [...baseline]; missingRequest[7] = null;
  await assert.rejects(() => call(missingRequest), /idempotência/);
  await db.exec('UPDATE public.contas_bancarias_polos SET ativo=false');
  assert.equal(await call(), first, 'Replay preservado após desativação da conta');
  const inactive = [...baseline]; inactive[7] = uuid(102);
  await assert.rejects(() => call(inactive), /não está disponível/);
  await db.exec('UPDATE public.contas_bancarias_polos SET ativo=true');

  await assert.rejects(() => one('SELECT public.excluir_transferencia_conta($1)', [first]), /não podem ser excluídas/);
  await assert.rejects(() => one('SELECT public.editar_transferencia_conta($1,$2,$3,$4,$5,$6,$7,$8)',
    [first, ...baseline.slice(0, 7)]), /imutáveis/);

  for (const role of ['anon', 'authenticated']) {
    for (const privilege of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
      assert.equal((await one('SELECT has_table_privilege($1,$2,$3) allowed',
        [role, 'public.transferencias_contas', privilege])).allowed, false);
    }
  }
  assert.equal((await one("SELECT has_table_privilege('authenticated','public.transferencias_contas','SELECT') allowed")).allowed, true);
  for (const [role, allowed] of [['anon', false], ['authenticated', true], ['service_role', true]]) {
    assert.equal((await one("SELECT has_function_privilege($1,$2,'EXECUTE') allowed", [role, signature])).allowed, allowed);
  }
  // Exercise grants as the real SQL role: DDL grants cannot be bypassed by RLS.
  await db.exec('SET ROLE authenticated');
  await assert.rejects(() => db.exec('TRUNCATE public.transferencias_contas'), /permission denied/);
  assert.equal(await call(), first, 'RPC SECURITY DEFINER continua utilizável pelo cliente');
  await db.exec('RESET ROLE');
  await db.exec("UPDATE test_transfer.access_state SET role_name='service_role',actor=NULL,module_allowed=false,allowed_polos='{}'");
  assert.equal(await call(), first, 'Operação privilegiada permanece compatível');
  assert.equal(await count(), 2);
  console.log('Transferências: replay legado reproduzido; escopo, payload, grants, rateio, conta inativa e imutabilidade validados em PostgreSQL isolado.');
} finally {
  await db.close();
}
