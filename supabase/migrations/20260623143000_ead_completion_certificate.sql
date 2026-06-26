create or replace function public.ead_get_aluno_progress(
  p_aluno_id uuid,
  p_curso_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course record;
  v_progress record;
  v_progress_json jsonb;
  v_config jsonb;
  v_conteudos jsonb;
  v_atividades jsonb;
  v_regras jsonb;
  v_questions jsonb;
  v_minimum_minutes int;
  v_elapsed_minutes int;
  v_content_total int;
  v_activity_total int;
  v_video_total int;
  v_content_done int;
  v_activity_done int;
  v_video_done int;
  v_total_required int;
  v_total_done int;
  v_progress_percent int;
  v_all_lessons_done boolean;
  v_all_activities_done boolean;
  v_all_videos_done boolean;
  v_minimum_time_done boolean;
  v_can_take_quiz boolean;
  v_questions_total int;
  v_min_questions int := 10;
  v_min_score int;
  v_quiz_score int;
  v_retry_hours int;
  v_last_failed_at timestamptz;
  v_retry_available_at timestamptz;
  v_quiz_retry_blocked boolean := false;
  v_certificate_id uuid;
begin
  select * into v_course
  from public.cursos
  where id = p_curso_id;

  if not found then
    raise exception 'Curso EAD nao encontrado';
  end if;

  insert into public.ead_aluno_progresso (aluno_id, curso_id, progress)
  values (
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
  on conflict (aluno_id, curso_id) do nothing;

  select * into v_progress
  from public.ead_aluno_progresso
  where aluno_id = p_aluno_id
    and curso_id = p_curso_id;

  select ca.id into v_certificate_id
  from public.certificados_academicos ca
  where ca.aluno_id = p_aluno_id
    and ca.curso_id = p_curso_id
    and ca.modalidade = 'EAD'
    and ca.status <> 'CANCELADO'
  order by ca.data_conclusao desc, ca.created_at desc
  limit 1;

  v_progress_json := coalesce(v_progress.progress, '{}'::jsonb);
  v_config := coalesce(v_course.ead_config, '{}'::jsonb);
  v_conteudos := coalesce(v_config->'conteudos', '[]'::jsonb);
  v_atividades := coalesce(v_config->'atividades', '[]'::jsonb);
  v_regras := coalesce(v_config->'regras', '{}'::jsonb);
  v_questions := coalesce(v_config#>'{provas,0,questoes}', '[]'::jsonb);

  v_minimum_minutes := coalesce((v_regras->>'tempoMinimoMinutos')::int, 0);
  v_retry_hours := greatest(coalesce((v_regras->>'intervaloReprovacaoHoras')::int, 3), 1);
  v_min_score := coalesce((v_config#>>'{provas,0,notaMinima}')::int, 70);
  v_questions_total := jsonb_array_length(v_questions);
  v_elapsed_minutes := greatest(floor(extract(epoch from (now() - v_progress.started_at)) / 60)::int, 0);
  v_content_total := jsonb_array_length(v_conteudos);
  v_activity_total := case when coalesce((v_regras->>'exigirAtividades')::boolean, true) then jsonb_array_length(v_atividades) else 0 end;
  v_video_total := case
    when coalesce((v_regras->>'exigirVideosConcluidos')::boolean, true) then
      (select count(*)::int from jsonb_array_elements(v_conteudos) item where coalesce(item->>'videoUrl', '') <> '')
    else 0
  end;

  if v_progress_json ? 'quizScore' then
    v_quiz_score := (v_progress_json->>'quizScore')::int;
  end if;

  if v_progress_json ? 'lastQuizFailedAt' then
    begin
      v_last_failed_at := to_timestamp((v_progress_json->>'lastQuizFailedAt')::numeric / 1000);
    exception when others then
      v_last_failed_at := null;
    end;
  end if;

  if v_last_failed_at is not null then
    v_retry_available_at := v_last_failed_at + make_interval(hours => v_retry_hours);
    v_quiz_retry_blocked := coalesce(v_quiz_score, 0) < v_min_score and now() < v_retry_available_at;
  end if;

  v_content_done := jsonb_array_length(coalesce(v_progress_json->'completedContentIds', '[]'::jsonb));
  v_activity_done := jsonb_array_length(coalesce(v_progress_json->'completedActivityIds', '[]'::jsonb));
  v_video_done := jsonb_array_length(coalesce(v_progress_json->'completedVideoIds', '[]'::jsonb));
  v_total_required := v_content_total + v_activity_total;
  v_total_done := least(v_content_done, v_content_total) + least(v_activity_done, v_activity_total);
  v_progress_percent := case when v_total_required > 0 then least(100, round((v_total_done::numeric / v_total_required::numeric) * 100)::int) else 0 end;
  v_all_lessons_done := v_content_done >= v_content_total;
  v_all_activities_done := v_activity_done >= v_activity_total;
  v_all_videos_done := v_video_done >= v_video_total;
  v_minimum_time_done := v_elapsed_minutes >= v_minimum_minutes;
  v_can_take_quiz := v_all_lessons_done
    and v_all_activities_done
    and v_all_videos_done
    and v_minimum_time_done
    and v_questions_total >= v_min_questions
    and not v_quiz_retry_blocked;

  return jsonb_build_object(
    'progress', v_progress_json || jsonb_build_object('startedAt', extract(epoch from v_progress.started_at) * 1000),
    'summary', jsonb_build_object(
      'elapsedMinutes', v_elapsed_minutes,
      'minimumMinutes', v_minimum_minutes,
      'progressPercent', v_progress_percent,
      'allLessonsDone', v_all_lessons_done,
      'allActivitiesDone', v_all_activities_done,
      'allVideosDone', v_all_videos_done,
      'minimumTimeDone', v_minimum_time_done,
      'canTakeQuiz', v_can_take_quiz,
      'quizScore', v_progress_json->>'quizScore',
      'quizPassed', coalesce(v_quiz_score, 0) >= v_min_score,
      'quizMinimumScore', v_min_score,
      'questionsTotal', v_questions_total,
      'minimumQuestions', v_min_questions,
      'quizRetryBlocked', v_quiz_retry_blocked,
      'retryIntervalHours', v_retry_hours,
      'retryAvailableAt', case when v_retry_available_at is not null then extract(epoch from v_retry_available_at) * 1000 else null end,
      'completedAt', case when v_progress_json ? 'completedAt' then (v_progress_json->>'completedAt')::numeric else null end,
      'certificateId', coalesce(v_progress_json->>'certificateId', v_certificate_id::text)
    )
  );
end;
$$;

create or replace function public.ead_update_aluno_progress(
  p_aluno_id uuid,
  p_curso_id uuid,
  p_action text,
  p_item_id text default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_progress jsonb;
  v_course_config jsonb;
  v_regras jsonb;
  v_questions jsonb;
  v_answers jsonb;
  v_correct int := 0;
  v_total int := 0;
  v_score int := 0;
  v_min_score int := 70;
  v_retry_hours int := 3;
  v_last_failed_at timestamptz;
  v_retry_available_at timestamptz;
  v_matricula record;
  v_cert record;
  q jsonb;
begin
  perform public.ead_get_aluno_progress(p_aluno_id, p_curso_id);

  select progress into v_progress
  from public.ead_aluno_progresso
  where aluno_id = p_aluno_id
    and curso_id = p_curso_id
  for update;

  if p_action = 'toggle_content' then
    v_progress := jsonb_set(v_progress, '{completedContentIds}', public.ead_jsonb_toggle_text(v_progress->'completedContentIds', p_item_id), true);
  elsif p_action = 'toggle_activity' then
    v_progress := jsonb_set(v_progress, '{completedActivityIds}', public.ead_jsonb_toggle_text(v_progress->'completedActivityIds', p_item_id), true);
  elsif p_action = 'toggle_video' then
    v_progress := jsonb_set(v_progress, '{completedVideoIds}', public.ead_jsonb_toggle_text(v_progress->'completedVideoIds', p_item_id), true);
  elsif p_action = 'set_activity_answer' then
    v_progress := jsonb_set(v_progress, array['activityAnswers', coalesce(p_item_id, '')], to_jsonb(coalesce(p_payload->>'answer', '')), true);
  elsif p_action = 'finish_quiz' then
    v_answers := coalesce(p_payload->'answers', '{}'::jsonb);
    select ead_config into v_course_config from public.cursos where id = p_curso_id;
    v_regras := coalesce(v_course_config->'regras', '{}'::jsonb);
    v_questions := coalesce(v_course_config#>'{provas,0,questoes}', '[]'::jsonb);
    v_total := jsonb_array_length(v_questions);
    v_min_score := coalesce((v_course_config#>>'{provas,0,notaMinima}')::int, 70);
    v_retry_hours := greatest(coalesce((v_regras->>'intervaloReprovacaoHoras')::int, 3), 1);

    if v_total < 10 then
      raise exception 'A prova precisa ter no minimo 10 questoes cadastradas.';
    end if;

    if v_progress ? 'lastQuizFailedAt' then
      begin
        v_last_failed_at := to_timestamp((v_progress->>'lastQuizFailedAt')::numeric / 1000);
      exception when others then
        v_last_failed_at := null;
      end;
    end if;

    if v_last_failed_at is not null then
      v_retry_available_at := v_last_failed_at + make_interval(hours => v_retry_hours);
      if coalesce((v_progress->>'quizScore')::int, 0) < v_min_score and now() < v_retry_available_at then
        raise exception 'Nova tentativa liberada somente apos % horas da reprovacao.', v_retry_hours;
      end if;
    end if;

    for q in select * from jsonb_array_elements(v_questions)
    loop
      if (v_answers->>(q->>'id'))::int = (q->>'respostaCorreta')::int then
        v_correct := v_correct + 1;
      end if;
    end loop;

    v_score := round((v_correct::numeric / v_total::numeric) * 100)::int;
    v_progress := jsonb_set(v_progress, '{quizAnswers}', v_answers, true);
    v_progress := jsonb_set(v_progress, '{quizScore}', to_jsonb(v_score), true);
    v_progress := jsonb_set(v_progress, '{lastQuizScoreAt}', to_jsonb(extract(epoch from now()) * 1000), true);

    if v_score >= v_min_score then
      v_progress := v_progress - 'lastQuizFailedAt' - 'retryAvailableAt';
      v_progress := jsonb_set(v_progress, '{quizPassed}', 'true'::jsonb, true);
      if not (v_progress ? 'completedAt') then
        v_progress := jsonb_set(v_progress, '{completedAt}', to_jsonb(extract(epoch from now()) * 1000), true);
      end if;

      select
        m.id,
        m.turma_id,
        m.aluno_id,
        m.data_matricula,
        t.polo_id,
        c.id as curso_id,
        c.modalidade,
        a.instituicao_origem,
        a.cidade,
        a.uf,
        a.ano_conclusao_ensino_medio
      into v_matricula
      from public.matriculas m
      join public.turmas t on t.id = m.turma_id
      join public.cursos c on c.id = t.curso_id
      join public.parceiros a on a.id = m.aluno_id
      where m.aluno_id = p_aluno_id
        and c.id = p_curso_id
        and c.modalidade = 'EAD'
        and upper(coalesce(m.status, '')) <> 'CANCELADO'
      order by m.data_matricula desc nulls last, m.created_at desc
      limit 1;

      if v_matricula.id is not null then
        update public.matriculas
        set status = 'CONCLUIDO'
        where id = v_matricula.id
          and upper(coalesce(status, '')) <> 'CONCLUIDO';

        insert into public.certificados_academicos (
          matricula_id, aluno_id, turma_id, curso_id, polo_id, modalidade,
          data_inscricao, data_conclusao, nota_final,
          ensino_medio_estabelecimento, ensino_medio_localidade_uf,
          ensino_medio_ano_conclusao
        )
        values (
          v_matricula.id,
          p_aluno_id,
          v_matricula.turma_id,
          p_curso_id,
          v_matricula.polo_id,
          'EAD',
          v_matricula.data_matricula,
          current_date,
          v_score,
          v_matricula.instituicao_origem,
          coalesce(v_matricula.cidade, '') || case when v_matricula.uf is not null then ' - ' || v_matricula.uf else '' end,
          v_matricula.ano_conclusao_ensino_medio
        )
        on conflict (matricula_id) do update set
          curso_id = excluded.curso_id,
          turma_id = excluded.turma_id,
          polo_id = excluded.polo_id,
          modalidade = excluded.modalidade,
          data_conclusao = excluded.data_conclusao,
          nota_final = excluded.nota_final,
          updated_at = now()
        returning id, status, codigo_validacao into v_cert;

        if coalesce(v_cert.status, '') <> 'FINALIZADO' or v_cert.codigo_validacao is null then
          select id, status, codigo_validacao
          into v_cert
          from public.finalizar_certificado_academico(v_cert.id);
        end if;

        v_progress := jsonb_set(v_progress, '{certificateId}', to_jsonb(v_cert.id::text), true);
      end if;
    else
      v_retry_available_at := now() + make_interval(hours => v_retry_hours);
      v_progress := jsonb_set(v_progress, '{quizPassed}', 'false'::jsonb, true);
      v_progress := jsonb_set(v_progress, '{lastQuizFailedAt}', to_jsonb(extract(epoch from now()) * 1000), true);
      v_progress := jsonb_set(v_progress, '{retryAvailableAt}', to_jsonb(extract(epoch from v_retry_available_at) * 1000), true);
    end if;
  else
    raise exception 'Acao EAD invalida: %', p_action;
  end if;

  update public.ead_aluno_progresso
  set progress = v_progress
  where aluno_id = p_aluno_id
    and curso_id = p_curso_id;

  return public.ead_get_aluno_progress(p_aluno_id, p_curso_id);
end;
$$;
