-- Otimiza as buscas financeiras e torna o backend a fonte canonica dos
-- valores exibidos no portal do aluno.

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE INDEX IF NOT EXISTS parceiros_alunos_nome_trgm_idx
  ON public.parceiros
  USING gin (lower(nome) extensions.gin_trgm_ops)
  WHERE tipo = 'Aluno';

CREATE INDEX IF NOT EXISTS parceiros_alunos_cpf_trgm_idx
  ON public.parceiros
  USING gin (lower(COALESCE(cpf_cnpj, '')) extensions.gin_trgm_ops)
  WHERE tipo = 'Aluno';

CREATE INDEX IF NOT EXISTS contas_receber_descricao_abertos_trgm_idx
  ON public.contas_receber
  USING gin (lower(COALESCE(descricao, '')) extensions.gin_trgm_ops)
  WHERE categoria = 'MENSALIDADE'
    AND status IN ('PENDENTE', 'VENCIDO');

CREATE OR REPLACE FUNCTION public.search_financeiro_aluno_receivables_secure(
  p_search text,
  p_polo_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_search text := lower(trim(COALESCE(p_search, '')));
  v_rows jsonb;
BEGIN
  IF length(v_search) < 2 THEN
    RETURN '[]'::jsonb;
  END IF;

  IF auth.role() <> 'service_role'
     AND NOT (
       (
         (p_polo_id IS NULL AND public.is_gestor_global())
         OR (p_polo_id IS NOT NULL AND public.is_gestor_for_polo(p_polo_id))
       )
       AND public.gestor_has_financeiro_tab('resumo')
     )
  THEN
    RAISE EXCEPTION 'Acesso financeiro fora do escopo autorizado.'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(result_row) ORDER BY result_row.data_vencimento, result_row.id), '[]'::jsonb)
    INTO v_rows
  FROM (
    SELECT
      receivable.id,
      receivable.descricao,
      receivable.valor,
      receivable.data_vencimento,
      receivable.data_pagamento,
      receivable.status,
      receivable.categoria,
      receivable.forma_pagamento,
      receivable.cliente_id,
      receivable.polo_id,
      student.nome AS cliente_nome,
      student.cpf_cnpj AS cliente_cpf,
      polo.nome AS polo_nome
    FROM public.contas_receber AS receivable
    JOIN public.parceiros AS student ON student.id = receivable.cliente_id
    LEFT JOIN public.polos AS polo ON polo.id = receivable.polo_id
    WHERE receivable.categoria = 'MENSALIDADE'
      AND receivable.status IN ('PENDENTE', 'VENCIDO')
      AND student.tipo = 'Aluno'
      AND (p_polo_id IS NULL OR receivable.polo_id = p_polo_id)
      AND (
        lower(student.nome) LIKE '%' || v_search || '%'
        OR lower(COALESCE(student.cpf_cnpj, '')) LIKE '%' || v_search || '%'
        OR lower(COALESCE(receivable.descricao, '')) LIKE '%' || v_search || '%'
      )
    ORDER BY receivable.data_vencimento, receivable.id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
  ) AS result_row;

  RETURN v_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_aluno_financeiro_portal_secure(
  p_aluno_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  IF p_aluno_id IS NULL THEN
    RAISE EXCEPTION 'Aluno obrigatorio para consultar o extrato financeiro.'
      USING ERRCODE = '22004';
  END IF;

  IF auth.role() <> 'service_role'
     AND (
       public.current_aluno_id() IS NULL
       OR p_aluno_id IS DISTINCT FROM public.current_aluno_id()
     )
  THEN
    RAISE EXCEPTION 'Extrato financeiro do aluno nao autorizado.'
      USING ERRCODE = '42501';
  END IF;

  WITH source_rows AS (
    SELECT
      receivable.*,
      enrollment.desconto_pontualidade_individual,
      enrollment.juros_atraso_individual,
      enrollment.multa_atraso_individual,
      class.id AS class_id,
      class.curso_id AS class_course_id,
      class.nome AS class_name,
      class.valor_parcela AS class_installment_value,
      class.qtd_parcelas AS class_installment_count,
      class.desconto_pontualidade,
      class.juros_atraso,
      class.multa_atraso,
      class.aplicar_desconto_matricula,
      class.aplicar_multa_juros_matricula,
      class.aplicar_desconto_mensalidade,
      class.aplicar_multa_juros_mensalidade,
      class.aplicar_desconto_rematricula,
      class.aplicar_multa_juros_rematricula,
      course.id AS course_id,
      course.nome AS course_name,
      upper(COALESCE(course.modalidade, '')) AS course_modality,
      student.nome AS student_name,
      student.cpf_cnpj AS student_document
    FROM public.contas_receber AS receivable
    LEFT JOIN public.matriculas AS enrollment ON enrollment.id = receivable.matricula_id
    LEFT JOIN public.turmas AS class ON class.id = receivable.turma_id
    LEFT JOIN public.cursos AS course ON course.id = class.curso_id
    LEFT JOIN public.parceiros AS student ON student.id = receivable.cliente_id
    WHERE receivable.cliente_id = p_aluno_id
  ),
  classified AS (
    SELECT
      source_rows.*,
      (
        upper(COALESCE(tipo_lancamento, '')) = 'MATRICULA'
        OR lower(COALESCE(descricao, '')) LIKE '%matricula%'
        OR lower(COALESCE(descricao, '')) LIKE '%matrícula%'
      ) AS is_enrollment,
      (
        upper(COALESCE(tipo_lancamento, '')) = 'REMATRICULA'
        OR lower(COALESCE(descricao, '')) LIKE '%rematricula%'
        OR lower(COALESCE(descricao, '')) LIKE '%rematrícula%'
      ) AS is_reenrollment,
      (
        upper(COALESCE(tipo_lancamento, '')) = 'PARCELA'
        OR lower(COALESCE(descricao, '')) LIKE '%mensalidade%'
      ) AS is_installment,
      (
        status = 'VENCIDO'
        OR (status = 'PENDENTE' AND data_vencimento < current_date)
      ) AS is_overdue,
      (
        lower(COALESCE(gateway_provider, '')) = 'banese_card'
        AND upper(COALESCE(gateway_payment_method, '')) = 'BOLETO'
        AND length(regexp_replace(COALESCE(gateway_boleto_linha_digitavel, ''), '\D', '', 'g')) = 47
        AND length(regexp_replace(COALESCE(gateway_boleto_codigo_barras, ''), '\D', '', 'g')) = 44
      ) AS has_registered_banese_boleto
    FROM source_rows
  ),
  policies AS (
    SELECT
      classified.*,
      (
        course_modality <> 'EAD'
        AND (
          (is_enrollment AND aplicar_desconto_matricula IS TRUE)
          OR (is_installment AND aplicar_desconto_mensalidade IS NOT FALSE)
          OR (is_reenrollment AND aplicar_desconto_rematricula IS NOT FALSE)
        )
      ) AS can_discount,
      (
        course_modality <> 'EAD'
        AND (
          (is_enrollment AND aplicar_multa_juros_matricula IS NOT FALSE)
          OR (is_installment AND aplicar_multa_juros_mensalidade IS NOT FALSE)
          OR (is_reenrollment AND aplicar_multa_juros_rematricula IS NOT FALSE)
        )
      ) AS can_late_charge
    FROM classified
  ),
  amounts AS (
    SELECT
      policies.*,
      CASE
        WHEN has_registered_banese_boleto OR status = 'PAGO' OR NOT can_discount THEN 0::numeric
        ELSE LEAST(
          COALESCE(valor, 0),
          GREATEST(0, COALESCE(desconto_pontualidade_individual, desconto_pontualidade, 0))
        )
      END AS punctual_discount,
      CASE
        WHEN has_registered_banese_boleto OR NOT is_overdue OR NOT can_late_charge THEN 0::numeric
        ELSE round(
          COALESCE(valor, 0)
          * COALESCE(juros_atraso_individual, juros_atraso, 0)
          / 30.0
          / 100.0
          * GREATEST(current_date - data_vencimento, 0),
          2
        )
      END AS interest_value,
      CASE
        WHEN has_registered_banese_boleto OR NOT is_overdue OR NOT can_late_charge THEN 0::numeric
        ELSE GREATEST(0, COALESCE(multa_atraso_individual, multa_atraso, 0))
      END AS late_fee_value
    FROM policies
  ),
  presented AS (
    SELECT
      amounts.*,
      round(GREATEST(0, COALESCE(valor, 0) - punctual_discount), 2) AS total_until_due,
      round(COALESCE(valor, 0) + interest_value + late_fee_value, 2) AS total_with_late
    FROM amounts
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'cliente_id', cliente_id,
        'matricula_id', matricula_id,
        'turma_id', turma_id,
        'descricao', descricao,
        'categoria', categoria,
        'tipo_lancamento', tipo_lancamento,
        'parcela_numero', parcela_numero,
        'valor', valor,
        'valor_pago', valor_pago,
        'data_vencimento', data_vencimento,
        'data_pagamento', data_pagamento,
        'status', status,
        'forma_pagamento', forma_pagamento,
        'origem_pagamento', origem_pagamento,
        'asaas_invoice_url', asaas_invoice_url,
        'asaas_status', asaas_status,
        'asaas_transaction_receipt_url', asaas_transaction_receipt_url,
        'gateway_provider', gateway_provider,
        'gateway_environment', gateway_environment,
        'gateway_payment_method', gateway_payment_method,
        'gateway_payment_id', gateway_payment_id,
        'gateway_status', gateway_status,
        'gateway_bank_slip_url', gateway_bank_slip_url,
        'gateway_invoice_url', gateway_invoice_url,
        'gateway_boleto_linha_digitavel', gateway_boleto_linha_digitavel,
        'gateway_boleto_codigo_barras', gateway_boleto_codigo_barras,
        'gateway_boleto_nosso_numero', gateway_boleto_nosso_numero,
        'turmas', CASE
          WHEN class_id IS NULL THEN NULL
          ELSE jsonb_build_object(
            'id', class_id,
            'curso_id', class_course_id,
            'nome', class_name,
            'valor_parcela', class_installment_value,
            'qtd_parcelas', class_installment_count,
            'cursos', CASE
              WHEN course_id IS NULL THEN NULL
              ELSE jsonb_build_object(
                'id', course_id,
                'modalidade', course_modality,
                'nome', course_name
              )
            END
          )
        END,
        'parceiros', jsonb_build_object(
          'nome', student_name,
          'cpf_cnpj', student_document
        ),
        'financial_summary', jsonb_build_object(
          'baseValue', COALESCE(valor, 0),
          'paidValue', COALESCE(valor_pago, valor, 0),
          'punctualDiscount', punctual_discount,
          'totalUntilDue', CASE WHEN has_registered_banese_boleto THEN COALESCE(valor, 0) ELSE total_until_due END,
          'interestPercent', CASE
            WHEN has_registered_banese_boleto OR NOT can_late_charge THEN 0
            ELSE COALESCE(juros_atraso_individual, juros_atraso, 0)
          END,
          'interestValue', interest_value,
          'lateFeeValue', late_fee_value,
          'totalWithLate', CASE WHEN has_registered_banese_boleto THEN COALESCE(valor, 0) ELSE total_with_late END,
          'highlightValue', CASE
            WHEN status = 'PAGO' THEN COALESCE(valor_pago, valor, 0)
            WHEN has_registered_banese_boleto THEN COALESCE(valor, 0)
            WHEN is_overdue THEN total_with_late
            ELSE total_until_due
          END,
          'highlightLabel', CASE
            WHEN status = 'PAGO' THEN 'Valor pago'
            WHEN has_registered_banese_boleto THEN 'Valor do boleto'
            WHEN is_overdue THEN 'Total em atraso'
            ELSE 'Total até o vencimento'
          END,
          'hasDiscount', punctual_discount > 0,
          'hasLateCharge', interest_value > 0 OR late_fee_value > 0,
          'canLateCharge', can_late_charge AND NOT has_registered_banese_boleto
        )
      )
      ORDER BY data_vencimento, id
    ),
    '[]'::jsonb
  )
  INTO v_rows
  FROM presented;

  RETURN jsonb_build_object(
    'rows', v_rows,
    'summary', (
      WITH elements AS (
        SELECT value AS row_data
        FROM jsonb_array_elements(v_rows)
      ),
      open_by_modality AS (
        SELECT
          COALESCE(NULLIF(row_data #>> '{turmas,cursos,modalidade}', ''), 'OUTROS') AS modality,
          count(*)::integer AS item_count,
          COALESCE(sum((row_data #>> '{financial_summary,highlightValue}')::numeric), 0) AS total_value
        FROM elements
        WHERE row_data ->> 'status' IN ('PENDENTE', 'VENCIDO')
        GROUP BY 1
      )
      SELECT jsonb_build_object(
        'totalPaid', COALESCE(sum(
          CASE
            WHEN row_data ->> 'status' = 'PAGO'
            THEN (row_data #>> '{financial_summary,paidValue}')::numeric
            ELSE 0
          END
        ), 0),
        'totalPending', COALESCE(sum(
          CASE
            WHEN row_data ->> 'status' IN ('PENDENTE', 'VENCIDO')
            THEN (row_data #>> '{financial_summary,highlightValue}')::numeric
            ELSE 0
          END
        ), 0),
        'openByModality', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'modality', modality,
            'count', item_count,
            'total', total_value
          ) ORDER BY modality)
          FROM open_by_modality
        ), '[]'::jsonb)
      )
      FROM elements
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.search_financeiro_aluno_receivables_secure(text, uuid, integer)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_aluno_financeiro_portal_secure(uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.search_financeiro_aluno_receivables_secure(text, uuid, integer)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_aluno_financeiro_portal_secure(uuid)
  TO authenticated, service_role;
