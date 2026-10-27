CREATE OR REPLACE FUNCTION public.registrar_turma_financeiro_auditoria(p_matricula_id uuid, p_evento text, p_regra jsonb DEFAULT NULL::jsonb, p_observacao text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_turma_id uuid;
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
$function$

