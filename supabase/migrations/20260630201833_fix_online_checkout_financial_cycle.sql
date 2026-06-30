BEGIN;

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

  SELECT COALESCE(MAX((regexp_match(origem_cronograma_id, '^ciclo-([0-9]+)-parc-'))[1]::INTEGER), 0)
    INTO v_ciclo
  FROM public.contas_receber
  WHERE matricula_id = p_matricula_id
    AND tipo_lancamento = 'PARCELA'
    AND origem_cronograma_id ~ '^ciclo-[0-9]+-parc-';

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

  SELECT COUNT(*)
    INTO v_total_ciclo
  FROM public.contas_receber
  WHERE matricula_id = p_matricula_id
    AND tipo_lancamento = 'PARCELA'
    AND origem_cronograma_id LIKE 'ciclo-' || v_ciclo || '-parc-%';

  SELECT COUNT(*)
    INTO v_pagas_ciclo
  FROM public.contas_receber
  WHERE matricula_id = p_matricula_id
    AND tipo_lancamento = 'PARCELA'
    AND origem_cronograma_id LIKE 'ciclo-' || v_ciclo || '-parc-%'
    AND status = 'PAGO';

  IF v_total_ciclo = 0 OR v_pagas_ciclo < v_total_ciclo THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(MAX(COALESCE(data_pagamento, data_vencimento)), CURRENT_DATE)
    INTO v_base_date
  FROM public.contas_receber
  WHERE matricula_id = p_matricula_id
    AND tipo_lancamento = 'PARCELA'
    AND origem_cronograma_id LIKE 'ciclo-' || v_ciclo || '-parc-%'
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
  ON CONFLICT (matricula_id, origem_cronograma_id)
    WHERE matricula_id IS NOT NULL AND origem_cronograma_id IS NOT NULL
  DO NOTHING
  RETURNING * INTO v_conta;

  RETURN v_conta;
END;
$$;

COMMIT;
