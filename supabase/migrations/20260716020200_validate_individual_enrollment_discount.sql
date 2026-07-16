-- Garante no banco que o desconto individual nunca zere uma cobranca aplicavel.

CREATE OR REPLACE FUNCTION public.matricular_aluno_turma_financeiro_individual(
  p_aluno_id uuid,
  p_turma_id uuid,
  p_responsavel_id uuid DEFAULT NULL,
  p_valor_matricula numeric DEFAULT NULL,
  p_data_vencimento_matricula date DEFAULT NULL,
  p_valor_parcela numeric DEFAULT NULL,
  p_valor_rematricula numeric DEFAULT NULL,
  p_desconto_pontualidade numeric DEFAULT NULL,
  p_juros_atraso numeric DEFAULT NULL,
  p_multa_atraso numeric DEFAULT NULL,
  p_dia_vencimento integer DEFAULT NULL,
  p_financeiro_herdado boolean DEFAULT NULL,
  p_gerar_cobranca_inicial boolean DEFAULT NULL,
  p_gerar_cobranca_futura boolean DEFAULT NULL,
  p_sincronizar_asaas boolean DEFAULT NULL
)
RETURNS public.matriculas
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_matricula public.matriculas;
  v_turma public.turmas;
  v_valor_matricula numeric;
  v_valor_parcela numeric;
  v_valor_rematricula numeric;
BEGIN
  SELECT * INTO v_turma
  FROM public.turmas
  WHERE id = p_turma_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turma não encontrada.';
  END IF;

  v_valor_matricula := coalesce(p_valor_matricula, v_turma.valor_matricula, 0);
  v_valor_parcela := coalesce(p_valor_parcela, v_turma.valor_parcela, 0);
  v_valor_rematricula := coalesce(p_valor_rematricula, v_turma.valor_rematricula, 0);

  IF coalesce(p_desconto_pontualidade, 0) > 0 AND (
    (v_turma.aplicar_desconto_matricula IS TRUE
      AND v_valor_matricula > 0
      AND p_desconto_pontualidade >= v_valor_matricula)
    OR (v_turma.aplicar_desconto_mensalidade IS NOT FALSE
      AND v_valor_parcela > 0
      AND p_desconto_pontualidade >= v_valor_parcela)
    OR (v_turma.aplicar_desconto_rematricula IS NOT FALSE
      AND v_valor_rematricula > 0
      AND p_desconto_pontualidade >= v_valor_rematricula)
  ) THEN
    RAISE EXCEPTION 'O desconto individual deve ser menor que cada cobrança em que será aplicado.';
  END IF;

  SELECT * INTO v_matricula
  FROM public.matricular_aluno_turma_financeiro(
    p_aluno_id,
    p_turma_id,
    p_responsavel_id,
    p_valor_matricula,
    p_data_vencimento_matricula,
    p_valor_parcela,
    p_valor_rematricula,
    p_dia_vencimento,
    p_financeiro_herdado,
    p_gerar_cobranca_inicial,
    p_gerar_cobranca_futura,
    p_sincronizar_asaas
  );

  UPDATE public.matriculas
  SET desconto_pontualidade_individual = p_desconto_pontualidade,
      juros_atraso_individual = p_juros_atraso,
      multa_atraso_individual = p_multa_atraso
  WHERE id = v_matricula.id
  RETURNING * INTO v_matricula;

  RETURN v_matricula;
END;
$$;
