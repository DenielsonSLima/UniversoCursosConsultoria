create table if not exists public.ead_aluno_progresso (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references public.parceiros(id) on delete cascade,
  curso_id uuid not null references public.cursos(id) on delete cascade,
  progress jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (aluno_id, curso_id)
);

create index if not exists idx_ead_aluno_progresso_aluno_id
  on public.ead_aluno_progresso (aluno_id);

create index if not exists idx_ead_aluno_progresso_curso_id
  on public.ead_aluno_progresso (curso_id);

create or replace function public.touch_ead_aluno_progresso_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_ead_aluno_progresso_updated_at on public.ead_aluno_progresso;
create trigger trg_touch_ead_aluno_progresso_updated_at
before update on public.ead_aluno_progresso
for each row
execute function public.touch_ead_aluno_progresso_updated_at();

alter table public.ead_aluno_progresso enable row level security;

drop policy if exists "ead_aluno_progresso_read" on public.ead_aluno_progresso;
create policy "ead_aluno_progresso_read"
on public.ead_aluno_progresso
for select
using (true);

drop policy if exists "ead_aluno_progresso_insert" on public.ead_aluno_progresso;
create policy "ead_aluno_progresso_insert"
on public.ead_aluno_progresso
for insert
with check (true);

drop policy if exists "ead_aluno_progresso_update" on public.ead_aluno_progresso;
create policy "ead_aluno_progresso_update"
on public.ead_aluno_progresso
for update
using (true)
with check (true);

create or replace function public.ead_jsonb_toggle_text(items jsonb, item text)
returns jsonb
language sql
immutable
as $$
  select case
    when coalesce(items, '[]'::jsonb) ? item then
      coalesce((
        select jsonb_agg(value)
        from jsonb_array_elements_text(coalesce(items, '[]'::jsonb)) as value
        where value <> item
      ), '[]'::jsonb)
    else
      coalesce(items, '[]'::jsonb) || to_jsonb(item)
  end;
$$;

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

  v_progress_json := coalesce(v_progress.progress, '{}'::jsonb);
  v_config := coalesce(v_course.ead_config, '{}'::jsonb);
  v_conteudos := coalesce(v_config->'conteudos', '[]'::jsonb);
  v_atividades := coalesce(v_config->'atividades', '[]'::jsonb);
  v_regras := coalesce(v_config->'regras', '{}'::jsonb);

  v_minimum_minutes := coalesce((v_regras->>'tempoMinimoMinutos')::int, 0);
  v_elapsed_minutes := greatest(floor(extract(epoch from (now() - v_progress.started_at)) / 60)::int, 0);
  v_content_total := jsonb_array_length(v_conteudos);
  v_activity_total := case when coalesce((v_regras->>'exigirAtividades')::boolean, true) then jsonb_array_length(v_atividades) else 0 end;
  v_video_total := case
    when coalesce((v_regras->>'exigirVideosConcluidos')::boolean, true) then
      (select count(*)::int from jsonb_array_elements(v_conteudos) item where coalesce(item->>'videoUrl', '') <> '')
    else 0
  end;

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
  v_can_take_quiz := v_all_lessons_done and v_all_activities_done and v_all_videos_done and v_minimum_time_done;

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
      'quizScore', v_progress_json->>'quizScore'
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
  v_questions jsonb;
  v_answers jsonb;
  v_correct int := 0;
  v_total int := 0;
  v_score int := 0;
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
    v_questions := coalesce(v_course_config#>'{provas,0,questoes}', '[]'::jsonb);
    v_total := jsonb_array_length(v_questions);

    for q in select * from jsonb_array_elements(v_questions)
    loop
      if (v_answers->>(q->>'id'))::int = (q->>'respostaCorreta')::int then
        v_correct := v_correct + 1;
      end if;
    end loop;

    v_score := case when v_total > 0 then round((v_correct::numeric / v_total::numeric) * 100)::int else 0 end;
    v_progress := jsonb_set(v_progress, '{quizAnswers}', v_answers, true);
    v_progress := jsonb_set(v_progress, '{quizScore}', to_jsonb(v_score), true);
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
