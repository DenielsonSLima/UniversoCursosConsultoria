-- Mantém gabaritos EAD fora do schema exposto e normaliza aliases legados.
-- A remoção do payload público ocorre apenas depois que todos os RPCs usam este contrato.

CREATE TABLE internal_academic.ead_assessment_answer_keys (
  course_id uuid PRIMARY KEY
    REFERENCES public.cursos(id) ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED,
  activity_answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  quiz_answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ead_assessment_activity_answers_object
    CHECK (jsonb_typeof(activity_answers) = 'object'),
  CONSTRAINT ead_assessment_quiz_answers_object
    CHECK (jsonb_typeof(quiz_answers) = 'object')
);

REVOKE ALL ON TABLE internal_academic.ead_assessment_answer_keys
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION internal_academic.ead_answer_alias(p_item jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_alias text;
  v_candidate text;
  v_answer text;
BEGIN
  IF jsonb_typeof(p_item) <> 'object' THEN
    RETURN NULL;
  END IF;

  FOREACH v_alias IN ARRAY ARRAY[
    'respostaCorreta',
    'resposta_correta',
    'correctAnswer',
    'correct_answer',
    'gabarito'
  ] LOOP
    IF p_item ? v_alias THEN
      IF jsonb_typeof(p_item -> v_alias) NOT IN ('string', 'number') THEN
        RAISE EXCEPTION 'O alias de gabarito % deve ser texto ou número.', v_alias
          USING ERRCODE = '23514';
      END IF;
      v_candidate := btrim(p_item ->> v_alias);
      IF nullif(v_candidate, '') IS NULL THEN
        RAISE EXCEPTION 'O alias de gabarito % não pode ficar vazio.', v_alias
          USING ERRCODE = '23514';
      END IF;
      IF v_answer IS NOT NULL AND v_answer IS DISTINCT FROM v_candidate THEN
        RAISE EXCEPTION 'Aliases de gabarito conflitantes no mesmo item.'
          USING ERRCODE = '23514';
      END IF;
      v_answer := v_candidate;
    END IF;
  END LOOP;

  RETURN v_answer;
END;
$$;

CREATE FUNCTION internal_academic.ead_collect_assessment_answer_keys(
  p_config jsonb,
  p_existing_activity jsonb DEFAULT '{}'::jsonb,
  p_existing_quiz jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_config jsonb := coalesce(p_config, '{}'::jsonb);
  v_regras jsonb;
  v_activities jsonb;
  v_provas jsonb;
  v_questions jsonb;
  v_activity_keys jsonb := '{}'::jsonb;
  v_quiz_keys jsonb := '{}'::jsonb;
  v_seen_activities jsonb := '{}'::jsonb;
  v_seen_questions jsonb := '{}'::jsonb;
  v_item jsonb;
  v_prova jsonb;
  v_id text;
  v_answer text;
  v_options jsonb;
  v_type text;
  v_is_open boolean;
  v_is_choice boolean;
BEGIN
  IF jsonb_typeof(v_config) <> 'object' THEN
    RAISE EXCEPTION 'Configuração EAD deve ser um objeto.' USING ERRCODE = '23514';
  END IF;

  v_regras := coalesce(v_config -> 'regras', '{}'::jsonb);
  IF jsonb_typeof(v_regras) <> 'object'
    OR (v_regras ? 'exigirAtividades'
      AND jsonb_typeof(v_regras -> 'exigirAtividades') <> 'boolean')
    OR (v_regras ? 'exigirVideosConcluidos'
      AND jsonb_typeof(v_regras -> 'exigirVideosConcluidos') <> 'boolean')
  THEN
    RAISE EXCEPTION 'Regras de conclusão EAD inválidas.' USING ERRCODE = '23514';
  END IF;
  IF v_regras ? 'intervaloReprovacaoHoras' THEN
    v_answer := v_regras ->> 'intervaloReprovacaoHoras';
    IF jsonb_typeof(v_regras -> 'intervaloReprovacaoHoras') NOT IN ('string', 'number')
      OR v_answer !~ '^(0|[1-9][0-9]*)$'
      OR length(v_answer) > 4
    THEN
      RAISE EXCEPTION 'Intervalo de retentativa EAD inválido.' USING ERRCODE = '23514';
    END IF;
    IF v_answer::numeric < 1 OR v_answer::numeric > 8760 THEN
      RAISE EXCEPTION 'Intervalo de retentativa EAD inválido.' USING ERRCODE = '23514';
    END IF;
  END IF;

  v_activities := coalesce(v_config -> 'atividades', '[]'::jsonb);
  IF jsonb_typeof(v_activities) <> 'array' THEN
    RAISE EXCEPTION 'Configuração de atividades EAD inválida.' USING ERRCODE = '23514';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_activities) LOOP
    v_id := v_item ->> 'id';
    IF jsonb_typeof(v_item) <> 'object'
      OR nullif(btrim(v_id), '') IS NULL
      OR v_id IS DISTINCT FROM btrim(v_id)
      OR v_seen_activities ? v_id
    THEN
      RAISE EXCEPTION 'Atividades EAD possuem IDs ausentes, não canônicos ou repetidos.'
        USING ERRCODE = '23514';
    END IF;
    IF jsonb_typeof(v_item -> 'titulo') <> 'string'
      OR nullif(btrim(v_item ->> 'titulo'), '') IS NULL
      OR jsonb_typeof(v_item -> 'enunciado') <> 'string'
      OR nullif(btrim(v_item ->> 'enunciado'), '') IS NULL
    THEN
      RAISE EXCEPTION 'Toda atividade EAD precisa de título e enunciado.'
        USING ERRCODE = '23514';
    END IF;

    v_seen_activities := v_seen_activities || jsonb_build_object(v_id, true);
    v_type := lower(coalesce(v_item ->> 'tipo', ''));
    v_is_open := v_type ~ '(reflex|discurs|aberta|texto)';
    v_answer := internal_academic.ead_answer_alias(v_item);
    v_is_choice := NOT v_is_open AND (
      v_type ~ '(multip|objetiv|selec|quiz)'
      OR v_item ? 'opcoes'
      OR v_answer IS NOT NULL
    );

    IF v_is_choice THEN
      v_options := v_item -> 'opcoes';
      IF jsonb_typeof(v_options) <> 'array' THEN
        RAISE EXCEPTION 'Alternativas da atividade EAD são inválidas.'
          USING ERRCODE = '23514';
      END IF;
      IF jsonb_array_length(v_options) < 2
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(v_options) option_value
          WHERE jsonb_typeof(option_value) <> 'string'
            OR nullif(btrim(option_value #>> '{}'), '') IS NULL
        )
      THEN
        RAISE EXCEPTION 'Alternativas da atividade EAD são inválidas.'
          USING ERRCODE = '23514';
      END IF;

      v_answer := coalesce(v_answer, p_existing_activity ->> v_id);
      IF v_answer IS NULL
        OR v_answer !~ '^(0|[1-9][0-9]*)$'
        OR length(v_answer) > 10
      THEN
        RAISE EXCEPTION 'Gabarito da atividade EAD é inválido ou ausente.'
          USING ERRCODE = '23514';
      END IF;
      IF v_answer::numeric >= jsonb_array_length(v_options) THEN
        RAISE EXCEPTION 'Gabarito da atividade EAD é inválido ou ausente.'
          USING ERRCODE = '23514';
      END IF;
      v_activity_keys := v_activity_keys || jsonb_build_object(v_id, v_answer);
    END IF;
  END LOOP;

  v_provas := coalesce(v_config -> 'provas', '[]'::jsonb);
  IF jsonb_typeof(v_provas) <> 'array' THEN
    RAISE EXCEPTION 'Configuração de provas EAD inválida.' USING ERRCODE = '23514';
  END IF;

  FOR v_prova IN SELECT value FROM jsonb_array_elements(v_provas) LOOP
    IF jsonb_typeof(v_prova) <> 'object' THEN
      RAISE EXCEPTION 'Configuração de prova EAD inválida.' USING ERRCODE = '23514';
    END IF;
    IF v_prova ? 'notaMinima' THEN
      v_answer := v_prova ->> 'notaMinima';
      IF jsonb_typeof(v_prova -> 'notaMinima') NOT IN ('string', 'number')
        OR v_answer !~ '^(0|[1-9][0-9]*)$'
        OR length(v_answer) > 3
      THEN
        RAISE EXCEPTION 'Nota mínima da prova EAD inválida.' USING ERRCODE = '23514';
      END IF;
      IF v_answer::numeric > 100 THEN
        RAISE EXCEPTION 'Nota mínima da prova EAD inválida.' USING ERRCODE = '23514';
      END IF;
    END IF;
    v_questions := coalesce(v_prova -> 'questoes', '[]'::jsonb);
    IF jsonb_typeof(v_questions) <> 'array' THEN
      RAISE EXCEPTION 'Questões da prova EAD são inválidas.' USING ERRCODE = '23514';
    END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(v_questions) LOOP
      v_id := v_item ->> 'id';
      IF jsonb_typeof(v_item) <> 'object'
        OR nullif(btrim(v_id), '') IS NULL
        OR v_id IS DISTINCT FROM btrim(v_id)
        OR v_seen_questions ? v_id
        OR jsonb_typeof(v_item -> 'pergunta') <> 'string'
        OR nullif(btrim(v_item ->> 'pergunta'), '') IS NULL
      THEN
        RAISE EXCEPTION 'Questões EAD possuem conteúdo ou IDs inválidos/repetidos.'
          USING ERRCODE = '23514';
      END IF;

      v_seen_questions := v_seen_questions || jsonb_build_object(v_id, true);
      v_options := v_item -> 'opcoes';
      IF jsonb_typeof(v_options) <> 'array' THEN
        RAISE EXCEPTION 'Alternativas da prova EAD são inválidas.' USING ERRCODE = '23514';
      END IF;
      IF jsonb_array_length(v_options) < 2
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(v_options) option_value
          WHERE jsonb_typeof(option_value) <> 'string'
            OR nullif(btrim(option_value #>> '{}'), '') IS NULL
        )
      THEN
        RAISE EXCEPTION 'Alternativas da prova EAD são inválidas.' USING ERRCODE = '23514';
      END IF;

      v_answer := coalesce(
        internal_academic.ead_answer_alias(v_item),
        p_existing_quiz ->> v_id
      );
      IF v_answer IS NULL
        OR v_answer !~ '^(0|[1-9][0-9]*)$'
        OR length(v_answer) > 10
      THEN
        RAISE EXCEPTION 'Gabarito da prova EAD é inválido ou ausente.'
          USING ERRCODE = '23514';
      END IF;
      IF v_answer::numeric >= jsonb_array_length(v_options) THEN
        RAISE EXCEPTION 'Gabarito da prova EAD é inválido ou ausente.'
          USING ERRCODE = '23514';
      END IF;
      v_quiz_keys := v_quiz_keys || jsonb_build_object(v_id, v_answer);
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('activities', v_activity_keys, 'quiz', v_quiz_keys);
END;
$$;

CREATE FUNCTION internal_academic.ead_sanitize_assessment_config(p_config jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb := coalesce(p_config, '{}'::jsonb);
  v_items jsonb := '[]'::jsonb;
  v_provas jsonb := '[]'::jsonb;
  v_questions jsonb;
  v_item jsonb;
  v_prova jsonb;
BEGIN
  IF v_result ? 'atividades' THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements(v_result -> 'atividades') LOOP
      v_items := v_items || jsonb_build_array(
        v_item - 'respostaCorreta' - 'resposta_correta'
          - 'correctAnswer' - 'correct_answer' - 'gabarito'
      );
    END LOOP;
    v_result := jsonb_set(v_result, '{atividades}', v_items, true);
  END IF;

  IF v_result ? 'provas' THEN
    FOR v_prova IN SELECT value FROM jsonb_array_elements(v_result -> 'provas') LOOP
      IF v_prova ? 'questoes' THEN
        v_questions := '[]'::jsonb;
        FOR v_item IN SELECT value FROM jsonb_array_elements(v_prova -> 'questoes') LOOP
          v_questions := v_questions || jsonb_build_array(
            v_item - 'respostaCorreta' - 'resposta_correta'
              - 'correctAnswer' - 'correct_answer' - 'gabarito'
          );
        END LOOP;
        v_prova := jsonb_set(v_prova, '{questoes}', v_questions, true);
      END IF;
      v_provas := v_provas || jsonb_build_array(v_prova);
    END LOOP;
    v_result := jsonb_set(v_result, '{provas}', v_provas, true);
  END IF;
  RETURN v_result;
END;
$$;

CREATE FUNCTION internal_academic.ead_restore_assessment_answers(
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
  v_result jsonb := internal_academic.ead_sanitize_assessment_config(p_config);
  v_items jsonb := '[]'::jsonb;
  v_provas jsonb := '[]'::jsonb;
  v_questions jsonb;
  v_item jsonb;
  v_prova jsonb;
  v_id text;
BEGIN
  IF v_result ? 'atividades' THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements(v_result -> 'atividades') LOOP
      v_id := v_item ->> 'id';
      IF coalesce(p_activity_answers, '{}'::jsonb) ? v_id THEN
        v_item := jsonb_set(
          v_item,
          '{respostaCorreta}',
          to_jsonb((p_activity_answers ->> v_id)::integer),
          true
        );
      END IF;
      v_items := v_items || jsonb_build_array(v_item);
    END LOOP;
    v_result := jsonb_set(v_result, '{atividades}', v_items, true);
  END IF;

  IF v_result ? 'provas' THEN
    FOR v_prova IN SELECT value FROM jsonb_array_elements(v_result -> 'provas') LOOP
      IF v_prova ? 'questoes' THEN
        v_questions := '[]'::jsonb;
        FOR v_item IN SELECT value FROM jsonb_array_elements(v_prova -> 'questoes') LOOP
          v_id := v_item ->> 'id';
          IF coalesce(p_quiz_answers, '{}'::jsonb) ? v_id THEN
            v_item := jsonb_set(
              v_item,
              '{respostaCorreta}',
              to_jsonb((p_quiz_answers ->> v_id)::integer),
              true
            );
          END IF;
          v_questions := v_questions || jsonb_build_array(v_item);
        END LOOP;
        v_prova := jsonb_set(v_prova, '{questoes}', v_questions, true);
      END IF;
      v_provas := v_provas || jsonb_build_array(v_prova);
    END LOOP;
    v_result := jsonb_set(v_result, '{provas}', v_provas, true);
  END IF;
  RETURN v_result;
END;
$$;

INSERT INTO internal_academic.ead_assessment_answer_keys (
  course_id,
  activity_answers,
  quiz_answers
)
SELECT
  c.id,
  collected.keys -> 'activities',
  collected.keys -> 'quiz'
FROM public.cursos c
CROSS JOIN LATERAL (
  SELECT internal_academic.ead_collect_assessment_answer_keys(
    c.ead_config,
    '{}'::jsonb,
    '{}'::jsonb
  ) AS keys
) collected
WHERE c.modalidade = 'EAD';

REVOKE ALL ON FUNCTION internal_academic.ead_answer_alias(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION internal_academic.ead_collect_assessment_answer_keys(jsonb, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION internal_academic.ead_sanitize_assessment_config(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION internal_academic.ead_restore_assessment_answers(jsonb, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE internal_academic.ead_assessment_answer_keys IS
  'Gabaritos EAD privados, indexados por IDs canônicos e nunca expostos pelo Data API.';
