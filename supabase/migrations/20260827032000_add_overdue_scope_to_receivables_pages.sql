BEGIN;

CREATE OR REPLACE FUNCTION public.get_receivables_modality_page(
  p_modality text,
  p_polo_id uuid DEFAULT NULL::uuid,
  p_search text DEFAULT NULL::text,
  p_due_start date DEFAULT NULL::date,
  p_due_end date DEFAULT NULL::date,
  p_status_scope text DEFAULT 'pending'::text,
  p_group_mode text DEFAULT 'none'::text,
  p_group_key text DEFAULT NULL::text,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 25
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH normalized AS (
    SELECT
      GREATEST(COALESCE(p_page, 1), 1) AS page_number,
      LEAST(GREATEST(COALESCE(p_page_size, 25), 1), 500) AS page_size,
      NULLIF(public.financeiro_normalize_search_text(BTRIM(COALESCE(p_search, ''))), '') AS search_term,
      CASE
        WHEN p_group_mode IN ('student', 'class', 'polo') THEN p_group_mode
        ELSE 'none'
      END AS group_mode
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
      cr.created_at,
      cr.tipo_lancamento,
      cr.parcela_numero,
      cr.origem_cronograma_id,
      CASE (SELECT group_mode FROM normalized)
        WHEN 'student' THEN COALESCE(cr.cliente_id::text, 'student:' || LOWER(COALESCE(pa.nome, 'aluno-nao-informado')))
        WHEN 'class' THEN COALESCE(cr.turma_id::text, 'class:turma-nao-informada')
        WHEN 'polo' THEN COALESCE(cr.polo_id::text, 'polo:unidade-nao-informada')
        ELSE cr.id::text
      END AS group_key
    FROM public.contas_receber cr
    JOIN public.turmas t ON t.id = cr.turma_id
    JOIN public.cursos c ON c.id = t.curso_id
    LEFT JOIN public.parceiros pa ON pa.id = cr.cliente_id
    LEFT JOIN public.polos po ON po.id = cr.polo_id
    CROSS JOIN normalized n
    WHERE cr.categoria = 'MENSALIDADE'
      AND c.modalidade = p_modality
      AND (p_polo_id IS NULL OR cr.polo_id = p_polo_id)
      AND (p_due_start IS NULL OR cr.data_vencimento >= p_due_start)
      AND (p_due_end IS NULL OR cr.data_vencimento <= p_due_end)
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
  scoped AS (
    SELECT *
    FROM filtered
    WHERE p_group_key IS NULL OR group_key = p_group_key
  ),
  paged AS (
    SELECT s.*
    FROM scoped s
    CROSS JOIN normalized n
    ORDER BY s.data_vencimento ASC, s.id ASC
    LIMIT (SELECT page_size FROM normalized)
    OFFSET ((SELECT page_number FROM normalized) - 1) * (SELECT page_size FROM normalized)
  )
  SELECT jsonb_build_object(
    'rows', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.data_vencimento, p.id) FROM paged p), '[]'::jsonb),
    'total_items', (SELECT COUNT(*) FROM scoped),
    'page', (SELECT page_number FROM normalized),
    'page_size', (SELECT page_size FROM normalized)
  );
$function$;

CREATE OR REPLACE FUNCTION public.get_receivables_modality_groups_page(
  p_modality text,
  p_polo_id uuid DEFAULT NULL::uuid,
  p_search text DEFAULT NULL::text,
  p_due_start date DEFAULT NULL::date,
  p_due_end date DEFAULT NULL::date,
  p_status_scope text DEFAULT 'pending'::text,
  p_group_mode text DEFAULT 'student'::text,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 10
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH normalized AS (
    SELECT
      GREATEST(COALESCE(p_page, 1), 1) AS page_number,
      LEAST(GREATEST(COALESCE(p_page_size, 10), 1), 100) AS page_size,
      NULLIF(public.financeiro_normalize_search_text(BTRIM(COALESCE(p_search, ''))), '') AS search_term,
      CASE
        WHEN p_group_mode IN ('student', 'class', 'polo') THEN p_group_mode
        ELSE 'student'
      END AS group_mode
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
    CROSS JOIN normalized n
    WHERE cr.categoria = 'MENSALIDADE'
      AND c.modalidade = p_modality
      AND (p_polo_id IS NULL OR cr.polo_id = p_polo_id)
      AND (p_due_start IS NULL OR cr.data_vencimento >= p_due_start)
      AND (p_due_end IS NULL OR cr.data_vencimento <= p_due_end)
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
      MIN(data_vencimento) FILTER (
        WHERE status IN ('PENDENTE', 'VENCIDO', 'SUSPENSO')
      ) AS next_due
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
    SELECT
      pg.*,
      first_record.first_row
    FROM paged_groups pg
    LEFT JOIN LATERAL (
      SELECT to_jsonb(f) - 'group_key' - 'group_label' AS first_row
      FROM filtered f
      WHERE f.group_key = pg.group_key
      ORDER BY f.data_vencimento, f.id
      LIMIT 1
    ) first_record ON TRUE
  )
  SELECT jsonb_build_object(
    'groups', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'key', h.group_key,
          'label', h.group_label,
          'item_count', h.item_count,
          'pending_count', h.pending_count,
          'received_count', h.received_count,
          'canceled_count', h.canceled_count,
          'overdue_count', h.overdue_count,
          'next_due', h.next_due,
          'first_row', h.first_row
        )
        ORDER BY LOWER(h.group_label), h.group_key
      )
      FROM hydrated_groups h
    ), '[]'::jsonb),
    'total_items', (SELECT COUNT(*) FROM grouped),
    'total_receivables', (SELECT COUNT(*) FROM filtered),
    'page', (SELECT page_number FROM normalized),
    'page_size', (SELECT page_size FROM normalized)
  );
$function$;

COMMIT;
