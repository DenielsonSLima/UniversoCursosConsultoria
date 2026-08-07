BEGIN;

CREATE TEMP TABLE technical_discount_correction_guard
ON COMMIT DROP
AS
SELECT
  COUNT(*)::BIGINT AS receivable_count,
  COUNT(*) FILTER (
    WHERE conta.gateway_payment_id IS NOT NULL
       OR conta.gateway_payment_link_id IS NOT NULL
       OR conta.gateway_boleto_nosso_numero IS NOT NULL
       OR conta.gateway_creation_token IS NOT NULL
       OR conta.asaas_payment_id IS NOT NULL
       OR conta.asaas_payment_link_id IS NOT NULL
       OR conta.nosso_numero_asaas IS NOT NULL
  )::BIGINT AS gateway_identity_count,
  MD5(COALESCE(
    STRING_AGG(TO_JSONB(conta)::TEXT, '' ORDER BY conta.id),
    ''
  )) AS receivables_fingerprint
FROM public.contas_receber AS conta
JOIN public.matriculas AS matricula
  ON matricula.id = conta.matricula_id
JOIN public.turmas AS turma
  ON turma.id = matricula.turma_id
JOIN public.cursos AS curso
  ON curso.id = turma.curso_id
WHERE UPPER(COALESCE(curso.modalidade, '')) IN ('TECNICO', 'TÉCNICO');

UPDATE public.turmas AS turma
SET desconto_pontualidade = 19.90
FROM public.cursos AS curso
WHERE curso.id = turma.curso_id
  AND UPPER(COALESCE(curso.modalidade, '')) IN ('TECNICO', 'TÉCNICO');

CREATE OR REPLACE FUNCTION public.aplicar_padrao_financeiro_turma_tecnica()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_modalidade TEXT;
BEGIN
  SELECT UPPER(COALESCE(curso.modalidade, ''))
  INTO v_modalidade
  FROM public.cursos AS curso
  WHERE curso.id = NEW.curso_id;

  IF v_modalidade IN ('TECNICO', 'TÉCNICO') THEN
    NEW.valor_matricula := 150.00;
    NEW.valor_rematricula := 150.00;
    NEW.qtd_parcelas := 12;
    NEW.valor_parcela := 279.90;
    NEW.desconto_pontualidade := 19.90;
    NEW.juros_atraso := 1.00;
    NEW.multa_atraso_percentual := 2.00;
    NEW.multa_atraso := 5.60;
    NEW.aplicar_desconto_matricula := FALSE;
    NEW.aplicar_multa_juros_matricula := FALSE;
    NEW.aplicar_desconto_mensalidade := TRUE;
    NEW.aplicar_multa_juros_mensalidade := TRUE;
    NEW.aplicar_desconto_rematricula := FALSE;
    NEW.aplicar_multa_juros_rematricula := FALSE;
    NEW.gerar_cobrancas_futuras := TRUE;
    NEW.sincronizar_asaas_futuro := FALSE;
    NEW.cronograma_financeiro := public.build_gestao_financial_schedule(
      COALESCE(NEW.data_inicio, CURRENT_DATE),
      NEW.valor_matricula,
      NEW.valor_parcela,
      NEW.valor_rematricula,
      NEW.qtd_parcelas,
      COALESCE(NEW.dia_vencimento_padrao, 10)
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.aplicar_padrao_financeiro_turma_tecnica() IS
  'Aplica matrícula 150, desconto 19,90, 12x279,90, rematrícula 150, multa única de 2% e um juros de 1% ao mês proporcional por dia, sem gateway.';

DO $$
DECLARE
  v_classes BIGINT;
  v_invalid_classes BIGINT;
  v_receivable_count BIGINT;
  v_gateway_identity_count BIGINT;
  v_receivables_fingerprint TEXT;
  v_preview RECORD;
  v_guard technical_discount_correction_guard%ROWTYPE;
BEGIN
  SELECT COUNT(*), COUNT(*) FILTER (
    WHERE turma.valor_matricula <> 150.00
       OR turma.valor_rematricula <> 150.00
       OR turma.qtd_parcelas <> 12
       OR turma.valor_parcela <> 279.90
       OR turma.desconto_pontualidade <> 19.90
       OR turma.juros_atraso <> 1.00
       OR turma.multa_atraso_percentual <> 2.00
       OR turma.multa_atraso <> 5.60
       OR turma.aplicar_desconto_matricula IS DISTINCT FROM FALSE
       OR turma.aplicar_multa_juros_matricula IS DISTINCT FROM FALSE
       OR turma.aplicar_desconto_mensalidade IS DISTINCT FROM TRUE
       OR turma.aplicar_multa_juros_mensalidade IS DISTINCT FROM TRUE
       OR turma.aplicar_desconto_rematricula IS DISTINCT FROM FALSE
       OR turma.aplicar_multa_juros_rematricula IS DISTINCT FROM FALSE
       OR turma.sincronizar_asaas_futuro IS DISTINCT FROM FALSE
  )
  INTO v_classes, v_invalid_classes
  FROM public.turmas AS turma
  JOIN public.cursos AS curso
    ON curso.id = turma.curso_id
  WHERE UPPER(COALESCE(curso.modalidade, '')) IN ('TECNICO', 'TÉCNICO');

  IF v_classes <= 0 OR v_invalid_classes <> 0 THEN
    RAISE EXCEPTION
      'Validação do padrão financeiro técnico falhou: % turmas, % inválidas.',
      v_classes,
      v_invalid_classes;
  END IF;

  SELECT *
  INTO v_preview
  FROM public.calculate_gestao_technical_financial_preview(
    279.90,
    19.90,
    1.00,
    2.00,
    TRUE,
    TRUE
  );

  IF v_preview.valor_com_desconto <> 260.00
     OR v_preview.juros_percentual_dia <> 0.033333
     OR v_preview.juros_valor_dia <> 0.09
     OR v_preview.multa_aplicada <> 5.60
     OR v_preview.valor_com_atraso <> 288.30
  THEN
    RAISE EXCEPTION
      'Prévia financeira técnica inválida: %.',
      TO_JSONB(v_preview);
  END IF;

  SELECT *
  INTO v_guard
  FROM technical_discount_correction_guard;

  SELECT
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (
      WHERE conta.gateway_payment_id IS NOT NULL
         OR conta.gateway_payment_link_id IS NOT NULL
         OR conta.gateway_boleto_nosso_numero IS NOT NULL
         OR conta.gateway_creation_token IS NOT NULL
         OR conta.asaas_payment_id IS NOT NULL
         OR conta.asaas_payment_link_id IS NOT NULL
         OR conta.nosso_numero_asaas IS NOT NULL
    )::BIGINT,
    MD5(COALESCE(
      STRING_AGG(TO_JSONB(conta)::TEXT, '' ORDER BY conta.id),
      ''
    ))
  INTO
    v_receivable_count,
    v_gateway_identity_count,
    v_receivables_fingerprint
  FROM public.contas_receber AS conta
  JOIN public.matriculas AS matricula
    ON matricula.id = conta.matricula_id
  JOIN public.turmas AS turma
    ON turma.id = matricula.turma_id
  JOIN public.cursos AS curso
    ON curso.id = turma.curso_id
  WHERE UPPER(COALESCE(curso.modalidade, '')) IN ('TECNICO', 'TÉCNICO');

  IF v_receivable_count <> v_guard.receivable_count
     OR v_gateway_identity_count <> v_guard.gateway_identity_count
     OR v_receivables_fingerprint <> v_guard.receivables_fingerprint
  THEN
    RAISE EXCEPTION
      'A correção do desconto tentou alterar recebíveis ou identidades de gateway.';
  END IF;
END;
$$;

COMMIT;
