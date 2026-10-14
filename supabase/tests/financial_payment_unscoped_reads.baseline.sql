-- Production definition inspected read-only; get_despesas_group_summary_secure(text,uuid,uuid,text,date,date,text,uuid); MD5 1aa2cc0dfc363ddd286199ad42c170ce.
CREATE OR REPLACE FUNCTION public.get_despesas_group_summary_secure(p_tipo text, p_polo_id uuid DEFAULT NULL::uuid, p_categoria_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_due_start date DEFAULT NULL::date, p_due_end date DEFAULT NULL::date, p_status_scope text DEFAULT 'todos'::text, p_turma_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(categoria_id uuid, categoria_nome text, total_value numeric, paid_value numeric, item_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_due_start date;
  v_due_end_exclusive date;
  v_tipo text := upper(trim(coalesce(p_tipo, '')));
  v_status_scope text := lower(trim(coalesce(p_status_scope, 'todos')));
  v_search text := nullif(public.financeiro_normalize_search_text(trim(coalesce(p_search, ''))), '');
  v_search_pattern text;
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

  v_search_pattern := replace(
    replace(
      replace(v_search, E'\\', E'\\\\'),
      '%',
      E'\\%'
    ),
    '_',
    E'\\_'
  );

  IF v_status_scope = 'mes_atual' THEN
    v_due_start := greatest(
      date_trunc('month', CURRENT_DATE)::date,
      coalesce(p_due_start, date_trunc('month', CURRENT_DATE)::date)
    );
    v_due_end_exclusive := least(
      (date_trunc('month', CURRENT_DATE) + interval '1 month')::date,
      coalesce(
        p_due_end + 1,
        (date_trunc('month', CURRENT_DATE) + interval '1 month')::date
      )
    );
  ELSE
    v_due_start := p_due_start;
    v_due_end_exclusive := CASE
      WHEN p_due_end IS NULL THEN NULL
      ELSE p_due_end + 1
    END;
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
      v_due_end_exclusive IS NULL
      OR despesa.data_vencimento < v_due_end_exclusive
    )
    AND (
      v_status_scope <> 'em_aberto'
      OR despesa.status IN ('PENDENTE', 'VENCIDO')
    )
    AND (
      v_search IS NULL
      OR public.financeiro_normalize_search_text(despesa.descricao) LIKE '%' || v_search_pattern || '%' ESCAPE E'\\'
      OR public.financeiro_normalize_search_text(categoria.nome) LIKE '%' || v_search_pattern || '%' ESCAPE E'\\'
      OR public.financeiro_normalize_search_text(parceiro.nome) LIKE '%' || v_search_pattern || '%' ESCAPE E'\\'
      OR public.financeiro_normalize_search_text(polo.nome) LIKE '%' || v_search_pattern || '%' ESCAPE E'\\'
    )
  GROUP BY despesa.categoria_financeira_id, categoria.nome
  ORDER BY coalesce(categoria.nome, 'Sem categoria'), despesa.categoria_financeira_id;
END;
$function$;

-- Production definition inspected read-only; get_despesas_summary(text,uuid,uuid,text,date,date,text,uuid); MD5 c22b5fdd6446d1a3756421e40675aaf0.
CREATE OR REPLACE FUNCTION public.get_despesas_summary(p_tipo text, p_polo_id uuid DEFAULT NULL::uuid, p_categoria_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_due_start date DEFAULT NULL::date, p_due_end date DEFAULT NULL::date, p_status_scope text DEFAULT 'todos'::text, p_turma_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(total_value numeric, paid_value numeric, pending_value numeric, vencidos_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE
  v_due_start date;
  v_due_end_exclusive date;
  v_search text := nullif(public.financeiro_normalize_search_text(trim(coalesce(p_search, ''))), '');
  v_search_pattern text;
BEGIN
  v_search_pattern := replace(
    replace(
      replace(v_search, E'\\', E'\\\\'),
      '%',
      E'\\%'
    ),
    '_',
    E'\\_'
  );

  IF p_status_scope = 'mes_atual' THEN
    v_due_start := greatest(
      date_trunc('month', CURRENT_DATE)::date,
      coalesce(p_due_start, date_trunc('month', CURRENT_DATE)::date)
    );
    v_due_end_exclusive := least(
      (date_trunc('month', CURRENT_DATE) + interval '1 month')::date,
      coalesce(
        p_due_end + 1,
        (date_trunc('month', CURRENT_DATE) + interval '1 month')::date
      )
    );
  ELSE
    v_due_start := p_due_start;
    v_due_end_exclusive := CASE
      WHEN p_due_end IS NULL THEN NULL
      ELSE p_due_end + 1
    END;
  END IF;

  RETURN QUERY
  SELECT
    coalesce(sum(despesa.valor) FILTER (
      WHERE despesa.status <> 'CANCELADO'
    ), 0)::numeric(15, 2),
    coalesce(sum(coalesce(despesa.valor_pago, despesa.valor)) FILTER (
      WHERE despesa.status = 'PAGO'
    ), 0)::numeric(15, 2),
    coalesce(sum(despesa.valor) FILTER (
      WHERE despesa.status IN ('PENDENTE', 'VENCIDO')
    ), 0)::numeric(15, 2),
    count(*) FILTER (
      WHERE despesa.status = 'VENCIDO'
         OR (
           despesa.status = 'PENDENTE'
           AND despesa.data_vencimento < CURRENT_DATE
         )
    )
  FROM public.despesas_lancamentos AS despesa
  LEFT JOIN public.categorias_financeiras AS categoria
    ON categoria.id = despesa.categoria_financeira_id
  LEFT JOIN public.parceiros AS parceiro
    ON parceiro.id = despesa.fornecedor_id
  LEFT JOIN public.polos AS polo
    ON polo.id = despesa.polo_id
  WHERE despesa.tipo = p_tipo
    AND (p_polo_id IS NULL OR despesa.polo_id = p_polo_id)
    AND (
      p_categoria_id IS NULL
      OR despesa.categoria_financeira_id = p_categoria_id
    )
    AND (p_turma_id IS NULL OR despesa.turma_id = p_turma_id)
    AND (v_due_start IS NULL OR despesa.data_vencimento >= v_due_start)
    AND (
      v_due_end_exclusive IS NULL
      OR despesa.data_vencimento < v_due_end_exclusive
    )
    AND (
      p_status_scope <> 'em_aberto'
      OR despesa.status IN ('PENDENTE', 'VENCIDO')
    )
    AND (
      v_search IS NULL
      OR public.financeiro_normalize_search_text(despesa.descricao) LIKE '%' || v_search_pattern || '%' ESCAPE E'\\'
      OR public.financeiro_normalize_search_text(categoria.nome) LIKE '%' || v_search_pattern || '%' ESCAPE E'\\'
      OR public.financeiro_normalize_search_text(parceiro.nome) LIKE '%' || v_search_pattern || '%' ESCAPE E'\\'
      OR public.financeiro_normalize_search_text(polo.nome) LIKE '%' || v_search_pattern || '%' ESCAPE E'\\'
    );
END;
$function$;

-- Production definition inspected read-only; get_despesas_summary(text,uuid,uuid,text,date,date,text); MD5 5085a0925350ad18dab50265987fc7ca.
CREATE OR REPLACE FUNCTION public.get_despesas_summary(p_tipo text, p_polo_id uuid DEFAULT NULL::uuid, p_categoria_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_due_start date DEFAULT NULL::date, p_due_end date DEFAULT NULL::date, p_status_scope text DEFAULT 'todos'::text)
 RETURNS TABLE(total_value numeric, paid_value numeric, pending_value numeric, vencidos_count bigint)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_due_start DATE;
  v_due_end DATE;
BEGIN
  -- Se o status_scope for 'mes_atual', define data inicial e final do mês corrente
  IF p_status_scope = 'mes_atual' THEN
    v_due_start := date_trunc('month', current_date)::date;
    v_due_end := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
  ELSE
    v_due_start := p_due_start;
    v_due_end := p_due_end;
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(SUM(d.valor), 0.00)::NUMERIC(15,2) AS total_value,
    COALESCE(SUM(CASE WHEN d.status = 'PAGO' THEN COALESCE(d.valor_pago, d.valor) ELSE 0.00 END), 0.00)::NUMERIC(15,2) AS paid_value,
    COALESCE(SUM(CASE WHEN d.status IN ('PENDENTE', 'VENCIDO') THEN d.valor ELSE 0.00 END), 0.00)::NUMERIC(15,2) AS pending_value,
    COUNT(CASE WHEN d.status = 'VENCIDO' OR (d.status = 'PENDENTE' AND d.data_vencimento < CURRENT_DATE) THEN 1 END)::BIGINT AS vencidos_count
  FROM despesas_lancamentos d
  LEFT JOIN categorias_financeiras c ON d.categoria_financeira_id = c.id
  LEFT JOIN parceiros p ON d.fornecedor_id = p.id
  LEFT JOIN polos po ON d.polo_id = po.id
  WHERE d.tipo = p_tipo
    AND (p_polo_id IS NULL OR d.polo_id = p_polo_id)
    AND (p_categoria_id IS NULL OR d.categoria_financeira_id = p_categoria_id)
    AND (v_due_start IS NULL OR d.data_vencimento >= v_due_start)
    AND (v_due_end IS NULL OR d.data_vencimento <= v_due_end)
    AND (
      p_status_scope <> 'em_aberto' 
      OR d.status IN ('PENDENTE', 'VENCIDO')
    )
    AND (
      p_search IS NULL OR p_search = '' OR
      d.descricao ILIKE '%' || p_search || '%' OR
      c.nome ILIKE '%' || p_search || '%' OR
      p.nome ILIKE '%' || p_search || '%' OR
      po.nome ILIKE '%' || p_search || '%'
    );
END;
$function$;

