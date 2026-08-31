BEGIN;

-- O desconto ofertado pelo boleto e o desconto efetivamente aplicado na baixa
-- possuem semânticas diferentes. Esta leitura expõe apenas escalares derivados
-- do snapshot Banese confirmado; o payload financeiro bruto não sai da RPC.
CREATE OR REPLACE FUNCTION public.get_receivables_modality_page_v3_secure(
  p_modality text,
  p_polo_id uuid DEFAULT NULL,
  p_turma_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_due_start date DEFAULT NULL,
  p_due_end date DEFAULT NULL,
  p_status_scope text DEFAULT 'pending',
  p_group_mode text DEFAULT 'none',
  p_group_key text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 25
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH authorized AS (
    SELECT public.assert_receivables_filter_scope(p_polo_id) AS allowed
  ),
  normalized AS (
    SELECT
      GREATEST(COALESCE(p_page, 1), 1) AS page_number,
      LEAST(GREATEST(COALESCE(p_page_size, 25), 1), 500) AS page_size,
      NULLIF(
        public.financeiro_normalize_search_text(BTRIM(COALESCE(p_search, ''))),
        ''
      ) AS search_term,
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
      boleto.nosso_numero AS boleto_nosso_numero,
      boleto.desconto_configurado AS boleto_desconto_configurado,
      boleto.valido_ate AS boleto_desconto_valido_ate,
      CASE
        WHEN boleto.desconto_configurado IS NULL THEN NULL
        WHEN boleto.valido_ate >= pg_catalog.to_char(
          pg_catalog.timezone('America/Maceio', CURRENT_TIMESTAMP)::date,
          'YYYY-MM-DD'
        ) THEN 'VIGENTE'
        ELSE 'EXPIRADO'
      END AS boleto_desconto_situacao,
      COALESCE(cr.asaas_payment_id, cr.gateway_payment_id) AS asaas_payment_id,
      COALESCE(cr.asaas_payment_link_id, cr.gateway_payment_link_id) AS asaas_payment_link_id,
      COALESCE(cr.asaas_invoice_url, cr.gateway_invoice_url) AS asaas_invoice_url,
      COALESCE(cr.asaas_bank_slip_url, cr.gateway_bank_slip_url) AS asaas_bank_slip_url,
      COALESCE(cr.asaas_installment_id, cr.gateway_installment_id) AS asaas_installment_id,
      COALESCE(
        cr.asaas_transaction_receipt_url,
        cr.gateway_transaction_receipt_url
      ) AS asaas_transaction_receipt_url,
      COALESCE(cr.asaas_status, cr.gateway_status) AS asaas_status,
      COALESCE(cr.asaas_last_error, cr.gateway_last_error) AS asaas_last_error,
      COALESCE(cr.asaas_fee_value, cr.gateway_fee_value) AS taxa,
      COALESCE(cr.asaas_net_value, cr.gateway_net_value) AS valor_liquido,
      cr.gateway_provider,
      cr.gateway_payment_method,
      cr.gateway_settlement_channel,
      cr.gateway_settlement_source,
      COALESCE(cr.gateway_boleto_issued_at, cr.created_at) AS data_emissao,
      CASE
        WHEN cr.status = 'PAGO'
          AND boleto.nosso_numero IS NOT NULL
          AND composition.desconto > 0
          THEN ROUND(composition.desconto, 2)
        ELSE NULL
      END AS desconto_aplicado,
      CASE WHEN cr.manual_settlement_interest_cents IS NULL THEN NULL
        ELSE ROUND(cr.manual_settlement_interest_cents::numeric / 100, 2)
      END AS juros_aplicados,
      CASE WHEN cr.manual_settlement_penalty_cents IS NULL THEN NULL
        ELSE ROUND(cr.manual_settlement_penalty_cents::numeric / 100, 2)
      END AS multa_aplicada,
      cr.created_at,
      cr.tipo_lancamento,
      cr.parcela_numero,
      cr.origem_cronograma_id,
      CASE (SELECT group_mode FROM normalized)
        WHEN 'student' THEN COALESCE(
          cr.cliente_id::text,
          'student:' || LOWER(COALESCE(pa.nome, 'aluno-nao-informado'))
        )
        WHEN 'class' THEN COALESCE(
          cr.turma_id::text,
          'class:turma-nao-informada'
        )
        WHEN 'polo' THEN COALESCE(
          cr.polo_id::text,
          'polo:unidade-nao-informada'
        )
        ELSE cr.id::text
      END AS group_key
    FROM public.contas_receber cr
    JOIN public.turmas t ON t.id = cr.turma_id
    JOIN public.cursos c ON c.id = t.curso_id
    LEFT JOIN public.parceiros pa ON pa.id = cr.cliente_id
    LEFT JOIN public.polos po ON po.id = cr.polo_id
    LEFT JOIN LATERAL (
      SELECT
        BTRIM(cr.gateway_boleto_nosso_numero) AS nosso_numero,
        ROUND(
          CASE
            WHEN pg_catalog.jsonb_typeof(
              cr.gateway_financial_terms -> 'discount' -> 'value'
            ) = 'number' THEN
              CASE LOWER(cr.gateway_financial_terms -> 'discount' ->> 'type')
                WHEN 'percentage' THEN cr.valor * (
                  cr.gateway_financial_terms -> 'discount' ->> 'value'
                )::numeric / 100
                ELSE (
                  cr.gateway_financial_terms -> 'discount' ->> 'value'
                )::numeric
              END
            ELSE NULL
          END,
          2
        ) AS desconto_configurado,
        cr.gateway_financial_terms -> 'discount' ->> 'validUntil' AS valido_ate
      WHERE LOWER(BTRIM(COALESCE(cr.gateway_provider, ''))) IN ('banese', 'banese_card')
        AND UPPER(BTRIM(COALESCE(cr.gateway_payment_method, ''))) = 'BOLETO'
        AND BTRIM(COALESCE(cr.gateway_boleto_nosso_numero, '')) ~ '^[0-9]{9}$'
        AND cr.gateway_financial_terms_confirmed_at IS NOT NULL
        AND BTRIM(COALESCE(cr.gateway_last_error, ''))
          NOT LIKE 'BANESE_IDENTITY_QUARANTINED:%'
        AND pg_catalog.jsonb_typeof(cr.gateway_financial_terms) = 'object'
        AND CASE
          WHEN pg_catalog.jsonb_typeof(
            cr.gateway_financial_terms -> 'nominalAmount'
          ) = 'number' THEN
            ROUND((cr.gateway_financial_terms ->> 'nominalAmount')::numeric, 2)
              = ROUND(cr.valor, 2)
          ELSE FALSE
        END
        AND cr.gateway_financial_terms ->> 'dueDate'
          = pg_catalog.to_char(cr.data_vencimento, 'YYYY-MM-DD')
        AND pg_catalog.jsonb_typeof(cr.gateway_financial_terms -> 'discount') = 'object'
        AND pg_catalog.jsonb_typeof(
          cr.gateway_financial_terms -> 'discount' -> 'value'
        ) = 'number'
        AND LOWER(cr.gateway_financial_terms -> 'discount' ->> 'type')
          IN ('fixed', 'percentage')
        AND CASE
          WHEN pg_catalog.jsonb_typeof(
            cr.gateway_financial_terms -> 'discount' -> 'value'
          ) = 'number' THEN
            (cr.gateway_financial_terms -> 'discount' ->> 'value')::numeric > 0
          ELSE FALSE
        END
        AND CASE
          WHEN pg_catalog.jsonb_typeof(
            cr.gateway_financial_terms -> 'discount' -> 'validUntil'
          ) = 'string'
          AND cr.gateway_financial_terms -> 'discount' ->> 'validUntil'
            ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          THEN SUBSTRING(
            cr.gateway_financial_terms -> 'discount' ->> 'validUntil'
            FROM 1 FOR 4
          )::integer BETWEEN 1 AND 9999
          AND SUBSTRING(
            cr.gateway_financial_terms -> 'discount' ->> 'validUntil'
            FROM 6 FOR 2
          )::integer BETWEEN 1 AND 12
          AND SUBSTRING(
            cr.gateway_financial_terms -> 'discount' ->> 'validUntil'
            FROM 9 FOR 2
          )::integer BETWEEN 1 AND CASE SUBSTRING(
            cr.gateway_financial_terms -> 'discount' ->> 'validUntil'
            FROM 6 FOR 2
          )::integer
            WHEN 2 THEN CASE
              WHEN MOD(SUBSTRING(
                cr.gateway_financial_terms -> 'discount' ->> 'validUntil'
                FROM 1 FOR 4
              )::integer, 400) = 0
              OR (
                MOD(SUBSTRING(
                  cr.gateway_financial_terms -> 'discount' ->> 'validUntil'
                  FROM 1 FOR 4
                )::integer, 4) = 0
                AND MOD(SUBSTRING(
                  cr.gateway_financial_terms -> 'discount' ->> 'validUntil'
                  FROM 1 FOR 4
                )::integer, 100) <> 0
              ) THEN 29
              ELSE 28
            END
            WHEN 4 THEN 30
            WHEN 6 THEN 30
            WHEN 9 THEN 30
            WHEN 11 THEN 30
            ELSE 31
          END
          ELSE FALSE
        END
        AND CASE
          WHEN pg_catalog.jsonb_typeof(
            cr.gateway_financial_terms -> 'discount' -> 'value'
          ) = 'number' THEN
            ROUND(
              CASE LOWER(cr.gateway_financial_terms -> 'discount' ->> 'type')
                WHEN 'percentage' THEN cr.valor * (
                  cr.gateway_financial_terms -> 'discount' ->> 'value'
                )::numeric / 100
                ELSE (
                  cr.gateway_financial_terms -> 'discount' ->> 'value'
                )::numeric
              END,
              2
            ) BETWEEN 0.01 AND ROUND(cr.valor - 0.01, 2)
          ELSE FALSE
        END
    ) boleto ON TRUE
    LEFT JOIN LATERAL public.resolve_receivable_financial_composition(
      cr.valor,
      cr.valor_pago,
      cr.data_vencimento,
      cr.data_pagamento,
      cr.gateway_financial_terms,
      cr.manual_settlement_id,
      cr.manual_settlement_reversed_at,
      cr.manual_settlement_principal_cents,
      cr.manual_settlement_interest_cents,
      cr.manual_settlement_penalty_cents,
      cr.manual_settlement_addition_cents,
      cr.manual_settlement_discount_cents,
      cr.manual_settlement_received_cents
    ) composition ON cr.status = 'PAGO'
    CROSS JOIN authorized a
    CROSS JOIN normalized n
    WHERE a.allowed
      AND cr.categoria = 'MENSALIDADE'
      AND c.modalidade = p_modality
      AND (p_polo_id IS NULL OR cr.polo_id = p_polo_id)
      AND (p_turma_id IS NULL OR cr.turma_id = p_turma_id)
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
  SELECT pg_catalog.jsonb_build_object(
    'rows', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p) ORDER BY p.data_vencimento, p.id)
      FROM paged p
    ), '[]'::jsonb),
    'total_items', (SELECT COUNT(*) FROM scoped),
    'page', (SELECT page_number FROM normalized),
    'page_size', (SELECT page_size FROM normalized)
  );
$function$;

ALTER FUNCTION public.get_receivables_modality_page_v3_secure(
  text, uuid, uuid, text, date, date, text, text, text, integer, integer
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.get_receivables_modality_page_v3_secure(
  text, uuid, uuid, text, date, date, text, text, text, integer, integer
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_receivables_modality_page_v3_secure(
  text, uuid, uuid, text, date, date, text, text, text, integer, integer
) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_receivables_modality_page_v3_secure(
  text, uuid, uuid, text, date, date, text, text, text, integer, integer
) IS
  'Lista recebíveis autorizados e separa desconto confirmado do boleto Banese da composição efetivamente liquidada.';

NOTIFY pgrst, 'reload schema';

COMMIT;
