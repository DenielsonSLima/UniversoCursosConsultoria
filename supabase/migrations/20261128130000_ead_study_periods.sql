BEGIN;

CREATE TABLE internal_academic.ead_study_periods (
  matricula_id uuid PRIMARY KEY REFERENCES public.matriculas(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL
);

CREATE TABLE internal_academic.ead_quiz_early_releases (
  matricula_id uuid PRIMARY KEY REFERENCES public.matriculas(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL,
  granted_by uuid NOT NULL,
  reason text NOT NULL CHECK (reason = btrim(reason) AND char_length(reason) BETWEEN 10 AND 500)
);

ALTER TABLE internal_academic.ead_study_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_academic.ead_quiz_early_releases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE internal_academic.ead_study_periods, internal_academic.ead_quiz_early_releases
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION internal_academic.ead_quiz_wait_state(p_matricula_id uuid)
RETURNS TABLE (study_started_at timestamptz, quiz_available_at timestamptz, quiz_waiting boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT study.started_at, study.started_at + interval '168 hours',
    study.started_at IS NULL OR (
      early.matricula_id IS NULL AND statement_timestamp() < study.started_at + interval '168 hours')
  FROM (VALUES (p_matricula_id)) selected(matricula_id)
  LEFT JOIN internal_academic.ead_study_periods study USING (matricula_id)
  LEFT JOIN internal_academic.ead_quiz_early_releases early USING (matricula_id);
$$;

CREATE FUNCTION internal_academic.ead_record_study_start(p_matricula_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  INSERT INTO internal_academic.ead_study_periods (matricula_id, started_at)
  VALUES (p_matricula_id, statement_timestamp())
  ON CONFLICT (matricula_id) DO NOTHING;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION internal_academic.ead_quiz_wait_state(uuid),
  internal_academic.ead_record_study_start(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.ead_start_study(p_aluno_id uuid, p_curso_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_matricula_id uuid;
  v_status text;
  v_result jsonb;
BEGIN
  IF p_aluno_id IS NULL OR (coalesce(auth.role(), '') <> 'service_role'
    AND (auth.uid() IS NULL OR public.current_aluno_id() IS DISTINCT FROM p_aluno_id)) THEN
    RAISE EXCEPTION 'O início do estudo EAD só pode ser registrado pelo próprio aluno.'
      USING ERRCODE = '42501';
  END IF;

  SELECT m.id, upper(coalesce(m.status, '')) INTO v_matricula_id, v_status
  FROM public.matriculas m
  JOIN public.turmas t ON t.id = m.turma_id
  JOIN public.cursos c ON c.id = t.curso_id AND c.modalidade = 'EAD'
  WHERE m.aluno_id = p_aluno_id AND c.id = p_curso_id
    AND (upper(coalesce(m.status, '')) IN ('ATIVO', 'CONCLUIDO')
      OR internal_academic.ead_has_trust_access(m.id))
  ORDER BY CASE upper(coalesce(m.status, '')) WHEN 'ATIVO' THEN 1 ELSE 2 END,
    m.data_matricula DESC NULLS LAST, m.id DESC
  LIMIT 1
  FOR UPDATE OF m;

  IF v_matricula_id IS NULL THEN
    RAISE EXCEPTION 'Curso EAD disponível somente para matrícula com acesso.'
      USING ERRCODE = '23514';
  END IF;

  v_result := public.ead_get_aluno_progress(p_aluno_id, p_curso_id);
  IF v_status <> 'CONCLUIDO' AND NOT coalesce((v_result #>> '{summary,quizPassed}')::boolean, false)
    AND (v_result #>> '{summary,studyStartedAt}') IS NULL
    AND internal_academic.ead_record_study_start(v_matricula_id) THEN
    RETURN public.ead_get_aluno_progress(p_aluno_id, p_curso_id);
  END IF;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.ead_start_study(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ead_start_study(uuid, uuid) TO authenticated, service_role;

COMMIT;
