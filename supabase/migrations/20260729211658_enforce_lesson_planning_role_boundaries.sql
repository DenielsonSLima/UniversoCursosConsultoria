begin;

drop policy if exists "portal_aulas_turma_update" on public.aulas_turma;
create policy "portal_aulas_turma_update"
  on public.aulas_turma
  for update
  to authenticated
  using (
    (select public.can_write_turma(turma_id))
    or (select public.can_write_academic_record_open(turma_id, disciplina_id))
  )
  with check (
    (select public.can_write_turma(turma_id))
    or (select public.can_write_academic_record_open(turma_id, disciplina_id))
  );

drop policy if exists "portal_aulas_turma_delete" on public.aulas_turma;
create policy "portal_aulas_turma_delete"
  on public.aulas_turma
  for delete
  to authenticated
  using (
    (select public.can_write_turma(turma_id))
    or (select public.can_write_academic_record_open(turma_id, disciplina_id))
  );

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

  if coalesce((select auth.role()), '') = 'service_role'
    or public.can_write_turma(v_turma_id) then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE'
    and public.is_professor_assigned_disciplina_open(v_turma_id, v_disciplina_id)
    and new.turma_id = old.turma_id
    and new.disciplina_id = old.disciplina_id
    and new.data_aula is not distinct from old.data_aula
    and new.carga_horaria is not distinct from old.carga_horaria
    and new.sessao is not distinct from old.sessao then
    return new;
  end if;

  raise exception
    'A Gestão define data e carga horária; o professor pode alterar somente o conteúdo programático.'
    using errcode = '42501';
end;
$function$;

revoke all on function public.enforce_aulas_turma_role_boundaries()
  from public, anon, authenticated;

drop trigger if exists enforce_aulas_turma_role_boundaries_trigger
  on public.aulas_turma;
create trigger enforce_aulas_turma_role_boundaries_trigger
before insert or update or delete on public.aulas_turma
for each row execute function public.enforce_aulas_turma_role_boundaries();

create or replace function public.atualizar_horario_encontro_gestor(
  p_aula_id uuid,
  p_carga_horaria numeric,
  p_data_aula date
)
returns setof public.aulas_turma
language plpgsql
security invoker
set search_path to ''
as $function$
declare
  v_turma_id uuid;
  v_disciplina_id uuid;
  v_data_anterior date;
  v_titulo text;
  v_total_anterior numeric;
  v_sessoes_anteriores integer;
  v_sessoes_esperadas integer;
  v_tem_lancamentos boolean;
begin
  if p_data_aula is null then
    raise exception 'Informe a data da aula.' using errcode = '22023';
  end if;

  if p_carga_horaria is null or p_carga_horaria <= 0 then
    raise exception 'A carga horária precisa ser maior que zero.'
      using errcode = '22023';
  end if;

  select aula.turma_id, aula.disciplina_id
  into v_turma_id, v_disciplina_id
  from public.aulas_turma aula
  where aula.id = p_aula_id;

  if not found then
    raise exception 'Encontro de aula não encontrado.' using errcode = 'P0002';
  end if;

  if coalesce((select auth.role()), '') <> 'service_role'
    and not public.can_write_turma(v_turma_id) then
    raise exception
      'Somente a Gestão pode ajustar data e carga horária do encontro.'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(v_turma_id::text),
    hashtext(v_disciplina_id::text)
  );

  select aula.data_aula, aula.titulo
  into v_data_anterior, v_titulo
  from public.aulas_turma aula
  where aula.id = p_aula_id
    and aula.turma_id = v_turma_id
    and aula.disciplina_id = v_disciplina_id
  for update;

  if not found then
    raise exception 'Encontro de aula não encontrado.' using errcode = 'P0002';
  end if;

  select coalesce(sum(aula.carga_horaria), 0), count(*)
  into v_total_anterior, v_sessoes_anteriores
  from public.aulas_turma aula
  where aula.turma_id = v_turma_id
    and aula.disciplina_id = v_disciplina_id
    and aula.data_aula is not distinct from v_data_anterior;

  select exists (
    select 1
    from public.aulas_turma aula
    where aula.turma_id = v_turma_id
      and aula.disciplina_id = v_disciplina_id
      and aula.data_aula is not distinct from v_data_anterior
      and (
        exists (
          select 1 from public.diario_frequencia frequencia
          where frequencia.aula_id = aula.id
        )
        or exists (
          select 1 from public.diario_praticas pratica
          where pratica.aula_id = aula.id
        )
      )
  )
  into v_tem_lancamentos;

  v_sessoes_esperadas := case when p_carga_horaria = 8 then 2 else 1 end;

  if v_tem_lancamentos
    and (
      v_total_anterior <> p_carga_horaria
      or v_sessoes_anteriores <> v_sessoes_esperadas
    ) then
    raise exception
      'A carga ou os turnos não podem ser alterados depois de lançada a frequência ou prática.';
  end if;

  if v_total_anterior = p_carga_horaria
    and v_sessoes_anteriores = v_sessoes_esperadas then
    update public.aulas_turma aula
    set data_aula = p_data_aula,
        carga_horaria = case
          when p_carga_horaria = 8 then 4
          else p_carga_horaria
        end,
        sessao = case
          when p_carga_horaria = 8 then aula.sessao
          else 'U'
        end
    where aula.turma_id = v_turma_id
      and aula.disciplina_id = v_disciplina_id
      and aula.data_aula is not distinct from v_data_anterior;
  else
    delete from public.aulas_turma aula
    where aula.turma_id = v_turma_id
      and aula.disciplina_id = v_disciplina_id
      and aula.data_aula is not distinct from v_data_anterior;

    if p_carga_horaria = 8 then
      insert into public.aulas_turma (
        turma_id,
        disciplina_id,
        titulo,
        carga_horaria,
        data_aula,
        sessao
      ) values
        (v_turma_id, v_disciplina_id, v_titulo, 4, p_data_aula, 'M'),
        (v_turma_id, v_disciplina_id, v_titulo, 4, p_data_aula, 'T');
    else
      insert into public.aulas_turma (
        turma_id,
        disciplina_id,
        titulo,
        carga_horaria,
        data_aula,
        sessao
      ) values (
        v_turma_id,
        v_disciplina_id,
        v_titulo,
        p_carga_horaria,
        p_data_aula,
        'U'
      );
    end if;
  end if;

  return query
  select aula.*
  from public.aulas_turma aula
  where aula.turma_id = v_turma_id
    and aula.disciplina_id = v_disciplina_id
    and aula.data_aula = p_data_aula
  order by
    case aula.sessao when 'M' then 1 when 'T' then 2 when 'N' then 3 else 4 end,
    aula.created_at,
    aula.id;
end;
$function$;

revoke all on function public.atualizar_horario_encontro_gestor(uuid, numeric, date)
  from public, anon;
grant execute on function public.atualizar_horario_encontro_gestor(uuid, numeric, date)
  to authenticated, service_role;

comment on function public.atualizar_horario_encontro_gestor(uuid, numeric, date) is
  'Permite à Gestão ajustar data e carga horária sem sobrescrever o conteúdo preenchido pelo professor.';

commit;
