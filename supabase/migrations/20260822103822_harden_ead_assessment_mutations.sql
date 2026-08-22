-- Serializa e valida de forma autoritativa as mutações das atividades e da prova EAD.
-- A implementação anterior permanece como núcleo dos efeitos acadêmicos/certificados,
-- mas deixa de ser executável diretamente pelos clientes.

ALTER FUNCTION public.ead_get_aluno_progress(uuid, uuid)
  SET search_path = '';

ALTER FUNCTION public.ead_update_aluno_progress(uuid, uuid, text, text, jsonb)
  RENAME TO ead_update_aluno_progress_core_20260822;

ALTER FUNCTION public.ead_update_aluno_progress_core_20260822(uuid, uuid, text, text, jsonb)
  SET search_path = '';

REVOKE ALL ON FUNCTION public.ead_update_aluno_progress_core_20260822(uuid, uuid, text, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.ead_update_aluno_progress(
  p_aluno_id uuid,
  p_curso_id uuid,
  p_action text,
  p_item_id text DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_progress jsonb;
  v_course_config jsonb;
  v_activities jsonb;
  v_activity jsonb;
  v_activity_matches integer;
  v_activity_type text;
  v_activity_options jsonb;
  v_option_count integer;
  v_answer text;
  v_answer_type text;
  v_correct_answer text;
  v_is_open_activity boolean;
  v_is_choice_activity boolean;
  v_questions jsonb;
  v_answers jsonb;
  v_questions_total integer;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role'
    AND public.current_aluno_id() IS DISTINCT FROM p_aluno_id
  THEN
    RAISE EXCEPTION 'O progresso EAD só pode ser alterado pelo próprio aluno.'
      USING ERRCODE = '42501';
  END IF;

  IF v_action NOT IN (
    'toggle_content',
    'toggle_activity',
    'complete_activity',
    'toggle_video',
    'set_activity_answer',
    'finish_quiz'
  ) THEN
    RAISE EXCEPTION 'Ação EAD inválida: %', p_action USING ERRCODE = '23514';
  END IF;

  -- Garante matrícula válida e cria o registro de progresso quando necessário.
  PERFORM public.ead_get_aluno_progress(p_aluno_id, p_curso_id);

  SELECT ep.progress
  INTO v_progress
  FROM public.ead_aluno_progresso ep
  WHERE ep.aluno_id = p_aluno_id
    AND ep.curso_id = p_curso_id
  FOR UPDATE;

  SELECT c.ead_config
  INTO v_course_config
  FROM public.cursos c
  WHERE c.id = p_curso_id
    AND c.modalidade = 'EAD'
  FOR SHARE;

  IF v_course_config IS NULL THEN
    RAISE EXCEPTION 'Configuração do curso EAD não encontrada.' USING ERRCODE = '23514';
  END IF;

  IF v_action IN ('set_activity_answer', 'complete_activity', 'toggle_activity') THEN
    IF nullif(btrim(coalesce(p_item_id, '')), '') IS NULL
      OR p_item_id IS DISTINCT FROM btrim(p_item_id)
    THEN
      RAISE EXCEPTION 'Informe um identificador canônico da atividade.' USING ERRCODE = '23514';
    END IF;

    v_activities := coalesce(v_course_config -> 'atividades', '[]'::jsonb);
    IF jsonb_typeof(v_activities) <> 'array' THEN
      RAISE EXCEPTION 'Configuração de atividades EAD inválida.' USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_activities) item
      WHERE jsonb_typeof(item) <> 'object'
        OR nullif(btrim(item ->> 'id'), '') IS NULL
        OR item ->> 'id' IS DISTINCT FROM btrim(item ->> 'id')
    ) OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_activities) item
      GROUP BY item ->> 'id'
      HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'As atividades EAD possuem identificadores ausentes ou repetidos.'
        USING ERRCODE = '23514';
    END IF;

    SELECT count(*)::integer
    INTO v_activity_matches
    FROM jsonb_array_elements(v_activities) item
    WHERE item ->> 'id' = p_item_id;

    IF v_activity_matches <> 1 THEN
      RAISE EXCEPTION 'Atividade EAD inválida.' USING ERRCODE = '23514';
    END IF;

    SELECT item
    INTO v_activity
    FROM jsonb_array_elements(v_activities) item
    WHERE item ->> 'id' = p_item_id
    LIMIT 1;

    v_activity_type := lower(coalesce(v_activity ->> 'tipo', ''));
    v_is_open_activity := v_activity_type ~ '(reflex|discurs|aberta|texto)';
    v_is_choice_activity := NOT v_is_open_activity AND (
      v_activity_type ~ '(multip|objetiv|selec|quiz)'
      OR v_activity ? 'opcoes'
      OR v_activity ? 'respostaCorreta'
    );

    IF v_is_choice_activity THEN
      v_activity_options := v_activity -> 'opcoes';
      IF jsonb_typeof(v_activity_options) <> 'array' THEN
        RAISE EXCEPTION 'As alternativas da atividade EAD são inválidas.' USING ERRCODE = '23514';
      END IF;
      v_option_count := jsonb_array_length(v_activity_options);
      IF v_option_count < 2 OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(v_activity_options) option_value
          WHERE jsonb_typeof(option_value) <> 'string'
            OR nullif(btrim(option_value #>> '{}'), '') IS NULL
        )
      THEN
        RAISE EXCEPTION 'As alternativas da atividade EAD são inválidas.' USING ERRCODE = '23514';
      END IF;

      v_correct_answer := v_activity ->> 'respostaCorreta';
      IF v_correct_answer IS NULL
        OR v_correct_answer !~ '^(0|[1-9][0-9]*)$'
        OR length(v_correct_answer) > 10
      THEN
        RAISE EXCEPTION 'O gabarito da atividade EAD é inválido.' USING ERRCODE = '23514';
      END IF;
      IF v_correct_answer::numeric >= v_option_count THEN
        RAISE EXCEPTION 'O gabarito da atividade EAD é inválido.' USING ERRCODE = '23514';
      END IF;
    END IF;

    IF v_action = 'set_activity_answer' THEN
      IF coalesce(v_progress -> 'completedActivityIds', '[]'::jsonb) ? p_item_id THEN
        RAISE EXCEPTION 'A atividade concluída não pode mais ser alterada.' USING ERRCODE = '23514';
      END IF;
      IF jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object'
        OR NOT (coalesce(p_payload, '{}'::jsonb) ? 'answer')
      THEN
        RAISE EXCEPTION 'Informe a resposta da atividade.' USING ERRCODE = '23514';
      END IF;

      v_answer_type := jsonb_typeof(p_payload -> 'answer');
      v_answer := p_payload ->> 'answer';
      IF v_is_choice_activity THEN
        IF v_answer_type IS NULL
          OR v_answer_type NOT IN ('string', 'number')
          OR v_answer !~ '^(0|[1-9][0-9]*)$'
          OR length(v_answer) > 10
        THEN
          RAISE EXCEPTION 'A resposta objetiva da atividade EAD é inválida.' USING ERRCODE = '23514';
        END IF;
        IF v_answer::numeric >= v_option_count THEN
          RAISE EXCEPTION 'A resposta objetiva da atividade EAD é inválida.' USING ERRCODE = '23514';
        END IF;
      ELSIF v_answer_type <> 'string' OR nullif(btrim(coalesce(v_answer, '')), '') IS NULL THEN
        RAISE EXCEPTION 'A resposta escrita da atividade EAD não pode ficar vazia.' USING ERRCODE = '23514';
      END IF;
    ELSE
      IF coalesce(v_progress -> 'completedActivityIds', '[]'::jsonb) ? p_item_id THEN
        RETURN public.ead_get_aluno_progress(p_aluno_id, p_curso_id);
      END IF;

      v_answer := v_progress #>> ARRAY['activityAnswers', p_item_id];
      IF nullif(btrim(coalesce(v_answer, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Responda a atividade antes de concluí-la.' USING ERRCODE = '23514';
      END IF;
      IF v_is_choice_activity THEN
        IF v_answer !~ '^(0|[1-9][0-9]*)$' OR length(v_answer) > 10 THEN
          RAISE EXCEPTION 'A resposta objetiva da atividade EAD é inválida.' USING ERRCODE = '23514';
        END IF;
        IF v_answer::numeric >= v_option_count
          OR v_answer::numeric <> v_correct_answer::numeric
        THEN
          RAISE EXCEPTION 'A atividade só pode ser concluída após a resposta correta.'
            USING ERRCODE = '23514';
        END IF;
      END IF;

      -- O toggle legado passa a compartilhar a semântica monotônica/idempotente.
      v_action := 'toggle_activity';
    END IF;
  ELSIF v_action = 'finish_quiz' THEN
    v_questions := coalesce(v_course_config #> '{provas,0,questoes}', '[]'::jsonb);
    IF jsonb_typeof(v_questions) <> 'array' THEN
      RAISE EXCEPTION 'Configuração da prova EAD inválida.' USING ERRCODE = '23514';
    END IF;

    v_questions_total := jsonb_array_length(v_questions);
    IF v_questions_total < 10 THEN
      RAISE EXCEPTION 'A prova precisa ter no mínimo 10 questões cadastradas.' USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_questions) question
      WHERE jsonb_typeof(question) <> 'object'
        OR nullif(btrim(question ->> 'id'), '') IS NULL
        OR question ->> 'id' IS DISTINCT FROM btrim(question ->> 'id')
        OR nullif(btrim(question ->> 'pergunta'), '') IS NULL
        OR jsonb_typeof(question -> 'pergunta') <> 'string'
        OR jsonb_typeof(question -> 'opcoes') <> 'array'
    ) THEN
      RAISE EXCEPTION 'A prova EAD possui questões, alternativas ou gabaritos inválidos.'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_questions) question
      WHERE jsonb_array_length(question -> 'opcoes') < 2
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(question -> 'opcoes') option_value
          WHERE jsonb_typeof(option_value) <> 'string'
            OR nullif(btrim(option_value #>> '{}'), '') IS NULL
        )
    ) THEN
      RAISE EXCEPTION 'A prova EAD possui questões, alternativas ou gabaritos inválidos.'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_questions) question
      WHERE question ->> 'respostaCorreta' IS NULL
        OR question ->> 'respostaCorreta' !~ '^(0|[1-9][0-9]*)$'
        OR length(question ->> 'respostaCorreta') > 10
    ) THEN
      RAISE EXCEPTION 'A prova EAD possui questões, alternativas ou gabaritos inválidos.'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_questions) question
      WHERE (question ->> 'respostaCorreta')::numeric >= jsonb_array_length(question -> 'opcoes')
    ) OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_questions) question
      GROUP BY question ->> 'id'
      HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'A prova EAD possui questões, alternativas ou gabaritos inválidos.'
        USING ERRCODE = '23514';
    END IF;

    IF jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object'
      OR jsonb_typeof(p_payload -> 'answers') <> 'object'
    THEN
      RAISE EXCEPTION 'Envie as respostas da prova em um objeto válido.' USING ERRCODE = '23514';
    END IF;
    v_answers := p_payload -> 'answers';

    IF (SELECT count(*) FROM jsonb_each(v_answers)) <> v_questions_total
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_questions) question
        WHERE NOT (v_answers ? (question ->> 'id'))
      )
      OR EXISTS (
        SELECT 1
        FROM jsonb_each(v_answers) answer_entry
        WHERE jsonb_typeof(answer_entry.value) NOT IN ('string', 'number')
          OR answer_entry.value #>> '{}' !~ '^(0|[1-9][0-9]*)$'
          OR length(answer_entry.value #>> '{}') > 10
      )
    THEN
      RAISE EXCEPTION 'Responda exatamente todas as questões válidas antes de corrigir a prova.'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_each(v_answers) answer_entry
      WHERE NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_questions) question
        WHERE question ->> 'id' = answer_entry.key
          AND (answer_entry.value #>> '{}')::numeric < jsonb_array_length(question -> 'opcoes')
      )
    ) THEN
      RAISE EXCEPTION 'Responda exatamente todas as questões válidas antes de corrigir a prova.'
        USING ERRCODE = '23514';
    END IF;

    -- Um replay depois de sucesso só é idempotente para a mesma tentativa
    -- autoritativamente gravada; payload diferente permanece bloqueado.
    IF public.ead_progress_meets_completion(v_progress, v_course_config) THEN
      IF coalesce(v_progress -> 'quizAnswers', '{}'::jsonb) IS DISTINCT FROM v_answers THEN
        RAISE EXCEPTION 'A prova já foi concluída com outro conjunto de respostas.'
          USING ERRCODE = '23514';
      END IF;
      RETURN public.ead_get_aluno_progress(p_aluno_id, p_curso_id);
    END IF;
  END IF;

  RETURN public.ead_update_aluno_progress_core_20260822(
    p_aluno_id,
    p_curso_id,
    v_action,
    p_item_id,
    coalesce(p_payload, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ead_update_aluno_progress(uuid, uuid, text, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ead_update_aluno_progress(uuid, uuid, text, text, jsonb)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.ead_update_aluno_progress(uuid, uuid, text, text, jsonb) IS
  'Mutações EAD serializadas: conclusão idempotente de atividades e prova corrigida autoritativamente.';
