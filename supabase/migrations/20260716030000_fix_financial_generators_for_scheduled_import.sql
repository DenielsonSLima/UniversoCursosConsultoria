-- Corrige a geração financeira para respeitar as flags da matrícula/turma
-- e o cronograma explícito configurado na turma.

CREATE OR REPLACE FUNCTION public.can_write_turma(p_turma_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1
      FROM public.turmas t
      WHERE t.id = p_turma_id
        AND public.is_gestor_for_polo(t.polo_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.gerar_cobranca_matricula(p_matricula_id uuid)
RETURNS public.contas_receber
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matricula public.matriculas%ROWTYPE;
  v_turma public.turmas%ROWTYPE;
  v_item jsonb;
  v_conta public.contas_receber%ROWTYPE;
  v_origem_id text;
  v_descricao text;
  v_valor numeric;
  v_vencimento date;
  v_flags record;
BEGIN
  SELECT * INTO v_matricula
  FROM public.matriculas
  WHERE id = p_matricula_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Matrícula não encontrada.';
  END IF;

  SELECT * INTO v_flags
  FROM public.resolver_flags_financeiras_turma_matricula(
    p_matricula_id => p_matricula_id
  );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Configuração financeira da matrícula não encontrada.';
  END IF;

  IF v_flags.gerar_cobranca_inicial = FALSE THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_turma
  FROM public.turmas
  WHERE id = v_matricula.turma_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turma não encontrada para a matrícula.';
  END IF;

  SELECT item INTO v_item
  FROM jsonb_array_elements(COALESCE(v_turma.cronograma_financeiro, '[]'::jsonb)) AS item
  WHERE UPPER(COALESCE(item->>'tipo', '')) = 'MATRICULA'
  LIMIT 1;

  v_origem_id := COALESCE(NULLIF(v_item->>'id', ''), 'matricula');
  v_descricao := COALESCE(NULLIF(v_item->>'label', ''), 'Matrícula Inicial');
  v_valor := COALESCE(
    v_matricula.valor_matricula_individual,
    NULLIF(v_item->>'valor', '')::numeric,
    v_turma.valor_matricula,
    0
  );
  v_vencimento := COALESCE(
    v_matricula.data_primeiro_vencimento_financeiro,
    NULLIF(v_item->>'dataVencimento', '')::date,
    v_matricula.data_matricula::date,
    CURRENT_DATE
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
    valor = CASE WHEN public.contas_receber.status = 'PAGO' THEN public.contas_receber.valor ELSE EXCLUDED.valor END,
    data_vencimento = CASE WHEN public.contas_receber.status = 'PAGO' THEN public.contas_receber.data_vencimento ELSE EXCLUDED.data_vencimento END,
    status = CASE WHEN public.contas_receber.status = 'PAGO' THEN public.contas_receber.status ELSE EXCLUDED.status END
  RETURNING * INTO v_conta;

  RETURN v_conta;
END;
$$;

CREATE OR REPLACE FUNCTION public.gerar_parcelas_matricula(p_matricula_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matricula public.matriculas%ROWTYPE;
  v_turma public.turmas%ROWTYPE;
  v_item jsonb;
  v_index integer;
  v_tipo text;
  v_origem_id text;
  v_descricao text;
  v_valor numeric;
  v_vencimento date;
  v_numero integer;
  v_inseridas integer := 0;
  v_row_count integer;
  v_flags record;
BEGIN
  SELECT * INTO v_matricula
  FROM public.matriculas
  WHERE id = p_matricula_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Matrícula não encontrada.';
  END IF;

  SELECT * INTO v_flags
  FROM public.resolver_flags_financeiras_turma_matricula(
    p_matricula_id => p_matricula_id
  );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Configuração financeira da matrícula não encontrada.';
  END IF;

  IF v_flags.gerar_cobranca_futura = FALSE THEN
    RETURN 0;
  END IF;

  SELECT * INTO v_turma
  FROM public.turmas
  WHERE id = v_matricula.turma_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turma não encontrada para a matrícula.';
  END IF;

  IF jsonb_array_length(COALESCE(v_turma.cronograma_financeiro, '[]'::jsonb)) > 0 THEN
    FOR v_item, v_index IN
      SELECT item, ordinality::integer
      FROM jsonb_array_elements(v_turma.cronograma_financeiro)
        WITH ORDINALITY AS schedule(item, ordinality)
      WHERE UPPER(COALESCE(item->>'tipo', 'PARCELA')) <> 'MATRICULA'
    LOOP
      v_tipo := CASE UPPER(COALESCE(v_item->>'tipo', 'PARCELA'))
        WHEN 'REMATRICULA' THEN 'REMATRICULA'
        ELSE 'PARCELA'
      END;
      v_numero := COALESCE(NULLIF(v_item->>'numero', '')::integer, v_index);
      v_origem_id := COALESCE(NULLIF(v_item->>'id', ''), LOWER(v_tipo) || '-' || v_numero);
      v_descricao := COALESCE(
        NULLIF(v_item->>'label', ''),
        CASE WHEN v_tipo = 'REMATRICULA' THEN 'Rematrícula' ELSE 'Mensalidade ' || v_numero END
      );
      v_valor := COALESCE(
        NULLIF(v_item->>'valor', '')::numeric,
        CASE WHEN v_tipo = 'REMATRICULA'
          THEN COALESCE(v_matricula.valor_rematricula_individual, v_turma.valor_rematricula)
          ELSE COALESCE(v_matricula.valor_parcela_individual, v_turma.valor_parcela)
        END,
        0
      );
      v_vencimento := COALESCE(
        NULLIF(v_item->>'dataVencimento', '')::date,
        public.data_vencimento_mensal(
          v_matricula.data_matricula::date,
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
      v_vencimento := public.data_vencimento_mensal(
        v_matricula.data_matricula::date,
        COALESCE(v_matricula.dia_vencimento_individual, v_turma.dia_vencimento_padrao, 10),
        v_numero
      );

      INSERT INTO public.contas_receber (
        polo_id, descricao, valor, data_vencimento, status, categoria,
        cliente_id, matricula_id, turma_id, tipo_lancamento,
        parcela_numero, origem_cronograma_id
      ) VALUES (
        v_turma.polo_id,
        'Mensalidade ' || v_numero || '/' || v_turma.qtd_parcelas || ' - ' || v_turma.nome,
        COALESCE(v_matricula.valor_parcela_individual, v_turma.valor_parcela, 0),
        v_vencimento,
        CASE WHEN v_vencimento < CURRENT_DATE THEN 'VENCIDO' ELSE 'PENDENTE' END,
        'MENSALIDADE',
        v_matricula.aluno_id,
        v_matricula.id,
        v_matricula.turma_id,
        'PARCELA',
        v_numero,
        'parc-' || v_numero
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

REVOKE ALL ON FUNCTION public.gerar_cobranca_matricula(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gerar_parcelas_matricula(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gerar_cobranca_matricula(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.gerar_parcelas_matricula(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.gerar_cobranca_matricula(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.gerar_parcelas_matricula(uuid) TO service_role;

COMMENT ON FUNCTION public.gerar_cobranca_matricula(uuid)
IS 'Gera cobrança inicial somente quando a configuração da matrícula/turma autoriza.';

COMMENT ON FUNCTION public.gerar_parcelas_matricula(uuid)
IS 'Gera parcelas futuras respeitando flags e cronograma financeiro explícito da turma.';
