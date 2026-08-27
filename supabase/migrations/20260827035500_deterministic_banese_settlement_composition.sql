-- Migração: Discriminação determinística de termos financeiros Banese no Caixa.
-- Quando o recebível é liquidado via gateway (Banese), casamos matematicamente
-- o valor_pago na data_pagamento com o gateway_financial_terms (desconto, multa e juros),
-- eliminando o status de "Não discriminado" de forma auditável e sem suposições.

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

    -- A. Desconto por Pontualidade
    IF p_financial_terms ? 'discount'
       AND p_financial_terms->'discount' IS NOT NULL
       AND jsonb_typeof(p_financial_terms->'discount') = 'object' THEN
      v_disc_valid_until := (p_financial_terms->'discount'->>'validUntil')::date;
      IF v_disc_valid_until IS NOT NULL AND p_data_pagamento <= v_disc_valid_until THEN
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
      IF v_pen_starts_on IS NOT NULL AND p_data_pagamento >= v_pen_starts_on THEN
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
      IF v_int_starts_on IS NOT NULL AND p_data_pagamento >= v_int_starts_on THEN
        v_int_type := coalesce(p_financial_terms->'interest'->>'type', '');
        v_int_val := (p_financial_terms->'interest'->>'value')::numeric;
        v_days := (p_data_pagamento - v_int_starts_on) + 1;
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

CREATE OR REPLACE FUNCTION public.get_caixa_relatorio_recebimentos_core(
  p_polo_id uuid,
  p_inicio date,
  p_fim date
)
RETURNS TABLE (
  id uuid,
  data_pagamento date,
  data_vencimento date,
  descricao text,
  pagador text,
  polo text,
  curso text,
  modalidade text,
  turma text,
  parcela_numero integer,
  total_parcelas integer,
  forma_pagamento text,
  conta text,
  valor_base numeric,
  juros numeric,
  multa numeric,
  acrescimo numeric,
  desconto numeric,
  diferenca_nao_discriminada numeric,
  composicao_status text,
  valor_recebido numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT
    cr.id,
    cr.data_pagamento,
    cr.data_vencimento,
    coalesce(nullif(trim(cr.descricao), ''), 'Recebimento') AS descricao,
    coalesce(nullif(trim(pagador.nome), ''), 'Pagador não identificado') AS pagador,
    CASE
      WHEN movimento_polo.id IS NULL THEN 'A CLASSIFICAR'
      ELSE concat_ws(
        ' · ',
        nullif(trim(movimento_polo.nome), ''),
        nullif(concat_ws('/', movimento_polo.cidade, movimento_polo.estado), '/')
      )
    END AS polo,
    coalesce(nullif(trim(curso.nome), ''), 'Curso não informado') AS curso,
    coalesce(nullif(trim(curso.modalidade), ''), 'OUTROS') AS modalidade,
    coalesce(
      nullif(trim(concat_ws(' · ', turma.codigo, turma.nome)), ''),
      'Turma não informada'
    ) AS turma,
    cr.parcela_numero,
    CASE
      WHEN cr.parcela_numero IS NULL THEN NULL
      WHEN coalesce(cr.gateway_installments, 0) > 1 THEN cr.gateway_installments
      WHEN coalesce(turma.qtd_parcelas, 0) > 0 THEN turma.qtd_parcelas
      ELSE NULL
    END AS total_parcelas,
    coalesce(
      nullif(
        trim(
          CASE
            WHEN upper(trim(coalesce(cr.gateway_settlement_channel, ''))) IN (
              'NAO_IDENTIFICADO',
              'NÃO IDENTIFICADO',
              'UNKNOWN'
            ) THEN NULL
            ELSE cr.gateway_settlement_channel
          END
        ),
        ''
      ),
      nullif(trim(cr.gateway_payment_method), ''),
      nullif(trim(cr.forma_pagamento), ''),
      'Não informada'
    ) AS forma_pagamento,
    CASE
      WHEN cb.id IS NULL THEN 'Conta não informada'
      ELSE concat_ws(
        ' · ',
        nullif(trim(cb.banco), ''),
        nullif(concat('Ag. ', cb.agencia), 'Ag. '),
        nullif(concat('Conta ', cb.conta), 'Conta ')
      )
    END AS conta,
    comp.valor_base,
    comp.juros,
    comp.multa,
    comp.acrescimo,
    comp.desconto,
    comp.diferenca_nao_discriminada,
    comp.composicao_status,
    comp.valor_recebido
  FROM public.contas_receber cr
  LEFT JOIN public.matriculas matricula
    ON matricula.id = cr.matricula_id
  LEFT JOIN public.parceiros pagador
    ON pagador.id = coalesce(cr.cliente_id, matricula.aluno_id)
  LEFT JOIN public.turmas turma
    ON turma.id = coalesce(cr.turma_id, matricula.turma_id)
  LEFT JOIN public.cursos curso
    ON curso.id = turma.curso_id
  LEFT JOIN public.polos movimento_polo
    ON movimento_polo.id = cr.polo_id
  LEFT JOIN public.contas_bancarias cb
    ON cb.id = cr.conta_bancaria_id
  CROSS JOIN LATERAL public.resolve_receivable_financial_composition(
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
  ) comp
  WHERE cr.status = 'PAGO'
    AND cr.data_pagamento >= p_inicio
    AND cr.data_pagamento < p_fim
    AND (p_polo_id IS NULL OR cr.polo_id = p_polo_id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.emprestimos_financeiros emprestimo
      WHERE emprestimo.conta_receber_id = cr.id
    )
  ORDER BY cr.data_pagamento, movimento_polo.nome, pagador.nome, cr.id;
$function$;

REVOKE ALL ON FUNCTION public.get_caixa_relatorio_recebimentos_core(uuid, date, date)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_caixa_relatorio_recebimentos_core(uuid, date, date)
  TO service_role;

COMMENT ON FUNCTION public.get_caixa_relatorio_recebimentos_core(uuid, date, date) IS
  'Detalhamento operacional de recebimentos para o relatório do Caixa, com discriminação determinística de termos financeiros.';
