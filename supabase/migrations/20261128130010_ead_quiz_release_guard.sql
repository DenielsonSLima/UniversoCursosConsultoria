BEGIN;

CREATE FUNCTION internal_academic.ead_mask_quiz_questions(p_config jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT CASE WHEN jsonb_typeof(p_config -> 'provas') = 'array' THEN
    jsonb_set(p_config, '{provas}', coalesce((
      SELECT jsonb_agg(
        CASE WHEN jsonb_typeof(prova.value) = 'object' THEN prova.value - 'questoes' ELSE prova.value END
        ORDER BY prova.position)
      FROM jsonb_array_elements(p_config -> 'provas') WITH ORDINALITY prova(value, position)
    ), '[]'::jsonb))
  ELSE p_config END;
$$;

REVOKE ALL ON FUNCTION internal_academic.ead_mask_quiz_questions(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

-- A carência usa a mesma matrícula que a sala já seleciona. Provas concluídas
-- antes da política continuam acessíveis para conferência e segunda via.
DO $read_state$
DECLARE
  definition text := pg_get_functiondef('public.ead_get_aluno_progress_core_20260822(uuid,uuid)'::regprocedure);
  declarations constant text := E'  v_certificate_id uuid;\n';
  result_start constant text := E'  RETURN jsonb_build_object(\n';
  availability constant text := $anchor$      'canTakeQuiz', v_can_take_quiz AND ($anchor$;
  study_variables constant text := $variables$  v_study_started_at timestamptz;
  v_quiz_available_at timestamptz;
  v_quiz_waiting boolean;
$variables$;
  load_study constant text := $state$  SELECT s.study_started_at, s.quiz_available_at, s.quiz_waiting AND NOT v_course_completed
  INTO v_study_started_at, v_quiz_available_at, v_quiz_waiting
  FROM internal_academic.ead_quiz_wait_state(v_matricula.id) s;

$state$;
  summary_fields constant text := $fields$      'studyStartedAt', extract(epoch FROM v_study_started_at) * 1000,
      'quizAvailableAt', extract(epoch FROM v_quiz_available_at) * 1000,
      'quizWaiting', v_quiz_waiting,
      'canTakeQuiz', v_can_take_quiz AND NOT v_quiz_waiting AND ($fields$;
BEGIN
  IF length(definition) - length(replace(definition, declarations, '')) <> length(declarations)
    OR length(definition) - length(replace(definition, result_start, '')) <> length(result_start)
    OR length(definition) - length(replace(definition, availability, '')) <> length(availability) THEN
    RAISE EXCEPTION 'EAD_QUIZ_RELEASE_READ_DRIFT';
  END IF;

  definition := replace(definition, declarations, declarations || study_variables);
  definition := replace(definition, result_start, load_study || result_start);
  EXECUTE replace(definition, availability, summary_fields);
END $read_state$;

-- A revisão selecionada continua sendo a fonte das questões. Durante a
-- carência, o RPC da sala devolve somente os metadados da prova.
DO $read_config$
DECLARE
  definition text := pg_get_functiondef('public.ead_get_aluno_progress(uuid,uuid)'::regprocedure);
  no_revision constant text := $anchor$  IF v_context ->> 'revision' IS NULL THEN
    RETURN v_result;
  END IF;$anchor$;
  config_value constant text := $anchor$internal_academic.ead_sanitize_assessment_config(v_context -> 'config')$anchor$;
  before_revision constant text := $patch$  v_result := v_result || jsonb_build_object('effectiveEadConfig',
    CASE WHEN NOT coalesce((v_result #>> '{summary,quizWaiting}')::boolean, true) AND (
      coalesce((v_result #>> '{summary,canTakeQuiz}')::boolean, false)
      OR coalesce((v_result #>> '{summary,quizPassed}')::boolean, false)
      OR coalesce((v_result #>> '{summary,quizRetryBlocked}')::boolean, false)
    ) THEN internal_academic.ead_sanitize_assessment_config(v_context -> 'config')
    ELSE internal_academic.ead_mask_quiz_questions(
      internal_academic.ead_sanitize_assessment_config(v_context -> 'config')) END);
$patch$;
  return_revision constant text := $anchor$  RETURN v_result || jsonb_build_object(
    'effectiveEadConfig', internal_academic.ead_sanitize_assessment_config(v_context -> 'config'),
    'assessmentRevision', v_revision);$anchor$;
BEGIN
  IF length(definition) - length(replace(definition, no_revision, '')) <> length(no_revision)
    OR length(definition) - length(replace(definition, return_revision, '')) <> length(return_revision) THEN
    RAISE EXCEPTION 'EAD_QUIZ_RELEASE_CONFIG_DRIFT';
  END IF;

  definition := replace(definition, return_revision,
    $patch$  RETURN v_result || jsonb_build_object('assessmentRevision', v_revision);$patch$);
  EXECUTE replace(definition, no_revision, before_revision || no_revision);
END $read_config$;

-- A RPC já autorizou o aluno e travou a matrícula antes destes pontos. A
-- guarda roda após o replay de prova concluída e antes da correção nova.
DO $submit_guard$
DECLARE
  definition text := pg_get_functiondef('public.ead_update_aluno_progress(uuid,uuid,text,text,jsonb)'::regprocedure);
  delegate constant text := E'  v_result := public.ead_update_aluno_progress_core_20260822(\n';
  certificate_check constant text := E'  IF (v_matricula_status IN (''ATIVO'',''CONCLUIDO'')\n';
  check_wait constant text := $patch$  IF v_action = 'finish_quiz' AND (
    SELECT s.quiz_waiting FROM internal_academic.ead_quiz_wait_state(v_matricula_id) s
  ) THEN
    RAISE EXCEPTION 'A prova final é liberada após 7 dias completos desde o início do estudo ou por autorização da Secretaria.'
      USING ERRCODE = 'PT409';
  END IF;

$patch$;
  record_progress constant text := $patch$  IF v_action IN ('toggle_content', 'toggle_activity', 'toggle_video', 'set_activity_answer')
    AND v_matricula_status <> 'CONCLUIDO'
    AND NOT coalesce((v_result #>> '{summary,quizPassed}')::boolean, false)
    AND (v_result #>> '{summary,studyStartedAt}') IS NULL
    AND ((v_result -> 'progress') - 'startedAt') IS DISTINCT FROM (v_progress - 'startedAt')
    AND internal_academic.ead_record_study_start(v_matricula_id) THEN
    RETURN public.ead_get_aluno_progress(p_aluno_id, p_curso_id);
  END IF;

$patch$;
BEGIN
  IF length(definition) - length(replace(definition, delegate, '')) <> length(delegate)
    OR length(definition) - length(replace(definition, certificate_check, '')) <> length(certificate_check) THEN
    RAISE EXCEPTION 'EAD_QUIZ_RELEASE_SUBMIT_DRIFT';
  END IF;

  definition := replace(definition, delegate, check_wait || delegate);
  EXECUTE replace(definition, certificate_check, record_progress || certificate_check);
END $submit_guard$;

COMMIT;
