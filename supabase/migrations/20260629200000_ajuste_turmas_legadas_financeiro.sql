-- Ajuste de turmas legadas com controle financeiro orientado a legado/importadas

CREATE TABLE IF NOT EXISTS public.historico_turma_financeira (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  turma_id UUID NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  matricula_id UUID REFERENCES public.matriculas(id) ON DELETE CASCADE,
  evento TEXT NOT NULL,
  regra JSONB,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS historico_turma_financeira_turma_idx
  ON public.historico_turma_financeira (turma_id, created_at DESC);
CREATE INDEX IF NOT EXISTS historico_turma_financeira_matricula_idx
  ON public.historico_turma_financeira (matricula_id, created_at DESC);

ALTER TABLE public.turmas
  ADD COLUMN IF NOT EXISTS origem_financeira TEXT,
  ADD COLUMN IF NOT EXISTS financeiro_herdado BOOLEAN,
  ADD COLUMN IF NOT EXISTS gerar_cobrancas_futuras BOOLEAN,
  ADD COLUMN IF NOT EXISTS sincronizar_asaas_futuro BOOLEAN,
  ADD COLUMN IF NOT EXISTS obs_financeira_origem TEXT;

ALTER TABLE public.matriculas
  ADD COLUMN IF NOT EXISTS financeiro_herdado BOOLEAN,
  ADD COLUMN IF NOT EXISTS gerar_cobranca_inicial BOOLEAN,
  ADD COLUMN IF NOT EXISTS gerar_cobranca_futura BOOLEAN,
  ADD COLUMN IF NOT EXISTS sincronizar_asaas BOOLEAN;

UPDATE public.turmas
SET
  origem_financeira = COALESCE(origem_financeira, 'NORMAL'),
  financeiro_herdado = COALESCE(financeiro_herdado, FALSE),
  gerar_cobrancas_futuras = COALESCE(gerar_cobrancas_futuras, TRUE),
  sincronizar_asaas_futuro = COALESCE(sincronizar_asaas_futuro, TRUE)
WHERE
  origem_financeira IS NULL
  OR financeiro_herdado IS NULL
  OR gerar_cobrancas_futuras IS NULL
  OR sincronizar_asaas_futuro IS NULL;

UPDATE public.matriculas
SET
  financeiro_herdado = COALESCE(financeiro_herdado, FALSE),
  gerar_cobranca_inicial = COALESCE(gerar_cobranca_inicial, TRUE),
  gerar_cobranca_futura = gerar_cobranca_futura,
  sincronizar_asaas = sincronizar_asaas
WHERE
  financeiro_herdado IS NULL
  OR gerar_cobranca_inicial IS NULL;

ALTER TABLE public.turmas
  ALTER COLUMN origem_financeira SET DEFAULT 'NORMAL',
  ALTER COLUMN origem_financeira SET NOT NULL,
  ALTER COLUMN financeiro_herdado SET DEFAULT FALSE,
  ALTER COLUMN financeiro_herdado SET NOT NULL,
  ALTER COLUMN gerar_cobrancas_futuras SET DEFAULT TRUE,
  ALTER COLUMN gerar_cobrancas_futuras SET NOT NULL,
  ALTER COLUMN sincronizar_asaas_futuro SET DEFAULT TRUE,
  ALTER COLUMN sincronizar_asaas_futuro SET NOT NULL;

ALTER TABLE public.matriculas
  ALTER COLUMN financeiro_herdado SET DEFAULT FALSE,
  ALTER COLUMN financeiro_herdado SET NOT NULL,
  ALTER COLUMN gerar_cobranca_inicial SET DEFAULT TRUE,
  ALTER COLUMN gerar_cobranca_inicial SET NOT NULL,
  ALTER COLUMN gerar_cobranca_futura DROP DEFAULT,
  ALTER COLUMN sincronizar_asaas DROP DEFAULT;

ALTER TABLE public.turmas
  DROP CONSTRAINT IF EXISTS turmas_origem_financeira_check;

ALTER TABLE public.turmas
  ADD CONSTRAINT turmas_origem_financeira_check
    CHECK (origem_financeira IN ('NORMAL', 'LEGADO'));

CREATE OR REPLACE FUNCTION public.registrar_turma_financeiro_auditoria(
  p_matricula_id UUID,
  p_evento TEXT,
  p_regra JSONB DEFAULT NULL,
  p_observacao TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_turma_id UUID;
BEGIN
  SELECT turma_id INTO v_turma_id
  FROM public.matriculas
  WHERE id = p_matricula_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  INSERT INTO public.historico_turma_financeira (
    turma_id,
    matricula_id,
    evento,
    regra,
    observacao
  ) VALUES (
    v_turma_id,
    p_matricula_id,
    p_evento,
    p_regra,
    p_observacao
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.resolver_flags_financeiras_turma_matricula(p_matricula_id UUID)
RETURNS TABLE (
  turma_id UUID,
  origem_financeira TEXT,
  financeiro_herdado BOOLEAN,
  gerar_cobranca_inicial BOOLEAN,
  gerar_cobranca_futura BOOLEAN,
  sincronizar_asaas BOOLEAN
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id AS turma_id,
    COALESCE(t.origem_financeira, 'NORMAL') AS origem_financeira,
    COALESCE(m.financeiro_herdado, t.financeiro_herdado, FALSE) AS financeiro_herdado,
    CASE
      WHEN m.gerar_cobranca_inicial IS NOT NULL THEN m.gerar_cobranca_inicial
      WHEN COALESCE(t.origem_financeira, 'NORMAL') = 'LEGADO' THEN FALSE
      ELSE TRUE
    END AS gerar_cobranca_inicial,
    COALESCE(m.gerar_cobranca_futura, t.gerar_cobrancas_futuras, TRUE) AS gerar_cobranca_futura,
    COALESCE(m.sincronizar_asaas, t.sincronizar_asaas_futuro, TRUE) AS sincronizar_asaas
  FROM public.matriculas m
  JOIN public.turmas t ON t.id = m.turma_id
  WHERE m.id = p_matricula_id
$$;

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
  v_flags RECORD;
BEGIN
  SELECT * INTO v_matricula
  FROM public.matriculas
  WHERE id = p_matricula_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Matrícula não encontrada.';
  END IF;

  SELECT * INTO v_flags
  FROM public.resolver_flags_financeiras_turma_matricula(p_matricula_id);

  IF v_flags.gerar_cobranca_inicial = FALSE THEN
    PERFORM public.registrar_turma_financeiro_auditoria(
      p_matricula_id,
      'GERAR_COBRANCA_INICIAL_BLOQUEADA',
      jsonb_build_object('motivo', 'regra', 'configuracao'),
      'Cobrança inicial bloqueada por configuração da turma/matrícula.'
    );
    RETURN NULL;
  END IF;

  SELECT * INTO v_turma
  FROM public.turmas
  WHERE id = v_matricula.turma_id;

  SELECT item INTO v_item
  FROM jsonb_array_elements(COALESCE(v_turma.cronograma_financeiro, '[]'::JSONB)) AS item
  WHERE UPPER(COALESCE(item->>'tipo', '')) = 'MATRICULA'
  LIMIT 1;

  v_origem_id := COALESCE(NULLIF(v_item->>'id', ''), 'matricula');
  v_descricao := COALESCE(NULLIF(v_item->>'label', ''), 'Matrícula Inicial');
  v_valor := COALESCE(NULLIF(v_item->>'valor', '')::NUMERIC, COALESCE(v_matricula.valor_matricula_individual, v_turma.valor_matricula), 0);
  v_vencimento := COALESCE(
    NULLIF(v_item->>'dataVencimento', '')::DATE,
    COALESCE(NULLIF(v_matricula.data_primeiro_vencimento_financeiro::TEXT, ''), NULL)::DATE,
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
    'PENDENTE',
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
    turma_id = EXCLUDED.turma_id
  RETURNING * INTO v_conta;

  PERFORM public.registrar_turma_financeiro_auditoria(
    p_matricula_id,
    'GERAR_COBRANCA_INICIAL',
    jsonb_build_object('conta_receber_id', v_conta.id),
    'Cobrança inicial gerada para matrícula.'
  );

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
  v_item JSONB;
  v_index INTEGER;
  v_tipo TEXT;
  v_origem_id TEXT;
  v_descricao TEXT;
  v_valor NUMERIC;
  v_vencimento DATE;
  v_numero INTEGER;
  v_inseridas INTEGER := 0;
  v_row_count INTEGER;
  v_flags RECORD;
BEGIN
  SELECT * INTO v_matricula
  FROM public.matriculas
  WHERE id = p_matricula_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Matrícula não encontrada.';
  END IF;

  SELECT * INTO v_flags
  FROM public.resolver_flags_financeiras_turma_matricula(p_matricula_id);

  IF v_flags.gerar_cobranca_futura = FALSE THEN
    PERFORM public.registrar_turma_financeiro_auditoria(
      p_matricula_id,
      'GERAR_PARCELAS_BLOQUEADO',
      jsonb_build_object('motivo', 'regra', 'configuracao'),
      'Geração de parcelas futuras bloqueada por configuração da turma/matrícula.'
    );
    RETURN 0;
  END IF;

  SELECT * INTO v_turma
  FROM public.turmas
  WHERE id = v_matricula.turma_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turma não encontrada para a matrícula.';
  END IF;

  SELECT item INTO v_item
  FROM jsonb_array_elements(COALESCE(v_turma.cronograma_financeiro, '[]'::JSONB)) AS item
  WHERE UPPER(COALESCE(item->>'tipo', '')) <> 'MATRICULA'
  LIMIT 1;

  IF jsonb_array_length(COALESCE(v_turma.cronograma_financeiro, '[]'::JSONB)) > 0 THEN
    FOR v_item, v_index IN
      SELECT item, ordinality::INTEGER
      FROM jsonb_array_elements(v_turma.cronograma_financeiro)
        WITH ORDINALITY AS schedule(item, ordinality)
      WHERE UPPER(COALESCE(item->>'tipo', 'PARCELA')) <> 'MATRICULA'
    LOOP
      v_tipo := CASE UPPER(COALESCE(v_item->>'tipo', 'PARCELA'))
        WHEN 'REMATRICULA' THEN 'REMATRICULA'
        ELSE 'PARCELA'
      END;
      v_numero := COALESCE(NULLIF(v_item->>'numero', '')::INTEGER, v_index - 1);
      v_origem_id := COALESCE(NULLIF(v_item->>'id', ''), LOWER(v_tipo) || '-' || v_numero);
      v_descricao := COALESCE(NULLIF(v_item->>'label', ''), CASE WHEN v_tipo = 'REMATRICULA' THEN 'Rematrícula' ELSE 'Mensalidade ' || v_numero END);
      v_valor := COALESCE(
        NULLIF(v_item->>'valor', '')::NUMERIC,
        CASE WHEN v_tipo = 'REMATRICULA'
          THEN COALESCE(v_matricula.valor_rematricula_individual, v_turma.valor_rematricula)
          ELSE COALESCE(v_matricula.valor_parcela_individual, v_turma.valor_parcela)
        END,
        0
      );
      v_vencimento := COALESCE(
        NULLIF(v_item->>'dataVencimento', '')::DATE,
        public.data_vencimento_mensal(
          v_matricula.data_matricula::DATE,
          COALESCE(v_matricula.dia_vencimento_individual, v_turma.dia_vencimento_padrao, 10),
          GREATEST(v_numero, 1)
        )
      );

      INSERT INTO public.contas_receber (
        polo_id, descricao, valor, data_vencimento, status, categoria,
        cliente_id, matricula_id, turma_id, tipo_lancamento,
        parcela_numero, origem_cronograma_id
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
        v_tipo,
        v_numero,
        v_origem_id
      )
      ON CONFLICT (matricula_id, origem_cronograma_id)
        WHERE matricula_id IS NOT NULL AND origem_cronograma_id IS NOT NULL
      DO NOTHING;

      GET DIAGNOSTICS v_row_count = ROW_COUNT;
      v_inseridas := v_inseridas + v_row_count;
    END LOOP;
  ELSE
    FOR v_numero IN 1..GREATEST(COALESCE(v_turma.qtd_parcelas, 0), 0) LOOP
      v_tipo := CASE WHEN v_numero = 12 THEN 'REMATRICULA' ELSE 'PARCELA' END;
      v_origem_id := CASE
        WHEN v_tipo = 'REMATRICULA' THEN 'rem-' || v_numero
        ELSE 'parc-' || v_numero
      END;
      v_descricao := CASE
        WHEN v_tipo = 'REMATRICULA' THEN 'Rematrícula'
        ELSE 'Mensalidade ' || v_numero || '/' || v_turma.qtd_parcelas
      END;
      v_valor := CASE
        WHEN v_tipo = 'REMATRICULA' THEN COALESCE(v_matricula.valor_rematricula_individual, v_turma.valor_rematricula)
        ELSE COALESCE(v_matricula.valor_parcela_individual, v_turma.valor_parcela)
      END;
      v_vencimento := public.data_vencimento_mensal(
        v_matricula.data_matricula::DATE,
        COALESCE(v_matricula.dia_vencimento_individual, v_turma.dia_vencimento_padrao, 10),
        v_numero
      );

      INSERT INTO public.contas_receber (
        polo_id, descricao, valor, data_vencimento, status, categoria,
        cliente_id, matricula_id, turma_id, tipo_lancamento,
        parcela_numero, origem_cronograma_id
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
        v_tipo,
        v_numero,
        v_origem_id
      )
      ON CONFLICT (matricula_id, origem_cronograma_id)
        WHERE matricula_id IS NOT NULL AND origem_cronograma_id IS NOT NULL
      DO NOTHING;

      GET DIAGNOSTICS v_row_count = ROW_COUNT;
      v_inseridas := v_inseridas + v_row_count;
    END LOOP;
  END IF;

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
  v_flags RECORD;
BEGIN
  SELECT * INTO v_matricula
  FROM public.matriculas
  WHERE id = p_matricula_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Matrícula não encontrada.';
  END IF;

  SELECT * INTO v_flags
  FROM public.resolver_flags_financeiras_turma_matricula(p_matricula_id);

  IF v_flags.gerar_cobranca_futura = FALSE THEN
    PERFORM public.registrar_turma_financeiro_auditoria(
      p_matricula_id,
      'GERAR_REMATRICULA_BLOQUEADO',
      jsonb_build_object('motivo', 'regra', 'configuracao'),
      'Rematrícula bloqueada por configuração da turma/matrícula.'
    );
    RETURN NULL;
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

  SELECT COUNT(*)
    INTO v_total_ciclo
  FROM public.contas_receber
  WHERE matricula_id = p_matricula_id
    AND tipo_lancamento IN ('PARCELA', 'REMATRICULA')
    AND origem_cronograma_id LIKE 'ciclo-%-parc-%';

  SELECT COALESCE(MAX((regexp_match(origem_cronograma_id, '^ciclo-([0-9]+)-rematricula$'))[1]::INTEGER), 0) + 1
    INTO v_ciclo
  FROM public.contas_receber
  WHERE matricula_id = p_matricula_id
    AND tipo_lancamento = 'REMATRICULA'
    AND origem_cronograma_id LIKE 'ciclo-%-rematricula';

  SELECT COALESCE(MAX((regexp_match(origem_cronograma_id, '^ciclo-[0-9]+-parc-([0-9]+)$'))[1]::INTEGER), 0)
    INTO v_total_parcelas
  FROM public.contas_receber
  WHERE matricula_id = p_matricula_id
    AND tipo_lancamento = 'PARCELA'
    AND origem_cronograma_id LIKE 'ciclo-%-parc-%';

  SELECT COALESCE(MAX((regexp_match(origem_cronograma_id, '^ciclo-[0-9]+-parc-([0-9]+)$'))[1]::INTEGER), 0)
    INTO v_pagas_ciclo
  FROM public.contas_receber
  WHERE matricula_id = p_matricula_id
    AND status = 'PAGO'
    AND tipo_lancamento = 'PARCELA';

  IF v_pagas_ciclo < v_total_parcelas THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(MAX(COALESCE(data_pagamento, data_vencimento)), v_matricula.data_matricula::DATE, CURRENT_DATE)
    INTO v_base_date
  FROM public.contas_receber
  WHERE matricula_id = p_matricula_id
    AND tipo_lancamento IN ('MATRICULA', 'REMATRICULA')
    AND status = 'PAGO';

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

  PERFORM public.gerar_ciclo_financeiro_apos_pagamento();

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
  p_dia_vencimento INTEGER DEFAULT NULL,
  p_gerar_cobranca_inicial BOOLEAN DEFAULT NULL,
  p_gerar_cobranca_futura BOOLEAN DEFAULT NULL,
  p_sincronizar_asaas BOOLEAN DEFAULT NULL
)
RETURNS public.matriculas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matricula public.matriculas%ROWTYPE;
  v_turma public.turmas%ROWTYPE;
  v_gerar_cobranca_inicial BOOLEAN;
  v_gerar_cobranca_futura BOOLEAN;
  v_sincronizar_asaas BOOLEAN;
BEGIN
  SELECT * INTO v_turma
  FROM public.turmas
  WHERE id = p_turma_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turma não encontrada.';
  END IF;

  v_gerar_cobranca_inicial := COALESCE(
    p_gerar_cobranca_inicial,
    CASE
      WHEN v_turma.origem_financeira = 'LEGADO' OR v_turma.financeiro_herdado THEN FALSE
      ELSE TRUE
    END
  );
  v_gerar_cobranca_futura := COALESCE(p_gerar_cobranca_futura, v_turma.gerar_cobrancas_futuras, TRUE);
  v_sincronizar_asaas := COALESCE(p_sincronizar_asaas, v_turma.sincronizar_asaas_futuro, TRUE);

  INSERT INTO public.matriculas (
    aluno_id,
    turma_id,
    status,
    valor_matricula_individual,
    valor_rematricula_individual,
    valor_parcela_individual,
    dia_vencimento_individual,
    data_primeiro_vencimento_financeiro,
    financeiro_herdado,
    gerar_cobranca_inicial,
    gerar_cobranca_futura,
    sincronizar_asaas
  )
  VALUES (
    p_aluno_id,
    p_turma_id,
    'ATIVO',
    p_valor_matricula,
    p_valor_rematricula,
    p_valor_parcela,
    p_dia_vencimento,
    COALESCE(p_data_vencimento_matricula, CURRENT_DATE),
    v_turma.financeiro_herdado,
    v_gerar_cobranca_inicial,
    v_gerar_cobranca_futura,
    v_sincronizar_asaas
  )
  ON CONFLICT (aluno_id, turma_id) DO UPDATE
    SET status = 'ATIVO',
        valor_matricula_individual = EXCLUDED.valor_matricula_individual,
        valor_rematricula_individual = EXCLUDED.valor_rematricula_individual,
        valor_parcela_individual = EXCLUDED.valor_parcela_individual,
        dia_vencimento_individual = EXCLUDED.dia_vencimento_individual,
        data_primeiro_vencimento_financeiro = EXCLUDED.data_primeiro_vencimento_financeiro,
        financeiro_herdado = EXCLUDED.financeiro_herdado,
        gerar_cobranca_inicial = EXCLUDED.gerar_cobranca_inicial,
        gerar_cobranca_futura = EXCLUDED.gerar_cobranca_futura,
        sincronizar_asaas = EXCLUDED.sincronizar_asaas
  RETURNING * INTO v_matricula;

  PERFORM public.gerar_cobranca_matricula(v_matricula.id);

  INSERT INTO public.matricula_movimentacoes (
    matricula_id,
    aluno_id,
    tipo,
    status_anterior,
    status_novo,
    turma_destino_id,
    motivo,
    responsavel_id
  ) VALUES (
    v_matricula.id,
    v_matricula.aluno_id,
    'MATRICULA',
    NULL,
    'ATIVO',
    v_matricula.turma_id,
    'Matricula realizada na turma com financeiro individual.',
    p_responsavel_id
  );

  RETURN v_matricula;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_pagamentos_irpf_aluno(
  p_aluno_id UUID,
  p_ano INTEGER,
  p_turma_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  turma_id UUID,
  turma_nome TEXT,
  data_pagamento DATE,
  valor_pago NUMERIC,
  valor NUMERIC,
  descricao TEXT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cr.id,
    cr.turma_id,
    t.nome AS turma_nome,
    cr.data_pagamento::DATE,
    COALESCE(cr.valor_pago, cr.valor, 0),
    COALESCE(cr.valor, 0),
    COALESCE(cr.descricao, '')
  FROM public.contas_receber cr
  LEFT JOIN public.turmas t ON t.id = cr.turma_id
  WHERE cr.cliente_id = p_aluno_id
    AND cr.status = 'PAGO'
    AND cr.data_pagamento IS NOT NULL
    AND EXTRACT(YEAR FROM cr.data_pagamento::DATE) = p_ano
    AND (p_turma_id IS NULL OR cr.turma_id = p_turma_id)
  ORDER BY cr.data_pagamento;
$$;

CREATE OR REPLACE FUNCTION public.prever_geracao_cobrancas_futuras(
  p_turma_id UUID,
  p_data_referencia DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  turma_id UUID,
  origem_financeira TEXT,
  gerar_cobrancas_futuras BOOLEAN,
  total_parcelas_previstas INTEGER,
  vencimento_matricula DATE,
  vencimento_primeira_parcela DATE,
  vencimento_ultima_parcela DATE
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_turma public.turmas%ROWTYPE;
  v_data_base DATE;
BEGIN
  SELECT * INTO v_turma
  FROM public.turmas
  WHERE id = p_turma_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_data_base := COALESCE(NULLIF(v_turma.data_inicio::TEXT, ''), p_data_referencia::TEXT)::DATE;

  RETURN QUERY
  SELECT
    v_turma.id,
    v_turma.origem_financeira,
    COALESCE(v_turma.gerar_cobrancas_futuras, TRUE),
    GREATEST(COALESCE(v_turma.qtd_parcelas, 11), 0),
    COALESCE(
      (SELECT (item->>'dataVencimento')::DATE
       FROM jsonb_array_elements(COALESCE(v_turma.cronograma_financeiro, '[]'::JSONB)) item
       WHERE UPPER(COALESCE(item->>'tipo', '')) = 'MATRICULA'
       LIMIT 1),
      COALESCE(v_turma.data_inicio, p_data_referencia)
    ) AS vencimento_matricula,
    public.data_vencimento_mensal(
      COALESCE(v_turma.data_inicio, p_data_referencia),
      COALESCE(v_turma.dia_vencimento_padrao, 10),
      1
    ),
    public.data_vencimento_mensal(
      COALESCE(v_turma.data_inicio, p_data_referencia),
      COALESCE(v_turma.dia_vencimento_padrao, 10),
      GREATEST(COALESCE(v_turma.qtd_parcelas, 11), 0)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolver_flags_financeiras_turma_matricula(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_pagamentos_irpf_aluno(UUID, INTEGER, UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prever_geracao_cobrancas_futuras(UUID, DATE) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.matricular_aluno_turma_financeiro(UUID, UUID, UUID, NUMERIC, DATE, NUMERIC, NUMERIC, INTEGER, BOOLEAN, BOOLEAN, BOOLEAN) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gerar_cobranca_matricula(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gerar_parcelas_matricula(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gerar_rematricula_apos_parcelas(UUID) TO anon, authenticated, service_role;
