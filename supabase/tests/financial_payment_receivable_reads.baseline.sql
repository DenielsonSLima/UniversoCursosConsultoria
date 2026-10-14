-- Production function definitions read without customer data; baseline for guarded rewrites.
CREATE OR REPLACE FUNCTION public.get_outros_creditos_summary(p_polo_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_due_start date DEFAULT NULL::date, p_due_end date DEFAULT NULL::date, p_categoria_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(pending_count bigint, received_count bigint, canceled_count bigint, overdue_count bigint, all_count bigint, pending_value numeric, received_value numeric, canceled_value numeric, overdue_value numeric, all_value numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_search text := nullif(
    public.financeiro_normalize_search_text(btrim(coalesce(p_search, ''))), ''
  );
BEGIN
  RETURN QUERY
  WITH filtered AS (
    SELECT item.*
    FROM jsonb_to_recordset(public.listar_outros_creditos_secure(p_polo_id)) AS item(
      id uuid,
      polo_nome text,
      polo_cnpj text,
      polo_cidade text,
      polo_uf text,
      descricao text,
      valor numeric,
      valor_pago numeric,
      data_vencimento date,
      status text,
      categoria_financeira_id uuid,
      categoria_financeira_nome text,
      cliente_nome text,
      cliente_cpf_cnpj text,
      forma_pagamento text,
      asaas_status text
    )
    WHERE (p_due_start IS NULL OR item.data_vencimento >= p_due_start)
      AND (p_due_end IS NULL OR item.data_vencimento <= p_due_end)
      AND (p_categoria_id IS NULL OR item.categoria_financeira_id = p_categoria_id)
      AND (
        v_search IS NULL
        OR public.financeiro_normalize_search_text(item.descricao) LIKE '%' || v_search || '%'
        OR public.financeiro_normalize_search_text(item.categoria_financeira_nome) LIKE '%' || v_search || '%'
        OR public.financeiro_normalize_search_text(item.cliente_nome) LIKE '%' || v_search || '%'
        OR public.financeiro_normalize_search_text(item.cliente_cpf_cnpj) LIKE '%' || v_search || '%'
        OR public.financeiro_normalize_search_text(item.polo_nome) LIKE '%' || v_search || '%'
        OR public.financeiro_normalize_search_text(item.polo_cnpj) LIKE '%' || v_search || '%'
        OR public.financeiro_normalize_search_text(item.polo_cidade) LIKE '%' || v_search || '%'
        OR public.financeiro_normalize_search_text(item.polo_uf) LIKE '%' || v_search || '%'
        OR public.financeiro_normalize_search_text(item.forma_pagamento) LIKE '%' || v_search || '%'
        OR public.financeiro_normalize_search_text(item.asaas_status) LIKE '%' || v_search || '%'
      )
  )
  SELECT
    count(*) FILTER (WHERE status IN ('PENDENTE', 'VENCIDO', 'SUSPENSO'))::bigint,
    count(*) FILTER (WHERE status = 'PAGO')::bigint,
    count(*) FILTER (WHERE status IN ('CANCELADO', 'ESTORNADO'))::bigint,
    count(*) FILTER (
      WHERE status = 'VENCIDO' OR (status = 'PENDENTE' AND data_vencimento < current_date)
    )::bigint,
    count(*)::bigint,
    coalesce(sum(valor) FILTER (WHERE status IN ('PENDENTE', 'VENCIDO', 'SUSPENSO')), 0),
    coalesce(sum(coalesce(valor_pago, valor)) FILTER (WHERE status = 'PAGO'), 0),
    coalesce(sum(valor) FILTER (WHERE status IN ('CANCELADO', 'ESTORNADO')), 0),
    coalesce(sum(valor) FILTER (
      WHERE status = 'VENCIDO' OR (status = 'PENDENTE' AND data_vencimento < current_date)
    ), 0),
    coalesce(sum(valor), 0)
  FROM filtered;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_receivables_modality_page_v4_secure(p_modality text, p_polo_id uuid DEFAULT NULL::uuid, p_turma_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_due_start date DEFAULT NULL::date, p_due_end date DEFAULT NULL::date, p_status_scope text DEFAULT 'pending'::text, p_group_mode text DEFAULT 'none'::text, p_group_key text DEFAULT NULL::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_page jsonb;
  v_rows jsonb;
BEGIN
  PERFORM public.assert_receivables_filter_scope(p_polo_id);

  v_page := public.get_receivables_modality_page_v3_secure(
    p_modality, p_polo_id, p_turma_id, p_search, p_due_start, p_due_end,
    p_status_scope, p_group_mode, p_group_key, p_page, p_page_size
  );

  SELECT COALESCE(pg_catalog.jsonb_agg(
    entry.value || internal_academic.receivable_cycle_presentation(target) || pg_catalog.jsonb_build_object(
      'manual_settlement_id', target.manual_settlement_id,
      'manual_settlement_actor_name', NULLIF(pg_catalog.btrim(actor.nome), ''),
      'manual_settlement_completed_at', settlement.completed_at
    ) ORDER BY entry.ordinality
  ), '[]'::jsonb)
  INTO v_rows
  FROM pg_catalog.jsonb_array_elements(v_page -> 'rows')
    WITH ORDINALITY AS entry(value, ordinality)
  LEFT JOIN public.contas_receber target ON target.id = (entry.value ->> 'id')::uuid
  LEFT JOIN public.contas_receber receivable
    ON receivable.id = (entry.value ->> 'id')::uuid
    AND receivable.status = 'PAGO'
    AND receivable.manual_settlement_reversed_at IS NULL
  LEFT JOIN public.receivable_manual_settlements settlement
    ON settlement.id = receivable.manual_settlement_id
    AND settlement.receivable_id = receivable.id
    AND settlement.polo_id IS NOT DISTINCT FROM receivable.polo_id
    AND settlement.state = 'COMPLETED'
    AND settlement.reversed_at IS NULL
  LEFT JOIN public.usuarios_sistema actor ON actor.id = settlement.actor_id;

  RETURN pg_catalog.jsonb_set(v_page, '{rows}', v_rows);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_receivables_modality_summary_v3_secure(p_modality text, p_polo_id uuid DEFAULT NULL::uuid, p_turma_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_due_start date DEFAULT NULL::date, p_due_end date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH authorized AS (
    SELECT public.assert_receivables_filter_scope(p_polo_id) AS allowed
  ),
  filtered AS (
    SELECT cr.status, cr.valor, cr.valor_pago,
      internal_contas.ead_checkout_is_optional(cr.id) AS optional_checkout,
      (p_due_start IS NULL OR cr.data_vencimento >= p_due_start)
        AND (p_due_end IS NULL OR cr.data_vencimento <= p_due_end) AS due_in_period,
      (p_due_start IS NULL OR cr.data_pagamento >= p_due_start)
        AND (p_due_end IS NULL OR cr.data_pagamento <= p_due_end) AS payment_in_period
    FROM public.contas_receber cr
    JOIN public.turmas t ON t.id = cr.turma_id
    JOIN public.cursos c ON c.id = t.curso_id
    LEFT JOIN public.parceiros pa ON pa.id = cr.cliente_id
    LEFT JOIN public.polos po ON po.id = cr.polo_id
    CROSS JOIN authorized a
    WHERE a.allowed
      AND (cr.categoria = 'MENSALIDADE' OR (
        cr.categoria = 'OUTROS_CREDITOS' AND cr.origem_pagamento = 'SISTEMA_ANTERIOR'
        AND EXISTS (
          SELECT 1 FROM internal_proesc.obligation_links proesc_link
          JOIN internal_proesc.class_scopes proesc_scope ON proesc_scope.turma_id = proesc_link.turma_id
            AND proesc_scope.source_unit_id = proesc_link.source_unit_id
            AND proesc_scope.source_class_id = proesc_link.source_class_id
            AND proesc_scope.phase = 'CONFIRMED'
          WHERE proesc_link.receivable_id = cr.id AND proesc_link.matricula_id = cr.matricula_id
            AND proesc_link.turma_id = cr.turma_id AND proesc_scope.polo_id = cr.polo_id
        )
      ))
      AND c.modalidade = p_modality
      AND (p_polo_id IS NULL OR cr.polo_id = p_polo_id)
      AND (p_turma_id IS NULL OR cr.turma_id = p_turma_id)
      AND (
        ((p_due_start IS NULL OR cr.data_vencimento >= p_due_start)
          AND (p_due_end IS NULL OR cr.data_vencimento <= p_due_end))
        OR (cr.status = 'PAGO'
          AND (p_due_start IS NULL OR cr.data_pagamento >= p_due_start)
          AND (p_due_end IS NULL OR cr.data_pagamento <= p_due_end))
      )
      AND (
        NULLIF(public.financeiro_normalize_search_text(BTRIM(COALESCE(p_search, ''))), '') IS NULL
        OR public.financeiro_normalize_search_text(cr.descricao) LIKE '%' || public.financeiro_normalize_search_text(BTRIM(p_search)) || '%'
        OR public.financeiro_normalize_search_text(pa.nome) LIKE '%' || public.financeiro_normalize_search_text(BTRIM(p_search)) || '%'
        OR public.financeiro_normalize_search_text(pa.cpf_cnpj) LIKE '%' || public.financeiro_normalize_search_text(BTRIM(p_search)) || '%'
        OR public.financeiro_normalize_search_text(t.nome) LIKE '%' || public.financeiro_normalize_search_text(BTRIM(p_search)) || '%'
        OR public.financeiro_normalize_search_text(po.nome) LIKE '%' || public.financeiro_normalize_search_text(BTRIM(p_search)) || '%'
        OR public.financeiro_normalize_search_text(po.cnpj) LIKE '%' || public.financeiro_normalize_search_text(BTRIM(p_search)) || '%'
        OR public.financeiro_normalize_search_text(po.cidade) LIKE '%' || public.financeiro_normalize_search_text(BTRIM(p_search)) || '%'
        OR public.financeiro_normalize_search_text(po.estado) LIKE '%' || public.financeiro_normalize_search_text(BTRIM(p_search)) || '%'
      )
  )
  SELECT jsonb_build_object(
    'pending_count', COUNT(*) FILTER (WHERE due_in_period AND status IN ('PENDENTE', 'VENCIDO', 'SUSPENSO')),
    'received_count', COUNT(*) FILTER (WHERE payment_in_period AND status = 'PAGO'),
    'canceled_count', COUNT(*) FILTER (WHERE due_in_period AND status = 'CANCELADO'),
    'overdue_count', COUNT(*) FILTER (WHERE due_in_period AND status = 'VENCIDO' AND NOT optional_checkout),
    'all_count', COUNT(*) FILTER (WHERE due_in_period),
    'pending_value', COALESCE(SUM(valor) FILTER (WHERE due_in_period AND status IN ('PENDENTE', 'VENCIDO', 'SUSPENSO')), 0),
    'received_value', COALESCE(SUM(COALESCE(valor_pago, valor)) FILTER (WHERE payment_in_period AND status = 'PAGO'), 0),
    'canceled_value', COALESCE(SUM(valor) FILTER (WHERE due_in_period AND status = 'CANCELADO'), 0),
    'overdue_value', COALESCE(SUM(valor) FILTER (WHERE due_in_period AND status = 'VENCIDO' AND NOT optional_checkout), 0),
    'all_value', COALESCE(SUM(valor) FILTER (WHERE due_in_period), 0),
    'optional_checkout_count', COUNT(*) FILTER (WHERE due_in_period AND optional_checkout),
    'optional_checkout_value', COALESCE(SUM(valor) FILTER (WHERE due_in_period AND optional_checkout), 0)
  )
  FROM filtered;
$function$
;

CREATE OR REPLACE FUNCTION public.listar_outros_creditos_secure(p_polo_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_creditos jsonb;
BEGIN
  v_creditos := public.listar_outros_creditos_sem_convenios_core(p_polo_id);
  RETURN coalesce((
    SELECT jsonb_agg(item || jsonb_build_object(
      'other_credit_cancellation_eligible', internal_other_credit_cancellation.eligible(credito),
      'outros_creditos_plano_id', credito.outros_creditos_plano_id,
      'outros_creditos_papel', credito.outros_creditos_papel,
      'regra_financeira_outros_creditos_snapshot', credito.regra_financeira_outros_creditos_snapshot
    ) ORDER BY item ->> 'data_vencimento', item ->> 'created_at', item ->> 'id')
    FROM jsonb_array_elements(v_creditos) item
    JOIN public.contas_receber credito ON credito.id = (item ->> 'id')::uuid
    WHERE NOT EXISTS (SELECT 1 FROM public.convenios_financeiros_creditos convenio_credito
      WHERE convenio_credito.conta_receber_id = credito.id)
  ), '[]'::jsonb);
END;
$function$
;

