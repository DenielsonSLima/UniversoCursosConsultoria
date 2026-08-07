-- Leituras econômicas do rateio. O Caixa físico continua refletindo somente
-- bancos e pagamentos reais; este resumo expõe o custo operacional por polo.

CREATE OR REPLACE FUNCTION public.listar_despesas_economicas_secure(
  p_tipo text,
  p_polo_id uuid,
  p_categoria_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_due_start date DEFAULT NULL,
  p_due_end date DEFAULT NULL,
  p_status_scope text DEFAULT 'todos',
  p_turma_id uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  despesa_lancamento_id uuid,
  polo_id uuid,
  polo_nome text,
  tipo text,
  descricao text,
  valor_base numeric,
  juros_valor numeric,
  multa_valor numeric,
  desconto_valor numeric,
  valor numeric,
  data_vencimento date,
  data_pagamento date,
  valor_pago numeric,
  status text,
  categoria_financeira_id uuid,
  categoria_nome text,
  fornecedor_id uuid,
  fornecedor_nome text,
  forma_pagamento text,
  conta_bancaria_id uuid,
  parcela_numero integer,
  total_parcelas integer,
  grupo_parcelas_id uuid,
  observacao text,
  turma_id uuid,
  turma_nome text,
  anexo_bucket text,
  anexo_path text,
  anexo_nome text,
  anexo_mime text,
  anexo_tamanho bigint,
  created_at timestamptz,
  is_rateio_derivado boolean,
  rateio_modo text,
  rateio_polos_quantidade integer,
  polo_matriz_id uuid,
  polo_matriz_nome text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tipo text := upper(btrim(coalesce(p_tipo, '')));
  v_status_scope text := lower(btrim(coalesce(p_status_scope, 'todos')));
  v_due_start date;
  v_due_end_exclusive date;
  v_search text := nullif(public.financeiro_normalize_search_text(btrim(coalesce(p_search, ''))), '');
  v_search_pattern text;
BEGIN
  IF v_tipo NOT IN ('DESPESA_FIXA', 'DESPESA_VARIAVEL', 'OUTRO_DEBITO')
     OR v_status_scope NOT IN ('todos', 'mes_atual', 'em_aberto') THEN
    RAISE EXCEPTION 'Filtros inválidos para contas a pagar.' USING ERRCODE = '22023';
  END IF;

  IF auth.role() <> 'service_role'
     AND NOT (
       p_polo_id IS NOT NULL
       AND public.is_financeiro_for_polo(p_polo_id)
       AND CASE
         WHEN v_tipo = 'OUTRO_DEBITO'
           THEN public.gestor_has_effective_financeiro_tab('outros-debitos')
         ELSE public.gestor_has_effective_financeiro_tab('despesas')
       END
     ) THEN
    RAISE EXCEPTION 'Acesso às contas a pagar fora do escopo autorizado.'
      USING ERRCODE = '42501';
  END IF;

  IF v_status_scope = 'mes_atual' THEN
    v_due_start := greatest(
      date_trunc('month', CURRENT_DATE)::date,
      coalesce(p_due_start, date_trunc('month', CURRENT_DATE)::date)
    );
    v_due_end_exclusive := least(
      (date_trunc('month', CURRENT_DATE) + interval '1 month')::date,
      coalesce(p_due_end + 1, (date_trunc('month', CURRENT_DATE) + interval '1 month')::date)
    );
  ELSE
    v_due_start := p_due_start;
    v_due_end_exclusive := CASE WHEN p_due_end IS NULL THEN NULL ELSE p_due_end + 1 END;
  END IF;

  v_search_pattern := replace(
    replace(
      replace(v_search, E'\\', E'\\\\'),
      '%', E'\\%'
    ),
    '_', E'\\_'
  );

  RETURN QUERY
  WITH itens AS (
    SELECT
      despesa.id,
      despesa.id AS despesa_lancamento_id,
      despesa.polo_id,
      polo.nome::text AS polo_nome,
      despesa.tipo,
      despesa.descricao,
      despesa.valor_base,
      despesa.juros_valor,
      despesa.multa_valor,
      despesa.desconto_valor,
      despesa.valor,
      despesa.data_vencimento,
      despesa.data_pagamento,
      despesa.valor_pago,
      despesa.status,
      despesa.categoria_financeira_id,
      categoria.nome::text AS categoria_nome,
      despesa.fornecedor_id,
      parceiro.nome::text AS fornecedor_nome,
      despesa.forma_pagamento,
      despesa.conta_bancaria_id,
      despesa.parcela_numero,
      despesa.total_parcelas,
      despesa.grupo_parcelas_id,
      despesa.observacao,
      despesa.turma_id,
      turma.nome::text AS turma_nome,
      despesa.anexo_bucket,
      despesa.anexo_path,
      despesa.anexo_nome,
      despesa.anexo_mime,
      despesa.anexo_tamanho,
      despesa.created_at,
      false AS is_rateio_derivado,
      despesa.rateio_modo,
      cardinality(despesa.rateio_polo_ids)::integer AS rateio_polos_quantidade,
      despesa.polo_id AS polo_matriz_id,
      polo.nome::text AS polo_matriz_nome
    FROM public.despesas_lancamentos despesa
    JOIN public.polos polo ON polo.id = despesa.polo_id
    LEFT JOIN public.categorias_financeiras categoria ON categoria.id = despesa.categoria_financeira_id
    LEFT JOIN public.parceiros parceiro ON parceiro.id = despesa.fornecedor_id
    LEFT JOIN public.turmas turma ON turma.id = despesa.turma_id
    WHERE despesa.polo_id = p_polo_id

    UNION ALL

    SELECT
      rateio.id,
      despesa.id AS despesa_lancamento_id,
      rateio.polo_id,
      polo_destino.nome::text AS polo_nome,
      despesa.tipo,
      despesa.descricao,
      rateio.valor_base,
      rateio.juros_valor,
      rateio.multa_valor,
      rateio.desconto_valor,
      rateio.valor_total AS valor,
      despesa.data_vencimento,
      rateio.data_pagamento,
      CASE WHEN rateio.status = 'PAGO' THEN rateio.valor_total ELSE NULL END AS valor_pago,
      rateio.status,
      despesa.categoria_financeira_id,
      categoria.nome::text AS categoria_nome,
      despesa.fornecedor_id,
      parceiro.nome::text AS fornecedor_nome,
      NULL::text AS forma_pagamento,
      NULL::uuid AS conta_bancaria_id,
      despesa.parcela_numero,
      despesa.total_parcelas,
      despesa.grupo_parcelas_id,
      concat_ws(' · ', nullif(despesa.observacao, ''), 'Rateio da Matriz') AS observacao,
      despesa.turma_id,
      turma.nome::text AS turma_nome,
      NULL::text AS anexo_bucket,
      NULL::text AS anexo_path,
      NULL::text AS anexo_nome,
      NULL::text AS anexo_mime,
      NULL::bigint AS anexo_tamanho,
      rateio.created_at,
      true AS is_rateio_derivado,
      despesa.rateio_modo,
      cardinality(despesa.rateio_polo_ids)::integer AS rateio_polos_quantidade,
      despesa.polo_id AS polo_matriz_id,
      polo_matriz.nome::text AS polo_matriz_nome
    FROM public.despesas_lancamentos_rateios rateio
    JOIN public.despesas_lancamentos despesa
      ON despesa.id = rateio.despesa_lancamento_id
    JOIN public.polos polo_destino ON polo_destino.id = rateio.polo_id
    JOIN public.polos polo_matriz ON polo_matriz.id = despesa.polo_id
    LEFT JOIN public.categorias_financeiras categoria ON categoria.id = despesa.categoria_financeira_id
    LEFT JOIN public.parceiros parceiro ON parceiro.id = despesa.fornecedor_id
    LEFT JOIN public.turmas turma ON turma.id = despesa.turma_id
    WHERE rateio.polo_id = p_polo_id
      -- A Matriz já enxerga a conta física; não deve receber uma cópia econômica.
      AND despesa.polo_id <> p_polo_id
  )
  SELECT
    item.id,
    item.despesa_lancamento_id,
    item.polo_id,
    item.polo_nome,
    item.tipo,
    item.descricao,
    item.valor_base,
    item.juros_valor,
    item.multa_valor,
    item.desconto_valor,
    item.valor,
    item.data_vencimento,
    item.data_pagamento,
    item.valor_pago,
    item.status,
    item.categoria_financeira_id,
    item.categoria_nome,
    item.fornecedor_id,
    item.fornecedor_nome,
    item.forma_pagamento,
    item.conta_bancaria_id,
    item.parcela_numero,
    item.total_parcelas,
    item.grupo_parcelas_id,
    item.observacao,
    item.turma_id,
    item.turma_nome,
    item.anexo_bucket,
    item.anexo_path,
    item.anexo_nome,
    item.anexo_mime,
    item.anexo_tamanho,
    item.created_at,
    item.is_rateio_derivado,
    item.rateio_modo,
    item.rateio_polos_quantidade,
    item.polo_matriz_id,
    item.polo_matriz_nome
  FROM itens item
  WHERE item.tipo = v_tipo
    AND (p_categoria_id IS NULL OR item.categoria_financeira_id = p_categoria_id)
    AND (p_turma_id IS NULL OR item.turma_id = p_turma_id)
    AND (v_due_start IS NULL OR item.data_vencimento >= v_due_start)
    AND (v_due_end_exclusive IS NULL OR item.data_vencimento < v_due_end_exclusive)
    AND (
      v_status_scope <> 'em_aberto'
      OR item.status IN ('PENDENTE', 'VENCIDO')
    )
    AND (
      v_search IS NULL
      OR public.financeiro_normalize_search_text(item.descricao) LIKE '%' || v_search_pattern || '%' ESCAPE E'\\'
      OR public.financeiro_normalize_search_text(item.categoria_nome) LIKE '%' || v_search_pattern || '%' ESCAPE E'\\'
      OR public.financeiro_normalize_search_text(item.fornecedor_nome) LIKE '%' || v_search_pattern || '%' ESCAPE E'\\'
      OR public.financeiro_normalize_search_text(item.polo_nome) LIKE '%' || v_search_pattern || '%' ESCAPE E'\\'
      OR public.financeiro_normalize_search_text(item.polo_matriz_nome) LIKE '%' || v_search_pattern || '%' ESCAPE E'\\'
    )
  ORDER BY item.data_vencimento, item.created_at, item.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_despesas_economicas_summary_secure(
  p_tipo text,
  p_polo_id uuid,
  p_categoria_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_due_start date DEFAULT NULL,
  p_due_end date DEFAULT NULL,
  p_status_scope text DEFAULT 'todos',
  p_turma_id uuid DEFAULT NULL
)
RETURNS TABLE(
  total_value numeric,
  paid_value numeric,
  pending_value numeric,
  vencidos_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    coalesce(sum(item.valor) FILTER (WHERE item.status <> 'CANCELADO'), 0)::numeric(15, 2),
    coalesce(sum(coalesce(item.valor_pago, item.valor)) FILTER (WHERE item.status = 'PAGO'), 0)::numeric(15, 2),
    coalesce(sum(item.valor) FILTER (WHERE item.status IN ('PENDENTE', 'VENCIDO')), 0)::numeric(15, 2),
    count(*) FILTER (
      WHERE item.status = 'VENCIDO'
         OR (item.status = 'PENDENTE' AND item.data_vencimento < CURRENT_DATE)
    )::bigint
  FROM public.listar_despesas_economicas_secure(
    p_tipo,
    p_polo_id,
    p_categoria_id,
    p_search,
    p_due_start,
    p_due_end,
    p_status_scope,
    p_turma_id
  ) item;
$function$;

CREATE OR REPLACE FUNCTION public.get_despesas_economicas_group_summary_secure(
  p_tipo text,
  p_polo_id uuid,
  p_categoria_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_due_start date DEFAULT NULL,
  p_due_end date DEFAULT NULL,
  p_status_scope text DEFAULT 'todos',
  p_turma_id uuid DEFAULT NULL
)
RETURNS TABLE(
  categoria_id uuid,
  categoria_nome text,
  total_value numeric,
  paid_value numeric,
  item_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    item.categoria_financeira_id,
    coalesce(item.categoria_nome, 'Sem categoria')::text,
    coalesce(sum(item.valor) FILTER (WHERE item.status <> 'CANCELADO'), 0)::numeric(15, 2),
    coalesce(sum(coalesce(item.valor_pago, item.valor)) FILTER (WHERE item.status = 'PAGO'), 0)::numeric(15, 2),
    count(*)::bigint
  FROM public.listar_despesas_economicas_secure(
    p_tipo,
    p_polo_id,
    p_categoria_id,
    p_search,
    p_due_start,
    p_due_end,
    p_status_scope,
    p_turma_id
  ) item
  GROUP BY item.categoria_financeira_id, item.categoria_nome
  ORDER BY coalesce(item.categoria_nome, 'Sem categoria'), item.categoria_financeira_id;
$function$;

CREATE OR REPLACE FUNCTION public.get_caixa_custos_operacionais_secure(
  p_polo_id uuid DEFAULT NULL,
  p_competencia date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inicio date := date_trunc('month', coalesce(p_competencia, CURRENT_DATE))::date;
  v_fim date := (date_trunc('month', coalesce(p_competencia, CURRENT_DATE)) + interval '1 month')::date;
  v_custo_competencia numeric := 0;
  v_pago_competencia numeric := 0;
  v_a_pagar numeric := 0;
  v_vencido numeric := 0;
  v_custo_rateado_competencia numeric := 0;
  v_rateado_a_pagar numeric := 0;
  v_lancamentos_competencia integer := 0;
  v_rateios_competencia integer := 0;
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT (
       (
         p_polo_id IS NULL
         AND public.gestor_has_any_global_module(ARRAY['caixa', 'financeiro'])
       )
       OR (
         p_polo_id IS NOT NULL
         AND public.gestor_has_any_module_for_polo(ARRAY['caixa', 'financeiro'], p_polo_id)
       )
     ) THEN
    RAISE EXCEPTION 'Acesso aos custos operacionais fora do escopo autorizado.'
      USING ERRCODE = '42501';
  END IF;

  WITH custos AS (
    -- Contas legadas comuns, sem vínculo com a tela de despesas nem empréstimos.
    SELECT
      conta.valor,
      conta.status,
      conta.data_vencimento,
      conta.data_pagamento,
      false AS rateado
    FROM public.contas_pagar conta
    WHERE conta.despesa_lancamento_id IS NULL
      AND conta.emprestimo_parcela_id IS NULL
      AND (p_polo_id IS NULL OR conta.polo_id = p_polo_id)

    UNION ALL

    -- Despesa normal pertence integralmente ao próprio polo.
    SELECT
      despesa.valor,
      despesa.status,
      despesa.data_vencimento,
      despesa.data_pagamento,
      false AS rateado
    FROM public.despesas_lancamentos despesa
    WHERE despesa.rateio_modo = 'SEM_RATEIO'
      AND (p_polo_id IS NULL OR despesa.polo_id = p_polo_id)

    UNION ALL

    -- Despesa rateada não conta inteira na Matriz: entra apenas nas parcelas
    -- econômicas atribuídas a cada polo. No consolidado, a soma fecha uma vez.
    SELECT
      rateio.valor_total AS valor,
      rateio.status,
      despesa.data_vencimento,
      rateio.data_pagamento,
      true AS rateado
    FROM public.despesas_lancamentos_rateios rateio
    JOIN public.despesas_lancamentos despesa
      ON despesa.id = rateio.despesa_lancamento_id
    WHERE p_polo_id IS NULL OR rateio.polo_id = p_polo_id
  )
  SELECT
    coalesce(sum(custo.valor) FILTER (
      WHERE custo.status <> 'CANCELADO'
        AND custo.data_vencimento >= v_inicio
        AND custo.data_vencimento < v_fim
    ), 0),
    coalesce(sum(custo.valor) FILTER (
      WHERE custo.status = 'PAGO'
        AND custo.data_pagamento >= v_inicio
        AND custo.data_pagamento < v_fim
    ), 0),
    coalesce(sum(custo.valor) FILTER (
      WHERE custo.status IN ('PENDENTE', 'VENCIDO')
    ), 0),
    coalesce(sum(custo.valor) FILTER (
      WHERE custo.status IN ('PENDENTE', 'VENCIDO')
        AND custo.data_vencimento < CURRENT_DATE
    ), 0),
    coalesce(sum(custo.valor) FILTER (
      WHERE custo.rateado
        AND custo.status <> 'CANCELADO'
        AND custo.data_vencimento >= v_inicio
        AND custo.data_vencimento < v_fim
    ), 0),
    coalesce(sum(custo.valor) FILTER (
      WHERE custo.rateado
        AND custo.status IN ('PENDENTE', 'VENCIDO')
    ), 0),
    count(*) FILTER (
      WHERE custo.status <> 'CANCELADO'
        AND custo.data_vencimento >= v_inicio
        AND custo.data_vencimento < v_fim
    )::integer,
    count(*) FILTER (
      WHERE custo.rateado
        AND custo.status <> 'CANCELADO'
        AND custo.data_vencimento >= v_inicio
        AND custo.data_vencimento < v_fim
    )::integer
  INTO
    v_custo_competencia,
    v_pago_competencia,
    v_a_pagar,
    v_vencido,
    v_custo_rateado_competencia,
    v_rateado_a_pagar,
    v_lancamentos_competencia,
    v_rateios_competencia
  FROM custos custo;

  RETURN jsonb_build_object(
    'competencia', to_char(v_inicio, 'YYYY-MM-DD'),
    'polo_id', p_polo_id,
    'custo_competencia', v_custo_competencia,
    'pago_competencia', v_pago_competencia,
    'a_pagar', v_a_pagar,
    'vencido', v_vencido,
    'custo_rateado_competencia', v_custo_rateado_competencia,
    'rateado_a_pagar', v_rateado_a_pagar,
    'lancamentos_competencia', v_lancamentos_competencia,
    'rateios_competencia', v_rateios_competencia,
    'ponto_equilibrio_status', 'PENDENTE_DE_MARGEM',
    'observacao', 'Custos rateados são econômicos. Caixa e baixa física permanecem somente no polo pagador; ponto de equilíbrio exige política de margem e receitas canônicas.'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.listar_despesas_economicas_secure(text, uuid, uuid, text, date, date, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_despesas_economicas_summary_secure(text, uuid, uuid, text, date, date, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_despesas_economicas_group_summary_secure(text, uuid, uuid, text, date, date, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_caixa_custos_operacionais_secure(uuid, date) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.listar_despesas_economicas_secure(text, uuid, uuid, text, date, date, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_despesas_economicas_summary_secure(text, uuid, uuid, text, date, date, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_despesas_economicas_group_summary_secure(text, uuid, uuid, text, date, date, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_caixa_custos_operacionais_secure(uuid, date) TO authenticated, service_role;

COMMENT ON FUNCTION public.listar_despesas_economicas_secure(text, uuid, uuid, text, date, date, text, uuid) IS
  'Lista uma conta física própria e custos derivados de rateio que pertencem economicamente ao polo consultado.';
COMMENT ON FUNCTION public.get_caixa_custos_operacionais_secure(uuid, date) IS
  'Resumo econômico de custos por polo. Não altera nem duplica o caixa bancário físico.';
