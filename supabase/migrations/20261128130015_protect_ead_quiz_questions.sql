BEGIN;

SET LOCAL lock_timeout = '5s';
-- The course row is locked before its answer keys in normal edits and grading.
LOCK TABLE public.cursos IN ACCESS EXCLUSIVE MODE;

ALTER TABLE internal_academic.ead_assessment_answer_keys ADD COLUMN quiz_provas jsonb
  CHECK (jsonb_typeof(quiz_provas) = 'array');

-- A complete edit supplies its new questions, including an explicit empty
-- array if intentional. Metadata-only edits preserve the existing questions.
CREATE FUNCTION internal_academic.ead_restore_quiz_questions(p_config jsonb, p_stored_provas jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT CASE
    WHEN jsonb_typeof(p_config -> 'provas') IS DISTINCT FROM 'array'
      OR jsonb_typeof(p_stored_provas) IS DISTINCT FROM 'array' THEN p_config
    ELSE jsonb_set(p_config, '{provas}', coalesce((
      SELECT jsonb_agg(
        CASE WHEN jsonb_typeof(prova.value) = 'object' AND NOT (prova.value ? 'questoes')
          AND previous.questoes IS NOT NULL
          THEN prova.value || jsonb_build_object('questoes', previous.questoes)
          ELSE prova.value END
        ORDER BY prova.position)
      FROM jsonb_array_elements(p_config -> 'provas') WITH ORDINALITY prova(value, position)
      LEFT JOIN LATERAL (
        SELECT source.value -> 'questoes' AS questoes
        FROM jsonb_array_elements(p_stored_provas) WITH ORDINALITY source(value, position)
        WHERE jsonb_typeof(source.value -> 'questoes') = 'array'
          AND nullif(btrim(source.value ->> 'id'), '') IS NOT DISTINCT FROM nullif(btrim(prova.value ->> 'id'), '')
          AND (nullif(btrim(prova.value ->> 'id'), '') IS NOT NULL OR source.position = prova.position)
        ORDER BY (source.position = prova.position) DESC, source.position
        LIMIT 1
      ) previous ON true
    ), '[]'::jsonb))
  END;
$$;

REVOKE ALL ON FUNCTION internal_academic.ead_restore_quiz_questions(jsonb, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION internal_academic.ead_secure_course_config()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_existing_activity jsonb;
  v_existing_quiz jsonb;
  v_existing_provas jsonb;
  v_config jsonb;
  v_collected jsonb;
  v_sanitized jsonb;
BEGIN
  IF NEW.modalidade = 'EAD' THEN
    SELECT k.activity_answers, k.quiz_answers, k.quiz_provas
    INTO v_existing_activity, v_existing_quiz, v_existing_provas
    FROM internal_academic.ead_assessment_answer_keys k
    WHERE k.course_id = NEW.id;

    v_config := internal_academic.ead_restore_quiz_questions(NEW.ead_config, v_existing_provas);
    v_collected := internal_academic.ead_collect_assessment_answer_keys(
      v_config, coalesce(v_existing_activity, '{}'::jsonb), coalesce(v_existing_quiz, '{}'::jsonb));
    v_sanitized := internal_academic.ead_sanitize_assessment_config(v_config);

    INSERT INTO internal_academic.ead_assessment_answer_keys (course_id, activity_answers, quiz_answers, quiz_provas, updated_at)
    VALUES (NEW.id, v_collected -> 'activities', v_collected -> 'quiz', v_sanitized -> 'provas', now())
    ON CONFLICT (course_id) DO UPDATE SET
      activity_answers = EXCLUDED.activity_answers,
      quiz_answers = EXCLUDED.quiz_answers,
      quiz_provas = EXCLUDED.quiz_provas,
      updated_at = now();

    NEW.ead_config := internal_academic.ead_mask_quiz_questions(v_sanitized);
  ELSIF TG_OP = 'UPDATE' AND OLD.modalidade = 'EAD' THEN
    DELETE FROM internal_academic.ead_assessment_answer_keys WHERE course_id = OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

DO $live_readers$
DECLARE
  definition text := pg_get_functiondef('internal_academic.ead_revision_context(uuid,uuid)'::regprocedure);
  context_anchor constant text := 'SELECT c.ead_config, k.activity_answers, k.quiz_answers INTO v_course';
  context_replacement constant text := $patch$SELECT internal_academic.ead_restore_quiz_questions(c.ead_config, k.quiz_provas) AS ead_config,
    k.activity_answers, k.quiz_answers INTO v_course$patch$;
  management_anchor constant text := E'      c.ead_config,\n      k.activity_answers,';
  management_replacement constant text := $patch$      internal_academic.ead_restore_quiz_questions(c.ead_config, k.quiz_provas),
      k.activity_answers,$patch$;
BEGIN
  IF length(definition) - length(replace(definition, context_anchor, '')) <> length(context_anchor) THEN
    RAISE EXCEPTION 'EAD_QUIZ_STORAGE_CONTEXT_DRIFT';
  END IF;
  EXECUTE replace(definition, context_anchor, context_replacement);

  definition := pg_get_functiondef('public.get_ead_course_configs_for_management(uuid[])'::regprocedure);
  IF length(definition) - length(replace(definition, management_anchor, '')) <> length(management_anchor) THEN
    RAISE EXCEPTION 'EAD_QUIZ_STORAGE_MANAGEMENT_DRIFT';
  END IF;
  EXECUTE replace(definition, management_anchor, management_replacement);
END $live_readers$;

-- A catalog-only rewrite must leave the authoritative revision snapshot intact.
-- Ordinary edits restore questions from that private snapshot before comparing.
DO $revision_editor$
DECLARE
  definition text := pg_get_functiondef('internal_academic.ead_preserve_course_revision()'::regprocedure);
  previous_revision constant text := E'  v_previous := coalesce(nullif(OLD.ead_config';
  collect_keys constant text := E'  v_keys := internal_academic.ead_collect_assessment_answer_keys(\n';
  no_config_change constant text := $patch$  IF NEW.ead_config IS NOT DISTINCT FROM OLD.ead_config THEN
    RETURN NEW;
  END IF;
$patch$;
  hydrate_config constant text := $patch$  NEW.ead_config := internal_academic.ead_restore_quiz_questions(
    NEW.ead_config, v_existing.config -> 'provas');
$patch$;
BEGIN
  IF length(definition) - length(replace(definition, previous_revision, '')) <> length(previous_revision)
    OR length(definition) - length(replace(definition, collect_keys, '')) <> length(collect_keys) THEN
    RAISE EXCEPTION 'EAD_QUIZ_STORAGE_REVISION_DRIFT';
  END IF;
  definition := replace(definition, previous_revision, no_config_change || previous_revision);
  EXECUTE replace(definition, collect_keys, hydrate_config || collect_keys);
END $revision_editor$;

UPDATE public.cursos AS course
SET ead_config = course.ead_config
WHERE course.modalidade = 'EAD'
  AND course.ead_config IS DISTINCT FROM internal_academic.ead_mask_quiz_questions(course.ead_config);

COMMIT;
