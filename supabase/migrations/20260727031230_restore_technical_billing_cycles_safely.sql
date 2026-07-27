-- Restaura o ciclo financeiro exclusivo dos cursos tecnicos:
-- matricula paga -> 12 parcelas -> rematricula -> 12 parcelas.
--
-- A automacao permanece bloqueada ate a conclusao do levantamento financeiro
-- do sistema anterior. Esta migration nao cria, altera nem quita recebiveis.

UPDATE public.turmas AS turma
SET
  gerar_cobrancas_futuras = FALSE,
  sincronizar_asaas_futuro = FALSE
FROM public.cursos AS curso
WHERE curso.id = turma.curso_id
  AND UPPER(COALESCE(curso.modalidade, '')) = 'TECNICO';

UPDATE public.matriculas AS matricula
SET
  gerar_cobranca_inicial = FALSE,
  gerar_cobranca_futura = FALSE,
  sincronizar_asaas = FALSE
FROM public.turmas AS turma
JOIN public.cursos AS curso
  ON curso.id = turma.curso_id
WHERE turma.id = matricula.turma_id
  AND UPPER(COALESCE(curso.modalidade, '')) = 'TECNICO';

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
  v_parcelas_por_ciclo CONSTANT INTEGER := 12;
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
  v_parcelas_por_ciclo CONSTANT INTEGER := 12;
  v_total_ciclo INTEGER;
  v_pagas_ciclo INTEGER;
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
    MAX(COALESCE(data_pagamento, data_vencimento))
      FILTER (WHERE status = 'PAGO')
  INTO
    v_total_ciclo,
    v_pagas_ciclo,
    v_base_date
  FROM public.contas_receber
  WHERE matricula_id = p_matricula_id
    AND tipo_lancamento = 'PARCELA'
    AND origem_cronograma_id LIKE
      'ciclo-' || v_ciclo || '-parc-%';

  IF v_total_ciclo <> v_parcelas_por_ciclo
     OR v_pagas_ciclo <> v_parcelas_por_ciclo
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

CREATE OR REPLACE FUNCTION public.gerar_ciclo_financeiro_apos_pagamento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_modalidade TEXT;
BEGIN
  IF NEW.status = 'PAGO'
     AND OLD.status IS DISTINCT FROM 'PAGO'
     AND NEW.matricula_id IS NOT NULL THEN
    SELECT UPPER(COALESCE(curso.modalidade, ''))
    INTO v_modalidade
    FROM public.matriculas AS matricula
    JOIN public.turmas AS turma
      ON turma.id = matricula.turma_id
    JOIN public.cursos AS curso
      ON curso.id = turma.curso_id
    WHERE matricula.id = NEW.matricula_id;

    IF v_modalidade = 'TECNICO' THEN
      IF NEW.tipo_lancamento IN ('MATRICULA', 'REMATRICULA') THEN
        PERFORM public.gerar_parcelas_matricula(NEW.matricula_id);
      ELSIF NEW.tipo_lancamento = 'PARCELA' THEN
        PERFORM public.gerar_rematricula_apos_parcelas(
          NEW.matricula_id
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.gerar_parcelas_matricula(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gerar_rematricula_apos_parcelas(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gerar_ciclo_financeiro_apos_pagamento()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.gerar_parcelas_matricula(UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.gerar_rematricula_apos_parcelas(UUID)
  TO service_role;

COMMENT ON FUNCTION public.gerar_parcelas_matricula(UUID) IS
  'Curso tecnico: gera exatamente 12 parcelas do proximo ciclo somente depois da matricula ou rematricula paga e com automacao financeira explicitamente habilitada.';
COMMENT ON FUNCTION public.gerar_rematricula_apos_parcelas(UUID) IS
  'Curso tecnico: gera uma rematricula somente depois das 12 parcelas do ciclo estarem pagas e com automacao financeira explicitamente habilitada.';
COMMENT ON FUNCTION public.gerar_ciclo_financeiro_apos_pagamento() IS
  'Encadeia exclusivamente o ciclo financeiro tecnico; a automacao permanece condicionada aos flags da turma e da matricula.';
