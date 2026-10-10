BEGIN;

-- Read-only projection: keep the statement authorization, balances and settlement
-- source unchanged, while exposing the same bank evidence as Contas a Receber.
CREATE OR REPLACE FUNCTION public.get_aluno_extrato_financeiro(p_matricula_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
WITH matricula_base AS (
  SELECT
    m.id,
    m.status,
    m.data_matricula,
    p.nome AS aluno_nome,
    p.cpf_cnpj AS aluno_cpf,
    t.nome AS turma_nome,
    t.codigo AS turma_codigo,
    t.polo_id,
    c.nome AS curso_nome,
    po.nome AS polo_nome
  FROM public.matriculas m
  LEFT JOIN public.parceiros p ON p.id = m.aluno_id
  LEFT JOIN public.turmas t ON t.id = m.turma_id
  LEFT JOIN public.cursos c ON c.id = t.curso_id
  LEFT JOIN public.polos po ON po.id = t.polo_id
  WHERE m.id = p_matricula_id
    AND (
      COALESCE(auth.role(), '') = 'service_role'
      OR m.aluno_id = public.current_aluno_id()
      OR public.is_financeiro_for_polo(t.polo_id)
    )
), recebiveis AS (
  SELECT
    cr.id,
    cr.descricao,
    cr.valor,
    cr.valor_pago,
    cr.data_vencimento,
    cr.data_pagamento,
    cr.status,
    cr.forma_pagamento,
    cr.origem_pagamento,
    cr.tipo_lancamento,
    cr.parcela_numero,
    cr.asaas_status,
    cr.asaas_invoice_url,
    cr.asaas_payment_id,
    cr.gateway_provider,
    cr.gateway_payment_method,
    cr.gateway_payment_id,
    cr.gateway_status,
    cr.gateway_invoice_url,
    cr.gateway_bank_slip_url,
    cr.gateway_settlement_channel,
    cr.gateway_settlement_source,
    CASE WHEN BTRIM(COALESCE(cr.gateway_last_error, ''))
      LIKE 'BANESE_IDENTITY_QUARANTINED:%'
      THEN 'BANESE_IDENTITY_QUARANTINED:' ELSE NULL
    END AS gateway_last_error,
    cr.gateway_submission_status,
    cr.gateway_boleto_issued_at,
    COALESCE(cr.gateway_boleto_issued_at, cr.created_at) AS data_emissao,
    CASE WHEN LOWER(BTRIM(COALESCE(cr.gateway_provider, '')))
      IN ('banese', 'banese_card')
      AND UPPER(BTRIM(COALESCE(cr.gateway_payment_method, ''))) = 'BOLETO'
      AND BTRIM(COALESCE(cr.gateway_boleto_nosso_numero, '')) ~ '^[0-9]{9}$'
      AND BTRIM(COALESCE(cr.gateway_last_error, ''))
        NOT LIKE 'BANESE_IDENTITY_QUARANTINED:%'
      THEN BTRIM(cr.gateway_boleto_nosso_numero) ELSE NULL
    END AS boleto_nosso_numero,
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
    internal_academic.receivable_cycle_presentation(cr) AS cobranca_presentation,
    cr.created_at,
    composition.juros AS juros_aplicados,
    composition.multa AS multa_aplicada,
    composition.desconto AS desconto_aplicado,
    composition.acrescimo AS acrescimo_aplicado,
    composition.diferenca_nao_discriminada AS diferenca_nao_discriminada,
    composition.composicao_status AS composicao_status,
    CASE composition.composicao_status
        WHEN 'CALCULADO_REGRA_INFORMADA_PROESC' THEN 'REGRA_INFORMADA_USUARIO'
        WHEN 'API_E_REGRA_INFORMADA_PROESC' THEN 'API_E_REGRA_INFORMADA_USUARIO'
        WHEN 'PARCIAL_POR_API_PROESC' THEN 'API_PROESC_COMPONENTES_EXPLICITOS'
        WHEN 'CONCILIADO_POR_CONFERENCIA_PROESC' THEN 'CONFERENCIA_PROESC'
        ELSE NULL END AS composicao_proveniencia
  FROM public.contas_receber cr
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
  LEFT JOIN LATERAL public.resolve_integrated_receivable_financial_composition(
    cr.id, cr.valor, cr.valor_pago, cr.data_vencimento,
    cr.data_pagamento, cr.gateway_financial_terms,
    cr.manual_settlement_id, cr.manual_settlement_reversed_at,
    cr.manual_settlement_principal_cents, cr.manual_settlement_interest_cents,
    cr.manual_settlement_penalty_cents, cr.manual_settlement_addition_cents,
    cr.manual_settlement_discount_cents, cr.manual_settlement_received_cents
  ) composition ON cr.status = 'PAGO'
  WHERE cr.matricula_id = p_matricula_id
    AND EXISTS (SELECT 1 FROM matricula_base)
  ORDER BY cr.data_vencimento ASC, cr.created_at ASC
), totais AS (
  SELECT
    COALESCE(SUM(valor), 0)::numeric AS total,
    COALESCE(SUM(CASE WHEN status = 'PAGO' THEN COALESCE(valor_pago, valor) ELSE 0 END), 0)::numeric AS recebido,
    COALESCE(SUM(CASE WHEN status IN ('PENDENTE', 'VENCIDO') THEN valor ELSE 0 END), 0)::numeric AS pendente,
    COALESCE(SUM(CASE WHEN status = 'VENCIDO' THEN valor ELSE 0 END), 0)::numeric AS vencido,
    COUNT(*) FILTER (WHERE status = 'PAGO')::integer AS pagos,
    COUNT(*) FILTER (WHERE status IN ('PENDENTE', 'VENCIDO'))::integer AS pendentes
  FROM recebiveis
)
SELECT jsonb_build_object(
  'matriculaId', mb.id,
  'dataMatricula', mb.data_matricula,
  'poloId', mb.polo_id,
  'alunoNome', COALESCE(mb.aluno_nome, 'Aluno'),
  'alunoCpf', COALESCE(mb.aluno_cpf, ''),
  'turmaNome', COALESCE(mb.turma_nome, mb.turma_codigo, ''),
  'cursoNome', COALESCE(mb.curso_nome, ''),
  'poloNome', COALESCE(mb.polo_nome, ''),
  'statusMatricula', mb.status,
  'total', t.total,
  'recebido', t.recebido,
  'pendente', t.pendente,
  'vencido', t.vencido,
  'pagos', t.pagos,
  'pendentes', t.pendentes,
  'recebiveis', COALESCE((SELECT jsonb_agg(
    (to_jsonb(r) - 'cobranca_presentation') || r.cobranca_presentation
    ORDER BY r.data_vencimento, r.created_at, r.id
  ) FROM recebiveis r), '[]'::jsonb)
)
FROM matricula_base mb
CROSS JOIN totais t;
$function$;

COMMIT;
