-- Feed paginado e somente leitura para reaproveitar Conciliação & Baixas como
-- central de recebimentos. A RPC compõe dados canônicos sem expor CPF/CNPJ ou
-- conta bancária em claro e preserva a proveniência das baixas históricas.
BEGIN;
CREATE OR REPLACE FUNCTION public.list_financial_receipts_secure(
  p_company_id uuid DEFAULT NULL,
  p_polo_id uuid DEFAULT NULL,
  p_payment_start date DEFAULT NULL,
  p_payment_end date DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_origin text DEFAULT 'TODOS',
  p_environment text DEFAULT 'production',
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_allowed_polo_ids uuid[] := ARRAY[]::uuid[];
  v_page integer := greatest(1, coalesce(p_page, 1));
  v_page_size integer := greatest(1, least(coalesce(p_page_size, 20), 100));
  v_offset bigint := (v_page::bigint - 1) * v_page_size;
  v_origin text := upper(coalesce(nullif(btrim(p_origin), ''), 'TODOS'));
  v_environment text := lower(coalesce(nullif(btrim(p_environment), ''), 'production'));
  v_search text;
  v_search_digits text;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.gestor_has_module('financeiro')
     OR NOT public.gestor_has_financeiro_tab('receber')
  THEN
    RAISE EXCEPTION 'Acesso negado aos recebimentos financeiros.'
      USING ERRCODE = '42501';
  END IF;
  v_allowed_polo_ids := coalesce(
    public.gestor_allowed_polo_ids(),
    ARRAY[]::uuid[]
  );
  IF cardinality(v_allowed_polo_ids) = 0 THEN
    RAISE EXCEPTION 'Nenhum polo financeiro autorizado.'
      USING ERRCODE = '42501';
  END IF;
  IF p_polo_id IS NOT NULL
     AND NOT (p_polo_id = ANY (v_allowed_polo_ids))
  THEN
    RAISE EXCEPTION 'Polo fora do escopo financeiro autorizado.'
      USING ERRCODE = '42501';
  END IF;
  IF p_company_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.polos authorized_polo
       WHERE authorized_polo.id = ANY (v_allowed_polo_ids)
         AND authorized_polo.company_id = p_company_id
     )
  THEN
    RAISE EXCEPTION 'Empresa fora do escopo financeiro autorizado.'
      USING ERRCODE = '42501';
  END IF;
  IF p_company_id IS NOT NULL
     AND p_polo_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.polos requested_polo
       WHERE requested_polo.id = p_polo_id
         AND requested_polo.company_id = p_company_id
     )
  THEN
    RAISE EXCEPTION 'Empresa e polo não pertencem ao mesmo escopo.'
      USING ERRCODE = '22023';
  END IF;
  IF p_payment_start IS NOT NULL
     AND p_payment_end IS NOT NULL
     AND p_payment_start > p_payment_end
  THEN
    RAISE EXCEPTION 'Período de recebimentos inválido.'
      USING ERRCODE = '22023';
  END IF;
  IF v_origin NOT IN (
    'TODOS',
    'AUTOMATICA_BANESE',
    'MANUAL',
    'HISTORICO_MIGRADO',
    'CNAB240',
    'MERCADO_PAGO',
    'OUTRO'
  ) THEN
    RAISE EXCEPTION 'Origem de recebimento inválida.'
      USING ERRCODE = '22023';
  END IF;
  IF v_environment NOT IN ('production', 'sandbox') THEN
    RAISE EXCEPTION 'Ambiente bancário inválido.' USING ERRCODE = '22023';
  END IF;
  v_search := nullif(
    public.financeiro_normalize_search_text(
      left(btrim(coalesce(p_search, '')), 120)
    ),
    ''
  );
  v_search_digits := nullif(
    regexp_replace(left(coalesce(p_search, ''), 120), '[^0-9]', '', 'g'),
    ''
  );
  WITH receipt_source AS MATERIALIZED (
    SELECT
      receivable.id,
      movement_polo.company_id AS empresa_id,
      coalesce(
        nullif(btrim(company.nome_fantasia), ''),
        nullif(btrim(company.razao_social), ''),
        'Empresa não informada'
      ) AS empresa_nome,
      receivable.polo_id,
      coalesce(nullif(btrim(movement_polo.nome), ''), 'Polo não informado') AS polo_nome,
      coalesce(nullif(btrim(payer.nome), ''), 'Pagador não identificado') AS cliente_nome,
      CASE
        WHEN length(regexp_replace(coalesce(payer.cpf_cnpj, ''), '[^0-9]', '', 'g')) = 11
          THEN '***.***.***-' || right(
            regexp_replace(payer.cpf_cnpj, '[^0-9]', '', 'g'), 2
          )
        WHEN length(regexp_replace(coalesce(payer.cpf_cnpj, ''), '[^0-9]', '', 'g')) = 14
          THEN '**.***.***/****-' || right(
            regexp_replace(payer.cpf_cnpj, '[^0-9]', '', 'g'), 2
          )
        WHEN nullif(regexp_replace(coalesce(payer.cpf_cnpj, ''), '[^0-9]', '', 'g'), '') IS NOT NULL
          THEN '***' || right(regexp_replace(payer.cpf_cnpj, '[^0-9]', '', 'g'), 2)
        ELSE NULL
      END AS cliente_cpf_cnpj,
      payer.nome AS payer_search_name,
      payer.cpf_cnpj AS payer_search_document,
      student.nome AS student_search_name,
      student.cpf_cnpj AS student_search_document,
      receivable.data_pagamento,
      receivable.data_vencimento,
      coalesce(nullif(btrim(receivable.descricao), ''), 'Recebimento') AS descricao,
      course.nome AS curso_nome,
      nullif(btrim(concat_ws(' · ', class.codigo, class.nome)), '') AS turma_nome,
      coalesce(
        nullif(btrim(student.matricula_acesso), ''),
        nullif(btrim(payer.matricula_acesso), '')
      ) AS matricula_codigo,
      CASE
        WHEN receivable.parcela_numero IS NOT NULL THEN concat(
          'Parcela ',
          receivable.parcela_numero,
          CASE
            WHEN coalesce(receivable.gateway_installments, 0) > 1
              THEN '/' || receivable.gateway_installments
            WHEN coalesce(class.qtd_parcelas, 0) > 0
              THEN '/' || class.qtd_parcelas
            ELSE ''
          END
        )
        ELSE coalesce(
          nullif(initcap(replace(receivable.tipo_lancamento, '_', ' ')), ''),
          'Recebimento'
        )
      END AS parcela_label,
      receivable.gateway_boleto_nosso_numero AS nosso_numero,
      receivable.valor AS valor_nominal,
      receivable.valor_pago AS valor_pago_original,
      receivable.gateway_financial_terms,
      receivable.manual_settlement_id,
      receivable.manual_settlement_reversed_at,
      receivable.manual_settlement_principal_cents,
      receivable.manual_settlement_interest_cents,
      receivable.manual_settlement_penalty_cents,
      receivable.manual_settlement_addition_cents,
      receivable.manual_settlement_discount_cents,
      receivable.manual_settlement_received_cents,
      coalesce(
        nullif(btrim(manual_settlement.payment_method), ''),
        CASE
          WHEN upper(btrim(coalesce(receivable.gateway_settlement_channel, ''))) IN (
            '', 'NAO_IDENTIFICADO', 'NÃO IDENTIFICADO', 'UNKNOWN'
          ) THEN NULL
          ELSE receivable.gateway_settlement_channel
        END,
        nullif(btrim(receivable.gateway_payment_method), ''),
        nullif(btrim(receivable.forma_pagamento), ''),
        'Não informada'
      ) AS forma_pagamento,
      CASE
        WHEN upper(coalesce(receivable.origem_pagamento, '')) = 'SISTEMA_ANTERIOR'
          THEN 'HISTORICO_MIGRADO'
        WHEN (
          receivable.manual_settlement_id IS NOT NULL
          AND receivable.manual_settlement_reversed_at IS NULL
        ) OR upper(coalesce(receivable.origem_pagamento, '')) = 'PRESENCIAL'
          THEN 'MANUAL'
        WHEN upper(coalesce(receivable.gateway_settlement_source, '')) IN ('CNAB', 'CNAB240')
          OR upper(coalesce(receivable.origem_pagamento, '')) IN ('CNAB', 'CNAB240')
          THEN 'CNAB240'
        WHEN upper(coalesce(receivable.gateway_provider, '')) LIKE '%MERCADO%PAGO%'
          OR upper(coalesce(receivable.origem_pagamento, '')) = 'MERCADO_PAGO'
          THEN 'MERCADO_PAGO'
        WHEN (
          receivable.gateway_provider = 'banese_card'
          AND upper(coalesce(receivable.gateway_status, '')) IN (
            'PAID', 'PAGO', 'RECEIVED', 'CONFIRMED', 'LIQUIDATED'
          )
        )
          OR upper(coalesce(receivable.origem_pagamento, '')) = 'BANESE'
          THEN 'AUTOMATICA_BANESE'
        ELSE 'OUTRO'
      END AS origem,
      manual_settlement.completed_at AS manual_completed_at,
      receivable.gateway_settlement_recorded_at,
      manual_actor.nome AS manual_actor_name,
      CASE
        WHEN receiving_account.id IS NULL THEN 'Conta não informada'
        ELSE concat_ws(
          ' · ',
          nullif(btrim(receiving_account.banco), ''),
          'Ag. ***',
          CASE
            WHEN nullif(
              regexp_replace(coalesce(receiving_account.conta, ''), '[^0-9A-Za-z]', '', 'g'),
              ''
            ) IS NULL THEN 'Conta ****'
            ELSE 'Conta ****' || right(
              regexp_replace(receiving_account.conta, '[^0-9A-Za-z]', '', 'g'),
              4
            )
          END
        )
      END AS conta_recebedora_nome,
      coalesce(
        nullif(btrim(receivable.gateway_transaction_receipt_url), ''),
        nullif(btrim(receivable.asaas_transaction_receipt_url), '')
      ) AS gateway_receipt_url
    FROM public.contas_receber receivable
    LEFT JOIN public.matriculas enrollment
      ON enrollment.id = receivable.matricula_id
    LEFT JOIN public.parceiros student
      ON student.id = enrollment.aluno_id
    LEFT JOIN public.parceiros payer
      ON payer.id = coalesce(receivable.cliente_id, student.id)
    LEFT JOIN public.turmas class
      ON class.id = coalesce(receivable.turma_id, enrollment.turma_id)
    LEFT JOIN public.cursos course
      ON course.id = class.curso_id
    JOIN public.polos movement_polo
      ON movement_polo.id = receivable.polo_id
    LEFT JOIN public.empresas company
      ON company.id = movement_polo.company_id
    LEFT JOIN public.receivable_manual_settlements manual_settlement
      ON manual_settlement.id = receivable.manual_settlement_id
      AND receivable.manual_settlement_reversed_at IS NULL
      AND manual_settlement.reversed_at IS NULL
    LEFT JOIN public.usuarios_sistema manual_actor
      ON manual_actor.id = manual_settlement.actor_id
    LEFT JOIN public.contas_bancarias receiving_account
      ON receiving_account.id = coalesce(
        manual_settlement.account_id,
        receivable.conta_bancaria_id
      )
    WHERE receivable.status = 'PAGO'
      AND receivable.polo_id = ANY (v_allowed_polo_ids)
      AND (p_company_id IS NULL OR movement_polo.company_id = p_company_id)
      AND (p_polo_id IS NULL OR receivable.polo_id = p_polo_id)
      AND (p_payment_start IS NULL OR receivable.data_pagamento >= p_payment_start)
      AND (p_payment_end IS NULL OR receivable.data_pagamento <= p_payment_end)
      AND (
        lower(receivable.gateway_environment) = v_environment
        OR (
          receivable.gateway_environment IS NULL
          AND receivable.gateway_provider IS NULL
          AND v_environment = 'production'
        )
        OR upper(coalesce(receivable.origem_pagamento, '')) IN (
          'PRESENCIAL', 'SISTEMA_ANTERIOR'
        ) OR (
          receivable.manual_settlement_id IS NOT NULL
          AND receivable.manual_settlement_reversed_at IS NULL
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.emprestimos_financeiros loan
        WHERE loan.conta_receber_id = receivable.id
      )
  ),
  receipts AS MATERIALIZED (
    SELECT
      source.*,
      CASE source.origem
        WHEN 'MANUAL' THEN source.manual_completed_at
        WHEN 'HISTORICO_MIGRADO' THEN NULL::timestamptz
        ELSE source.gateway_settlement_recorded_at
      END AS baixa_registrada_em,
      CASE
        WHEN source.origem = 'HISTORICO_MIGRADO'
          THEN 'HISTORICO_SEM_HORA'
        WHEN source.origem = 'MANUAL' AND source.manual_completed_at IS NOT NULL
          THEN 'MANUAL_CONCLUSAO'
        -- Este timestamp é o registro local da conciliação, não a hora bancária.
        WHEN source.gateway_settlement_recorded_at IS NOT NULL
          THEN 'SISTEMA_REGISTRO'
        ELSE 'FINANCEIRO_SEM_HORA'
      END AS baixa_tempo_proveniencia,
      CASE source.origem
        WHEN 'MANUAL' THEN coalesce(
          nullif(btrim(source.manual_actor_name), ''),
          'Operador não identificado'
        )
        WHEN 'HISTORICO_MIGRADO' THEN 'Histórico migrado'
        ELSE 'Sistema'
      END AS operador_nome,
      CASE
        WHEN source.origem IN ('AUTOMATICA_BANESE', 'CNAB240', 'MERCADO_PAGO')
          THEN source.gateway_receipt_url
        ELSE NULL
      END AS comprovante_url
    FROM receipt_source source
    WHERE v_search IS NULL
       OR position(v_search IN public.financeiro_normalize_search_text(source.cliente_nome)) > 0
       OR position(v_search IN public.financeiro_normalize_search_text(source.student_search_name)) > 0
       OR position(v_search IN public.financeiro_normalize_search_text(source.descricao)) > 0
       OR position(v_search IN public.financeiro_normalize_search_text(source.curso_nome)) > 0
       OR position(v_search IN public.financeiro_normalize_search_text(source.turma_nome)) > 0
       OR position(v_search IN public.financeiro_normalize_search_text(source.matricula_codigo)) > 0
       OR position(v_search IN public.financeiro_normalize_search_text(source.nosso_numero)) > 0
       OR (
         length(v_search_digits) IN (11, 14)
         AND (
           v_search_digits = regexp_replace(coalesce(source.payer_search_document, ''), '[^0-9]', '', 'g')
           OR v_search_digits = regexp_replace(coalesce(source.student_search_document, ''), '[^0-9]', '', 'g')
         )
       )
  ),
  receipt_counts AS (
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE receipt.origem = 'AUTOMATICA_BANESE') AS automatica_banese,
      count(*) FILTER (WHERE receipt.origem = 'MANUAL') AS manual,
      count(*) FILTER (WHERE receipt.origem = 'HISTORICO_MIGRADO') AS historico_migrado,
      count(*) FILTER (WHERE receipt.origem = 'CNAB240') AS cnab240,
      count(*) FILTER (WHERE receipt.origem = 'MERCADO_PAGO') AS mercado_pago,
      count(*) FILTER (WHERE receipt.origem = 'OUTRO') AS outro
    FROM receipts receipt
  ),
  origin_filtered AS MATERIALIZED (
    SELECT receipt.*
    FROM receipts receipt
    WHERE v_origin = 'TODOS' OR receipt.origem = v_origin
  ),
  filtered_total AS (
    SELECT count(*) AS total_count
    FROM origin_filtered
  ),
  page_seed AS (
    SELECT receipt.*
    FROM origin_filtered receipt
    ORDER BY receipt.data_pagamento DESC,
      receipt.baixa_registrada_em DESC NULLS LAST,
      receipt.id DESC
    LIMIT v_page_size
    OFFSET v_offset
  ),
  page_enriched AS (
    SELECT
      receipt.*,
      composition.juros AS juros_aplicados,
      composition.multa AS multa_aplicada,
      composition.acrescimo AS acrescimo_aplicado,
      composition.desconto AS desconto_aplicado,
      CASE WHEN receipt.origem = 'HISTORICO_MIGRADO'
        THEN receipt.valor_pago_original - receipt.valor_nominal
        ELSE composition.diferenca_nao_discriminada
      END AS diferenca_nao_discriminada,
      CASE
        WHEN receipt.origem = 'HISTORICO_MIGRADO' THEN 'HISTORICO_SEM_COMPOSICAO'
        ELSE coalesce(composition.composicao_status, 'NAO_DISCRIMINADA_PELO_GATEWAY')
      END AS composicao_status,
      coalesce(composition.valor_recebido, receipt.valor_pago_original) AS valor_pago,
      CASE WHEN receipt.origem = 'HISTORICO_MIGRADO' THEN 'HISTORICO_SEM_DETALHAMENTO'
        WHEN composition.composicao_status = 'COMPOSICAO_EXPLICITA' THEN 'BAIXA_MANUAL_EXPLICITA'
        WHEN composition.composicao_status = 'SEM_DIFERENCA_FINANCEIRA' THEN 'VALOR_EXATO_SEM_AJUSTES'
        WHEN composition.composicao_status = 'CONCILIADO_POR_FORMULA_BANESE' THEN 'FORMULA_CONTRATUAL_BANESE'
        ELSE 'DIFERENCA_NAO_DISCRIMINADA'
      END AS composicao_proveniencia
    FROM page_seed receipt
    LEFT JOIN LATERAL public.resolve_receivable_financial_composition(
      receipt.valor_nominal,
      receipt.valor_pago_original,
      receipt.data_vencimento,
      receipt.data_pagamento,
      receipt.gateway_financial_terms,
      receipt.manual_settlement_id,
      receipt.manual_settlement_reversed_at,
      receipt.manual_settlement_principal_cents,
      receipt.manual_settlement_interest_cents,
      receipt.manual_settlement_penalty_cents,
      receipt.manual_settlement_addition_cents,
      receipt.manual_settlement_discount_cents,
      receipt.manual_settlement_received_cents
    ) composition ON receipt.origem <> 'HISTORICO_MIGRADO'
  )
  SELECT jsonb_build_object(
    'items', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', receipt.id,
          'empresa_id', receipt.empresa_id,
          'empresa_nome', receipt.empresa_nome,
          'polo_id', receipt.polo_id,
          'polo_nome', receipt.polo_nome,
          'cliente_nome', receipt.cliente_nome,
          'cliente_cpf_cnpj', receipt.cliente_cpf_cnpj,
          'data_pagamento', receipt.data_pagamento,
          'baixa_registrada_em', receipt.baixa_registrada_em,
          'baixa_tempo_proveniencia', receipt.baixa_tempo_proveniencia,
          'data_vencimento', receipt.data_vencimento,
          'descricao', receipt.descricao,
          'curso_nome', receipt.curso_nome,
          'turma_nome', receipt.turma_nome,
          'matricula_codigo', receipt.matricula_codigo,
          'parcela_label', receipt.parcela_label,
          'nosso_numero', receipt.nosso_numero,
          'valor_nominal', receipt.valor_nominal,
          'valor_pago', receipt.valor_pago,
          'juros_aplicados', receipt.juros_aplicados,
          'multa_aplicada', receipt.multa_aplicada,
          'acrescimo_aplicado', receipt.acrescimo_aplicado,
          'desconto_aplicado', receipt.desconto_aplicado,
          'diferenca_nao_discriminada', receipt.diferenca_nao_discriminada,
          'composicao_status', receipt.composicao_status,
          'composicao_proveniencia', receipt.composicao_proveniencia,
          'forma_pagamento', receipt.forma_pagamento,
          'origem', receipt.origem,
          'operador_nome', receipt.operador_nome,
          'conta_recebedora_nome', receipt.conta_recebedora_nome,
          'comprovante_url', receipt.comprovante_url
        )
        ORDER BY receipt.data_pagamento DESC,
          receipt.baixa_registrada_em DESC NULLS LAST,
          receipt.id DESC
      )
      FROM page_enriched receipt
    ), '[]'::jsonb),
    'total_count', filtered_total.total_count,
    'page', v_page,
    'page_size', v_page_size,
    'total_pages', CASE
      WHEN filtered_total.total_count = 0 THEN 0
      ELSE ceil(filtered_total.total_count::numeric / v_page_size)::integer
    END,
    'counts', jsonb_build_object(
      'total', receipt_counts.total,
      'automatica_banese', receipt_counts.automatica_banese,
      'manual', receipt_counts.manual,
      'historico_migrado', receipt_counts.historico_migrado,
      'cnab240', receipt_counts.cnab240,
      'mercado_pago', receipt_counts.mercado_pago,
      'outro', receipt_counts.outro
    )
  )
  INTO v_result
  FROM filtered_total
  CROSS JOIN receipt_counts;

  RETURN coalesce(
    v_result,
    jsonb_build_object(
      'items', '[]'::jsonb,
      'total_count', 0,
      'page', v_page,
      'page_size', v_page_size,
      'total_pages', 0,
      'counts', jsonb_build_object(
        'total', 0,
        'automatica_banese', 0,
        'manual', 0,
        'historico_migrado', 0,
        'cnab240', 0,
        'mercado_pago', 0,
        'outro', 0
      )
    )
  );
END;
$function$;
ALTER FUNCTION public.list_financial_receipts_secure(
  uuid, uuid, date, date, text, text, text, integer, integer
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.list_financial_receipts_secure(uuid, uuid, date, date, text, text, text, integer, integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_financial_receipts_secure(uuid, uuid, date, date, text, text, text, integer, integer)
  TO authenticated;
COMMENT ON FUNCTION public.list_financial_receipts_secure(
  uuid, uuid, date, date, text, text, text, integer, integer
) IS
  'Lista recebimentos financeiros paginados com escopo RBAC, dados sensíveis mascarados e composição/proveniência canônicas.';
COMMIT;
