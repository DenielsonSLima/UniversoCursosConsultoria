BEGIN;

CREATE TEMP TABLE technical_percentage_fine_guard
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

ALTER TABLE public.turmas
  ADD COLUMN IF NOT EXISTS multa_atraso_percentual NUMERIC(5,2);

ALTER TABLE public.matriculas
  ADD COLUMN IF NOT EXISTS multa_atraso_percentual_individual NUMERIC(5,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'turmas_multa_atraso_percentual_chk'
      AND conrelid = 'public.turmas'::regclass
  ) THEN
    ALTER TABLE public.turmas
      ADD CONSTRAINT turmas_multa_atraso_percentual_chk
      CHECK (
        multa_atraso_percentual IS NULL
        OR multa_atraso_percentual BETWEEN 0 AND 100
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'matriculas_multa_atraso_percentual_individual_chk'
      AND conrelid = 'public.matriculas'::regclass
  ) THEN
    ALTER TABLE public.matriculas
      ADD CONSTRAINT matriculas_multa_atraso_percentual_individual_chk
      CHECK (
        multa_atraso_percentual_individual IS NULL
        OR multa_atraso_percentual_individual BETWEEN 0 AND 100
      );
  END IF;
END;
$$;

-- A coluna legada multa_atraso continua sendo o valor monetário derivado.
-- Isso preserva integrações existentes enquanto a Gestão técnica configura a
-- multa de forma explícita como percentual.
UPDATE public.turmas AS turma
SET
  juros_atraso = 2.00,
  multa_atraso_percentual = 2.00,
  multa_atraso = ROUND(COALESCE(turma.valor_parcela, 0) * 0.02, 2),
  aplicar_desconto_matricula = FALSE,
  aplicar_multa_juros_matricula = FALSE,
  aplicar_desconto_mensalidade = TRUE,
  aplicar_multa_juros_mensalidade = TRUE,
  aplicar_desconto_rematricula = FALSE,
  aplicar_multa_juros_rematricula = FALSE
FROM public.cursos AS curso
WHERE curso.id = turma.curso_id
  AND UPPER(COALESCE(curso.modalidade, '')) IN ('TECNICO', 'TÉCNICO');

-- Overrides zerados impediam 43 matrículas de herdar os 2% da turma. NULL
-- restaura a herança sem criar ou alterar qualquer recebível.
UPDATE public.matriculas AS matricula
SET
  juros_atraso_individual = NULL,
  multa_atraso_individual = NULL,
  multa_atraso_percentual_individual = NULL
FROM public.turmas AS turma
JOIN public.cursos AS curso
  ON curso.id = turma.curso_id
WHERE turma.id = matricula.turma_id
  AND UPPER(COALESCE(curso.modalidade, '')) IN ('TECNICO', 'TÉCNICO');

CREATE OR REPLACE FUNCTION public.calculate_gestao_technical_financial_preview(
  p_valor NUMERIC,
  p_desconto NUMERIC,
  p_juros_percentual NUMERIC,
  p_multa_percentual NUMERIC,
  p_aplicar_desconto BOOLEAN DEFAULT TRUE,
  p_aplicar_encargos BOOLEAN DEFAULT TRUE
)
RETURNS TABLE(
  desconto_aplicado NUMERIC,
  juros_calculados NUMERIC,
  juros_percentual_dia NUMERIC,
  juros_valor_dia NUMERIC,
  multa_aplicada NUMERIC,
  valor_com_desconto NUMERIC,
  valor_com_atraso NUMERIC
)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_valor NUMERIC := ROUND(COALESCE(p_valor, 0), 2);
  v_desconto NUMERIC;
  v_juros NUMERIC;
  v_juros_percentual_dia NUMERIC;
  v_juros_valor_dia NUMERIC;
  v_multa NUMERIC;
BEGIN
  IF v_valor < 0
     OR COALESCE(p_desconto, 0) < 0
     OR COALESCE(p_juros_percentual, 0) NOT BETWEEN 0 AND 100
     OR COALESCE(p_multa_percentual, 0) NOT BETWEEN 0 AND 100
  THEN
    RAISE EXCEPTION 'Valores financeiros inválidos para a prévia técnica.'
      USING ERRCODE = '22023';
  END IF;

  v_desconto := CASE
    WHEN COALESCE(p_aplicar_desconto, FALSE)
      THEN ROUND(COALESCE(p_desconto, 0), 2)
    ELSE 0
  END;
  v_juros := CASE
    WHEN COALESCE(p_aplicar_encargos, FALSE)
      THEN ROUND(v_valor * (COALESCE(p_juros_percentual, 0) / 100.0), 2)
    ELSE 0
  END;
  v_juros_percentual_dia := CASE
    WHEN COALESCE(p_aplicar_encargos, FALSE)
      THEN ROUND(COALESCE(p_juros_percentual, 0) / 30.0, 6)
    ELSE 0
  END;
  v_juros_valor_dia := CASE
    WHEN COALESCE(p_aplicar_encargos, FALSE)
      THEN ROUND(
        v_valor * (COALESCE(p_juros_percentual, 0) / 100.0) / 30.0,
        2
      )
    ELSE 0
  END;
  v_multa := CASE
    WHEN COALESCE(p_aplicar_encargos, FALSE)
      THEN ROUND(v_valor * (COALESCE(p_multa_percentual, 0) / 100.0), 2)
    ELSE 0
  END;

  RETURN QUERY SELECT
    v_desconto,
    v_juros,
    v_juros_percentual_dia,
    v_juros_valor_dia,
    v_multa,
    ROUND(GREATEST(0, v_valor - v_desconto), 2),
    ROUND(v_valor + v_juros + v_multa, 2);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.calculate_gestao_technical_financial_preview(
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, BOOLEAN, BOOLEAN
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_gestao_technical_financial_preview(
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, BOOLEAN, BOOLEAN
) TO authenticated, service_role;

COMMENT ON FUNCTION public.calculate_gestao_technical_financial_preview(
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, BOOLEAN, BOOLEAN
) IS
  'Prévia técnica canônica: juros mensais e diários, multa percentual única e desconto somente da mensalidade.';

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
    NEW.juros_atraso := 2.00;
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

CREATE OR REPLACE FUNCTION public.sincronizar_multa_percentual_turma_tecnica()
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
    NEW.multa_atraso_percentual := COALESCE(
      NEW.multa_atraso_percentual,
      2.00
    );
    NEW.multa_atraso := ROUND(
      COALESCE(NEW.valor_parcela, 0)
      * NEW.multa_atraso_percentual
      / 100.0,
      2
    );
    NEW.aplicar_desconto_matricula := FALSE;
    NEW.aplicar_multa_juros_matricula := FALSE;
    NEW.aplicar_desconto_mensalidade := TRUE;
    NEW.aplicar_multa_juros_mensalidade := TRUE;
    NEW.aplicar_desconto_rematricula := FALSE;
    NEW.aplicar_multa_juros_rematricula := FALSE;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sincronizar_multa_percentual_turma_tecnica_trigger
  ON public.turmas;

CREATE TRIGGER sincronizar_multa_percentual_turma_tecnica_trigger
BEFORE INSERT OR UPDATE OF
  curso_id,
  valor_parcela,
  multa_atraso_percentual,
  aplicar_desconto_matricula,
  aplicar_multa_juros_matricula,
  aplicar_desconto_mensalidade,
  aplicar_multa_juros_mensalidade,
  aplicar_desconto_rematricula,
  aplicar_multa_juros_rematricula
ON public.turmas
FOR EACH ROW
EXECUTE FUNCTION public.sincronizar_multa_percentual_turma_tecnica();

REVOKE ALL ON FUNCTION public.sincronizar_multa_percentual_turma_tecnica()
  FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_classes BIGINT;
  v_invalid_classes BIGINT;
  v_enrollments BIGINT;
  v_invalid_enrollments BIGINT;
  v_receivable_count BIGINT;
  v_gateway_identity_count BIGINT;
  v_receivables_fingerprint TEXT;
  v_preview RECORD;
  v_guard technical_percentage_fine_guard%ROWTYPE;
BEGIN
  SELECT COUNT(*)
  INTO v_classes
  FROM public.turmas AS turma
  JOIN public.cursos AS curso
    ON curso.id = turma.curso_id
  WHERE UPPER(COALESCE(curso.modalidade, '')) IN ('TECNICO', 'TÉCNICO');

  SELECT COUNT(*)
  INTO v_invalid_classes
  FROM public.turmas AS turma
  JOIN public.cursos AS curso
    ON curso.id = turma.curso_id
  WHERE UPPER(COALESCE(curso.modalidade, '')) IN ('TECNICO', 'TÉCNICO')
    AND (
      turma.juros_atraso <> 2.00
      OR turma.multa_atraso_percentual <> 2.00
      OR turma.multa_atraso <> 5.60
      OR turma.aplicar_desconto_matricula IS DISTINCT FROM FALSE
      OR turma.aplicar_multa_juros_matricula IS DISTINCT FROM FALSE
      OR turma.aplicar_desconto_mensalidade IS DISTINCT FROM TRUE
      OR turma.aplicar_multa_juros_mensalidade IS DISTINCT FROM TRUE
      OR turma.aplicar_desconto_rematricula IS DISTINCT FROM FALSE
      OR turma.aplicar_multa_juros_rematricula IS DISTINCT FROM FALSE
    );

  IF v_classes <= 0 OR v_invalid_classes <> 0 THEN
    RAISE EXCEPTION
      'Validação das regras percentuais técnicas falhou: % turmas, % inválidas.',
      v_classes,
      v_invalid_classes;
  END IF;

  SELECT COUNT(*), COUNT(*) FILTER (
    WHERE matricula.juros_atraso_individual IS NOT NULL
       OR matricula.multa_atraso_individual IS NOT NULL
       OR matricula.multa_atraso_percentual_individual IS NOT NULL
  )
  INTO v_enrollments, v_invalid_enrollments
  FROM public.matriculas AS matricula
  JOIN public.turmas AS turma
    ON turma.id = matricula.turma_id
  JOIN public.cursos AS curso
    ON curso.id = turma.curso_id
  WHERE UPPER(COALESCE(curso.modalidade, '')) IN ('TECNICO', 'TÉCNICO');

  IF v_enrollments <= 0 OR v_invalid_enrollments <> 0 THEN
    RAISE EXCEPTION
      'Validação das matrículas técnicas falhou: % matrículas, % com override.',
      v_enrollments,
      v_invalid_enrollments;
  END IF;

  SELECT *
  INTO v_preview
  FROM public.calculate_gestao_technical_financial_preview(
    279.90,
    19.90,
    2.00,
    2.00,
    TRUE,
    TRUE
  );

  IF v_preview.valor_com_desconto <> 260.00
     OR v_preview.juros_calculados <> 5.60
     OR v_preview.juros_percentual_dia <> 0.066667
     OR v_preview.juros_valor_dia <> 0.19
     OR v_preview.multa_aplicada <> 5.60
     OR v_preview.valor_com_atraso <> 291.10
  THEN
    RAISE EXCEPTION
      'Prévia técnica inválida: %.',
      TO_JSONB(v_preview);
  END IF;

  SELECT *
  INTO v_guard
  FROM technical_percentage_fine_guard;

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
      'A migration tentou alterar recebíveis ou identidades de gateway.';
  END IF;
END;
$$;

COMMIT;
