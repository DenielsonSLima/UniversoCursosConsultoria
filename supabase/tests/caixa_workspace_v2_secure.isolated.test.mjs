// PostgreSQL/WASM local: valida ACL e resultado real sem conexão remota.
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

const migrations = [
  '20260927203000_create_caixa_workspace_v2_core.sql',
  '20260927214500_fix_caixa_workspace_v2_rateio_payment_quality.sql',
  '20260927221000_create_caixa_workspace_v2_company_core.sql',
  '20260927222000_expose_caixa_workspace_v2_secure.sql',
  '20260927233000_fix_caixa_workspace_v2_quantity_semantics.sql',
].map((name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));

const ids = {
  companyA: 'a0000000-0000-0000-0000-000000000001',
  companyB: 'b0000000-0000-0000-0000-000000000002',
  invalidCompany: 'f0000000-0000-0000-0000-000000000099',
  poloA: '00000000-0000-0000-0000-000000000001',
  poloB: '00000000-0000-0000-0000-000000000002',
  poloC: '00000000-0000-0000-0000-000000000003',
  user: '90000000-0000-0000-0000-000000000001',
};
const signature = 'public.get_caixa_workspace_v2_secure(uuid,uuid,date,integer)';
const coreSignature = 'internal_contas.get_caixa_workspace_v2_company_core(uuid,uuid,date,integer)';
const expectCode = (operation, code) => assert.rejects(
  operation,
  (error) => error.code === code,
);

test('wrapper v2 isola empresa, autoriza escopo e mantém paridade financeira', {
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
  const call = async (companyId, poloId = null) => {
    const { rows } = await db.query(`
      SELECT public.get_caixa_workspace_v2_secure(
        $1::uuid, $2::uuid, NULL::date, 6
      ) AS payload
    `, [companyId, poloId]);
    return rows[0].payload;
  };

  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE SCHEMA internal_contas;
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
        id uuid PRIMARY KEY, company_id uuid NOT NULL, status text NOT NULL
      );
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
        id uuid, despesa_lancamento_id uuid, company_id uuid, polo_id uuid, valor_total numeric,
        data_pagamento date, status text, created_at timestamptz
      );
      INSERT INTO public.polos VALUES
        ('${ids.poloA}', '${ids.companyA}', 'ativo'),
        ('${ids.poloB}', '${ids.companyA}', 'ativo'),
        ('${ids.poloC}', '${ids.companyB}', 'ativo');
    `);
    for (const migration of migrations) await db.exec(migration);

    await db.exec(`
      INSERT INTO public.contas_pagar VALUES
        ('10000000-0000-0000-0000-000000000001', '${ids.poloA}', 10, 0,
          timezone('America/Maceio', now())::date, NULL, 'PENDENTE',
          now() - interval '1 day', NULL, NULL),
        ('10000000-0000-0000-0000-000000000002', '${ids.poloA}', 20, 20,
          timezone('America/Maceio', now())::date,
          timezone('America/Maceio', now())::date, 'PAGO',
          now() - interval '1 day', NULL, NULL),
        ('10000000-0000-0000-0000-000000000003', '${ids.poloC}', 999, 0,
          timezone('America/Maceio', now())::date, NULL, 'PENDENTE',
          now() - interval '1 day', NULL, NULL);
      INSERT INTO public.despesas_lancamentos VALUES (
        '20000000-0000-0000-0000-000000000001', '${ids.poloA}', 100, 40,
        timezone('America/Maceio', now())::date, NULL, 'PENDENTE',
        now() - interval '1 day', 'TODOS', NULL
      ), (
        '20000000-0000-0000-0000-000000000002', '${ids.poloB}', 777, 0,
        timezone('America/Maceio', now())::date, NULL, 'PENDENTE',
        now() - interval '1 day', 'TODOS', NULL
      ), (
        '20000000-0000-0000-0000-000000000003', '${ids.poloC}', 555, 0,
        timezone('America/Maceio', now())::date, NULL, 'PENDENTE',
        now() - interval '1 day', 'TODOS', NULL
      );
      INSERT INTO public.despesas_lancamentos_rateios VALUES
        ('30000000-0000-0000-0000-000000000001',
          '20000000-0000-0000-0000-000000000001', '${ids.companyA}', '${ids.poloA}', 40,
          timezone('America/Maceio', now())::date, 'PAGO', now() - interval '1 day'),
        ('30000000-0000-0000-0000-000000000002',
          '20000000-0000-0000-0000-000000000001', '${ids.companyA}', '${ids.poloB}', 60,
          NULL, 'PENDENTE', now() - interval '1 day'),
        ('30000000-0000-0000-0000-000000000003',
          '20000000-0000-0000-0000-000000000002', '${ids.companyB}', '${ids.poloB}', 777,
          NULL, 'PENDENTE', now() - interval '1 day'),
        -- Metadados do rateio aparentam empresa A, mas a despesa pai pertence à B.
        ('30000000-0000-0000-0000-000000000004',
          '20000000-0000-0000-0000-000000000003', '${ids.companyA}', '${ids.poloA}', 555,
          NULL, 'PENDENTE', now() - interval '1 day');
    `);

    await setSession({ globalModules: 'caixa' });
    const companyA = await call(ids.companyA);
    assert.equal(companyA.meta.empresa_id, ids.companyA);
    const payable = companyA.secoes.compromissos.dados.contas_a_pagar.dados;
    assert.equal(payable.unidade_quantidade, 'TITULO_FISICO_SEM_DUPLICACAO');
    assert.deepEqual(payable.contas_competencia, { valor: '130.00', quantidade: 3 });
    assert.equal(payable.pagas_competencia.valor, '60.00');
    assert.equal(payable.pagas_competencia.quantidade, 1);
    assert.deepEqual(payable.a_vencer_competencia, { valor: '0.00', quantidade: 0 });
    assert.deepEqual(payable.em_atraso, {
      valor: '0.00', quantidade: 0, data_mais_antiga: null,
    });
    const agenda = companyA.secoes.compromissos.dados.agenda_financeira.dados;
    assert.equal(agenda.unidade_quantidade, 'TITULO_FISICO_SEM_DUPLICACAO');
    assert.equal(agenda.hoje.valor, '70.00');
    assert.equal(agenda.hoje.quantidade, 2);

    // allPolos é administrador global do sistema por contrato atual, mas cada
    // resposta continua isolada pela empresa explicitamente solicitada.
    const companyB = await call(ids.companyB);
    assert.equal(companyB.secoes.compromissos.dados.contas_a_pagar.dados
      .contas_competencia.valor, '999.00');

    await setSession({ poloModules: 'caixa', allowedPolo: ids.poloA });
    const { rows: [parity] } = await db.query(`SELECT
      public.get_caixa_workspace_v2_secure($1, $2, NULL, 6)
        -> 'secoes' -> 'compromissos' -> 'dados' -> 'contas_a_pagar' -> 'dados'
        AS wrapper_kpis,
      internal_contas.get_caixa_workspace_v2_core($2, NULL, 6)
        -> 'secoes' -> 'compromissos' -> 'dados' -> 'contas_a_pagar' -> 'dados'
        AS legacy_kpis
    `, [ids.companyA, ids.poloA]);
    assert.equal(parity.wrapper_kpis.contas_competencia.valor, '70.00');
    assert.equal(parity.wrapper_kpis.contas_competencia.quantidade, 3);
    assert.notDeepEqual(parity.wrapper_kpis, parity.legacy_kpis);

    await expectCode(() => call(ids.companyA, ids.poloB), '42501');
    await expectCode(() => call(ids.companyB, ids.poloA), '42501');
    await setSession({ globalModules: 'financeiro', despesas: false });
    await expectCode(() => call(ids.companyA), '42501');
    await setSession({ globalModules: 'financeiro', despesas: true });
    assert.equal((await call(ids.companyA)).versao, 2);
    await setSession({
      poloModules: 'financeiro', allowedPolo: ids.poloA, despesas: true,
    });
    assert.equal((await call(ids.companyA, ids.poloA)).versao, 2);
    await setSession({ sub: null, globalModules: 'caixa' });
    await expectCode(() => call(ids.companyA), '42501');

    await setSession({ role: 'service_role', sub: null, gestor: false });
    await expectCode(() => call(ids.invalidCompany), '22023');

    const { rows: [acl] } = await db.query(`SELECT
      has_function_privilege('anon', '${signature}', 'EXECUTE') AS anon_wrapper,
      has_function_privilege('authenticated', '${signature}', 'EXECUTE') AS auth_wrapper,
      has_function_privilege('service_role', '${signature}', 'EXECUTE') AS service_wrapper,
      has_function_privilege('authenticated', '${coreSignature}', 'EXECUTE') AS auth_core,
      has_function_privilege('service_role', '${coreSignature}', 'EXECUTE') AS service_core
    `);
    assert.deepEqual(acl, {
      anon_wrapper: false,
      auth_wrapper: true,
      service_wrapper: true,
      auth_core: false,
      service_core: false,
    });

    await setSession({ globalModules: 'caixa' });
    await db.exec('SET ROLE authenticated');
    assert.equal((await call(ids.companyA)).versao, 2);
    await db.exec('RESET ROLE');
  } finally {
    await db.close();
  }
});
