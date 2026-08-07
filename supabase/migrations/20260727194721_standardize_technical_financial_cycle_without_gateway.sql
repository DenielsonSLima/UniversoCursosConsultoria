BEGIN;

CREATE TEMP TABLE technical_financial_cycle_guard
ON COMMIT DROP
AS
SELECT
  (
    SELECT COUNT(*)::BIGINT
    FROM public.turmas AS turma_snapshot
    JOIN public.cursos AS curso_snapshot
      ON curso_snapshot.id = turma_snapshot.curso_id
    WHERE UPPER(COALESCE(curso_snapshot.modalidade, ''))
      IN ('TECNICO', 'TÉCNICO')
  ) AS technical_class_count,
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

-- O cálculo já limita o vencimento ao último dia real de cada mês. Ampliar a
-- validação para 31 preserva configurações como o dia 30 sem transformar esse
-- dia silenciosamente em 28.
CREATE OR REPLACE FUNCTION public.build_gestao_financial_schedule(
  p_data_inicio DATE,
  p_valor_matricula NUMERIC,
  p_valor_parcela NUMERIC,
  p_valor_rematricula NUMERIC,
  p_qtd_parcelas INTEGER,
  p_dia_vencimento INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_result JSONB := '[]'::JSONB;
  v_index INTEGER;
  v_month_start DATE;
  v_due_date DATE;
  v_last_day INTEGER;
BEGIN
  IF COALESCE(p_valor_matricula, 0) < 0
     OR COALESCE(p_valor_parcela, 0) < 0
     OR COALESCE(p_valor_rematricula, 0) < 0
     OR COALESCE(p_qtd_parcelas, 0) NOT BETWEEN 1 AND 60
     OR COALESCE(p_dia_vencimento, 0) NOT BETWEEN 1 AND 31
  THEN
    RAISE EXCEPTION 'Parâmetros inválidos para gerar o cronograma financeiro.'
      USING ERRCODE = '22023';
  END IF;

  v_result := v_result || JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT(
    'id', 'matr',
    'tipo', 'MATRICULA',
    'label', 'Matrícula Inicial',
    'valor', ROUND(COALESCE(p_valor_matricula, 0), 2),
    'dataVencimento', COALESCE(TO_CHAR(p_data_inicio, 'YYYY-MM-DD'), '')
  ));

  FOR v_index IN 1..p_qtd_parcelas LOOP
    v_month_start := (
      DATE_TRUNC('month', p_data_inicio)::DATE
      + MAKE_INTERVAL(months => v_index)
    )::DATE;
    v_last_day := EXTRACT(
      DAY FROM (v_month_start + INTERVAL '1 month - 1 day')
    )::INTEGER;
    v_due_date := v_month_start + (LEAST(p_dia_vencimento, v_last_day) - 1);

    v_result := v_result || JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT(
      'id', 'parc-' || v_index,
      'tipo', 'PARCELA',
      'label', 'Mensalidade ' || v_index || '/' || p_qtd_parcelas,
      'valor', ROUND(COALESCE(p_valor_parcela, 0), 2),
      'numero', v_index,
      'dataVencimento', COALESCE(TO_CHAR(v_due_date, 'YYYY-MM-DD'), '')
    ));
  END LOOP;

  v_month_start := (
    DATE_TRUNC('month', p_data_inicio)::DATE
    + MAKE_INTERVAL(months => p_qtd_parcelas + 1)
  )::DATE;
  v_last_day := EXTRACT(
    DAY FROM (v_month_start + INTERVAL '1 month - 1 day')
  )::INTEGER;
  v_due_date := v_month_start + (LEAST(p_dia_vencimento, v_last_day) - 1);

  RETURN v_result || JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT(
    'id', 'rem-apos-ciclo',
    'tipo', 'REMATRICULA',
    'label', 'Rematrícula após o ciclo',
    'valor', ROUND(COALESCE(p_valor_rematricula, 0), 2),
    'dataVencimento', COALESCE(TO_CHAR(v_due_date, 'YYYY-MM-DD'), '')
  ));
END;
$$;

COMMENT ON FUNCTION public.build_gestao_financial_schedule(
  DATE, NUMERIC, NUMERIC, NUMERIC, INTEGER, INTEGER
) IS
  'Monta o cronograma financeiro para vencimentos de 1 a 31, ajustando somente meses que não possuem o dia configurado.';

-- Política financeira vigente para todos os cursos técnicos:
-- matrícula de R$ 150,00 -> 12 mensalidades de R$ 279,90 ->
-- rematrícula de R$ 150,00 -> próximo ciclo de 12 mensalidades.
--
-- A criação dos lançamentos futuros é interna. A sincronização com gateway
-- permanece desligada para que esta configuração não emita boleto, Pix ou
-- qualquer outra cobrança externa.
UPDATE public.turmas AS turma
SET
  valor_matricula = 150.00,
  valor_rematricula = 150.00,
  qtd_parcelas = 12,
  valor_parcela = 279.90,
  gerar_cobrancas_futuras = TRUE,
  sincronizar_asaas_futuro = FALSE,
  cronograma_financeiro = public.build_gestao_financial_schedule(
    COALESCE(turma.data_inicio, CURRENT_DATE),
    150.00,
    279.90,
    150.00,
    12,
    COALESCE(turma.dia_vencimento_padrao, 10)
  )
FROM public.cursos AS curso
WHERE curso.id = turma.curso_id
  AND UPPER(COALESCE(curso.modalidade, '')) IN ('TECNICO', 'TÉCNICO');

-- As funções do ciclo priorizam os valores individuais da matrícula. Alinhar
-- esses valores é necessário para que matrículas já existentes também adotem
-- a política no próximo lançamento, sem reescrever contas já emitidas/pagas.
UPDATE public.matriculas AS matricula
SET
  valor_matricula_individual = 150.00,
  valor_rematricula_individual = 150.00,
  valor_parcela_individual = 279.90,
  gerar_cobranca_inicial = TRUE,
  gerar_cobranca_futura = TRUE,
  sincronizar_asaas = FALSE
FROM public.turmas AS turma
JOIN public.cursos AS curso
  ON curso.id = turma.curso_id
WHERE turma.id = matricula.turma_id
  AND UPPER(COALESCE(curso.modalidade, '')) IN ('TECNICO', 'TÉCNICO');

-- Mantém o banco como fonte canônica para novas turmas, inclusive quando elas
-- forem criadas por importação ou outra integração que não passe pela UI.
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

DROP TRIGGER IF EXISTS aplicar_padrao_financeiro_turma_tecnica_trigger
  ON public.turmas;

CREATE TRIGGER aplicar_padrao_financeiro_turma_tecnica_trigger
BEFORE INSERT OR UPDATE OF curso_id
ON public.turmas
FOR EACH ROW
EXECUTE FUNCTION public.aplicar_padrao_financeiro_turma_tecnica();

REVOKE ALL ON FUNCTION public.aplicar_padrao_financeiro_turma_tecnica()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.aplicar_padrao_financeiro_turma_tecnica() IS
  'Aplica a novas turmas técnicas o ciclo canônico 150 + 12x279,90 + rematrícula 150, mantendo o envio a gateway desligado.';

DO $$
DECLARE
  v_turmas_tecnicas BIGINT;
  v_turmas_invalidas BIGINT;
  v_matriculas_invalidas BIGINT;
  v_receivable_count BIGINT;
  v_gateway_identity_count BIGINT;
  v_receivables_fingerprint TEXT;
  v_guard technical_financial_cycle_guard%ROWTYPE;
BEGIN
  SELECT *
  INTO v_guard
  FROM technical_financial_cycle_guard;

  SELECT COUNT(*)
  INTO v_turmas_tecnicas
  FROM public.turmas AS turma
  JOIN public.cursos AS curso
    ON curso.id = turma.curso_id
  WHERE UPPER(COALESCE(curso.modalidade, '')) IN ('TECNICO', 'TÉCNICO');

  IF v_guard.technical_class_count <= 0
     OR v_turmas_tecnicas <> v_guard.technical_class_count THEN
    RAISE EXCEPTION
      'Validação do ciclo técnico falhou: esperadas % turmas, encontradas %.',
      v_guard.technical_class_count,
      v_turmas_tecnicas;
  END IF;

  SELECT COUNT(*)
  INTO v_turmas_invalidas
  FROM public.turmas AS turma
  JOIN public.cursos AS curso
    ON curso.id = turma.curso_id
  WHERE UPPER(COALESCE(curso.modalidade, '')) IN ('TECNICO', 'TÉCNICO')
    AND (
      turma.valor_matricula <> 150.00
      OR turma.valor_rematricula <> 150.00
      OR turma.qtd_parcelas <> 12
      OR turma.valor_parcela <> 279.90
      OR turma.gerar_cobrancas_futuras IS DISTINCT FROM TRUE
      OR turma.sincronizar_asaas_futuro IS DISTINCT FROM FALSE
      OR JSONB_ARRAY_LENGTH(
        COALESCE(turma.cronograma_financeiro, '[]'::JSONB)
      ) <> 14
      OR (
        SELECT COUNT(*)
        FROM JSONB_ARRAY_ELEMENTS(
          COALESCE(turma.cronograma_financeiro, '[]'::JSONB)
        ) AS item
        WHERE UPPER(COALESCE(item->>'tipo', '')) = 'PARCELA'
      ) <> 12
      OR (
        SELECT COUNT(*)
        FROM JSONB_ARRAY_ELEMENTS(
          COALESCE(turma.cronograma_financeiro, '[]'::JSONB)
        ) AS item
        WHERE UPPER(COALESCE(item->>'tipo', '')) = 'PARCELA'
          AND NULLIF(item->>'valor', '')::NUMERIC = 279.90
      ) <> 12
      OR (
        SELECT COUNT(*)
        FROM JSONB_ARRAY_ELEMENTS(
          COALESCE(turma.cronograma_financeiro, '[]'::JSONB)
        ) AS item
        WHERE UPPER(COALESCE(item->>'tipo', '')) = 'MATRICULA'
          AND NULLIF(item->>'valor', '')::NUMERIC = 150.00
      ) <> 1
      OR (
        SELECT COUNT(*)
        FROM JSONB_ARRAY_ELEMENTS(
          COALESCE(turma.cronograma_financeiro, '[]'::JSONB)
        ) AS item
        WHERE UPPER(COALESCE(item->>'tipo', '')) = 'REMATRICULA'
          AND NULLIF(item->>'valor', '')::NUMERIC = 150.00
      ) <> 1
    );

  IF v_turmas_invalidas <> 0 THEN
    RAISE EXCEPTION
      'Validação do ciclo técnico falhou em % turma(s).',
      v_turmas_invalidas;
  END IF;

  SELECT COUNT(*)
  INTO v_matriculas_invalidas
  FROM public.matriculas AS matricula
  JOIN public.turmas AS turma
    ON turma.id = matricula.turma_id
  JOIN public.cursos AS curso
    ON curso.id = turma.curso_id
  WHERE UPPER(COALESCE(curso.modalidade, '')) IN ('TECNICO', 'TÉCNICO')
    AND (
      matricula.valor_matricula_individual <> 150.00
      OR matricula.valor_rematricula_individual <> 150.00
      OR matricula.valor_parcela_individual <> 279.90
      OR matricula.gerar_cobranca_inicial IS DISTINCT FROM TRUE
      OR matricula.gerar_cobranca_futura IS DISTINCT FROM TRUE
      OR matricula.sincronizar_asaas IS DISTINCT FROM FALSE
    );

  IF v_matriculas_invalidas <> 0 THEN
    RAISE EXCEPTION
      'Validação do ciclo técnico falhou em % matrícula(s).',
      v_matriculas_invalidas;
  END IF;

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
     OR v_receivables_fingerprint <> v_guard.receivables_fingerprint THEN
    RAISE EXCEPTION
      'A migration financeira técnica alterou contas a receber ou identidades de gateway.';
  END IF;
END;
$$;

COMMIT;
