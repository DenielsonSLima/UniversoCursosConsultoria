begin;

create or replace function public.enforce_aulas_turma_role_boundaries()
returns trigger
language plpgsql
security invoker
set search_path to ''
as $function$
declare
  v_turma_id uuid;
  v_disciplina_id uuid;
  v_deleted_title text;
  v_deleted_turma_id text;
  v_deleted_disciplina_id text;
begin
  if tg_op = 'DELETE' then
    v_turma_id := old.turma_id;
    v_disciplina_id := old.disciplina_id;
  else
    v_turma_id := new.turma_id;
    v_disciplina_id := new.disciplina_id;
  end if;

  if coalesce((select auth.role()), '') = 'service_role' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if public.can_write_turma(v_turma_id) then
    if tg_op = 'UPDATE'
      and new.id = old.id
      and new.turma_id = old.turma_id
      and new.disciplina_id = old.disciplina_id
      and new.titulo is not distinct from old.titulo
      and new.created_at is not distinct from old.created_at then
      return new;
    end if;

    if tg_op = 'DELETE' then
      perform set_config('universo.deleted_lesson_title', old.titulo, true);
      perform set_config('universo.deleted_lesson_turma_id', old.turma_id::text, true);
      perform set_config('universo.deleted_lesson_disciplina_id', old.disciplina_id::text, true);
      return old;
    end if;

    if tg_op = 'INSERT' then
      v_deleted_title := current_setting('universo.deleted_lesson_title', true);
      v_deleted_turma_id := current_setting('universo.deleted_lesson_turma_id', true);
      v_deleted_disciplina_id := current_setting(
        'universo.deleted_lesson_disciplina_id',
        true
      );

      if new.titulo = 'Conteúdo a definir pelo professor'
        or (
          new.titulo = v_deleted_title
          and new.turma_id::text = v_deleted_turma_id
          and new.disciplina_id::text = v_deleted_disciplina_id
        ) then
        return new;
      end if;
    end if;

    raise exception
      'A Gestão pode definir somente data e carga horária do encontro.'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
    and public.is_professor_assigned_disciplina_open(v_turma_id, v_disciplina_id)
    and new.id = old.id
    and new.turma_id = old.turma_id
    and new.disciplina_id = old.disciplina_id
    and new.data_aula is not distinct from old.data_aula
    and new.carga_horaria is not distinct from old.carga_horaria
    and new.sessao is not distinct from old.sessao
    and new.created_at is not distinct from old.created_at
    and nullif(trim(new.titulo), '') is not null
    and char_length(trim(new.titulo)) <= 1000 then
    return new;
  end if;

  raise exception
    'A Gestão define data e carga horária; o professor pode alterar somente o conteúdo programático.'
    using errcode = '42501';
end;
$function$;

revoke all on function public.enforce_aulas_turma_role_boundaries()
  from public, anon, authenticated;

comment on function public.enforce_aulas_turma_role_boundaries() is
  'Impõe fronteira por coluna: Gestão altera agenda sem sobrescrever conteúdo; professor altera somente o título/conteúdo.';

commit;
