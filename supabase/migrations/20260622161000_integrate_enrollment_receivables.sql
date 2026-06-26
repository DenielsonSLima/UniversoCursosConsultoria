-- Integra matrícula, plano financeiro da turma e contas a receber.
-- A cobrança de matrícula nasce na inscrição; as demais parcelas são geradas
-- somente após a confirmação do pagamento da matrícula.

ALTER TABLE public.contas_receber
  ADD COLUMN IF NOT EXISTS tipo_lancamento TEXT,
  ADD COLUMN IF NOT EXISTS parcela_numero INTEGER,
  ADD COLUMN IF NOT EXISTS origem_cronograma_id TEXT;

ALTER TABLE public.contas_receber
  DROP CONSTRAINT IF EXISTS contas_receber_tipo_lancamento_check;

ALTER TABLE public.contas_receber
  ADD CONSTRAINT contas_receber_tipo_lancamento_check
  CHECK (
    tipo_lancamento IS NULL
    OR tipo_lancamento IN ('MATRICULA', 'PARCELA', 'REMATRICULA')
  );

CREATE UNIQUE INDEX IF NOT EXISTS contas_receber_matricula_cronograma_uidx
  ON public.contas_receber (matricula_id, origem_cronograma_id)
  WHERE matricula_id IS NOT NULL AND origem_cronograma_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS contas_receber_turma_status_vencimento_idx
  ON public.contas_receber (turma_id, status, data_vencimento);

CREATE INDEX IF NOT EXISTS contas_receber_cliente_vencimento_idx
  ON public.contas_receber (cliente_id, data_vencimento);

CREATE OR REPLACE FUNCTION public.data_vencimento_mensal(
  p_base DATE,
  p_dia INTEGER,
  p_offset INTEGER
)
RETURNS DATE
LANGUAGE SQL
IMMUTABLE
SET search_path = public
AS $$
  SELECT (
    date_trunc('month', p_base)
    + make_interval(months => p_offset)
    + (
      LEAST(
        GREATEST(COALESCE(p_dia, 10), 1),
        EXTRACT(
          DAY FROM (
            date_trunc('month', p_base)
            + make_interval(months => p_offset + 1)
            - interval '1 day'
          )
        )::INTEGER
      ) - 1
    ) * interval '1 day'
  )::DATE;
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
BEGIN
  SELECT * INTO v_matricula
  FROM public.matriculas
  WHERE id = p_matricula_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Matrícula não encontrada.';
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
  v_valor := COALESCE(NULLIF(v_item->>'valor', '')::NUMERIC, v_turma.valor_matricula, 0);
  v_vencimento := COALESCE(
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
BEGIN
  SELECT * INTO v_matricula
  FROM public.matriculas
  WHERE id = p_matricula_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Matrícula não encontrada.';
  END IF;

  SELECT * INTO v_turma
  FROM public.turmas
  WHERE id = v_matricula.turma_id;

  IF jsonb_array_length(COALESCE(v_turma.cronograma_financeiro, '[]'::JSONB)) > 0 THEN
    FOR v_item, v_index IN
      SELECT item, ordinality::INTEGER
      FROM jsonb_array_elements(v_turma.cronograma_financeiro)
        WITH ORDINALITY AS schedule(item, ordinality)
      WHERE UPPER(COALESCE(item->>'tipo', '')) <> 'MATRICULA'
    LOOP
      v_tipo := CASE UPPER(COALESCE(v_item->>'tipo', 'PARCELA'))
        WHEN 'REMATRICULA' THEN 'REMATRICULA'
        ELSE 'PARCELA'
      END;
      v_numero := COALESCE(NULLIF(v_item->>'numero', '')::INTEGER, v_index - 1);
      v_origem_id := COALESCE(NULLIF(v_item->>'id', ''), LOWER(v_tipo) || '-' || v_numero);
      v_descricao := COALESCE(
        NULLIF(v_item->>'label', ''),
        CASE WHEN v_tipo = 'REMATRICULA'
          THEN 'Rematrícula'
          ELSE 'Mensalidade ' || v_numero
        END
      );
      v_valor := COALESCE(
        NULLIF(v_item->>'valor', '')::NUMERIC,
        CASE WHEN v_tipo = 'REMATRICULA'
          THEN v_turma.valor_rematricula
          ELSE v_turma.valor_parcela
        END,
        0
      );
      v_vencimento := COALESCE(
        NULLIF(v_item->>'dataVencimento', '')::DATE,
        public.data_vencimento_mensal(
          v_matricula.data_matricula::DATE,
          v_turma.dia_vencimento_padrao,
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
    FOR v_numero IN 1..GREATEST(COALESCE(v_turma.qtd_parcelas, 0), 0)
    LOOP
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
        WHEN v_tipo = 'REMATRICULA' THEN v_turma.valor_rematricula
        ELSE v_turma.valor_parcela
      END;
      v_vencimento := public.data_vencimento_mensal(
        v_matricula.data_matricula::DATE,
        v_turma.dia_vencimento_padrao,
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

CREATE OR REPLACE FUNCTION public.criar_financeiro_ao_matricular()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'ATIVO' THEN
    PERFORM public.gerar_cobranca_matricula(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS criar_financeiro_ao_matricular_trigger ON public.matriculas;
CREATE TRIGGER criar_financeiro_ao_matricular_trigger
AFTER INSERT OR UPDATE OF status ON public.matriculas
FOR EACH ROW
WHEN (NEW.status = 'ATIVO')
EXECUTE FUNCTION public.criar_financeiro_ao_matricular();

CREATE OR REPLACE FUNCTION public.gerar_parcelas_apos_baixa_matricula()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'PAGO'
     AND OLD.status IS DISTINCT FROM 'PAGO'
     AND NEW.tipo_lancamento = 'MATRICULA'
     AND NEW.matricula_id IS NOT NULL THEN
    PERFORM public.gerar_parcelas_matricula(NEW.matricula_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gerar_parcelas_apos_baixa_matricula_trigger
  ON public.contas_receber;
CREATE TRIGGER gerar_parcelas_apos_baixa_matricula_trigger
AFTER UPDATE OF status ON public.contas_receber
FOR EACH ROW
EXECUTE FUNCTION public.gerar_parcelas_apos_baixa_matricula();

-- Matrículas ativas anteriores passam a ter a cobrança inicial, sem duplicar.
DO $$
DECLARE
  v_matricula RECORD;
BEGIN
  FOR v_matricula IN
    SELECT id FROM public.matriculas WHERE status = 'ATIVO'
  LOOP
    PERFORM public.gerar_cobranca_matricula(v_matricula.id);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.gerar_cobranca_matricula(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gerar_parcelas_matricula(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gerar_cobranca_matricula(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gerar_parcelas_matricula(UUID) TO anon, authenticated;
