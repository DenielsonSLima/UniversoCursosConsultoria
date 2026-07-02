CREATE OR REPLACE FUNCTION public.asaas_checkout_upsert_matricula(
  p_aluno_id uuid,
  p_turma_id uuid,
  p_gerar_cobranca_futura boolean DEFAULT false
)
RETURNS public.matriculas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_turma record;
  v_existing public.matriculas%ROWTYPE;
  v_matricula public.matriculas%ROWTYPE;
BEGIN
  SELECT t.id, t.curso_id, t.polo_id
  INTO v_turma
  FROM public.turmas t
  WHERE t.id = p_turma_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turma nao encontrada.';
  END IF;

  PERFORM public.assert_aluno_sem_matricula_curso_duplicada(p_aluno_id, v_turma.curso_id, p_turma_id);

  SELECT *
  INTO v_existing
  FROM public.matriculas
  WHERE aluno_id = p_aluno_id
    AND turma_id = p_turma_id
  ORDER BY data_matricula DESC
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.matriculas
    SET status = CASE
          WHEN status IN ('CANCELADO', 'DESISTENTE', 'TRANCADO', 'VENCIDO') THEN 'PENDENTE'
          ELSE status
        END,
        financeiro_herdado = false,
        gerar_cobranca_inicial = true,
        gerar_cobranca_futura = COALESCE(p_gerar_cobranca_futura, false),
        sincronizar_asaas = true
    WHERE id = v_existing.id
    RETURNING * INTO v_matricula;
  ELSE
    INSERT INTO public.matriculas (
      aluno_id,
      turma_id,
      status,
      financeiro_herdado,
      gerar_cobranca_inicial,
      gerar_cobranca_futura,
      sincronizar_asaas
    )
    VALUES (
      p_aluno_id,
      p_turma_id,
      'PENDENTE',
      false,
      true,
      COALESCE(p_gerar_cobranca_futura, false),
      true
    )
    RETURNING * INTO v_matricula;
  END IF;

  RETURN v_matricula;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.asaas_checkout_upsert_matricula(uuid, uuid, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.asaas_checkout_upsert_matricula(uuid, uuid, boolean)
  TO authenticated, service_role;
