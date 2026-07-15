-- A conclusão EAD encerra a matrícula individual e cria uma solicitação de
-- certificado PENDENTE. A turma operacional EAD permanece ativa para os demais alunos.

CREATE OR REPLACE FUNCTION public.ead_update_aluno_progress(
  p_aluno_id uuid,
  p_curso_id uuid,
  p_action text,
  p_item_id text DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_progress jsonb;
  v_course_config jsonb;
  v_regras jsonb;
  v_questions jsonb;
  v_answers jsonb;
  v_answer text;
  v_activity jsonb;
  v_correct integer := 0;
  v_total integer := 0;
  v_score integer := 0;
  v_min_score integer := 70;
  v_retry_hours integer := 3;
  v_last_failed_at timestamptz;
  v_retry_available_at timestamptz;
  v_matricula record;
  v_is_completed boolean;
  q jsonb;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role'
    AND public.current_aluno_id() IS DISTINCT FROM p_aluno_id
  THEN
    RAISE EXCEPTION 'O progresso EAD só pode ser alterado pelo próprio aluno.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.ead_get_aluno_progress(p_aluno_id, p_curso_id);

  SELECT progress INTO v_progress
  FROM public.ead_aluno_progresso
  WHERE aluno_id = p_aluno_id AND curso_id = p_curso_id
  FOR UPDATE;

  SELECT ead_config INTO v_course_config
  FROM public.cursos
  WHERE id = p_curso_id AND modalidade = 'EAD';

  IF v_course_config IS NULL THEN
    RAISE EXCEPTION 'Configuração do curso EAD não encontrada.';
  END IF;

  IF public.ead_progress_meets_completion(v_progress, v_course_config) THEN
    RAISE EXCEPTION 'Este curso já foi concluído e o histórico acadêmico está bloqueado.';
  END IF;

  v_regras := coalesce(v_course_config -> 'regras', '{}'::jsonb);
  v_questions := coalesce(v_course_config #> '{provas,0,questoes}', '[]'::jsonb);
  v_min_score := coalesce((v_course_config #>> '{provas,0,notaMinima}')::integer, 70);
  v_retry_hours := greatest(coalesce((v_regras ->> 'intervaloReprovacaoHoras')::integer, 3), 1);

  IF p_action IN ('toggle_content', 'toggle_activity', 'toggle_video', 'set_activity_answer')
    AND nullif(btrim(coalesce(p_item_id, '')), '') IS NULL
  THEN
    RAISE EXCEPTION 'Informe o item do conteúdo EAD.';
  END IF;

  IF p_action = 'toggle_content' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(coalesce(v_course_config -> 'conteudos', '[]'::jsonb)) item
      WHERE item ->> 'id' = p_item_id
    ) THEN
      RAISE EXCEPTION 'Etapa EAD inválida.' USING ERRCODE = '23514';
    END IF;
    v_progress := jsonb_set(
      v_progress,
      '{completedContentIds}',
      public.ead_jsonb_toggle_text(v_progress -> 'completedContentIds', p_item_id),
      true
    );

  ELSIF p_action = 'set_activity_answer' THEN
    SELECT item INTO v_activity
    FROM jsonb_array_elements(coalesce(v_course_config -> 'atividades', '[]'::jsonb)) item
    WHERE item ->> 'id' = p_item_id
    LIMIT 1;
    IF v_activity IS NULL THEN
      RAISE EXCEPTION 'Atividade EAD inválida.' USING ERRCODE = '23514';
    END IF;
    IF NOT (coalesce(p_payload, '{}'::jsonb) ? 'answer') THEN
      RAISE EXCEPTION 'Informe a resposta da atividade.' USING ERRCODE = '23514';
    END IF;
    v_progress := jsonb_set(
      v_progress,
      ARRAY['activityAnswers', p_item_id],
      to_jsonb(coalesce(p_payload ->> 'answer', '')),
      true
    );

  ELSIF p_action = 'toggle_activity' THEN
    SELECT item INTO v_activity
    FROM jsonb_array_elements(coalesce(v_course_config -> 'atividades', '[]'::jsonb)) item
    WHERE item ->> 'id' = p_item_id
    LIMIT 1;
    IF v_activity IS NULL THEN
      RAISE EXCEPTION 'Atividade EAD inválida.' USING ERRCODE = '23514';
    END IF;

    v_is_completed := coalesce(v_progress -> 'completedActivityIds', '[]'::jsonb) ? p_item_id;
    IF NOT v_is_completed THEN
      v_answer := v_progress #>> ARRAY['activityAnswers', p_item_id];
      IF nullif(btrim(coalesce(v_answer, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Responda a atividade antes de concluí-la.' USING ERRCODE = '23514';
      END IF;
      IF jsonb_array_length(coalesce(v_activity -> 'opcoes', '[]'::jsonb)) > 0
        AND v_activity ? 'respostaCorreta'
        AND (v_answer !~ '^\d+$' OR v_answer::integer <> (v_activity ->> 'respostaCorreta')::integer)
      THEN
        RAISE EXCEPTION 'A atividade só pode ser concluída após a resposta correta.'
          USING ERRCODE = '23514';
      END IF;
    END IF;

    v_progress := jsonb_set(
      v_progress,
      '{completedActivityIds}',
      public.ead_jsonb_toggle_text(v_progress -> 'completedActivityIds', p_item_id),
      true
    );

  ELSIF p_action = 'toggle_video' THEN
    IF public.ead_config_required_video_count(v_course_config) = 0
      OR NOT (
        p_item_id = 'video-principal'
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(coalesce(v_course_config -> 'conteudos', '[]'::jsonb)) item
          WHERE item ->> 'id' = p_item_id
            AND nullif(btrim(item ->> 'videoUrl'), '') IS NOT NULL
        )
      )
    THEN
      RAISE EXCEPTION 'Vídeo EAD inválido.' USING ERRCODE = '23514';
    END IF;
    v_progress := jsonb_set(
      v_progress,
      '{completedVideoIds}',
      public.ead_jsonb_toggle_text(v_progress -> 'completedVideoIds', p_item_id),
      true
    );

  ELSIF p_action = 'finish_quiz' THEN
    IF NOT public.ead_learning_requirements_completed(v_progress, v_course_config) THEN
      RAISE EXCEPTION 'Conclua aulas, atividades e vídeo antes da prova final.'
        USING ERRCODE = '23514';
    END IF;

    v_answers := coalesce(p_payload -> 'answers', '{}'::jsonb);
    v_total := jsonb_array_length(v_questions);
    IF v_total < 10 THEN
      RAISE EXCEPTION 'A prova precisa ter no mínimo 10 questões cadastradas.';
    END IF;

    IF v_progress ? 'lastQuizFailedAt' THEN
      BEGIN
        v_last_failed_at := to_timestamp((v_progress ->> 'lastQuizFailedAt')::numeric / 1000);
      EXCEPTION WHEN OTHERS THEN
        v_last_failed_at := NULL;
      END;
    END IF;

    IF v_last_failed_at IS NOT NULL THEN
      v_retry_available_at := v_last_failed_at + make_interval(hours => v_retry_hours);
      IF coalesce((v_progress ->> 'quizScore')::integer, 0) < v_min_score
        AND now() < v_retry_available_at
      THEN
        RAISE EXCEPTION 'Nova tentativa liberada somente após % horas da reprovação.', v_retry_hours;
      END IF;
    END IF;

    FOR q IN SELECT * FROM jsonb_array_elements(v_questions)
    LOOP
      IF coalesce(v_answers ->> (q ->> 'id'), '') ~ '^\d+$'
        AND (v_answers ->> (q ->> 'id'))::integer = (q ->> 'respostaCorreta')::integer
      THEN
        v_correct := v_correct + 1;
      END IF;
    END LOOP;

    v_score := round((v_correct::numeric / v_total::numeric) * 100)::integer;
    v_progress := jsonb_set(v_progress, '{quizAnswers}', v_answers, true);
    v_progress := jsonb_set(v_progress, '{quizScore}', to_jsonb(v_score), true);
    v_progress := jsonb_set(
      v_progress,
      '{lastQuizScoreAt}',
      to_jsonb(extract(epoch FROM now()) * 1000),
      true
    );

    IF v_score >= v_min_score THEN
      v_progress := v_progress - 'lastQuizFailedAt' - 'retryAvailableAt';
    ELSE
      v_retry_available_at := now() + make_interval(hours => v_retry_hours);
      v_progress := v_progress - 'completedAt' - 'certificateId';
      v_progress := jsonb_set(
        v_progress,
        '{lastQuizFailedAt}',
        to_jsonb(extract(epoch FROM now()) * 1000),
        true
      );
      v_progress := jsonb_set(
        v_progress,
        '{retryAvailableAt}',
        to_jsonb(extract(epoch FROM v_retry_available_at) * 1000),
        true
      );
    END IF;
  ELSE
    RAISE EXCEPTION 'Ação EAD inválida: %', p_action;
  END IF;

  IF public.ead_progress_meets_completion(v_progress, v_course_config) THEN
    v_progress := jsonb_set(
      v_progress - 'certificateId',
      '{completedAt}',
      coalesce(v_progress -> 'completedAt', to_jsonb(extract(epoch FROM now()) * 1000)),
      true
    );

    SELECT
      m.id,
      m.turma_id,
      m.status,
      m.data_matricula,
      t.polo_id,
      a.instituicao_origem,
      a.cidade,
      a.uf,
      a.ano_conclusao_ensino_medio
    INTO v_matricula
    FROM public.matriculas m
    JOIN public.turmas t ON t.id = m.turma_id
    JOIN public.cursos c ON c.id = t.curso_id
    JOIN public.parceiros a ON a.id = m.aluno_id
    WHERE m.aluno_id = p_aluno_id
      AND c.id = p_curso_id
      AND c.modalidade = 'EAD'
      AND upper(coalesce(m.status, '')) IN ('ATIVO', 'CONCLUIDO')
    ORDER BY m.data_matricula DESC NULLS LAST, m.id DESC
    LIMIT 1;

    IF v_matricula.id IS NULL THEN
      RAISE EXCEPTION 'Matrícula EAD válida não encontrada para registrar a conclusão.';
    END IF;

    UPDATE public.matriculas
    SET status = 'CONCLUIDO'
    WHERE id = v_matricula.id
      AND upper(coalesce(status, '')) <> 'CONCLUIDO';

    INSERT INTO public.certificados_academicos (
      matricula_id,
      aluno_id,
      turma_id,
      curso_id,
      polo_id,
      modalidade,
      status,
      data_inscricao,
      data_conclusao,
      nota_final,
      ensino_medio_estabelecimento,
      ensino_medio_localidade_uf,
      ensino_medio_ano_conclusao,
      metadados
    )
    VALUES (
      v_matricula.id,
      p_aluno_id,
      v_matricula.turma_id,
      p_curso_id,
      v_matricula.polo_id,
      'EAD',
      'PENDENTE',
      v_matricula.data_matricula,
      current_date,
      (v_progress ->> 'quizScore')::numeric,
      v_matricula.instituicao_origem,
      coalesce(v_matricula.cidade, '')
        || CASE WHEN v_matricula.uf IS NOT NULL THEN ' - ' || v_matricula.uf ELSE '' END,
      v_matricula.ano_conclusao_ensino_medio,
      jsonb_build_object('origem', 'CONCLUSAO_EAD', 'enfileiradoEm', now())
    )
    ON CONFLICT (matricula_id) DO UPDATE SET
      curso_id = EXCLUDED.curso_id,
      turma_id = EXCLUDED.turma_id,
      polo_id = EXCLUDED.polo_id,
      modalidade = EXCLUDED.modalidade,
      data_conclusao = EXCLUDED.data_conclusao,
      nota_final = EXCLUDED.nota_final,
      metadados = coalesce(public.certificados_academicos.metadados, '{}'::jsonb)
        || EXCLUDED.metadados,
      updated_at = now();
  ELSE
    v_progress := v_progress - 'completedAt' - 'certificateId';
  END IF;

  UPDATE public.ead_aluno_progresso
  SET progress = v_progress
  WHERE aluno_id = p_aluno_id AND curso_id = p_curso_id;

  RETURN public.ead_get_aluno_progress(p_aluno_id, p_curso_id);
END;
$$;

REVOKE ALL ON FUNCTION public.ead_update_aluno_progress(uuid, uuid, text, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ead_update_aluno_progress(uuid, uuid, text, text, jsonb)
  TO authenticated, service_role;
