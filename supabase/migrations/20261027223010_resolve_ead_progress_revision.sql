-- O resumo e o feedback sempre usam a mesma versão da avaliação exibida.
CREATE OR REPLACE FUNCTION public.ead_get_aluno_progress_core_20260822(p_aluno_id uuid, p_curso_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_course record;
  v_matricula record;
  v_progress record;
  v_progress_json jsonb;
  v_config jsonb;
  v_conteudos jsonb;
  v_atividades jsonb;
  v_regras jsonb;
  v_questions jsonb;
  v_elapsed_minutes integer;
  v_content_total integer;
  v_activity_total integer;
  v_video_total integer;
  v_content_done integer;
  v_activity_done integer;
  v_video_done integer;
  v_total_required integer;
  v_total_done integer;
  v_progress_percent integer;
  v_all_lessons_done boolean;
  v_all_activities_done boolean;
  v_all_videos_done boolean;
  v_can_take_quiz boolean;
  v_questions_total integer;
  v_min_questions integer := 10;
  v_min_score integer;
  v_quiz_score integer;
  v_retry_hours integer;
  v_last_failed_at timestamptz;
  v_retry_available_at timestamptz;
  v_quiz_retry_blocked boolean := false;
  v_course_completed boolean := false;
  v_certificate_id uuid;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role'
    AND public.current_aluno_id() IS DISTINCT FROM p_aluno_id
  THEN
    RAISE EXCEPTION 'O progresso EAD só pode ser acessado pelo próprio aluno.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_course
  FROM public.cursos
  WHERE id = p_curso_id AND modalidade = 'EAD';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Curso EAD não encontrado.';
  END IF;

  SELECT m.id, m.status, m.data_matricula, t.id AS turma_id
  INTO v_matricula
  FROM public.matriculas m
  JOIN public.turmas t ON t.id = m.turma_id
  WHERE m.aluno_id = p_aluno_id
    AND t.curso_id = p_curso_id
    AND upper(coalesce(m.status, '')) IN ('ATIVO', 'CONCLUIDO')
  ORDER BY
    CASE upper(coalesce(m.status, '')) WHEN 'ATIVO' THEN 1 ELSE 2 END,
    m.data_matricula DESC NULLS LAST,
    m.id DESC
  LIMIT 1;

  IF v_matricula.id IS NULL THEN
    RAISE EXCEPTION 'Curso EAD liberado apenas para aluno com matrícula ativa ou concluída.';
  END IF;

  INSERT INTO public.ead_aluno_progresso (aluno_id, curso_id, progress)
  VALUES (
    p_aluno_id,
    p_curso_id,
    jsonb_build_object(
      'completedContentIds', '[]'::jsonb,
      'completedActivityIds', '[]'::jsonb,
      'completedVideoIds', '[]'::jsonb,
      'activityAnswers', '{}'::jsonb,
      'quizAnswers', '{}'::jsonb
    )
  )
  ON CONFLICT (aluno_id, curso_id) DO NOTHING;

  SELECT * INTO v_progress
  FROM public.ead_aluno_progresso
  WHERE aluno_id = p_aluno_id AND curso_id = p_curso_id;

  v_progress_json := coalesce(v_progress.progress, '{}'::jsonb);
  v_config := internal_academic.ead_revision_context(p_aluno_id, p_curso_id) -> 'config';
  v_conteudos := coalesce(v_config -> 'conteudos', '[]'::jsonb);
  v_atividades := coalesce(v_config -> 'atividades', '[]'::jsonb);
  v_regras := coalesce(v_config -> 'regras', '{}'::jsonb);
  v_questions := coalesce(v_config #> '{provas,0,questoes}', '[]'::jsonb);
  v_course_completed := public.ead_progress_meets_completion(v_progress_json, v_config);

  SELECT ca.id INTO v_certificate_id
  FROM public.certificados_academicos ca
  WHERE ca.aluno_id = p_aluno_id
    AND ca.curso_id = p_curso_id
    AND ca.modalidade = 'EAD'
    AND ca.status = 'FINALIZADO'
    AND ca.codigo_validacao IS NOT NULL
    AND v_course_completed
  ORDER BY ca.data_conclusao DESC, ca.created_at DESC
  LIMIT 1;

  v_retry_hours := greatest(coalesce((v_regras ->> 'intervaloReprovacaoHoras')::integer, 3), 1);
  v_min_score := coalesce((v_config #>> '{provas,0,notaMinima}')::integer, 70);
  v_questions_total := jsonb_array_length(v_questions);
  v_elapsed_minutes := greatest(floor(extract(epoch FROM (now() - v_progress.started_at)) / 60)::integer, 0);
  v_content_total := jsonb_array_length(v_conteudos);
  v_activity_total := CASE
    WHEN coalesce((v_regras ->> 'exigirAtividades')::boolean, true)
      THEN jsonb_array_length(v_atividades)
    ELSE 0
  END;
  v_video_total := CASE
    WHEN coalesce((v_regras ->> 'exigirVideosConcluidos')::boolean, true)
      THEN public.ead_config_required_video_count(v_config)
    ELSE 0
  END;

  IF v_progress_json ? 'quizScore' THEN
    v_quiz_score := (v_progress_json ->> 'quizScore')::integer;
  END IF;

  IF v_progress_json ? 'lastQuizFailedAt' THEN
    BEGIN
      v_last_failed_at := to_timestamp((v_progress_json ->> 'lastQuizFailedAt')::numeric / 1000);
    EXCEPTION WHEN OTHERS THEN
      v_last_failed_at := NULL;
    END;
  END IF;

  IF v_last_failed_at IS NOT NULL THEN
    v_retry_available_at := v_last_failed_at + make_interval(hours => v_retry_hours);
    v_quiz_retry_blocked := coalesce(v_quiz_score, 0) < v_min_score
      AND now() < v_retry_available_at;
  END IF;

  SELECT count(*)::integer INTO v_content_done
  FROM jsonb_array_elements(v_conteudos) item
  WHERE coalesce(v_progress_json -> 'completedContentIds', '[]'::jsonb) ? (item ->> 'id');

  SELECT count(*)::integer INTO v_activity_done
  FROM jsonb_array_elements(v_atividades) item
  WHERE coalesce(v_progress_json -> 'completedActivityIds', '[]'::jsonb) ? (item ->> 'id');

  v_video_done := CASE
    WHEN v_video_total = 0 THEN 0
    WHEN coalesce(v_progress_json -> 'completedVideoIds', '[]'::jsonb) ? 'video-principal'
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_conteudos) item
        WHERE nullif(btrim(item ->> 'videoUrl'), '') IS NOT NULL
          AND coalesce(v_progress_json -> 'completedVideoIds', '[]'::jsonb) ? (item ->> 'id')
      )
      THEN 1
    ELSE 0
  END;

  v_activity_done := least(v_activity_done, v_activity_total);
  v_total_required := v_content_total + v_activity_total + v_video_total;
  v_total_done := least(v_content_done, v_content_total) + v_activity_done + least(v_video_done, v_video_total);
  v_progress_percent := CASE
    WHEN v_total_required > 0
      THEN least(100, round((v_total_done::numeric / v_total_required::numeric) * 100)::integer)
    ELSE 0
  END;
  v_all_lessons_done := v_content_done >= v_content_total;
  v_all_activities_done := v_activity_done >= v_activity_total;
  v_all_videos_done := v_video_done >= v_video_total;
  v_can_take_quiz := v_all_lessons_done
    AND v_all_activities_done
    AND v_all_videos_done
    AND v_questions_total >= v_min_questions
    AND NOT v_quiz_retry_blocked;

  RETURN jsonb_build_object(
    'progress', v_progress_json || jsonb_build_object(
      'startedAt', extract(epoch FROM v_progress.started_at) * 1000
    ),
    'summary', jsonb_build_object(
      'elapsedMinutes', v_elapsed_minutes,
      'minimumMinutes', 0,
      'progressPercent', v_progress_percent,
      'allLessonsDone', v_all_lessons_done,
      'allActivitiesDone', v_all_activities_done,
      'allVideosDone', v_all_videos_done,
      'minimumTimeDone', true,
      'canTakeQuiz', v_can_take_quiz,
      'quizScore', v_progress_json ->> 'quizScore',
      'quizPassed', v_course_completed,
      'quizMinimumScore', v_min_score,
      'questionsTotal', v_questions_total,
      'minimumQuestions', v_min_questions,
      'quizRetryBlocked', v_quiz_retry_blocked,
      'retryIntervalHours', v_retry_hours,
      'retryAvailableAt', CASE
        WHEN v_retry_available_at IS NOT NULL
          THEN extract(epoch FROM v_retry_available_at) * 1000
        ELSE NULL
      END,
      'completedAt', CASE
        WHEN v_course_completed AND v_progress_json ? 'completedAt'
          THEN (v_progress_json ->> 'completedAt')::numeric
        ELSE NULL
      END,
      'certificateId', v_certificate_id::text
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.ead_get_aluno_progress(p_aluno_id uuid, p_curso_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
  v_context jsonb;
  v_revision jsonb;
  v_can_upgrade boolean := false;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role'
    AND public.current_aluno_id() IS DISTINCT FROM p_aluno_id THEN
    RAISE EXCEPTION 'O progresso EAD só pode ser acessado pelo próprio aluno.' USING ERRCODE = '42501';
  END IF;
  v_result := public.ead_get_aluno_progress_core_20260822(p_aluno_id, p_curso_id);
  v_context := internal_academic.ead_revision_context(p_aluno_id, p_curso_id);
  v_result := v_result || jsonb_build_object('assessmentFeedback',
    internal_academic.ead_assessment_feedback(
      v_result -> 'progress', v_context -> 'config',
      v_context -> 'activityAnswers', v_context -> 'quizAnswers'));
  IF v_context ->> 'revision' IS NULL THEN
    RETURN v_result;
  END IF;
  v_can_upgrade := v_context ->> 'revision' IS DISTINCT FROM v_context ->> 'currentRevision'
    AND NOT coalesce((v_result #>> '{summary,quizPassed}')::boolean, false)
    AND EXISTS (
      SELECT 1 FROM public.matriculas m JOIN public.turmas t ON t.id = m.turma_id
      WHERE m.aluno_id = p_aluno_id AND t.curso_id = p_curso_id
        AND upper(coalesce(m.status, '')) = 'ATIVO')
    AND NOT EXISTS (SELECT 1 FROM public.certificados_academicos ca
      WHERE ca.aluno_id = p_aluno_id AND ca.curso_id = p_curso_id AND ca.modalidade = 'EAD');
  v_revision := jsonb_build_object(
    'current', v_context ->> 'revision',
    'available', v_context ->> 'currentRevision',
    'canUpgrade', v_can_upgrade,
    'isHistorical', v_context ->> 'revision' IS DISTINCT FROM v_context ->> 'currentRevision');
  RETURN v_result || jsonb_build_object(
    'effectiveEadConfig', internal_academic.ead_sanitize_assessment_config(v_context -> 'config'),
    'assessmentRevision', v_revision);
END;
$$;

REVOKE ALL ON FUNCTION public.ead_get_aluno_progress(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ead_get_aluno_progress(uuid, uuid) TO authenticated, service_role;
