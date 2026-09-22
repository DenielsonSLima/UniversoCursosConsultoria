// Local PostgreSQL/WASM only: creates a NEW in-memory database, never Supabase.
// Supply CAIXA_TEST_PGLITE_MODULE if PGlite is installed outside this repository.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

const modulePath = process.env.CAIXA_TEST_PGLITE_MODULE;
const { PGlite } = await import(modulePath || '@electric-sql/pglite');
const { pgcrypto } = await import(modulePath
  ? resolve(dirname(modulePath), 'contrib/pgcrypto.js')
  : '@electric-sql/pglite/contrib/pgcrypto');
const readMigration = (name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const baseline = readMigration('20260827130000_create_caixa_linha_corte_rpc.sql');
const candidate = readMigration('20260922013646_caixa_linha_corte_previstas_a_vencer.sql');
const poloA = '00000000-0000-0000-0000-000000000001';
const poloB = '00000000-0000-0000-0000-000000000002';
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

test('RPC real acrescenta somente o saldo a vencer, preserva centavos, histórico e autorização', async () => {
  const db = new PGlite({ extensions: { pgcrypto } });
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
        $$ SELECT nullif(current_setting('test.actor_role',true),'') $$;
      CREATE FUNCTION public.gestor_has_any_global_module(text[]) RETURNS boolean
        LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('test.global_scope',true)='yes',false) $$;
      CREATE FUNCTION public.gestor_has_any_module_for_polo(text[],uuid) RETURNS boolean
        LANGUAGE sql STABLE AS $$ SELECT coalesce($2::text=current_setting('test.polo',true),false) $$;
      CREATE TABLE public.contas_receber (
        id uuid DEFAULT gen_random_uuid(),polo_id uuid,status text,valor numeric,
        valor_pago numeric,data_pagamento date,data_vencimento date,
        manual_settlement_id uuid,manual_settlement_reversed_at timestamptz,
        manual_settlement_received_cents bigint
      );
      CREATE TABLE public.contas_pagar (
        valor numeric,status text,data_vencimento date,categoria text,
        despesa_lancamento_id uuid,emprestimo_parcela_id uuid,polo_id uuid
      );
      CREATE TABLE public.despesas_lancamentos (
        id uuid,valor numeric,status text,data_vencimento date,tipo text,
        rateio_modo text,polo_id uuid
      );
      CREATE TABLE public.despesas_lancamentos_rateios (
        valor_total numeric,status text,despesa_lancamento_id uuid,polo_id uuid
      );
      INSERT INTO public.contas_receber(polo_id,status,valor,data_vencimento) VALUES
        ('${poloA}','PENDENTE',0.20,current_date),
        ('${poloA}','VENCIDO',0.10,current_date-1),
        ('${poloA}','CANCELADO',90000,current_date),
        ('${poloA}','PENDENTE',NULL,current_date),
        ('${poloB}','PENDENTE',-10,current_date),
        ('${poloB}','VENCIDO',100,current_date-1);
      INSERT INTO public.contas_receber(polo_id,status,valor,valor_pago,data_pagamento,
        data_vencimento,manual_settlement_id,manual_settlement_received_cents,manual_settlement_reversed_at)
      VALUES ('${poloA}','PAGO',50,49,current_date,current_date,gen_random_uuid(),4001,NULL),
        ('${poloA}','PAGO',70,69,current_date,current_date,gen_random_uuid(),100,current_timestamp),
        ('${poloA}','PAGO',20,19,date_trunc('month',current_date)::date-1,
          date_trunc('month',current_date)::date-1,NULL,NULL,NULL);
      INSERT INTO public.contas_pagar(valor,status,data_vencimento,categoria,polo_id)
      VALUES (10.01,'PENDENTE',current_date,'DESPESA_FIXA','${poloA}'),
        (20.02,'PAGO',current_date,'VARIAVEL','${poloA}'),
        (5000,'CANCELADO',current_date,'VARIAVEL','${poloA}');
      INSERT INTO public.despesas_lancamentos(id,valor,status,data_vencimento,tipo,rateio_modo,polo_id)
      VALUES ('${poloB}',60.06,'PENDENTE',current_date,'VARIAVEL','RATEIO','${poloB}');
      INSERT INTO public.despesas_lancamentos_rateios VALUES (30.03,'PENDENTE','${poloB}','${poloA}');
      SET test.actor_role='authenticated'; SET test.global_scope='yes'; SET test.polo='${poloA}';
    `);
    await db.exec(baseline.replaceAll('get_caixa_linha_corte_secure', 'test_linha_corte_baseline'));
    await db.exec(baseline);
    await db.exec('BEGIN; ALTER FUNCTION public.get_caixa_linha_corte_secure(uuid,date) VOLATILE;');
    await assert.rejects(db.exec(candidate), /review the canonical field migration/);
    await db.exec('ROLLBACK;');
    await db.exec(candidate);

    // Full RPC comparison: no existing field may change, including monetary
    // rounding, current/historical month boundaries, manual settlement and rateio.
    for (const polo of [null, poloA]) {
      for (const monthOffset of [-1, 0, 1]) {
        const { rows: [row] } = await db.query(`SELECT
          public.test_linha_corte_baseline($1,(current_date+($2||' months')::interval)::date) AS before,
          public.get_caixa_linha_corte_secure($1,(current_date+($2||' months')::interval)::date) AS after`,
        [polo, monthOffset]);
        const { previstas_a_vencer: amount, ...receitas } = row.after.receitas;
        assert.deepEqual({ ...row.after, receitas }, row.before);
        // Preserve the old visible monetary result, not JS's binary subtraction noise.
        assert.equal(currency.format(amount), currency.format(
          Math.max(row.before.receitas.previstas - row.before.inadimplencia.valor_vencido, 0),
        ));
      }
    }
    const { rows: [current] } = await db.query(
      'SELECT public.get_caixa_linha_corte_secure($1,current_date) AS payload', [poloA],
    );
    assert.equal(current.payload.receitas.previstas_a_vencer, 0.20);
    assert.equal(current.payload.receitas.realizadas, 109.01);

    // The second polo is denied before any financial response; then its valid
    // negative projection clamps to exact zero under its own authorized scope.
    await assert.rejects(db.query('SELECT public.get_caixa_linha_corte_secure($1,current_date)', [poloB]),
      (error) => error.code === '42501');
    await db.exec(`SET test.global_scope='no'; SET test.polo='${poloB}';`);
    await assert.rejects(db.query('SELECT public.get_caixa_linha_corte_secure(NULL,current_date)'),
      (error) => error.code === '42501');
    const { rows: [clamped] } = await db.query(
      'SELECT public.get_caixa_linha_corte_secure($1,current_date) AS payload', [poloB],
    );
    assert.equal(clamped.payload.receitas.previstas_a_vencer, 0);
    const { rows: [empty] } = await db.query(
      "SELECT public.get_caixa_linha_corte_secure($1,(current_date+interval '1 month')::date) AS payload", [poloB],
    );
    assert.equal(empty.payload.receitas.previstas_a_vencer, 0);
    assert.equal(empty.payload.receitas.previstas, 0);
    await db.exec("SET test.actor_role=''; SET test.polo='';");
    await assert.rejects(db.query('SELECT public.get_caixa_linha_corte_secure(NULL,current_date)'),
      (error) => error.code === '42501');
    await assert.rejects(db.query('SELECT public.get_caixa_linha_corte_secure($1,current_date)', [poloA]),
      (error) => error.code === '42501');

    const { rows: [permissions] } = await db.query(`SELECT
      has_function_privilege('anon','public.get_caixa_linha_corte_secure(uuid,date)','EXECUTE') AS anon,
      has_function_privilege('authenticated','public.get_caixa_linha_corte_secure(uuid,date)','EXECUTE') AS authenticated,
      has_function_privilege('service_role','public.get_caixa_linha_corte_secure(uuid,date)','EXECUTE') AS service,
      proconfig,provolatile,prosecdef FROM pg_proc
      WHERE oid='public.get_caixa_linha_corte_secure(uuid,date)'::regprocedure`);
    assert.equal(permissions.anon, false);
    assert.equal(permissions.authenticated, true);
    assert.equal(permissions.service, true);
    assert.equal(permissions.provolatile, 's');
    assert.equal(permissions.prosecdef, true);
    assert.deepEqual(permissions.proconfig, ['search_path=""']);
  } finally {
    await db.close();
  }
});
