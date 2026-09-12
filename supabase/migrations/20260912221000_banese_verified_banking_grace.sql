-- Verified national banking calendar, 2026 only. No source/receivable updates.
-- CMN4.880art6; https://portal.febraban.org.br/noticia/4413/pt-br/
-- Confirmed Banese payment: due06/09, paid08/09,279.90-19.90=260.
CREATE OR REPLACE FUNCTION public.banese_next_national_banking_day(p_date date)
RETURNS date LANGUAGE plpgsql IMMUTABLE STRICT SECURITY INVOKER SET search_path TO ''
AS $$
DECLARE
  v_date date := p_date;
  v_index integer;
  v_holidays constant date[] := ARRAY[
    '2026-01-01'::date, '2026-02-16', '2026-02-17', '2026-04-03',
    '2026-04-21', '2026-05-01', '2026-06-04', '2026-09-07',
    '2026-10-12', '2026-11-02', '2026-11-15', '2026-11-20', '2026-12-25'
  ];
BEGIN
  FOR v_index IN 0..9 LOOP
    IF extract(year FROM v_date) <> 2026 THEN RETURN NULL; END IF;
    IF extract(isodow FROM v_date) < 6 AND NOT (v_date = ANY(v_holidays)) THEN
      RETURN v_date;
    END IF;
    v_date := v_date + 1;
  END LOOP;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.banese_next_national_banking_day(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.banese_next_national_banking_day(date) TO service_role;
COMMENT ON FUNCTION public.banese_next_national_banking_day(date)
IS 'National banking calendar2026verified byFEBRABAN; unsupported years returnNULL, never presumed business days.';

CREATE OR REPLACE FUNCTION public.resolve_receivable_financial_composition(
  p_valor_base numeric,
  p_valor_pago numeric,
  p_data_vencimento date,
  p_data_pagamento date,
  p_financial_terms jsonb,
  p_manual_id uuid,
  p_manual_reversed_at timestamptz,
  p_manual_principal_cents bigint,
  p_manual_interest_cents bigint,
  p_manual_penalty_cents bigint,
  p_manual_addition_cents bigint,
  p_manual_discount_cents bigint,
  p_manual_received_cents bigint
)
RETURNS TABLE (
  valor_base numeric,
  juros numeric,
  multa numeric,
  acrescimo numeric,
  desconto numeric,
  diferenca_nao_discriminada numeric,
  composicao_status text,
  valor_recebido numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_valor_base numeric := coalesce(p_valor_base, 0);
  v_valor_pago numeric := coalesce(p_valor_pago, v_valor_base, 0);
  v_disc_valid_until date;
  v_banking_due_date date;
  v_effective_payment_date date := p_data_pagamento;
  v_disc_type text;
  v_disc_val numeric;
  v_calc_discount numeric := 0;
  v_pen_starts_on date;
  v_pen_type text;
  v_pen_val numeric;
  v_calc_penalty numeric := 0;
  v_int_starts_on date;
  v_int_type text;
  v_int_val numeric;
  v_days integer := 0;
  v_daily_rate numeric := 0;
  v_calc_interest numeric := 0;
  v_diff numeric := 0;
  v_expected_diff numeric := 0;
  v_final_penalty numeric := 0;
  v_final_interest numeric := 0;
BEGIN
  -- 1. Baixa Manual Explícita
  IF p_manual_id IS NOT NULL AND p_manual_reversed_at IS NULL THEN
    RETURN QUERY SELECT
      coalesce(p_manual_principal_cents, 0)::numeric / 100,
      coalesce(p_manual_interest_cents, 0)::numeric / 100,
      coalesce(p_manual_penalty_cents, 0)::numeric / 100,
      coalesce(p_manual_addition_cents, 0)::numeric / 100,
      coalesce(p_manual_discount_cents, 0)::numeric / 100,
      0::numeric,
      'COMPOSICAO_EXPLICITA'::text,
      coalesce(p_manual_received_cents, 0)::numeric / 100;
    RETURN;
  END IF;

  -- 2. Pagamento pelo valor exato sem diferença
  IF v_valor_pago = v_valor_base THEN
    RETURN QUERY SELECT
      v_valor_base,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric,
      'SEM_DIFERENCA_FINANCEIRA'::text,
      v_valor_pago;
    RETURN;
  END IF;

  -- 3. Reconciliação Determinística por Fórmula (Banese)
  IF p_financial_terms IS NOT NULL
     AND jsonb_typeof(p_financial_terms) = 'object'
     AND p_data_pagamento IS NOT NULL THEN

    -- Apply only the verified 2026 banking grace window. Dates and terms in
    -- the receivable remain canonical; actual payment date is never changed.
    IF p_data_vencimento IS NOT NULL AND p_data_pagamento > p_data_vencimento
       AND p_financial_terms->>'dueDate' = p_data_vencimento::text
       AND p_financial_terms->>'nominalAmount' ~ '^[0-9]+([.][0-9]+)?$'
       AND (p_financial_terms->>'nominalAmount')::numeric = v_valor_base THEN
      v_banking_due_date := public.banese_next_national_banking_day(p_data_vencimento);
      IF v_banking_due_date IS NOT NULL AND p_data_pagamento <= v_banking_due_date THEN
        v_effective_payment_date := p_data_vencimento;
      END IF;
    END IF;

    -- A. Desconto por Pontualidade
    IF p_financial_terms ? 'discount'
       AND p_financial_terms->'discount' IS NOT NULL
       AND jsonb_typeof(p_financial_terms->'discount') = 'object' THEN
      v_disc_valid_until := (p_financial_terms->'discount'->>'validUntil')::date;
      IF v_disc_valid_until IS NOT NULL AND v_effective_payment_date <= v_disc_valid_until THEN
        v_disc_type := coalesce(p_financial_terms->'discount'->>'type', '');
        v_disc_val := (p_financial_terms->'discount'->>'value')::numeric;
        IF v_disc_type = 'fixed' THEN
          v_calc_discount := round(v_disc_val, 2);
        ELSIF v_disc_type = 'percentage' THEN
          v_calc_discount := round(v_valor_base * v_disc_val / 100, 2);
        END IF;
      END IF;
    END IF;

    -- B. Multa por Atraso
    IF p_financial_terms ? 'penalty'
       AND p_financial_terms->'penalty' IS NOT NULL
       AND jsonb_typeof(p_financial_terms->'penalty') = 'object' THEN
      v_pen_starts_on := (p_financial_terms->'penalty'->>'startsOn')::date;
      IF v_pen_starts_on IS NOT NULL AND v_effective_payment_date >= v_pen_starts_on THEN
        v_pen_type := coalesce(p_financial_terms->'penalty'->>'type', '');
        v_pen_val := (p_financial_terms->'penalty'->>'value')::numeric;
        IF v_pen_type = 'fixed' THEN
          v_calc_penalty := round(v_pen_val, 2);
        ELSIF v_pen_type = 'percentage' THEN
          v_calc_penalty := round(v_valor_base * v_pen_val / 100, 2);
        END IF;
      END IF;
    END IF;

    -- C. Juros por Atraso
    IF p_financial_terms ? 'interest'
       AND p_financial_terms->'interest' IS NOT NULL
       AND jsonb_typeof(p_financial_terms->'interest') = 'object' THEN
      v_int_starts_on := (p_financial_terms->'interest'->>'startsOn')::date;
      IF v_int_starts_on IS NOT NULL AND v_effective_payment_date >= v_int_starts_on THEN
        v_int_type := coalesce(p_financial_terms->'interest'->>'type', '');
        v_int_val := (p_financial_terms->'interest'->>'value')::numeric;
        v_days := (v_effective_payment_date - v_int_starts_on) + 1;
        IF v_days > 0 THEN
          IF v_int_type = 'daily-fixed' THEN
            v_daily_rate := greatest(v_int_val, round(v_valor_base * 0.01 / 30, 4));
            v_calc_interest := round(v_daily_rate * v_days, 2);
          ELSIF v_int_type = 'monthly-percentage' THEN
            v_calc_interest := round(v_valor_base * v_int_val / 100 * v_days / 30, 2);
          END IF;
        END IF;
      END IF;
    END IF;

    -- Casamento 1: Desconto pontualidade coincide exatamente
    IF v_calc_discount > 0 AND v_valor_pago = (v_valor_base - v_calc_discount) THEN
      RETURN QUERY SELECT
        v_valor_base,
        0::numeric,
        0::numeric,
        0::numeric,
        v_calc_discount,
        0::numeric,
        'CONCILIADO_POR_FORMULA_BANESE'::text,
        v_valor_pago;
      RETURN;
    END IF;

    -- Casamento 2: Multa e Juros coincidem com o valor pago em atraso
    v_diff := v_valor_pago - v_valor_base;
    IF (v_calc_penalty > 0 OR v_calc_interest > 0) AND v_diff > 0 THEN
      v_expected_diff := v_calc_penalty + v_calc_interest;
      IF abs(v_diff - v_expected_diff) <= 0.30 THEN
        IF v_diff >= v_calc_penalty THEN
          v_final_penalty := v_calc_penalty;
          v_final_interest := v_diff - v_calc_penalty;
        ELSE
          v_final_penalty := v_diff;
          v_final_interest := 0;
        END IF;
        RETURN QUERY SELECT
          v_valor_base,
          v_final_interest,
          v_final_penalty,
          0::numeric,
          0::numeric,
          0::numeric,
          'CONCILIADO_POR_FORMULA_BANESE'::text,
          v_valor_pago;
        RETURN;
      END IF;
    END IF;
  END IF;

  -- 4. Fallback de Segurança (Divergência não mapeada pela fórmula canônica)
  RETURN QUERY SELECT
    v_valor_base,
    NULL::numeric,
    NULL::numeric,
    NULL::numeric,
    NULL::numeric,
    v_valor_pago - v_valor_base,
    'NAO_DISCRIMINADA_PELO_GATEWAY'::text,
    v_valor_pago;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_receivable_financial_composition(
  numeric, numeric, date, date, jsonb, uuid, timestamptz,
  bigint, bigint, bigint, bigint, bigint, bigint
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.resolve_receivable_financial_composition(
  numeric, numeric, date, date, jsonb, uuid, timestamptz,
  bigint, bigint, bigint, bigint, bigint, bigint
) TO service_role;

COMMENT ON FUNCTION public.resolve_receivable_financial_composition(
  numeric, numeric, date, date, jsonb, uuid, timestamptz,
  bigint, bigint, bigint, bigint, bigint, bigint
) IS 'Resolve determinística e auditavelmente a composição de juros, multa e desconto de recebíveis com base nos termos contratuais cadastrados.';

