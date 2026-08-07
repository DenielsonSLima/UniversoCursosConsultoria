begin;

-- A grade e o diário passam a aceitar escrita somente pelas RPCs canônicas.
drop policy if exists portal_aulas_turma_insert on public.aulas_turma;
drop policy if exists portal_aulas_turma_update on public.aulas_turma;
drop policy if exists portal_aulas_turma_delete on public.aulas_turma;

alter function public.atualizar_horario_encontro_gestor(uuid, numeric, date)
  security definer;
alter function public.atualizar_titulo_encontro_professor(uuid, text)
  security definer;

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
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' and (
    exists (
      select 1
      from public.diario_frequencia frequencia
      where frequencia.aula_id = old.id
    )
    or exists (
      select 1
      from public.diario_praticas pratica
      where pratica.aula_id = old.id
    )
  ) then
    raise exception
      'O encontro não pode ser removido porque possui frequência ou prática lançada.'
      using errcode = '23503';
  end if;

  if public.can_operate_turma_academics(v_turma_id) then
    if tg_op = 'UPDATE'
      and new.id = old.id
      and new.turma_id = old.turma_id
      and new.disciplina_id = old.disciplina_id
      and new.titulo is not distinct from old.titulo
      and new.created_at is not distinct from old.created_at
      and new.data_aula is not null
      and new.carga_horaria > 0
      and (
        (new.sessao = 'U' and new.carga_horaria <> 8)
        or (new.sessao in ('M', 'T') and new.carga_horaria = 4)
      ) then
      return new;
    end if;

    if tg_op = 'DELETE' then
      perform set_config('universo.deleted_lesson_title', old.titulo, true);
      perform set_config('universo.deleted_lesson_turma_id', old.turma_id::text, true);
      perform set_config(
        'universo.deleted_lesson_disciplina_id',
        old.disciplina_id::text,
        true
      );
      return old;
    end if;

    if tg_op = 'INSERT'
      and new.data_aula is not null
      and new.carga_horaria > 0
      and (
        (new.sessao = 'U' and new.carga_horaria <> 8)
        or (new.sessao in ('M', 'T') and new.carga_horaria = 4)
      ) then
      v_deleted_title := current_setting('universo.deleted_lesson_title', true);
      v_deleted_turma_id := current_setting(
        'universo.deleted_lesson_turma_id',
        true
      );
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
      'A Gestão deve usar o planejamento canônico de data, carga horária e sessões.'
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
  'Bloqueia escrita REST, impede cascata com diário lançado e valida a composição canônica dos encontros.';

-- Arquiva a implementação anterior e expõe um guardião que exige Gestão.
alter function public.set_matricula_liberacao_diario(uuid, boolean, text)
  set schema internal_academic;
alter function internal_academic.set_matricula_liberacao_diario(uuid, boolean, text)
  rename to p1_set_matricula_liberacao_diario_20260729;

revoke all on function internal_academic.p1_set_matricula_liberacao_diario_20260729(uuid, boolean, text)
  from public, anon, authenticated;

grant execute on function internal_academic.p1_set_matricula_liberacao_diario_20260729(uuid, boolean, text)
  to service_role;

create function public.set_matricula_liberacao_diario(
  p_matricula_id uuid,
  p_liberada boolean,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_turma_id uuid;
begin
  select matricula.turma_id
  into v_turma_id
  from public.matriculas matricula
  where matricula.id = p_matricula_id;

  if v_turma_id is null then
    raise exception 'Matrícula não encontrada.' using errcode = '22023';
  end if;

  if coalesce((select auth.role()), '') <> 'service_role'
    and not public.can_operate_turma_academics(v_turma_id) then
    raise exception
      'A permissão de Gestão acadêmica é obrigatória para liberar ou revogar acesso ao diário.'
      using errcode = '42501';
  end if;

  return internal_academic.p1_set_matricula_liberacao_diario_20260729(
    p_matricula_id,
    p_liberada,
    p_motivo
  );
end;
$function$;

revoke all on function public.set_matricula_liberacao_diario(uuid, boolean, text)
  from public, anon;
grant execute on function public.set_matricula_liberacao_diario(uuid, boolean, text)
  to authenticated, service_role;

comment on function public.set_matricula_liberacao_diario(uuid, boolean, text) is
  'Libera ou revoga matrícula pendente no diário somente para service_role ou Gestão acadêmica no polo da turma.';

commit;
