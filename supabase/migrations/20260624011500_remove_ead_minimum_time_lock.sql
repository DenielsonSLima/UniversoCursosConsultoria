create or replace function public.ead_get_aluno_progress(p_aluno_id uuid, p_curso_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_course record;
  v_matricula record;
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
  where id = p_curso_id
    and modalidade = 'EAD';

  if not found then
    raise exception 'Curso EAD nao encontrado';
  end if;

  select m.id, m.status, m.data_matricula, t.id as turma_id
    into v_matricula
  from public.matriculas m
  join public.turmas t on t.id = m.turma_id
  where m.aluno_id = p_aluno_id
    and t.curso_id = p_curso_id
    and upper(coalesce(m.status, '')) in ('ATIVO', 'CONCLUIDO')
  order by
    case upper(coalesce(m.status, ''))
      when 'ATIVO' then 1
      when 'CONCLUIDO' then 2
      else 3
    end,
    m.data_matricula desc nulls last,
    m.id desc
  limit 1;

  if v_matricula.id is null then
    raise exception 'Curso EAD liberado apenas para aluno com matricula ativa ou concluida.';
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

  v_minimum_minutes := 0;
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
  v_minimum_time_done := true;
  v_can_take_quiz := v_all_lessons_done
    and v_all_activities_done
    and v_all_videos_done
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
$function$;
