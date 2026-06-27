-- Cursos tecnicos: matricula isolada, ciclos de 11 mensalidades e rematricula por aluno.

ALTER TABLE public.matriculas
  ADD COLUMN IF NOT EXISTS valor_matricula_individual NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS valor_rematricula_individual NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS valor_parcela_individual NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS dia_vencimento_individual INTEGER,
  ADD COLUMN IF NOT EXISTS data_primeiro_vencimento_financeiro DATE;

ALTER TABLE public.turmas
  ALTER COLUMN qtd_parcelas SET DEFAULT 11;

ALTER TABLE public.turmas
  ADD COLUMN IF NOT EXISTS aplicar_desconto_matricula BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS aplicar_multa_juros_matricula BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS aplicar_desconto_mensalidade BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS aplicar_multa_juros_mensalidade BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS aplicar_desconto_rematricula BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS aplicar_multa_juros_rematricula BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE public.turmas
SET qtd_parcelas = 11
WHERE qtd_parcelas = 22;

CREATE OR REPLACE FUNCTION public.gerar_cobranca_matricula(
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
  v_item JSONB;
  v_conta public.contas_receber%ROWTYPE;
  v_origem_id TEXT;
  v_descricao TEXT;
  v_valor NUMERIC;
  v_vencimento DATE;
BEGIN
  SELECT * INTO v_matricula
  FROM public.matriculas
  WHERE id = p_matricula_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Matricula nao encontrada.';
  END IF;

  SELECT * INTO v_turma
  FROM public.turmas
  WHERE id = v_matricula.turma_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turma nao encontrada para a matricula.';
  END IF;

  SELECT item INTO v_item
  FROM jsonb_array_elements(COALESCE(v_turma.cronograma_financeiro, '[]'::JSONB)) AS item
  WHERE UPPER(COALESCE(item->>'tipo', '')) = 'MATRICULA'
  LIMIT 1;

  SELECT origem_cronograma_id INTO v_origem_id
  FROM public.contas_receber
  WHERE matricula_id = p_matricula_id
    AND tipo_lancamento = 'MATRICULA'
  ORDER BY created_at
  LIMIT 1;

  v_origem_id := COALESCE(NULLIF(v_origem_id, ''), 'matricula');
  v_descricao := COALESCE(NULLIF(v_item->>'label', ''), 'Matricula Inicial');
  v_valor := COALESCE(
    v_matricula.valor_matricula_individual,
    NULLIF(v_item->>'valor', '')::NUMERIC,
    v_turma.valor_matricula,
    0
  );
  v_vencimento := COALESCE(
    v_matricula.data_primeiro_vencimento_financeiro,
    NULLIF(v_item->>'dataVencimento', '')::DATE,
    v_matricula.data_matricula::DATE,
    CURRENT_DATE
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
    v_descricao || ' - ' || v_turma.nome,
    v_valor,
    v_vencimento,
    CASE WHEN v_vencimento < CURRENT_DATE THEN 'VENCIDO' ELSE 'PENDENTE' END,
    'MENSALIDADE',
    v_matricula.aluno_id,
    v_matricula.id,
    v_matricula.turma_id,
    'MATRICULA',
    0,
    v_origem_id
  )
  ON CONFLICT (matricula_id, origem_cronograma_id)
    WHERE matricula_id IS NOT NULL AND origem_cronograma_id IS NOT NULL
  DO UPDATE SET
    polo_id = EXCLUDED.polo_id,
    cliente_id = EXCLUDED.cliente_id,
    turma_id = EXCLUDED.turma_id,
    valor = CASE
      WHEN public.contas_receber.status = 'PAGO' THEN public.contas_receber.valor
      ELSE EXCLUDED.valor
    END,
    data_vencimento = CASE
      WHEN public.contas_receber.status = 'PAGO' THEN public.contas_receber.data_vencimento
      ELSE EXCLUDED.data_vencimento
    END,
    status = CASE
      WHEN public.contas_receber.status = 'PAGO' THEN public.contas_receber.status
      ELSE EXCLUDED.status
    END
  RETURNING * INTO v_conta;

  RETURN v_conta;
END;
$$;

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
  v_total_parcelas INTEGER;
  v_ciclo INTEGER;
  v_base_date DATE;
  v_dia INTEGER;
  v_valor NUMERIC;
  v_vencimento DATE;
  v_numero INTEGER;
  v_inseridas INTEGER := 0;
  v_row_count INTEGER;
BEGIN
  SELECT * INTO v_matricula
  FROM public.matriculas
  WHERE id = p_matricula_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Matricula nao encontrada.';
  END IF;

  SELECT * INTO v_turma
  FROM public.turmas
  WHERE id = v_matricula.turma_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turma nao encontrada para a matricula.';
  END IF;

  SELECT modalidade INTO v_modalidade
  FROM public.cursos
  WHERE id = v_turma.curso_id;

  IF v_modalidade = 'EAD' THEN
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

  SELECT COALESCE(MAX((regexp_match(origem_cronograma_id, '^ciclo-([0-9]+)-parc-'))[1]::INTEGER), 0) + 1
    INTO v_ciclo
  FROM public.contas_receber
  WHERE matricula_id = p_matricula_id
    AND tipo_lancamento = 'PARCELA'
    AND origem_cronograma_id ~ '^ciclo-[0-9]+-parc-';

  SELECT COALESCE(MAX(COALESCE(data_pagamento, data_vencimento)), v_matricula.data_matricula::DATE, CURRENT_DATE)
    INTO v_base_date
  FROM public.contas_receber
  WHERE matricula_id = p_matricula_id
    AND tipo_lancamento IN ('MATRICULA', 'REMATRICULA')
    AND status = 'PAGO';

  v_total_parcelas := GREATEST(COALESCE(v_turma.qtd_parcelas, 11), 1);
  v_dia := COALESCE(v_matricula.dia_vencimento_individual, v_turma.dia_vencimento_padrao, 10);
  v_valor := COALESCE(v_matricula.valor_parcela_individual, v_turma.valor_parcela, 0);

  FOR v_numero IN 1..v_total_parcelas
  LOOP
    v_vencimento := public.data_vencimento_mensal(v_base_date, v_dia, v_numero);

    INSERT INTO public.contas_receber (
      polo_id, descricao, valor, data_vencimento, status, categoria,
      cliente_id, matricula_id, turma_id, tipo_lancamento,
      parcela_numero, origem_cronograma_id
    ) VALUES (
      v_turma.polo_id,
      'Mensalidade ' || v_numero || '/' || v_total_parcelas || ' - Ciclo ' || v_ciclo || ' - ' || v_turma.nome,
      v_valor,
      v_vencimento,
      CASE WHEN v_vencimento < CURRENT_DATE THEN 'VENCIDO' ELSE 'PENDENTE' END,
      'MENSALIDADE',
      v_matricula.aluno_id,
      v_matricula.id,
      v_matricula.turma_id,
      'PARCELA',
      v_numero,
      'ciclo-' || v_ciclo || '-parc-' || v_numero
    )
    ON CONFLICT (matricula_id, origem_cronograma_id)
      WHERE matricula_id IS NOT NULL AND origem_cronograma_id IS NOT NULL
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
  v_total_parcelas INTEGER;
  v_ciclo INTEGER;
  v_total_ciclo INTEGER;
  v_pagas_ciclo INTEGER;
  v_base_date DATE;
  v_dia INTEGER;
  v_valor NUMERIC;
  v_vencimento DATE;
BEGIN
  SELECT * INTO v_matricula
  FROM public.matriculas
  WHERE id = p_matricula_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Matricula nao encontrada.';
  END IF;

  SELECT * INTO v_turma
  FROM public.turmas
  WHERE id = v_matricula.turma_id;

  SELECT modalidade INTO v_modalidade
  FROM public.cursos
  WHERE id = v_turma.curso_id;

  IF v_modalidade = 'EAD' THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(MAX((regexp_match(origem_cronograma_id, '^ciclo-([0-9]+)-parc-'))[1]::INTEGER), 0)
    INTO v_ciclo
  FROM public.contas_receber
  WHERE matricula_id = p_matricula_id
    AND tipo_lancamento = 'PARCELA'
    AND origem_cronograma_id ~ '^ciclo-[0-9]+-parc-';

  IF v_ciclo = 0 THEN
    RETURN NULL;
  END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'PAGO'),
    MAX(data_vencimento)
    INTO v_total_ciclo, v_pagas_ciclo, v_base_date
  FROM public.contas_receber
  WHERE matricula_id = p_matricula_id
    AND tipo_lancamento = 'PARCELA'
    AND origem_cronograma_id LIKE 'ciclo-' || v_ciclo || '-parc-%';

  v_total_parcelas := GREATEST(COALESCE(v_turma.qtd_parcelas, 11), 1);

  IF v_total_ciclo < v_total_parcelas OR v_pagas_ciclo < v_total_parcelas THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.contas_receber
    WHERE matricula_id = p_matricula_id
      AND origem_cronograma_id = 'ciclo-' || v_ciclo || '-rematricula'
  ) THEN
    RETURN NULL;
  END IF;

  v_dia := COALESCE(v_matricula.dia_vencimento_individual, v_turma.dia_vencimento_padrao, 10);
  v_valor := COALESCE(v_matricula.valor_rematricula_individual, v_turma.valor_rematricula, 0);
  v_vencimento := public.data_vencimento_mensal(COALESCE(v_base_date, CURRENT_DATE), v_dia, 1);

  INSERT INTO public.contas_receber (
    polo_id, descricao, valor, data_vencimento, status, categoria,
    cliente_id, matricula_id, turma_id, tipo_lancamento,
    parcela_numero, origem_cronograma_id
  ) VALUES (
    v_turma.polo_id,
    'Rematricula - Ciclo ' || v_ciclo || ' - ' || v_turma.nome,
    v_valor,
    v_vencimento,
    CASE WHEN v_vencimento < CURRENT_DATE THEN 'VENCIDO' ELSE 'PENDENTE' END,
    'MENSALIDADE',
    v_matricula.aluno_id,
    v_matricula.id,
    v_matricula.turma_id,
    'REMATRICULA',
    0,
    'ciclo-' || v_ciclo || '-rematricula'
  )
  RETURNING * INTO v_conta;

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
    SELECT c.modalidade
      INTO v_modalidade
      FROM public.matriculas m
      JOIN public.turmas t ON t.id = m.turma_id
      JOIN public.cursos c ON c.id = t.curso_id
     WHERE m.id = NEW.matricula_id;

    IF v_modalidade IS DISTINCT FROM 'EAD' THEN
      IF NEW.tipo_lancamento IN ('MATRICULA', 'REMATRICULA') THEN
        PERFORM public.gerar_parcelas_matricula(NEW.matricula_id);
      ELSIF NEW.tipo_lancamento = 'PARCELA' THEN
        PERFORM public.gerar_rematricula_apos_parcelas(NEW.matricula_id);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gerar_parcelas_apos_baixa_matricula_trigger
  ON public.contas_receber;

DROP TRIGGER IF EXISTS gerar_ciclo_financeiro_apos_pagamento_trigger
  ON public.contas_receber;

CREATE TRIGGER gerar_ciclo_financeiro_apos_pagamento_trigger
AFTER UPDATE OF status ON public.contas_receber
FOR EACH ROW
EXECUTE FUNCTION public.gerar_ciclo_financeiro_apos_pagamento();

CREATE OR REPLACE FUNCTION public.matricular_aluno_turma_financeiro(
  p_aluno_id UUID,
  p_turma_id UUID,
  p_responsavel_id UUID DEFAULT NULL,
  p_valor_matricula NUMERIC DEFAULT NULL,
  p_data_vencimento_matricula DATE DEFAULT NULL,
  p_valor_parcela NUMERIC DEFAULT NULL,
  p_valor_rematricula NUMERIC DEFAULT NULL,
  p_dia_vencimento INTEGER DEFAULT NULL
)
RETURNS public.matriculas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matricula public.matriculas%ROWTYPE;
BEGIN
  INSERT INTO public.matriculas (
    aluno_id,
    turma_id,
    status,
    valor_matricula_individual,
    valor_rematricula_individual,
    valor_parcela_individual,
    dia_vencimento_individual,
    data_primeiro_vencimento_financeiro
  )
  VALUES (
    p_aluno_id,
    p_turma_id,
    'ATIVO',
    p_valor_matricula,
    p_valor_rematricula,
    p_valor_parcela,
    p_dia_vencimento,
    COALESCE(p_data_vencimento_matricula, CURRENT_DATE)
  )
  ON CONFLICT (aluno_id, turma_id) DO UPDATE
    SET status = 'ATIVO',
        valor_matricula_individual = EXCLUDED.valor_matricula_individual,
        valor_rematricula_individual = EXCLUDED.valor_rematricula_individual,
        valor_parcela_individual = EXCLUDED.valor_parcela_individual,
        dia_vencimento_individual = EXCLUDED.dia_vencimento_individual,
        data_primeiro_vencimento_financeiro = EXCLUDED.data_primeiro_vencimento_financeiro
  RETURNING * INTO v_matricula;

  PERFORM public.gerar_cobranca_matricula(v_matricula.id);

  INSERT INTO public.matricula_movimentacoes (
    matricula_id, aluno_id, tipo, status_anterior, status_novo,
    turma_destino_id, motivo, responsavel_id
  ) VALUES (
    v_matricula.id, v_matricula.aluno_id, 'MATRICULA', NULL, 'ATIVO',
    v_matricula.turma_id, 'Matricula realizada na turma com financeiro individual.', p_responsavel_id
  );

  RETURN v_matricula;
END;
$$;

GRANT EXECUTE ON FUNCTION public.gerar_cobranca_matricula(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gerar_parcelas_matricula(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gerar_rematricula_apos_parcelas(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.matricular_aluno_turma_financeiro(UUID, UUID, UUID, NUMERIC, DATE, NUMERIC, NUMERIC, INTEGER) TO anon, authenticated, service_role;
