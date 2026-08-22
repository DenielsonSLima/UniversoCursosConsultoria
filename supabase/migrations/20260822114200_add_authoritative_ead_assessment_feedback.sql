-- O aluno recebe a correção somente depois da própria submissão. O gabarito
-- permanece no schema privado e o GET reconstrói o feedback após recarregar.

CREATE FUNCTION internal_academic.ead_assessment_feedback(
  p_progress jsonb,
  p_config jsonb,
  p_activity_answers jsonb,
  p_quiz_answers jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_progress jsonb := coalesce(p_progress, '{}'::jsonb);
  v_config jsonb := coalesce(p_config, '{}'::jsonb);
  v_saved_activities jsonb := coalesce(p_progress -> 'activityAnswers', '{}'::jsonb);
  v_saved_quiz jsonb := coalesce(p_progress -> 'quizAnswers', '{}'::jsonb);
  v_activity_feedback jsonb := '{}'::jsonb;
  v_quiz_feedback jsonb := '{}'::jsonb;
  v_activity jsonb;
  v_question jsonb;
  v_id text;
  v_selected text;
  v_correct text;
  v_score_text text := p_progress ->> 'quizScore';
  v_score integer;
  v_min_score integer := 70;
  v_quiz_submitted boolean := false;
BEGIN
  FOR v_activity IN
    SELECT value
    FROM jsonb_array_elements(coalesce(v_config -> 'atividades', '[]'::jsonb))
  LOOP
    v_id := v_activity ->> 'id';
    IF nullif(v_id, '') IS NULL OR NOT (v_saved_activities ? v_id) THEN
      CONTINUE;
    END IF;

    v_selected := v_saved_activities ->> v_id;
    v_correct := p_activity_answers ->> v_id;
    IF v_correct IS NULL THEN
      v_activity_feedback := v_activity_feedback || jsonb_build_object(
        v_id,
        jsonb_build_object(
          'submitted', true,
          'selectedIndex', NULL,
          'correctIndex', NULL,
          'isCorrect', NULL
        )
      );
    ELSIF v_selected ~ '^(0|[1-9][0-9]*)$'
      AND length(v_selected) <= 10
      AND v_correct ~ '^(0|[1-9][0-9]*)$'
      AND length(v_correct) <= 10
    THEN
      v_activity_feedback := v_activity_feedback || jsonb_build_object(
        v_id,
        jsonb_build_object(
          'submitted', true,
          'selectedIndex', v_selected::numeric,
          'correctIndex', v_correct::numeric,
          'isCorrect', v_selected::numeric = v_correct::numeric
        )
      );
    END IF;
  END LOOP;

  v_quiz_submitted := v_progress ? 'lastQuizScoreAt'
    AND v_score_text ~ '^(0|[1-9][0-9]*)$'
    AND length(v_score_text) <= 3;
  IF v_quiz_submitted THEN
    v_score := v_score_text::integer;
    IF coalesce(v_config #>> '{provas,0,notaMinima}', '') ~ '^(0|[1-9][0-9]*)$'
      AND length(v_config #>> '{provas,0,notaMinima}') <= 3
    THEN
      v_min_score := (v_config #>> '{provas,0,notaMinima}')::integer;
    END IF;

    FOR v_question IN
      SELECT value
      FROM jsonb_array_elements(coalesce(v_config #> '{provas,0,questoes}', '[]'::jsonb))
    LOOP
      v_id := v_question ->> 'id';
      v_selected := v_saved_quiz ->> v_id;
      v_correct := p_quiz_answers ->> v_id;
      IF v_selected ~ '^(0|[1-9][0-9]*)$'
        AND length(v_selected) <= 10
        AND v_correct ~ '^(0|[1-9][0-9]*)$'
        AND length(v_correct) <= 10
      THEN
        v_quiz_feedback := v_quiz_feedback || jsonb_build_object(
          v_id,
          jsonb_build_object(
            'selectedIndex', v_selected::numeric,
            'correctIndex', v_correct::numeric,
            'isCorrect', v_selected::numeric = v_correct::numeric
          )
        );
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'activities', v_activity_feedback,
    'quiz', jsonb_build_object(
      'submitted', v_quiz_submitted,
      'score', CASE WHEN v_quiz_submitted THEN v_score ELSE NULL END,
      'passed', v_quiz_submitted AND v_score >= v_min_score,
      'results', v_quiz_feedback
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION internal_academic.ead_assessment_feedback(
  jsonb, jsonb, jsonb, jsonb
) FROM PUBLIC, anon, authenticated, service_role;

ALTER FUNCTION public.ead_get_aluno_progress(uuid, uuid)
  RENAME TO ead_get_aluno_progress_core_20260822;

ALTER FUNCTION public.ead_get_aluno_progress_core_20260822(uuid, uuid)
  SET search_path = '';

REVOKE ALL ON FUNCTION public.ead_get_aluno_progress_core_20260822(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.ead_get_aluno_progress(
  p_aluno_id uuid,
  p_curso_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
  v_progress jsonb;
  v_config jsonb;
  v_activity_answers jsonb;
  v_quiz_answers jsonb;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role'
    AND public.current_aluno_id() IS DISTINCT FROM p_aluno_id
  THEN
    RAISE EXCEPTION 'O progresso EAD só pode ser acessado pelo próprio aluno.'
      USING ERRCODE = '42501';
  END IF;

  v_result := public.ead_get_aluno_progress_core_20260822(p_aluno_id, p_curso_id);

  SELECT
    ep.progress,
    c.ead_config,
    k.activity_answers,
    k.quiz_answers
  INTO
    v_progress,
    v_config,
    v_activity_answers,
    v_quiz_answers
  FROM public.ead_aluno_progresso ep
  JOIN public.cursos c ON c.id = ep.curso_id
  JOIN internal_academic.ead_assessment_answer_keys k ON k.course_id = c.id
  WHERE ep.aluno_id = p_aluno_id
    AND ep.curso_id = p_curso_id
    AND c.modalidade = 'EAD';

  IF v_config IS NULL THEN
    RAISE EXCEPTION 'Configuração do curso EAD não encontrada.' USING ERRCODE = '23514';
  END IF;

  RETURN v_result || jsonb_build_object(
    'assessmentFeedback',
    internal_academic.ead_assessment_feedback(
      v_progress,
      v_config,
      v_activity_answers,
      v_quiz_answers
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ead_get_aluno_progress(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ead_get_aluno_progress(uuid, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.ead_get_aluno_progress(uuid, uuid) IS
  'Progresso do próprio aluno com feedback autoritativo apenas para respostas já submetidas.';
