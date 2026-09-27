// PostgreSQL/WASM local: banco novo em memória, sem conexão com Supabase.
// CAIXA_TEST_PGLITE_MODULE permite usar uma instalação temporária externa.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const modulePath = process.env.CAIXA_TEST_PGLITE_MODULE;
let PGlite;
let pgliteUnavailable = false;
try {
  ({ PGlite } = await import(modulePath || '@electric-sql/pglite'));
} catch (error) {
  if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  pgliteUnavailable = true;
}
const migration = readFileSync(
  new URL('../migrations/20260927160000_create_caixa_contas_pagar_resumo.sql', import.meta.url),
  'utf8',
);
const poloA = '00000000-0000-0000-0000-000000000001';
const poloB = '00000000-0000-0000-0000-000000000002';

test('rateio preserva pagamentos por fração e consolida somente a quantidade', {
  skip: pgliteUnavailable
    ? 'PGlite não instalado; informe CAIXA_TEST_PGLITE_MODULE para executar o PostgreSQL isolado.'
    : false,
}, async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
        SELECT jsonb_build_object(
          'role', nullif(current_setting('test.actor_role', true), '')
        )
      $$;
      CREATE FUNCTION public.gestor_has_any_global_module(text[]) RETURNS boolean
        LANGUAGE sql STABLE AS $$
          SELECT current_setting('test.global_scope', true) = 'yes'
            AND (
              ('caixa' = ANY($1) AND current_setting('test.caixa', true) = 'yes')
              OR ('financeiro' = ANY($1) AND current_setting('test.financeiro', true) = 'yes')
            )
        $$;
      CREATE FUNCTION public.gestor_has_any_module_for_polo(text[], uuid) RETURNS boolean
        LANGUAGE sql STABLE AS $$
          SELECT $2::text = current_setting('test.polo', true)
            AND (
              ('caixa' = ANY($1) AND current_setting('test.caixa', true) = 'yes')
              OR ('financeiro' = ANY($1) AND current_setting('test.financeiro', true) = 'yes')
            )
        $$;
      CREATE FUNCTION public.gestor_has_effective_financeiro_tab(text) RETURNS boolean
        LANGUAGE sql STABLE AS $$
          SELECT $1 = 'despesas' AND current_setting('test.despesas', true) = 'yes'
        $$;
      CREATE FUNCTION public.test_hoje() RETURNS date LANGUAGE sql STABLE AS $$
        SELECT timezone('America/Maceio', now())::date
      $$;
      CREATE TABLE public.contas_pagar (
        id uuid, polo_id uuid, valor numeric, valor_pago numeric,
        data_vencimento date, data_pagamento date, status text,
        created_at timestamptz, despesa_lancamento_id uuid,
        emprestimo_parcela_id uuid
      );
      CREATE TABLE public.despesas_lancamentos (
        id uuid, polo_id uuid, valor numeric, valor_pago numeric,
        data_vencimento date, data_pagamento date, status text,
        created_at timestamptz, rateio_modo text, excluido_em timestamptz
      );
      CREATE TABLE public.despesas_lancamentos_rateios (
        despesa_lancamento_id uuid, polo_id uuid, valor_total numeric,
        data_pagamento date, status text, created_at timestamptz
      );
      SET test.actor_role = 'authenticated'; SET test.global_scope = 'yes';
      SET test.polo = '${poloA}'; SET test.caixa = 'yes';
      SET test.financeiro = 'no'; SET test.despesas = 'no';
    `);
    await db.exec(migration);
    await db.exec(`
      INSERT INTO public.despesas_lancamentos VALUES (
        '10000000-0000-0000-0000-000000000001', '${poloA}', 100, 100,
        (date_trunc('month', public.test_hoje()) - interval '2 months' + interval '10 days')::date,
        NULL, 'PAGO', date_trunc('month', public.test_hoje()) - interval '3 months',
        'TODOS', NULL
      );
      INSERT INTO public.despesas_lancamentos_rateios VALUES
        (
          '10000000-0000-0000-0000-000000000001', '${poloA}', 50,
          (date_trunc('month', public.test_hoje()) - interval '2 months' + interval '4 days')::date,
          'PAGO', date_trunc('month', public.test_hoje()) - interval '3 months'
        ),
        (
          '10000000-0000-0000-0000-000000000001', '${poloB}', 50,
          (date_trunc('month', public.test_hoje()) - interval '1 month' + interval '4 days')::date,
          'PAGO', date_trunc('month', public.test_hoje()) - interval '3 months'
        );
    `);

    const { rows: [past] } = await db.query(`
      SELECT public.get_caixa_contas_pagar_resumo_secure(
        NULL, (date_trunc('month', public.test_hoje()) - interval '2 months')::date
      ) AS payload
    `);
    assert.deepEqual(past.payload.contas_competencia, {
      valor: '100.00', quantidade: 1,
    });
    assert.deepEqual(past.payload.pagas_competencia, {
      valor: '50.00', quantidade: 0,
    });
    assert.equal(past.payload.em_atraso.valor, '50.00');
    assert.equal(past.payload.em_atraso.quantidade, 1);

    const { rows: [secondMonth] } = await db.query(`
      SELECT public.get_caixa_contas_pagar_resumo_secure(
        NULL, (date_trunc('month', public.test_hoje()) - interval '1 month')::date
      ) AS payload
    `);
    assert.deepEqual(secondMonth.payload.pagas_competencia, {
      valor: '50.00', quantidade: 1,
    });
    assert.equal(secondMonth.payload.em_atraso.valor, '0.00');
    assert.equal(secondMonth.payload.agenda_financeira.dias.length, 8);

    await db.exec(`
      SET test.caixa = 'no'; SET test.financeiro = 'yes'; SET test.despesas = 'no';
    `);
    await assert.rejects(
      db.query('SELECT public.get_caixa_contas_pagar_resumo_secure(NULL, public.test_hoje())'),
      (error) => error.code === '42501',
    );
    await db.exec(`SET test.despesas = 'yes';`);
    await db.query('SELECT public.get_caixa_contas_pagar_resumo_secure(NULL, public.test_hoje())');
    await db.exec(`
      SET test.actor_role = ''; SET test.global_scope = 'no';
      SET test.financeiro = 'no'; SET test.despesas = 'no';
    `);
    await assert.rejects(
      db.query('SELECT public.get_caixa_contas_pagar_resumo_secure(NULL, public.test_hoje())'),
      (error) => error.code === '42501',
    );
    await db.exec(`SET test.actor_role = 'service_role';`);
    await db.query('SELECT public.get_caixa_contas_pagar_resumo_secure(NULL, public.test_hoje())');

    const { rows: [security] } = await db.query(`SELECT
      has_function_privilege('anon',
        'public.get_caixa_contas_pagar_resumo_secure(uuid,date)','EXECUTE') AS anon,
      has_function_privilege('authenticated',
        'public.get_caixa_contas_pagar_resumo_secure(uuid,date)','EXECUTE') AS authenticated,
      has_function_privilege('service_role',
        'public.get_caixa_contas_pagar_resumo_secure(uuid,date)','EXECUTE') AS service,
      proconfig, provolatile, prosecdef
      FROM pg_proc
      WHERE oid = 'public.get_caixa_contas_pagar_resumo_secure(uuid,date)'::regprocedure
    `);
    assert.deepEqual(security, {
      anon: false,
      authenticated: true,
      service: true,
      proconfig: ['search_path=""'],
      provolatile: 's',
      prosecdef: true,
    });
  } finally {
    await db.close();
  }
});
