// PostgreSQL/WASM local: valida contrato, escopo, paridade e volume sem rede.
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
  '../migrations/20261002003956_create_caixa_composicao_mensal_secure.sql',
  import.meta.url,
), 'utf8');

const signature = 'public.get_caixa_composicao_mensal_secure(uuid,date)';
const poloA = '00000000-0000-0000-0000-000000000001';
const poloB = '00000000-0000-0000-0000-000000000002';
const poloEmpty = '00000000-0000-0000-0000-000000000003';
const expectCode = (operation, code) => assert.rejects(
  operation,
  (error) => error.code === code,
);

test('composição mensal é canônica, isolada e suporta mais de 300 movimentos', {
  skip: pgliteUnavailable
    ? 'PGlite não instalado; informe CAIXA_TEST_PGLITE_MODULE para executar.'
    : false,
}, async () => {
  const db = new PGlite();
  const setAccess = async ({
    role = 'authenticated', global = false, allowedPolo = poloA,
    receiptDelta = '0', receiptCountDelta = '0',
  } = {}) => db.query(`SELECT
    set_config('test.actor_role', $1, false),
    set_config('test.global_scope', $2, false),
    set_config('test.allowed_polo', $3, false),
    set_config('test.statement_receipt_delta', $4, false),
    set_config('test.statement_receipt_count_delta', $5, false)
  `, [role, String(global), allowedPolo, receiptDelta, receiptCountDelta]);
  const call = async (polo = poloA, competencia = '2026-10-15') => {
    const { rows } = await db.query(`SELECT
      public.get_caixa_composicao_mensal_secure($1::uuid, $2::date) AS payload
    `, [polo, competencia]);
    return rows[0].payload;
  };

  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role;
      CREATE SCHEMA test_caixa;

      CREATE TABLE test_caixa.receipts (
        id uuid PRIMARY KEY,
        polo_id uuid,
        data_pagamento date NOT NULL,
        valor_base numeric NOT NULL,
        juros numeric,
        multa numeric,
        acrescimo numeric,
        desconto numeric,
        diferenca numeric NOT NULL,
        composicao_status text,
        valor_recebido numeric NOT NULL
      );
      CREATE TABLE test_caixa.expenses (
        id uuid PRIMARY KEY,
        polo_id uuid,
        data_pagamento date NOT NULL,
        valor_base numeric NOT NULL,
        juros numeric,
        multa numeric,
        acrescimo numeric,
        desconto numeric,
        diferenca numeric NOT NULL,
        composicao_status text,
        valor_pago numeric NOT NULL
      );

      CREATE FUNCTION public.get_caixa_relatorio_recebimentos_core(
        p_polo_id uuid, p_inicio date, p_fim date
      ) RETURNS TABLE (
        id uuid, data_pagamento date, data_vencimento date,
        descricao text, pagador text, polo text, curso text, modalidade text,
        turma text, parcela_numero integer, total_parcelas integer,
        forma_pagamento text, conta text, valor_base numeric, juros numeric,
        multa numeric, acrescimo numeric, desconto numeric,
        diferenca_nao_discriminada numeric, composicao_status text,
        valor_recebido numeric
      ) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
        SELECT r.id, r.data_pagamento, NULL::date, 'Recebimento', 'Pagador',
          'Polo', 'Curso', 'TECNICO', 'Turma', NULL::integer, NULL::integer,
          'PIX', 'Conta', r.valor_base, r.juros, r.multa, r.acrescimo,
          r.desconto, r.diferenca, r.composicao_status, r.valor_recebido
        FROM test_caixa.receipts r
        WHERE r.data_pagamento >= p_inicio AND r.data_pagamento < p_fim
          AND (p_polo_id IS NULL OR r.polo_id = p_polo_id)
      $$;

      CREATE FUNCTION public.get_caixa_relatorio_despesas_core(
        p_polo_id uuid, p_inicio date, p_fim date
      ) RETURNS TABLE (
        id uuid, origem text, data_pagamento date, data_vencimento date,
        descricao text, fornecedor text, categoria text, polo text,
        curso text, turma text, parcela_numero integer, total_parcelas integer,
        forma_pagamento text, conta text, valor_base numeric, juros numeric,
        multa numeric, acrescimo numeric, desconto numeric,
        diferenca_nao_discriminada numeric, composicao_status text,
        valor_pago numeric
      ) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
        SELECT e.id, 'CONTA_PAGAR', e.data_pagamento, NULL::date, 'Despesa',
          'Fornecedor', 'Administrativa', 'Polo', 'Curso', 'Turma',
          NULL::integer, NULL::integer, 'PIX', 'Conta', e.valor_base,
          e.juros, e.multa, e.acrescimo, e.desconto, e.diferenca,
          e.composicao_status, e.valor_pago
        FROM test_caixa.expenses e
        WHERE e.data_pagamento >= p_inicio AND e.data_pagamento < p_fim
          AND (p_polo_id IS NULL OR e.polo_id = p_polo_id)
      $$;

      CREATE FUNCTION public.get_caixa_prestacao_mensal_secure(
        p_polo_id uuid DEFAULT NULL,
        p_competencia date DEFAULT CURRENT_DATE,
        p_meses_historico integer DEFAULT 6
      ) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
      SET search_path TO '' AS $$
      DECLARE
        v_role text := current_setting('test.actor_role', true);
        v_global boolean := coalesce(
          current_setting('test.global_scope', true), 'false'
        ) = 'true';
        v_allowed_polo text := current_setting('test.allowed_polo', true);
        v_inicio date := date_trunc('month', p_competencia)::date;
        v_fim date := (date_trunc('month', p_competencia) + interval '1 month')::date;
        v_recebimentos numeric;
        v_despesas numeric;
        v_quantidade_recebimentos integer;
        v_quantidade_despesas integer;
      BEGIN
        IF v_role IS DISTINCT FROM 'service_role' AND (
          v_role IS DISTINCT FROM 'authenticated'
          OR (p_polo_id IS NULL AND NOT v_global)
          OR (p_polo_id IS NOT NULL AND p_polo_id::text IS DISTINCT FROM v_allowed_polo)
        ) THEN
          RAISE EXCEPTION 'Escopo negado pela prestação mensal.'
            USING ERRCODE = '42501';
        END IF;
        IF p_meses_historico <> 1 THEN
          RAISE EXCEPTION 'A composição deve requisitar um mês.'
            USING ERRCODE = '22023';
        END IF;
        SELECT coalesce(sum(r.valor_recebido), 0), count(*)::integer
        INTO v_recebimentos, v_quantidade_recebimentos
        FROM test_caixa.receipts r
        WHERE r.data_pagamento >= v_inicio AND r.data_pagamento < v_fim
          AND (p_polo_id IS NULL OR r.polo_id = p_polo_id);
        SELECT coalesce(sum(e.valor_pago), 0), count(*)::integer
        INTO v_despesas, v_quantidade_despesas
        FROM test_caixa.expenses e
        WHERE e.data_pagamento >= v_inicio AND e.data_pagamento < v_fim
          AND (p_polo_id IS NULL OR e.polo_id = p_polo_id);
        RETURN jsonb_build_object('resumo_competencia', jsonb_build_object(
          'entradas_recebidas_brutas', v_recebimentos
            + coalesce(nullif(current_setting('test.statement_receipt_delta', true), ''), '0')::numeric,
          'saidas_pagas', v_despesas,
          'quantidade_recebimentos', v_quantidade_recebimentos
            + coalesce(nullif(current_setting('test.statement_receipt_count_delta', true), ''), '0')::integer,
          'quantidade_pagamentos', v_quantidade_despesas
        ));
      END;
      $$;

      REVOKE ALL ON FUNCTION public.get_caixa_relatorio_recebimentos_core(uuid,date,date)
        FROM PUBLIC, anon, authenticated, service_role;
      REVOKE ALL ON FUNCTION public.get_caixa_relatorio_despesas_core(uuid,date,date)
        FROM PUBLIC, anon, authenticated, service_role;
      GRANT EXECUTE ON FUNCTION public.get_caixa_relatorio_recebimentos_core(uuid,date,date)
        TO service_role;
      GRANT EXECUTE ON FUNCTION public.get_caixa_relatorio_despesas_core(uuid,date,date)
        TO service_role;
    `);
    await db.exec(migration);
    await db.exec(`
      INSERT INTO test_caixa.receipts
      SELECT
        ('10000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
        '${poloA}'::uuid, DATE '2026-10-10', 10, 0, 0, 0, 0, 0,
        'SEM_DIFERENCA_FINANCEIRA', 10
      FROM generate_series(1, 300) n;
      INSERT INTO test_caixa.receipts VALUES (
        '10000000-0000-0000-0000-000000000999', '${poloA}', DATE '2026-10-11',
        10, NULL, NULL, NULL, NULL, 2, 'PARCIAL_POR_API_PROESC', 12
      ), (
        '10000000-0000-0000-0000-000000001000', '${poloB}', DATE '2026-10-11',
        999, 0, 0, 0, 0, 0, 'COMPOSICAO_EXPLICITA', 999
      );
      INSERT INTO test_caixa.expenses VALUES (
        '20000000-0000-0000-0000-000000000001', '${poloA}', DATE '2026-10-12',
        90, 10, 0, 0, 0, 0, 'COMPOSICAO_EXPLICITA', 100
      ), (
        '20000000-0000-0000-0000-000000000002', '${poloA}', DATE '2026-10-13',
        50, NULL, NULL, NULL, NULL, -5, 'NAO_DISCRIMINADA', 45
      ), (
        '20000000-0000-0000-0000-000000000003', '${poloB}', DATE '2026-10-13',
        999, 0, 0, 0, 0, 0, 'SEM_DIFERENCA_FINANCEIRA', 999
      );
    `);
    await setAccess();

    const payload = await call();
    assert.equal(payload.versao, 1);
    assert.equal(payload.competencia, '2026-10-01');
    assert.equal(payload.periodo_inicio, '2026-10-01');
    assert.equal(payload.periodo_fim_exclusivo, '2026-11-01');
    assert.equal(payload.escopo_tipo, 'POLO');
    assert.equal(payload.polo_id, poloA);
    assert.equal(typeof payload.gerado_em, 'string');
    assert.deepEqual(payload.recebimentos.dados, {
      total: '3012.00', quantidade: 301, base: '3010.00', juros: null,
      multa: null, acrescimo: null, desconto: null,
      diferenca_a_conferir: '2.00', quantidade_a_conferir: 1,
    });
    assert.equal(payload.recebimentos.disponivel, true);
    assert.equal(payload.recebimentos.completo, false);
    assert.equal(payload.recebimentos.motivo, 'DADOS_INCOMPLETOS');
    assert.match(payload.recebimentos.observacao, /1 recebimento/);
    assert.deepEqual(payload.despesas.dados, {
      total: '145.00', quantidade: 2, base: '140.00', juros: null,
      multa: null, acrescimo: null, desconto: null,
      diferenca_a_conferir: '-5.00', quantidade_a_conferir: 1,
    });
    assert.equal(payload.despesas.completo, false);
    assert.equal(payload.despesas.motivo, 'DADOS_INCOMPLETOS');

    await setAccess({ allowedPolo: poloEmpty });
    const empty = await call(poloEmpty);
    assert.deepEqual(empty.recebimentos.dados, {
      total: '0.00', quantidade: 0, base: '0.00', juros: '0.00', multa: '0.00',
      acrescimo: '0.00', desconto: '0.00', diferenca_a_conferir: '0.00',
      quantidade_a_conferir: 0,
    });
    assert.equal(empty.recebimentos.completo, true);
    assert.equal(empty.recebimentos.motivo, null);
    assert.equal(empty.recebimentos.observacao, null);

    await setAccess();
    await expectCode(() => call(poloB), '42501');
    await expectCode(() => call(null), '42501');
    await setAccess({ role: '' });
    await expectCode(() => call(poloA), '42501');
    await setAccess({ role: 'service_role', allowedPolo: '' });
    assert.equal((await call(poloB)).recebimentos.dados.total, '999.00');
    await expectCode(() => call(poloA, null), '22023');

    await setAccess({ receiptDelta: '0.01' });
    await expectCode(() => call(), 'P0001');
    await setAccess({ receiptCountDelta: '1' });
    await expectCode(() => call(), 'P0001');

    await setAccess();
    const { rows: [acl] } = await db.query(`SELECT
      has_function_privilege('anon', '${signature}', 'EXECUTE') AS anon,
      has_function_privilege('authenticated', '${signature}', 'EXECUTE') AS authenticated,
      has_function_privilege('service_role', '${signature}', 'EXECUTE') AS service,
      proconfig, provolatile, prosecdef
      FROM pg_proc WHERE oid = '${signature}'::regprocedure
    `);
    assert.deepEqual(acl, {
      anon: false, authenticated: true, service: true,
      proconfig: ['search_path=""'], provolatile: 's', prosecdef: true,
    });
    await db.exec('SET ROLE authenticated');
    assert.equal((await call()).recebimentos.dados.quantidade, 301);
    await db.exec('RESET ROLE');
  } finally {
    await db.close();
  }
});
