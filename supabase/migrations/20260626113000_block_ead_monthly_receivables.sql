-- EAD e pagamento único: impede geração automática de mensalidades/rematrícula.
-- O curso EAD pode permitir parcelamento no cartão pelo Asaas, mas internamente
-- deve existir apenas a cobrança avulsa de inscrição/matrícula.

UPDATE public.cursos
SET financeiro_config = jsonb_set(
  jsonb_set(
    COALESCE(financeiro_config, '{}'::jsonb),
    '{asaas}',
    jsonb_build_object(
      'gerarParcelamentoMensalidades', false,
      'tipoCarnePreferencial', 'COBRANCAS_AVULSAS'
    ),
    true
  ),
  '{parcelasPadrao}',
  '1'::jsonb,
  true
)
WHERE modalidade = 'EAD';

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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turma não encontrada para a matrícula.';
  END IF;

  SELECT modalidade INTO v_modalidade
  FROM public.cursos
  WHERE id = v_turma.curso_id;

  IF v_modalidade = 'EAD' THEN
    RETURN 0;
  END IF;

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

CREATE OR REPLACE FUNCTION public.gerar_parcelas_apos_baixa_matricula()
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
     AND NEW.tipo_lancamento = 'MATRICULA'
     AND NEW.matricula_id IS NOT NULL THEN
    SELECT c.modalidade
      INTO v_modalidade
      FROM public.matriculas m
      JOIN public.turmas t ON t.id = m.turma_id
      JOIN public.cursos c ON c.id = t.curso_id
     WHERE m.id = NEW.matricula_id;

    IF v_modalidade IS DISTINCT FROM 'EAD' THEN
      PERFORM public.gerar_parcelas_matricula(NEW.matricula_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
