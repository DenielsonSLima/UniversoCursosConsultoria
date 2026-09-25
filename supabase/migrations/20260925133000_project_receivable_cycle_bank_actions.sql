-- Project cycle ownership and bank readiness through authorized financial RPCs.
-- No receivable, amount, due date or bank identity is modified.
begin;
set local lock_timeout = '5s';

create function internal_academic.receivable_cycle_presentation(p_receivable public.contas_receber)
returns jsonb language plpgsql stable security invoker set search_path='' as $function$
declare
  v_managed boolean;
  v_destination text;
  v_state text;
begin
  v_destination := case when p_receivable.regra_financeira_tecnica_snapshot->>'destinoCobranca'
    in ('LOCAL','BANESE') then p_receivable.regra_financeira_tecnica_snapshot->>'destinoCobranca' end;
  select exists(select 1 from internal_academic.technical_manual_cycle_runs run
    where run.state='LOCAL_CREATED' and p_receivable.id=any(run.receivable_ids)) into v_managed;
  if v_managed then
    if v_destination='LOCAL' then
      v_state := case when internal_academic.manual_cycle_local_receivable_complete(p_receivable)
        then 'NAO_APLICAVEL' else 'REVISAO' end;
    elsif internal_academic.technical_manual_banese_receivable_complete(p_receivable)
      or internal_academic.technical_manual_banese_receivable_paid_issued(p_receivable) then
      v_state := 'EMITIDO';
    elsif p_receivable.gateway_submission_status='API_REVIEW' then
      v_state := 'REVISAO_MANUAL';
    elsif p_receivable.gateway_submission_status is not null
      or p_receivable.gateway_creation_token is not null
      or coalesce(p_receivable.gateway_payment_id,p_receivable.gateway_boleto_nosso_numero) is not null
      or p_receivable.gateway_boleto_issued_at is not null
      or p_receivable.gateway_boleto_linha_digitavel is not null
      or p_receivable.gateway_boleto_codigo_barras is not null
      or p_receivable.gateway_pix_payload is not null
      or p_receivable.gateway_pix_encoded_image is not null
      or exists(select 1 from public.payment_gateway_transactions transaction
        where transaction.receivable_id=p_receivable.id) then
      v_state := 'REVISAO';
    else
      v_state := 'PENDENTE';
    end if;
    v_destination := coalesce(v_destination,'BANESE');
  end if;
  return jsonb_build_object('destino_cobranca',v_destination,
    'emissao_gerenciada_turma',v_managed,'emissao_ciclo_status',v_state);
end;
$function$;
revoke all on function internal_academic.receivable_cycle_presentation(public.contas_receber)
  from public,anon,authenticated,service_role;

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

CREATE OR REPLACE FUNCTION public.get_receivables_modality_groups_page_v3_secure(p_modality text, p_polo_id uuid DEFAULT NULL::uuid, p_turma_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_due_start date DEFAULT NULL::date, p_due_end date DEFAULT NULL::date, p_status_scope text DEFAULT 'pending'::text, p_group_mode text DEFAULT 'student'::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH authorized AS (
    SELECT public.assert_receivables_filter_scope(p_polo_id) AS allowed
  ),
  normalized AS (
    SELECT
      GREATEST(COALESCE(p_page, 1), 1) AS page_number,
      LEAST(GREATEST(COALESCE(p_page_size, 10), 1), 100) AS page_size,
      NULLIF(public.financeiro_normalize_search_text(BTRIM(COALESCE(p_search, ''))), '') AS search_term,
      CASE WHEN p_group_mode IN ('student', 'class', 'polo') THEN p_group_mode ELSE 'student' END AS group_mode
  ),
  filtered AS (
    SELECT
      cr.id,
      cr.polo_id,
      po.nome AS polo_nome,
      po.cnpj AS polo_cnpj,
      po.cidade AS polo_cidade,
      po.estado AS polo_uf,
      cr.descricao,
      cr.valor,
      cr.data_vencimento,
      cr.data_pagamento,
      cr.valor_pago,
      cr.status,
      cr.categoria,
      cr.cliente_id,
      pa.nome AS cliente_nome,
      pa.cpf_cnpj AS cliente_cpf_cnpj,
      pa.telefone AS cliente_telefone,
      cr.matricula_id,
      cr.turma_id,
      t.nome AS turma_nome,
      c.nome AS curso_nome,
      c.modalidade AS curso_modalidade,
      cr.forma_pagamento,
      cr.origem_pagamento,
      cr.conta_bancaria_id,
      cr.nosso_numero_asaas,
      COALESCE(cr.asaas_payment_id, cr.gateway_payment_id) AS asaas_payment_id,
      COALESCE(cr.asaas_payment_link_id, cr.gateway_payment_link_id) AS asaas_payment_link_id,
      COALESCE(cr.asaas_invoice_url, cr.gateway_invoice_url) AS asaas_invoice_url,
      COALESCE(cr.asaas_bank_slip_url, cr.gateway_bank_slip_url) AS asaas_bank_slip_url,
      COALESCE(cr.asaas_installment_id, cr.gateway_installment_id) AS asaas_installment_id,
      COALESCE(cr.asaas_transaction_receipt_url, cr.gateway_transaction_receipt_url) AS asaas_transaction_receipt_url,
      COALESCE(cr.asaas_status, cr.gateway_status) AS asaas_status,
      COALESCE(cr.asaas_last_error, cr.gateway_last_error) AS asaas_last_error,
      COALESCE(cr.asaas_fee_value, cr.gateway_fee_value) AS taxa,
      COALESCE(cr.asaas_net_value, cr.gateway_net_value) AS valor_liquido,
      cr.gateway_provider,
      cr.gateway_payment_method,
      cr.gateway_settlement_channel,
      cr.gateway_settlement_source,
      COALESCE(cr.gateway_boleto_issued_at, cr.created_at) AS data_emissao,
      CASE WHEN cr.manual_settlement_discount_cents IS NULL THEN NULL
        ELSE ROUND(cr.manual_settlement_discount_cents::numeric / 100, 2) END AS desconto_aplicado,
      CASE WHEN cr.manual_settlement_interest_cents IS NULL THEN NULL
        ELSE ROUND(cr.manual_settlement_interest_cents::numeric / 100, 2) END AS juros_aplicados,
      CASE WHEN cr.manual_settlement_penalty_cents IS NULL THEN NULL
        ELSE ROUND(cr.manual_settlement_penalty_cents::numeric / 100, 2) END AS multa_aplicada,
      cr.created_at,
      cr.tipo_lancamento,
      cr.parcela_numero,
      cr.origem_cronograma_id,
      CASE (SELECT group_mode FROM normalized)
        WHEN 'student' THEN COALESCE(cr.cliente_id::text, 'student:' || LOWER(COALESCE(pa.nome, 'aluno-nao-informado')))
        WHEN 'class' THEN COALESCE(cr.turma_id::text, 'class:turma-nao-informada')
        ELSE COALESCE(cr.polo_id::text, 'polo:unidade-nao-informada')
      END AS group_key,
      CASE (SELECT group_mode FROM normalized)
        WHEN 'student' THEN COALESCE(pa.nome, 'Aluno não informado')
        WHEN 'class' THEN COALESCE(t.nome, 'Turma não informada')
        ELSE COALESCE(po.nome, 'Unidade não informada')
      END AS group_label
    FROM public.contas_receber cr
    JOIN public.turmas t ON t.id = cr.turma_id
    JOIN public.cursos c ON c.id = t.curso_id
    LEFT JOIN public.parceiros pa ON pa.id = cr.cliente_id
    LEFT JOIN public.polos po ON po.id = cr.polo_id
    CROSS JOIN authorized a
    CROSS JOIN normalized n
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
      AND (p_due_start IS NULL OR
        CASE WHEN p_status_scope = 'received' THEN cr.data_pagamento
          ELSE cr.data_vencimento END >= p_due_start)
      AND (p_due_end IS NULL OR
        CASE WHEN p_status_scope = 'received' THEN cr.data_pagamento
          ELSE cr.data_vencimento END <= p_due_end)
      AND (
        p_status_scope = 'all'
        OR (p_status_scope = 'pending' AND cr.status IN ('PENDENTE', 'VENCIDO', 'SUSPENSO'))
        OR (p_status_scope = 'received' AND cr.status = 'PAGO')
        OR (p_status_scope = 'canceled' AND cr.status = 'CANCELADO')
        OR (p_status_scope = 'overdue' AND cr.status = 'VENCIDO')
      )
      AND (
        n.search_term IS NULL
        OR public.financeiro_normalize_search_text(cr.descricao) LIKE '%' || n.search_term || '%'
        OR public.financeiro_normalize_search_text(pa.nome) LIKE '%' || n.search_term || '%'
        OR public.financeiro_normalize_search_text(pa.cpf_cnpj) LIKE '%' || n.search_term || '%'
        OR public.financeiro_normalize_search_text(t.nome) LIKE '%' || n.search_term || '%'
        OR public.financeiro_normalize_search_text(po.nome) LIKE '%' || n.search_term || '%'
        OR public.financeiro_normalize_search_text(po.cnpj) LIKE '%' || n.search_term || '%'
        OR public.financeiro_normalize_search_text(po.cidade) LIKE '%' || n.search_term || '%'
        OR public.financeiro_normalize_search_text(po.estado) LIKE '%' || n.search_term || '%'
      )
  ),
  grouped AS (
    SELECT
      group_key,
      MIN(group_label) AS group_label,
      COUNT(*)::bigint AS item_count,
      COUNT(*) FILTER (WHERE status IN ('PENDENTE', 'VENCIDO', 'SUSPENSO'))::bigint AS pending_count,
      COUNT(*) FILTER (WHERE status = 'PAGO')::bigint AS received_count,
      COUNT(*) FILTER (WHERE status = 'CANCELADO')::bigint AS canceled_count,
      COUNT(*) FILTER (WHERE status = 'VENCIDO')::bigint AS overdue_count,
      MIN(data_vencimento) FILTER (WHERE status IN ('PENDENTE', 'VENCIDO', 'SUSPENSO')) AS next_due
    FROM filtered
    GROUP BY group_key
  ),
  paged_groups AS (
    SELECT g.*
    FROM grouped g
    CROSS JOIN normalized n
    ORDER BY LOWER(g.group_label), g.group_key
    LIMIT (SELECT page_size FROM normalized)
    OFFSET ((SELECT page_number FROM normalized) - 1) * (SELECT page_size FROM normalized)
  ),
  hydrated_groups AS (
    SELECT pg.*, first_record.first_row
    FROM paged_groups pg
    LEFT JOIN LATERAL (
      SELECT (to_jsonb(f) - 'group_key' - 'group_label')
        || internal_academic.receivable_cycle_presentation(target) AS first_row
      FROM filtered f
      JOIN public.contas_receber target ON target.id=f.id
      WHERE f.group_key = pg.group_key
      ORDER BY f.data_vencimento, f.id
      LIMIT 1
    ) first_record ON TRUE
  )
  SELECT jsonb_build_object(
    'groups', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'key', h.group_key,
        'label', h.group_label,
        'item_count', h.item_count,
        'pending_count', h.pending_count,
        'received_count', h.received_count,
        'canceled_count', h.canceled_count,
        'overdue_count', h.overdue_count,
        'next_due', h.next_due,
        'first_row', h.first_row
      ) ORDER BY LOWER(h.group_label), h.group_key)
      FROM hydrated_groups h
    ), '[]'::jsonb),
    'total_items', (SELECT COUNT(*) FROM grouped),
    'total_receivables', (SELECT COUNT(*) FROM filtered),
    'page', (SELECT page_number FROM normalized),
    'page_size', (SELECT page_size FROM normalized)
  );
$function$
;

commit;
