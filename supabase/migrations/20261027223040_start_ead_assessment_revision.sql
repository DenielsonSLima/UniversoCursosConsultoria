-- Troca deliberada da versão; nunca executada automaticamente ao abrir o curso.
CREATE FUNCTION public.ead_start_assessment_revision(
  p_aluno_id uuid,
  p_curso_id uuid,
  p_expected_revision text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_matricula_id uuid;
  v_matricula_status text;
  v_progress record;
  v_context jsonb;
  v_current text;
  v_available text;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role'
    AND public.current_aluno_id() IS DISTINCT FROM p_aluno_id THEN
    RAISE EXCEPTION 'A revisão EAD só pode ser iniciada pelo próprio aluno.' USING ERRCODE = '42501';
  END IF;
  -- Autoriza e bloqueia a matrícula antes de ler histórico ou aceitar replay.
  SELECT m.id, upper(coalesce(m.status, '')) INTO v_matricula_id, v_matricula_status
  FROM public.matriculas m
  JOIN public.turmas t ON t.id = m.turma_id
  JOIN public.cursos c ON c.id = t.curso_id
  WHERE m.aluno_id = p_aluno_id AND c.id = p_curso_id AND c.modalidade = 'EAD'
    AND upper(coalesce(m.status, '')) IN ('ATIVO', 'CONCLUIDO')
  ORDER BY CASE upper(coalesce(m.status, '')) WHEN 'ATIVO' THEN 1 ELSE 2 END,
    m.data_matricula DESC NULLS LAST, m.id DESC
  LIMIT 1 FOR UPDATE OF m;
  IF v_matricula_id IS NULL OR v_matricula_status <> 'ATIVO' THEN
    RAISE EXCEPTION 'Somente matrícula EAD ativa pode iniciar uma revisão.' USING ERRCODE = '23514';
  END IF;
  PERFORM public.ead_get_aluno_progress(p_aluno_id, p_curso_id);
  SELECT ep.* INTO v_progress FROM public.ead_aluno_progresso ep
  WHERE ep.aluno_id = p_aluno_id AND ep.curso_id = p_curso_id FOR UPDATE;
  PERFORM 1 FROM public.cursos c WHERE c.id = p_curso_id FOR SHARE;

  v_context := internal_academic.ead_revision_context(p_aluno_id, p_curso_id);
  v_current := v_context ->> 'revision';
  v_available := v_context ->> 'currentRevision';
  IF v_available IS NULL OR p_expected_revision IS DISTINCT FROM v_available THEN
    RAISE EXCEPTION 'A revisão disponível mudou. Atualize o curso antes de confirmar.' USING ERRCODE = '23514';
  END IF;
  IF public.ead_progress_meets_completion(v_progress.progress, v_context -> 'config')
    OR EXISTS (SELECT 1 FROM public.certificados_academicos ca
      WHERE ca.aluno_id = p_aluno_id AND ca.curso_id = p_curso_id AND ca.modalidade = 'EAD') THEN
    RAISE EXCEPTION 'Conclusões, notas aprovadas e certificados anteriores permanecem preservados.'
      USING ERRCODE = '23514';
  END IF;
  -- Depois da autorização, repetir a mesma confirmação não apaga o novo progresso.
  IF v_current = v_available THEN
    RETURN public.ead_get_aluno_progress(p_aluno_id, p_curso_id);
  END IF;
  INSERT INTO internal_academic.ead_progress_revision_archives
    (aluno_id, course_id, from_revision, to_revision, progress, started_at)
  VALUES (p_aluno_id, p_curso_id, v_current, v_available, v_progress.progress, v_progress.started_at);

  UPDATE public.ead_aluno_progresso SET progress = jsonb_build_object(
    'assessmentRevision', v_available,
    'completedContentIds', '[]'::jsonb,
    'completedActivityIds', '[]'::jsonb,
    'completedVideoIds', '[]'::jsonb,
    'activityAnswers', '{}'::jsonb,
    'quizAnswers', '{}'::jsonb)
  WHERE aluno_id = p_aluno_id AND curso_id = p_curso_id;
  RETURN public.ead_get_aluno_progress(p_aluno_id, p_curso_id);
END;
$$;

REVOKE ALL ON FUNCTION public.ead_start_assessment_revision(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ead_start_assessment_revision(uuid, uuid, text)
  TO authenticated, service_role;
