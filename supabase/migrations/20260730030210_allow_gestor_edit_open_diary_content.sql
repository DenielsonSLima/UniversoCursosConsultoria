begin;

-- O conteúdo do encontro é colaborativo enquanto o diário está aberto:
-- a Gestão pode preenchê-lo no planejamento ou ajustá-lo no diário, e o
-- professor vinculado continua podendo completá-lo. Data, carga e sessões
-- permanecem exclusivas do fluxo canônico da Gestão.
create or replace function public.atualizar_titulo_encontro_professor(
  p_aula_id uuid,
  p_titulo text
)
returns setof public.aulas_turma
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_turma_id uuid;
  v_disciplina_id uuid;
  v_data_aula date;
  v_titulo text := trim(p_titulo);
begin
  if nullif(v_titulo, '') is null then
    raise exception 'Informe o título ou conteúdo programático da aula.'
      using errcode = '22023';
  end if;

  if char_length(v_titulo) > 1000 then
    raise exception 'O conteúdo programático deve ter no máximo 1000 caracteres.'
      using errcode = '22023';
  end if;

  select aula.turma_id, aula.disciplina_id, aula.data_aula
  into v_turma_id, v_disciplina_id, v_data_aula
  from public.aulas_turma aula
  where aula.id = p_aula_id;

  if not found then
    raise exception 'Encontro de aula não encontrado.'
      using errcode = 'P0002';
  end if;

  if coalesce((select auth.role()), '') <> 'service_role'
    and not public.can_write_academic_record_open(
      v_turma_id,
      v_disciplina_id
    ) then
    raise exception
      'Gestão e professor só podem alterar o conteúdo enquanto o diário estiver aberto para o respectivo perfil.'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(v_turma_id::text),
    hashtext(v_disciplina_id::text)
  );

  update public.aulas_turma aula
  set titulo = v_titulo
  where aula.turma_id = v_turma_id
    and aula.disciplina_id = v_disciplina_id
    and aula.data_aula is not distinct from v_data_aula;

  return query
  select aula.*
  from public.aulas_turma aula
  where aula.turma_id = v_turma_id
    and aula.disciplina_id = v_disciplina_id
    and aula.data_aula is not distinct from v_data_aula
  order by
    case aula.sessao when 'M' then 1 when 'T' then 2 when 'N' then 3 else 4 end,
    aula.created_at,
    aula.id;
end;
$function$;

revoke all on function public.atualizar_titulo_encontro_professor(uuid, text)
  from public, anon;
grant execute on function public.atualizar_titulo_encontro_professor(uuid, text)
  to authenticated, service_role;

comment on function public.atualizar_titulo_encontro_professor(uuid, text) is
  'Permite à Gestão autorizada ou ao professor vinculado ajustar o conteúdo de um encontro enquanto o diário estiver aberto para o respectivo perfil.';

create or replace function public.enforce_aulas_turma_role_boundaries()
returns trigger
language plpgsql
security invoker
set search_path to ''
as $function$
declare
  v_turma_id uuid;
  v_disciplina_id uuid;
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
      and new.created_at is not distinct from old.created_at
      and nullif(trim(new.titulo), '') is not null
      and char_length(trim(new.titulo)) <= 1000
      and new.data_aula is not null
      and new.carga_horaria > 0
      and (
        (new.sessao = 'U' and new.carga_horaria <> 8)
        or (new.sessao in ('M', 'T') and new.carga_horaria = 4)
      ) then
      return new;
    end if;

    if tg_op = 'DELETE' then
      return old;
    end if;

    if tg_op = 'INSERT'
      and nullif(trim(new.titulo), '') is not null
      and char_length(trim(new.titulo)) <= 1000
      and new.data_aula is not null
      and new.carga_horaria > 0
      and (
        (new.sessao = 'U' and new.carga_horaria <> 8)
        or (new.sessao in ('M', 'T') and new.carga_horaria = 4)
      ) then
      return new;
    end if;

    raise exception
      'A Gestão deve usar o planejamento canônico de conteúdo, data, carga horária e sessões.'
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
    'A Gestão define a agenda; Gestão e professor podem ajustar o conteúdo enquanto o diário estiver aberto.'
    using errcode = '42501';
end;
$function$;

revoke all on function public.enforce_aulas_turma_role_boundaries()
  from public, anon, authenticated;

comment on function public.enforce_aulas_turma_role_boundaries() is
  'Mantém agenda exclusiva da Gestão, permite conteúdo colaborativo no diário aberto e preserva a composição canônica dos encontros.';

commit;
