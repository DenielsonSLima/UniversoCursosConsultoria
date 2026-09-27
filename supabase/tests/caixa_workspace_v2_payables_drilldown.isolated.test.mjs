// PostgreSQL/WASM local: exercita a RPC real sem conexão remota.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const modulePath = process.env.CAIXA_TEST_PGLITE_MODULE;
let PGlite;
let pgliteUnavailable = false;
try {
  ({ PGlite } = await import(modulePath || '@electric-sql/pglite'));
} catch (error) {
  if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  pgliteUnavailable = true;
}

const migration = readFileSync(new URL(
  '../migrations/20260927230000_create_caixa_workspace_v2_payables_drilldown.sql',
  import.meta.url,
), 'utf8');
const ids = {
  companyA: 'a0000000-0000-0000-0000-000000000001',
  companyB: 'b0000000-0000-0000-0000-000000000002',
  invalidCompany: 'f0000000-0000-0000-0000-000000000099',
  poloA: '00000000-0000-0000-0000-000000000001',
  poloB: '00000000-0000-0000-0000-000000000002',
  poloC: '00000000-0000-0000-0000-000000000003',
  user: '90000000-0000-0000-0000-000000000001',
};
const signature = 'public.list_caixa_workspace_v2_contas_pagar_secure(uuid,uuid,date,text,integer,integer,text)';
const expectCode = (operation, code) => assert.rejects(
  operation,
  (error) => error.code === code,
);

test('drill-down pagina filtros, corta histórico e protege escopo', {
  skip: pgliteUnavailable
    ? 'PGlite não instalado; informe CAIXA_TEST_PGLITE_MODULE para executar o PostgreSQL isolado.'
    : false,
}, async () => {
  const db = new PGlite();
  const setSession = async ({
    role = 'authenticated', sub = ids.user, gestor = true,
    globalModules = '', poloModules = '', allowedPolo = '', despesas = false,
  } = {}) => {
    const claims = JSON.stringify({ role, ...(sub ? { sub } : {}) });
    await db.query(`SELECT
      set_config('request.jwt.claims', $1, false),
      set_config('test.gestor', $2, false),
      set_config('test.global_modules', $3, false),
      set_config('test.polo_modules', $4, false),
      set_config('test.allowed_polo', $5, false),
      set_config('test.despesas', $6, false)
    `, [claims, String(gestor), globalModules, poloModules, allowedPolo, String(despesas)]);
  };
  const call = async ({
    company = ids.companyA, polo = null, competencia = null,
    filtro = 'COMPETENCIA', pagina = 1, tamanho = 20, snapshot = null,
  } = {}) => {
    const { rows } = await db.query(`
      SELECT public.list_caixa_workspace_v2_contas_pagar_secure(
        $1::uuid, $2::uuid, $3::date, $4::text, $5::integer, $6::integer,
        $7::text
      ) AS payload
    `, [company, polo, competencia, filtro, pagina, tamanho, snapshot]);
    return rows[0].payload;
  };

  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
        SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
      $$;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT NULLIF(auth.jwt() ->> 'sub', '')::uuid
      $$;
      GRANT USAGE ON SCHEMA auth TO authenticated, service_role;
      GRANT EXECUTE ON FUNCTION auth.jwt(), auth.uid() TO authenticated, service_role;
      CREATE FUNCTION public.is_gestor() RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
        SELECT coalesce(current_setting('test.gestor', true), 'false') = 'true'
      $$;
      CREATE FUNCTION public.gestor_has_any_global_module(p_modules text[])
      RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
        SELECT p_modules && string_to_array(
          coalesce(current_setting('test.global_modules', true), ''), ','
        )
      $$;
      CREATE FUNCTION public.gestor_has_any_module_for_polo(
        p_modules text[], p_polo_id uuid
      ) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
        SELECT p_polo_id::text = current_setting('test.allowed_polo', true)
          AND p_modules && string_to_array(
            coalesce(current_setting('test.polo_modules', true), ''), ','
          )
      $$;
      CREATE FUNCTION public.gestor_has_effective_financeiro_tab(p_tab text)
      RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
        SELECT p_tab = 'despesas'
          AND coalesce(current_setting('test.despesas', true), 'false') = 'true'
      $$;
      CREATE TABLE public.polos (
        id uuid PRIMARY KEY, company_id uuid NOT NULL,
        status text NOT NULL, nome text
      );
      CREATE TABLE public.contas_pagar (
        id uuid, polo_id uuid, descricao text, valor numeric, valor_pago numeric,
        data_vencimento date, data_pagamento date, status text,
        created_at timestamptz, despesa_lancamento_id uuid,
        emprestimo_parcela_id uuid
      );
      CREATE TABLE public.despesas_lancamentos (
        id uuid, polo_id uuid, descricao text, valor numeric, valor_pago numeric,
        data_vencimento date, data_pagamento date, status text,
        created_at timestamptz, rateio_modo text, excluido_em timestamptz
      );
      CREATE TABLE public.despesas_lancamentos_rateios (
        id uuid, despesa_lancamento_id uuid, company_id uuid, polo_id uuid,
        valor_total numeric, data_pagamento date, status text, created_at timestamptz
      );
      INSERT INTO public.polos VALUES
        ('${ids.poloA}', '${ids.companyA}', 'ativo', 'Matriz A'),
        ('${ids.poloB}', '${ids.companyA}', 'ativo', 'Polo B'),
        ('${ids.poloC}', '${ids.companyB}', 'ativo', 'Polo C');
    `);
    await db.exec(migration);
    await db.exec(`
      INSERT INTO public.contas_pagar VALUES
        ('10000000-0000-0000-0000-000000000001', '${ids.poloA}', 'Energia', 30, 5,
          timezone('America/Maceio', now())::date - 1, NULL, 'PENDENTE',
          now() - interval '2 days', NULL, NULL),
        ('10000000-0000-0000-0000-000000000002', '${ids.poloA}', '', 10, 0,
          timezone('America/Maceio', now())::date, NULL, 'PENDENTE',
          now() - interval '1 day', NULL, NULL),
        ('10000000-0000-0000-0000-000000000003', '${ids.poloA}', 'D+7', 20, 0,
          timezone('America/Maceio', now())::date + 7, NULL, 'PENDENTE',
          now() - interval '1 day', NULL, NULL),
        ('10000000-0000-0000-0000-000000000004', '${ids.poloA}', 'D+8', 21, 0,
          timezone('America/Maceio', now())::date + 8, NULL, 'PENDENTE',
          now() - interval '1 day', NULL, NULL),
        ('10000000-0000-0000-0000-000000000005', '${ids.poloA}', 'Paga hoje', 40, 40,
          timezone('America/Maceio', now())::date,
          timezone('America/Maceio', now())::date, 'PAGO',
          now() - interval '2 days', NULL, NULL),
        ('10000000-0000-0000-0000-000000000006', '${ids.poloA}', 'Paga após corte', 50, 50,
          (date_trunc('month', timezone('America/Maceio', now())::date)
            - interval '1 month' + interval '9 days')::date,
          timezone('America/Maceio', now())::date, 'PAGO',
          now() - interval '2 months', NULL, NULL),
        ('10000000-0000-0000-0000-000000000007', '${ids.poloA}', 'Físico rateado', 100, 0,
          timezone('America/Maceio', now())::date, NULL, 'PENDENTE',
          now() - interval '1 day', '20000000-0000-0000-0000-000000000001', NULL),
        ('10000000-0000-0000-0000-000000000008', '${ids.poloC}', 'Outra empresa', 999, 0,
          timezone('America/Maceio', now())::date, NULL, 'PENDENTE',
          now() - interval '1 day', NULL, NULL),
        ('10000000-0000-0000-0000-000000000009', '${ids.poloA}', 'Financiamento', 888, 0,
          timezone('America/Maceio', now())::date, NULL, 'PENDENTE',
          now() - interval '1 day', NULL, '80000000-0000-0000-0000-000000000001');
      INSERT INTO public.despesas_lancamentos VALUES
        ('20000000-0000-0000-0000-000000000001', '${ids.poloA}', 'Rateio', 100, 40,
          timezone('America/Maceio', now())::date, NULL, 'PENDENTE',
          now() - interval '1 day', 'TODOS', NULL),
        ('20000000-0000-0000-0000-000000000002', '${ids.poloA}', '', 25, 10,
          timezone('America/Maceio', now())::date, NULL, 'PENDENTE',
          now() - interval '1 day', 'SEM_RATEIO', NULL),
        ('20000000-0000-0000-0000-000000000003', '${ids.poloA}', 'Rateio inválido', 777, 0,
          timezone('America/Maceio', now())::date, NULL, 'PENDENTE',
          now() - interval '1 day', 'TODOS', NULL),
        ('20000000-0000-0000-0000-000000000004', '${ids.poloC}', 'Pai de outra empresa', 333, 0,
          timezone('America/Maceio', now())::date, NULL, 'PENDENTE',
          now() - interval '1 day', 'TODOS', NULL);
      INSERT INTO public.despesas_lancamentos_rateios VALUES
        ('30000000-0000-0000-0000-000000000001',
          '20000000-0000-0000-0000-000000000001', '${ids.companyA}', '${ids.poloA}', 40,
          timezone('America/Maceio', now())::date, 'PAGO', now() - interval '1 day'),
        ('30000000-0000-0000-0000-000000000002',
          '20000000-0000-0000-0000-000000000001', '${ids.companyA}', '${ids.poloB}', 60,
          NULL, 'PENDENTE', now() - interval '1 day'),
        ('30000000-0000-0000-0000-000000000003',
          '20000000-0000-0000-0000-000000000003', '${ids.companyB}', '${ids.poloA}', 777,
          NULL, 'PENDENTE', now() - interval '1 day'),
        ('30000000-0000-0000-0000-000000000004',
          '20000000-0000-0000-0000-000000000004', '${ids.companyA}', '${ids.poloA}', 333,
          NULL, 'PENDENTE', now() - interval '1 day');
    `);

    const { rows: [clock] } = await db.query(`SELECT
      to_char(timezone('America/Maceio', now())::date, 'YYYY-MM-DD') AS hoje,
      to_char(
        date_trunc('month', timezone('America/Maceio', now())::date)
          - interval '1 month', 'YYYY-MM-DD'
      ) AS competencia_anterior,
      to_char(timezone('America/Maceio', now())::date + 7, 'YYYY-MM-DD') AS d7
    `);

    await setSession({ globalModules: 'caixa' });
    const todayPage1 = await call({ filtro: 'HOJE', tamanho: 2 });
    assert.equal(todayPage1.meta.empresa_id, ids.companyA);
    assert.equal(todayPage1.meta.unidade_contagem, 'LINHA_ECONOMICA');
    assert.equal(todayPage1.meta.all_polos_admin_global_sistema, true);
    assert.deepEqual(todayPage1.paginacao, {
      pagina: 1, tamanho_pagina: 2, total_itens: 3,
      total_paginas: 2, tem_anterior: false, tem_proxima: true,
    });
    assert.equal(todayPage1.itens.length, 2);
    const todayPage2 = await call({
      filtro: 'HOJE', pagina: 2, tamanho: 2,
      snapshot: todayPage1.meta.snapshot_id,
    });
    assert.equal(todayPage2.meta.snapshot_id, todayPage1.meta.snapshot_id);
    assert.equal(todayPage2.itens.length, 1);
    assert.equal(todayPage2.paginacao.tem_anterior, true);
    const todayItems = [...todayPage1.itens, ...todayPage2.itens];
    assert.equal(todayItems.some((item) => item.descricao === 'Físico rateado'), false);
    assert.equal(todayItems.some((item) => item.descricao === 'Rateio inválido'), false);
    assert.equal(todayItems.some((item) => item.descricao === 'Pai de outra empresa'), false);
    const partial = todayItems.find((item) => item.fonte === 'DESPESA');
    assert.equal(partial.valor_pago, '10.00');
    assert.equal(partial.saldo_aberto, '15.00');
    assert.equal(partial.descricao, 'Despesa sem descrição');
    assert.ok(todayItems.every((item) => /^\d+\.\d{2}$/.test(item.valor_programado)));

    await db.exec(`UPDATE public.contas_pagar
      SET valor = valor + 1
      WHERE id = '10000000-0000-0000-0000-000000000002'`);
    await expectCode(() => call({
      filtro: 'HOJE', pagina: 2, tamanho: 2,
      snapshot: todayPage1.meta.snapshot_id,
    }), '40001');

    const paid = await call({ filtro: 'PAGAS_COMPETENCIA' });
    const paidRateio = paid.itens.find((item) => item.fonte === 'RATEIO_ECONOMICO');
    assert.equal(paidRateio.valor_pago, '40.00');
    assert.equal(paidRateio.saldo_aberto, '0.00');

    const next7 = await call({ filtro: 'PROXIMOS_7_DIAS' });
    assert.equal(next7.paginacao.total_itens, 1);
    assert.equal(next7.itens[0].datas.vencimento, clock.d7);
    assert.equal(next7.itens[0].descricao, 'D+7');
    const overdue = await call({ filtro: 'ATRASADAS' });
    assert.equal(overdue.paginacao.total_itens, 1);
    assert.equal(overdue.itens[0].saldo_aberto, '25.00');
    assert.notEqual(overdue.itens[0].datas.vencimento, clock.hoje);
    const upcoming = await call({ filtro: 'A_VENCER_COMPETENCIA' });
    assert.ok(upcoming.itens.every((item) => item.datas.vencimento > clock.hoje));
    const competence = await call({ filtro: 'COMPETENCIA' });
    assert.ok(competence.itens.every((item) =>
      item.datas.vencimento >= competence.meta.periodo_inicio
      && item.datas.vencimento < competence.meta.periodo_fim_exclusivo));
    const historical = await call({
      competencia: clock.competencia_anterior, filtro: 'ATRASADAS',
    });
    assert.equal(historical.paginacao.total_itens, 1);
    assert.equal(historical.itens[0].descricao, 'Paga após corte');
    assert.equal(historical.itens[0].status, 'VENCIDO');
    assert.equal(historical.itens[0].valor_pago, '0.00');
    assert.equal(historical.itens[0].datas.pagamento, null);
    assert.equal(historical.itens[0].saldo_aberto, '50.00');
    const historicalPaid = await call({
      competencia: clock.competencia_anterior, filtro: 'PAGAS_COMPETENCIA',
    });
    assert.equal(historicalPaid.paginacao.total_itens, 0);

    const companyB = await call({ company: ids.companyB, filtro: 'HOJE' });
    assert.equal(companyB.paginacao.total_itens, 1);
    assert.equal(companyB.itens[0].valor_programado, '999.00');

    await setSession({ poloModules: 'caixa', allowedPolo: ids.poloA });
    assert.equal((await call({ polo: ids.poloA, filtro: 'HOJE' }))
      .paginacao.total_itens, 2);
    await expectCode(() => call({ polo: ids.poloB, filtro: 'HOJE' }), '42501');
    await expectCode(() => call({ company: ids.companyB, polo: ids.poloA }), '42501');
    await setSession({ globalModules: 'financeiro', despesas: false });
    await expectCode(() => call({ filtro: 'HOJE' }), '42501');
    await setSession({ poloModules: 'financeiro', allowedPolo: ids.poloA, despesas: true });
    assert.equal((await call({ polo: ids.poloA, filtro: 'HOJE' })).versao, 2);
    await setSession({ sub: null, globalModules: 'caixa' });
    await expectCode(() => call({ filtro: 'HOJE' }), '42501');

    await setSession({ globalModules: 'caixa' });
    await expectCode(() => call({ filtro: 'QUALQUER' }), '22023');
    await expectCode(() => call({ pagina: 0 }), '22023');
    await expectCode(() => call({ tamanho: 101 }), '22023');
    await setSession({ role: 'service_role', sub: null, gestor: false });
    await expectCode(() => call({ company: ids.invalidCompany }), '22023');
    await expectCode(() => call({ company: ids.companyB, polo: ids.poloA }), '22023');

    const { rows: [acl] } = await db.query(`SELECT
      has_function_privilege('anon', '${signature}', 'EXECUTE') AS anon_rpc,
      has_function_privilege('authenticated', '${signature}', 'EXECUTE') AS auth_rpc,
      has_function_privilege('service_role', '${signature}', 'EXECUTE') AS service_rpc
    `);
    assert.deepEqual(acl, { anon_rpc: false, auth_rpc: true, service_rpc: true });
    await setSession({ globalModules: 'caixa' });
    await db.exec('SET ROLE authenticated');
    assert.equal((await call({ filtro: 'HOJE' })).versao, 2);
    await db.exec('RESET ROLE');
  } finally {
    await db.close();
  }
});
