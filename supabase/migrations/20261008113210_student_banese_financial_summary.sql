BEGIN;

-- Preserve the current dependency wrapper and its authorized base reader.
-- Apply the confirmed bank discount after legacy/dependency presentation, so
-- neither an old zero-discount branch nor class rules can overwrite it.
CREATE OR REPLACE FUNCTION public.get_aluno_financeiro_portal_secure(p_aluno_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_base jsonb;
  v_rows jsonb;
  v_today date := (statement_timestamp() AT TIME ZONE 'America/Maceio')::date;
BEGIN
  v_base := public.p2_get_aluno_financeiro_portal_secure_20260812(p_aluno_id);

  WITH source_rows AS (
    SELECT
      element.row_data,
      element.position,
      recebivel.*,
      CASE
        WHEN upper(coalesce(recebivel.tipo_lancamento, '')) = 'DEPENDENCIA'
          AND recebivel.regra_financeira_dependencia_snapshot->>'origem'
            = 'DEPENDENCIA'
          THEN recebivel.regra_financeira_dependencia_snapshot
        ELSE NULL
      END AS dependency_snapshot
    FROM jsonb_array_elements(coalesce(v_base->'rows', '[]'::jsonb))
      WITH ORDINALITY AS element(row_data, position)
    LEFT JOIN public.contas_receber recebivel
      ON recebivel.id = (element.row_data->>'id')::uuid
  ),
  dependency_values AS (
    SELECT
      source_rows.*,
      dependency_snapshot IS NOT NULL AS is_dependency,
      (
        lower(btrim(coalesce(gateway_provider, ''))) IN ('banese', 'banese_card')
        AND upper(coalesce(gateway_payment_method, '')) = 'BOLETO'
        AND length(regexp_replace(coalesce(gateway_boleto_linha_digitavel, ''), '\D', '', 'g')) = 47
        AND length(regexp_replace(coalesce(gateway_boleto_codigo_barras, ''), '\D', '', 'g')) = 44
      ) AS has_registered_banese_boleto,
      (
        status = 'VENCIDO'
        OR (status = 'PENDENTE' AND data_vencimento < current_date)
      ) AS is_overdue,
      greatest(0, coalesce((dependency_snapshot->>'descontoPontualidade')::numeric, 0))
        AS discount_policy_value,
      greatest(0, coalesce((dependency_snapshot->>'jurosAtrasoPercentual')::numeric, 0))
        AS interest_policy_percent,
      greatest(0, coalesce((dependency_snapshot->>'multaAtrasoPercentual')::numeric, 0))
        AS penalty_policy_percent,
      dependency_snapshot IS NOT NULL
        AND coalesce((dependency_snapshot->>'aplicarDesconto')::boolean, false)
        AS can_discount,
      dependency_snapshot IS NOT NULL
        AND coalesce((dependency_snapshot->>'aplicarMultaJuros')::boolean, false)
        AS can_late_charge
    FROM source_rows
  ),
  dependency_amounts AS (
    SELECT
      dependency_values.*,
      CASE WHEN status = 'PAGO' THEN 0::numeric ELSE
        portal_private.banese_confirmed_student_discount(
          valor, data_vencimento, gateway_provider, gateway_payment_method,
          gateway_boleto_nosso_numero, gateway_financial_terms,
          gateway_financial_terms_confirmed_at, gateway_last_error, v_today
        )
      END AS confirmed_banese_discount,
      CASE
        WHEN has_registered_banese_boleto OR status = 'PAGO' OR NOT can_discount
          THEN 0::numeric
        ELSE least(coalesce(valor, 0), discount_policy_value)
      END AS punctual_discount,
      CASE
        WHEN has_registered_banese_boleto OR NOT is_overdue OR NOT can_late_charge
          THEN 0::numeric
        ELSE round(
          coalesce(valor, 0) * interest_policy_percent / 30.0 / 100.0
            * greatest(current_date - data_vencimento, 0),
          2
        )
      END AS interest_value,
      CASE
        WHEN has_registered_banese_boleto OR NOT is_overdue OR NOT can_late_charge
          THEN 0::numeric
        ELSE round(coalesce(valor, 0) * penalty_policy_percent / 100.0, 2)
      END AS penalty_value
    FROM dependency_values
  ),
  patched AS (
    SELECT
      position,
      has_registered_banese_boleto,
      confirmed_banese_discount,
      valor,
      valor_pago,
      status,
      data_vencimento,
      CASE
        WHEN is_dependency THEN row_data || jsonb_build_object(
          'tipo_lancamento', 'DISCIPLINA',
          'categoria', 'DISCIPLINA',
          'cobranca_disciplina_avulsa', true,
          'matricula_id', NULL,
          'turma_id', NULL,
          'turmas', NULL,
          'financial_summary', jsonb_build_object(
            'baseValue', coalesce(valor, 0),
            'paidValue', coalesce(valor_pago, valor, 0),
            'punctualDiscount', punctual_discount,
            'totalUntilDue', CASE
              WHEN has_registered_banese_boleto THEN coalesce(valor, 0)
              ELSE round(greatest(0, coalesce(valor, 0) - punctual_discount), 2)
            END,
            'interestPercent', CASE
              WHEN has_registered_banese_boleto OR NOT can_late_charge THEN 0
              ELSE interest_policy_percent
            END,
            'interestValue', interest_value,
            'lateFeeValue', penalty_value,
            'totalWithLate', CASE
              WHEN has_registered_banese_boleto THEN coalesce(valor, 0)
              ELSE round(coalesce(valor, 0) + interest_value + penalty_value, 2)
            END,
            'highlightValue', CASE
              WHEN status = 'PAGO' THEN coalesce(valor_pago, valor, 0)
              WHEN has_registered_banese_boleto THEN coalesce(valor, 0)
              WHEN is_overdue THEN round(coalesce(valor, 0) + interest_value + penalty_value, 2)
              ELSE round(greatest(0, coalesce(valor, 0) - punctual_discount), 2)
            END,
            'highlightLabel', CASE
              WHEN status = 'PAGO' THEN 'Valor pago'
              WHEN has_registered_banese_boleto THEN 'Valor do boleto'
              WHEN is_overdue THEN 'Total em atraso'
              ELSE 'Total até o vencimento'
            END,
            'hasDiscount', punctual_discount > 0,
            'hasLateCharge', interest_value > 0 OR penalty_value > 0,
            'canLateCharge', can_late_charge AND NOT has_registered_banese_boleto
          )
        )
        ELSE row_data
      END AS row_data
    FROM dependency_amounts
  ),
  bank_patched AS (
    SELECT
      position,
      CASE WHEN has_registered_banese_boleto THEN row_data || jsonb_build_object(
        'financial_summary', (row_data->'financial_summary') || jsonb_build_object(
          'baseValue', coalesce(valor, 0),
          'paidValue', greatest(coalesce(valor_pago, 0), 0),
          'punctualDiscount', confirmed_banese_discount,
          'totalUntilDue', round(greatest(0, coalesce(valor, 0) - confirmed_banese_discount), 2),
          'highlightValue', CASE
            WHEN status = 'PAGO' THEN greatest(coalesce(valor_pago, 0), 0)
            ELSE greatest(round(coalesce(valor, 0) - confirmed_banese_discount
              - greatest(coalesce(valor_pago, 0), 0), 2), 0)
          END,
          'highlightLabel', CASE
            WHEN status = 'PAGO' THEN 'Valor pago'
            WHEN status = 'VENCIDO' OR data_vencimento < v_today THEN 'Saldo em atraso'
            ELSE 'Saldo até o vencimento'
          END,
          'hasDiscount', confirmed_banese_discount > 0
        )
      ) ELSE row_data END AS row_data
    FROM patched
  )
  SELECT coalesce(jsonb_agg(row_data ORDER BY position), '[]'::jsonb)
  INTO v_rows
  FROM bank_patched;

  RETURN jsonb_build_object(
    'rows', v_rows,
    'summary', (
      WITH elements AS (
        SELECT value AS row_data
        FROM jsonb_array_elements(v_rows)
      ),
      open_by_modality AS (
        SELECT
          CASE
            WHEN coalesce(
              (row_data->>'cobranca_disciplina_avulsa')::boolean,
              false
            )
              THEN 'DISCIPLINA'
            ELSE coalesce(
              nullif(row_data #>> '{turmas,cursos,modalidade}', ''),
              'OUTROS'
            )
          END AS modality,
          count(*)::integer AS item_count,
          coalesce(sum((row_data #>> '{financial_summary,highlightValue}')::numeric), 0)
            AS total_value
        FROM elements
        WHERE row_data->>'status' IN ('PENDENTE', 'VENCIDO')
        GROUP BY 1
      )
      SELECT jsonb_build_object(
        'totalPaid', coalesce(sum(
          CASE
            WHEN row_data->>'status' = 'PAGO'
              THEN (row_data #>> '{financial_summary,paidValue}')::numeric
            ELSE 0
          END
        ), 0),
        'totalPending', coalesce(sum(
          CASE
            WHEN row_data->>'status' IN ('PENDENTE', 'VENCIDO')
              THEN (row_data #>> '{financial_summary,highlightValue}')::numeric
            ELSE 0
          END
        ), 0),
        'openByModality', coalesce((
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
$function$;

REVOKE ALL ON FUNCTION public.get_aluno_financeiro_portal_secure(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_aluno_financeiro_portal_secure(uuid)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
