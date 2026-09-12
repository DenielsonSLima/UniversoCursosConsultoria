-- Recebidos acompanha a data do pagamento; os demais filtros mantêm vencimento.
-- Definição integral baseada na função remota vigente, preservando escopo e payload.
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
      AND cr.categoria = 'MENSALIDADE'
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
    'overdue_count', COUNT(*) FILTER (WHERE due_in_period AND status = 'VENCIDO'),
    'all_count', COUNT(*) FILTER (WHERE due_in_period),
    'pending_value', COALESCE(SUM(valor) FILTER (WHERE due_in_period AND status IN ('PENDENTE', 'VENCIDO', 'SUSPENSO')), 0),
    'received_value', COALESCE(SUM(COALESCE(valor_pago, valor)) FILTER (WHERE payment_in_period AND status = 'PAGO'), 0),
    'canceled_value', COALESCE(SUM(valor) FILTER (WHERE due_in_period AND status = 'CANCELADO'), 0),
    'overdue_value', COALESCE(SUM(valor) FILTER (WHERE due_in_period AND status = 'VENCIDO'), 0),
    'all_value', COALESCE(SUM(valor) FILTER (WHERE due_in_period), 0)
  )
  FROM filtered;
$function$;
