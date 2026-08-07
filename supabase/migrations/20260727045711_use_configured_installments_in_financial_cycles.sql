-- O tamanho de cada ciclo financeiro pertence à configuração da turma.
--
-- Esta migration apenas substitui as funções do ciclo técnico. Ela não ativa
-- as flags financeiras e não cria, altera ou quita recebíveis existentes.

CREATE OR REPLACE FUNCTION public.gerar_parcelas_matricula(
  p_matricula_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matricula public.matriculas%ROWTYPE;
  v_turma public.turmas%ROWTYPE;
  v_modalidade TEXT;
  v_flags RECORD;
  v_ultimo_ciclo INTEGER;
  v_novo_ciclo INTEGER;
  v_parcelas_por_ciclo INTEGER;
  v_base_date DATE;
  v_dia INTEGER;
  v_valor NUMERIC;
  v_vencimento DATE;
  v_numero INTEGER;
  v_inseridas INTEGER := 0;
  v_row_count INTEGER;
BEGIN
  SELECT *
  INTO v_matricula
  FROM public.matriculas
  WHERE id = p_matricula_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Matricula nao encontrada.';
  END IF;

  SELECT *
  INTO v_turma
  FROM public.turmas
  WHERE id = v_matricula.turma_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turma nao encontrada para a matricula.';
  END IF;

  SELECT UPPER(COALESCE(modalidade, ''))
  INTO v_modalidade
  FROM public.cursos
  WHERE id = v_turma.curso_id;

  IF v_modalidade <> 'TECNICO' THEN
    RETURN 0;
  END IF;

  SELECT *
  INTO v_flags
  FROM public.resolver_flags_financeiras_turma_matricula(p_matricula_id);

  IF NOT FOUND OR v_flags.gerar_cobranca_futura IS DISTINCT FROM TRUE THEN
    RETURN 0;
  END IF;

  v_parcelas_por_ciclo := v_turma.qtd_parcelas;

  IF v_parcelas_por_ciclo IS NULL
     OR v_parcelas_por_ciclo NOT BETWEEN 1 AND 60 THEN
    RETURN 0;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.contas_receber
    WHERE matricula_id = p_matricula_id
      AND tipo_lancamento IN ('PARCELA', 'REMATRICULA')
      AND status <> 'PAGO'
  ) THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(
    MAX(
      (regexp_match(
        origem_cronograma_id,
        '^ciclo-([0-9]+)-parc-[0-9]+$'
      ))[1]::INTEGER
    ),
    0
  )
  INTO v_ultimo_ciclo
  FROM public.contas_receber
  WHERE matricula_id = p_matricula_id
    AND tipo_lancamento = 'PARCELA'
    AND origem_cronograma_id ~ '^ciclo-[0-9]+-parc-[0-9]+$';

  IF v_ultimo_ciclo = 0 THEN
    SELECT MAX(COALESCE(data_pagamento, data_vencimento))
    INTO v_base_date
    FROM public.contas_receber
    WHERE matricula_id = p_matricula_id
      AND tipo_lancamento = 'MATRICULA'
      AND status = 'PAGO';

    IF v_base_date IS NULL THEN
      RETURN 0;
    END IF;
  ELSE
    SELECT MAX(COALESCE(data_pagamento, data_vencimento))
    INTO v_base_date
    FROM public.contas_receber
    WHERE matricula_id = p_matricula_id
      AND tipo_lancamento = 'REMATRICULA'
      AND origem_cronograma_id =
        'ciclo-' || v_ultimo_ciclo || '-rematricula'
      AND status = 'PAGO';

    IF v_base_date IS NULL THEN
      RETURN 0;
    END IF;
  END IF;

  v_novo_ciclo := v_ultimo_ciclo + 1;
  v_dia := COALESCE(
    v_matricula.dia_vencimento_individual,
    v_turma.dia_vencimento_padrao,
    10
  );
  v_valor := COALESCE(
    v_matricula.valor_parcela_individual,
    v_turma.valor_parcela,
    0
  );

  IF v_valor <= 0 THEN
    RETURN 0;
  END IF;

  FOR v_numero IN 1..v_parcelas_por_ciclo
  LOOP
    v_vencimento := public.data_vencimento_mensal(
      v_base_date,
      v_dia,
      v_numero
    );

    INSERT INTO public.contas_receber (
      polo_id,
      descricao,
      valor,
      data_vencimento,
      status,
      categoria,
      cliente_id,
      matricula_id,
      turma_id,
      tipo_lancamento,
      parcela_numero,
      origem_cronograma_id
    ) VALUES (
      v_turma.polo_id,
      'Mensalidade ' || v_numero || '/' || v_parcelas_por_ciclo
        || ' - Ciclo ' || v_novo_ciclo || ' - ' || v_turma.nome,
      v_valor,
      v_vencimento,
      CASE
        WHEN v_vencimento < CURRENT_DATE THEN 'VENCIDO'
        ELSE 'PENDENTE'
      END,
      'MENSALIDADE',
      v_matricula.aluno_id,
      v_matricula.id,
      v_matricula.turma_id,
      'PARCELA',
      v_numero,
      'ciclo-' || v_novo_ciclo || '-parc-' || v_numero
    )
    ON CONFLICT (matricula_id, origem_cronograma_id)
      WHERE matricula_id IS NOT NULL
        AND origem_cronograma_id IS NOT NULL
    DO NOTHING;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_inseridas := v_inseridas + v_row_count;
  END LOOP;

  RETURN v_inseridas;
END;
$$;

CREATE OR REPLACE FUNCTION public.gerar_rematricula_apos_parcelas(
  p_matricula_id UUID
)
RETURNS public.contas_receber
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matricula public.matriculas%ROWTYPE;
  v_turma public.turmas%ROWTYPE;
  v_conta public.contas_receber%ROWTYPE;
  v_modalidade TEXT;
  v_flags RECORD;
  v_ciclo INTEGER;
  v_total_ciclo INTEGER;
  v_pagas_ciclo INTEGER;
  v_numeros_distintos INTEGER;
  v_primeiro_numero INTEGER;
  v_ultimo_numero INTEGER;
  v_base_date DATE;
  v_dia INTEGER;
  v_valor NUMERIC;
  v_vencimento DATE;
BEGIN
  SELECT *
  INTO v_matricula
  FROM public.matriculas
  WHERE id = p_matricula_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Matricula nao encontrada.';
  END IF;

  SELECT *
  INTO v_turma
  FROM public.turmas
  WHERE id = v_matricula.turma_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turma nao encontrada para a matricula.';
  END IF;

  SELECT UPPER(COALESCE(modalidade, ''))
  INTO v_modalidade
  FROM public.cursos
  WHERE id = v_turma.curso_id;

  IF v_modalidade <> 'TECNICO' THEN
    RETURN NULL;
  END IF;

  SELECT *
  INTO v_flags
  FROM public.resolver_flags_financeiras_turma_matricula(p_matricula_id);

  IF NOT FOUND OR v_flags.gerar_cobranca_futura IS DISTINCT FROM TRUE THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(
    MAX(
      (regexp_match(
        origem_cronograma_id,
        '^ciclo-([0-9]+)-parc-[0-9]+$'
      ))[1]::INTEGER
    ),
    0
  )
  INTO v_ciclo
  FROM public.contas_receber
  WHERE matricula_id = p_matricula_id
    AND tipo_lancamento = 'PARCELA'
    AND origem_cronograma_id ~ '^ciclo-[0-9]+-parc-[0-9]+$';

  IF v_ciclo = 0 THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.contas_receber
    WHERE matricula_id = p_matricula_id
      AND tipo_lancamento = 'REMATRICULA'
      AND origem_cronograma_id = 'ciclo-' || v_ciclo || '-rematricula'
  ) THEN
    RETURN NULL;
  END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'PAGO'),
    COUNT(DISTINCT parcela_numero),
    MIN(parcela_numero),
    MAX(parcela_numero),
    MAX(COALESCE(data_pagamento, data_vencimento))
      FILTER (WHERE status = 'PAGO')
  INTO
    v_total_ciclo,
    v_pagas_ciclo,
    v_numeros_distintos,
    v_primeiro_numero,
    v_ultimo_numero,
    v_base_date
  FROM public.contas_receber
  WHERE matricula_id = p_matricula_id
    AND tipo_lancamento = 'PARCELA'
    AND origem_cronograma_id LIKE
      'ciclo-' || v_ciclo || '-parc-%';

  -- A quantidade foi registrada quando o ciclo foi emitido. Usar o próprio
  -- ciclo evita que uma alteração posterior na turma antecipe ou bloqueie a
  -- rematrícula de cobranças que já existiam.
  IF v_total_ciclo <= 0
     OR v_pagas_ciclo <> v_total_ciclo
     OR v_numeros_distintos <> v_total_ciclo
     OR v_primeiro_numero <> 1
     OR v_ultimo_numero <> v_total_ciclo
     OR v_base_date IS NULL THEN
    RETURN NULL;
  END IF;

  v_dia := COALESCE(
    v_matricula.dia_vencimento_individual,
    v_turma.dia_vencimento_padrao,
    10
  );
  v_valor := COALESCE(
    v_matricula.valor_rematricula_individual,
    v_turma.valor_rematricula,
    0
  );

  IF v_valor <= 0 THEN
    RETURN NULL;
  END IF;

  v_vencimento := public.data_vencimento_mensal(
    v_base_date,
    v_dia,
    1
  );

  INSERT INTO public.contas_receber (
    polo_id,
    descricao,
    valor,
    data_vencimento,
    status,
    categoria,
    cliente_id,
    matricula_id,
    turma_id,
    tipo_lancamento,
    parcela_numero,
    origem_cronograma_id
  ) VALUES (
    v_turma.polo_id,
    'Rematricula - Ciclo ' || v_ciclo || ' - ' || v_turma.nome,
    v_valor,
    v_vencimento,
    CASE
      WHEN v_vencimento < CURRENT_DATE THEN 'VENCIDO'
      ELSE 'PENDENTE'
    END,
    'MENSALIDADE',
    v_matricula.aluno_id,
    v_matricula.id,
    v_matricula.turma_id,
    'REMATRICULA',
    0,
    'ciclo-' || v_ciclo || '-rematricula'
  )
  ON CONFLICT (matricula_id, origem_cronograma_id)
    WHERE matricula_id IS NOT NULL
      AND origem_cronograma_id IS NOT NULL
  DO NOTHING
  RETURNING *
  INTO v_conta;

  RETURN v_conta;
END;
$$;

REVOKE ALL ON FUNCTION public.gerar_parcelas_matricula(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gerar_rematricula_apos_parcelas(UUID)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.gerar_parcelas_matricula(UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.gerar_rematricula_apos_parcelas(UUID)
  TO service_role;

COMMENT ON FUNCTION public.gerar_parcelas_matricula(UUID)
IS 'Gera o próximo ciclo técnico com a quantidade configurada em turmas.qtd_parcelas; permanece protegido pelas flags financeiras.';

COMMENT ON FUNCTION public.gerar_rematricula_apos_parcelas(UUID)
IS 'Gera a rematrícula apenas quando todas as parcelas contíguas do ciclo técnico emitido estiverem pagas.';
