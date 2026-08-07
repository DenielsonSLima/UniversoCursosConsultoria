-- Remove do frontend as duas agregacoes financeiras remanescentes:
-- o total filtrado de transferencias e os totais de despesas por categoria.

CREATE OR REPLACE FUNCTION public.get_transferencias_summary_secure(
  p_polo_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_conta_origem_id uuid DEFAULT NULL,
  p_conta_destino_id uuid DEFAULT NULL,
  p_data_inicio date DEFAULT NULL,
  p_data_fim date DEFAULT NULL,
  p_mes_atual boolean DEFAULT false
)
RETURNS TABLE (
  total_value numeric,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    coalesce(sum(transferencia.valor), 0)::numeric(15, 2) AS total_value,
    count(*)::bigint AS total_count
  FROM public.get_transferencias_contas(
    p_polo_id,
    p_search,
    p_conta_origem_id,
    p_conta_destino_id,
    p_data_inicio,
    p_data_fim,
    p_mes_atual
  ) AS transferencia;
$$;

REVOKE ALL
  ON FUNCTION public.get_transferencias_summary_secure(
    uuid,
    text,
    uuid,
    uuid,
    date,
    date,
    boolean
  )
  FROM PUBLIC, anon;

GRANT EXECUTE
  ON FUNCTION public.get_transferencias_summary_secure(
    uuid,
    text,
    uuid,
    uuid,
    date,
    date,
    boolean
  )
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_despesas_group_summary_secure(
  p_tipo text,
  p_polo_id uuid DEFAULT NULL,
  p_categoria_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_due_start date DEFAULT NULL,
  p_due_end date DEFAULT NULL,
  p_status_scope text DEFAULT 'todos',
  p_turma_id uuid DEFAULT NULL
)
RETURNS TABLE (
  categoria_id uuid,
  categoria_nome text,
  total_value numeric,
  paid_value numeric,
  item_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_due_start date;
  v_due_end date;
  v_tipo text := upper(trim(coalesce(p_tipo, '')));
  v_status_scope text := lower(trim(coalesce(p_status_scope, 'todos')));
  v_search text := nullif(trim(coalesce(p_search, '')), '');
BEGIN
  IF v_tipo NOT IN (
    'DESPESA_FIXA',
    'DESPESA_VARIAVEL',
    'OUTRO_DEBITO'
  ) THEN
    RAISE EXCEPTION 'Tipo de despesa invalido.'
      USING ERRCODE = '22023';
  END IF;

  IF v_status_scope NOT IN ('todos', 'mes_atual', 'em_aberto') THEN
    RAISE EXCEPTION 'Escopo de status de despesa invalido.'
      USING ERRCODE = '22023';
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role'
     AND (
       p_polo_id IS NULL
       OR public.is_financeiro_for_polo(p_polo_id) IS NOT TRUE
       OR NOT (
         (
           v_tipo IN ('DESPESA_FIXA', 'DESPESA_VARIAVEL')
           AND public.gestor_has_financeiro_tab('despesas') IS TRUE
         )
         OR (
           v_tipo = 'OUTRO_DEBITO'
           AND public.gestor_has_financeiro_tab('outros-debitos') IS TRUE
         )
       )
     )
  THEN
    RAISE EXCEPTION 'Acesso ao resumo de despesas fora do escopo autorizado.'
      USING ERRCODE = '42501';
  END IF;

  IF v_status_scope = 'mes_atual' THEN
    v_due_start := date_trunc('month', CURRENT_DATE)::date;
    v_due_end := (
      date_trunc('month', CURRENT_DATE) + interval '1 month'
    )::date;
  ELSE
    v_due_start := p_due_start;
    v_due_end := p_due_end;
  END IF;

  RETURN QUERY
  SELECT
    despesa.categoria_financeira_id AS categoria_id,
    coalesce(categoria.nome, 'Sem categoria')::text AS categoria_nome,
    coalesce(sum(despesa.valor) FILTER (
      WHERE despesa.status <> 'CANCELADO'
    ), 0)::numeric(15, 2) AS total_value,
    coalesce(sum(coalesce(despesa.valor_pago, despesa.valor)) FILTER (
      WHERE despesa.status = 'PAGO'
    ), 0)::numeric(15, 2) AS paid_value,
    count(*)::bigint AS item_count
  FROM public.despesas_lancamentos AS despesa
  LEFT JOIN public.categorias_financeiras AS categoria
    ON categoria.id = despesa.categoria_financeira_id
  LEFT JOIN public.parceiros AS parceiro
    ON parceiro.id = despesa.fornecedor_id
  LEFT JOIN public.polos AS polo
    ON polo.id = despesa.polo_id
  WHERE despesa.tipo = v_tipo
    AND (p_polo_id IS NULL OR despesa.polo_id = p_polo_id)
    AND (
      p_categoria_id IS NULL
      OR despesa.categoria_financeira_id = p_categoria_id
    )
    AND (p_turma_id IS NULL OR despesa.turma_id = p_turma_id)
    AND (v_due_start IS NULL OR despesa.data_vencimento >= v_due_start)
    AND (
      v_due_end IS NULL
      OR (
        v_status_scope = 'mes_atual'
        AND despesa.data_vencimento < v_due_end
      )
      OR (
        v_status_scope <> 'mes_atual'
        AND despesa.data_vencimento <= v_due_end
      )
    )
    AND (
      v_status_scope <> 'em_aberto'
      OR despesa.status IN ('PENDENTE', 'VENCIDO')
    )
    AND (
      v_search IS NULL
      OR despesa.descricao ILIKE '%' || v_search || '%'
      OR categoria.nome ILIKE '%' || v_search || '%'
      OR parceiro.nome ILIKE '%' || v_search || '%'
      OR polo.nome ILIKE '%' || v_search || '%'
    )
  GROUP BY despesa.categoria_financeira_id, categoria.nome
  ORDER BY coalesce(categoria.nome, 'Sem categoria'), despesa.categoria_financeira_id;
END;
$$;

REVOKE ALL
  ON FUNCTION public.get_despesas_group_summary_secure(
    text,
    uuid,
    uuid,
    text,
    date,
    date,
    text,
    uuid
  )
  FROM PUBLIC, anon;

GRANT EXECUTE
  ON FUNCTION public.get_despesas_group_summary_secure(
    text,
    uuid,
    uuid,
    text,
    date,
    date,
    text,
    uuid
  )
  TO authenticated, service_role;
