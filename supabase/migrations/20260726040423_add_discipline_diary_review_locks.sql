alter table public.turmas_disciplinas
  add column if not exists bloqueio_diario text not null default 'ABERTO',
  add column if not exists diario_bloqueado_em timestamp with time zone,
  add column if not exists diario_bloqueado_por uuid,
  add column if not exists diario_bloqueio_motivo text;

alter table public.turmas_disciplinas
  drop constraint if exists turmas_disciplinas_bloqueio_diario_check;

alter table public.turmas_disciplinas
  add constraint turmas_disciplinas_bloqueio_diario_check
  check (bloqueio_diario in ('ABERTO', 'PROFESSOR', 'TOTAL'));

create or replace function public.can_write_academic_record_open(
  p_turma_id uuid,
  p_disciplina_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce((select auth.role()), '') = 'service_role' or exists (
    select 1
    from public.turmas t
    join public.cursos c on c.id = t.curso_id
    join public.turmas_disciplinas td
      on td.turma_id = t.id
     and td.disciplina_id = p_disciplina_id
    left join public.periodos_letivos pl on pl.id = td.periodo_letivo_id
    where t.id = p_turma_id
      and (
        (
          c.modalidade <> 'TECNICO'
          and upper(coalesce(t.status, '')) <> 'FINALIZADA'
        )
        or (
          c.modalidade = 'TECNICO'
          and t.status = 'EM_ANDAMENTO'
          and pl.status in ('ABERTO', 'EM_FECHAMENTO')
        )
      )
      and (
        (
          public.can_operate_turma_academics(t.id)
          and td.bloqueio_diario <> 'TOTAL'
        )
        or (
          td.professor_id = public.current_professor_id()
          and td.bloqueio_diario = 'ABERTO'
        )
      )
  );
$function$;

create or replace function public.bloquear_edicao_diario_disciplina()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_turma_id uuid;
  v_disciplina_id uuid;
  v_bloqueio text;
begin
  if coalesce((select auth.role()), '') = 'service_role' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    v_turma_id := old.turma_id;
    v_disciplina_id := old.disciplina_id;
  else
    v_turma_id := new.turma_id;
    v_disciplina_id := new.disciplina_id;
  end if;

  select td.bloqueio_diario
    into v_bloqueio
  from public.turmas_disciplinas td
  where td.turma_id = v_turma_id
    and td.disciplina_id = v_disciplina_id;

  if v_bloqueio = 'TOTAL' then
    raise exception 'Este diário foi fechado pela Gestão e está bloqueado para todos.';
  end if;

  if v_bloqueio = 'PROFESSOR'
    and not public.can_operate_turma_academics(v_turma_id) then
    raise exception 'Este diário foi enviado para revisão e está bloqueado para o professor.';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

drop trigger if exists bloquear_aulas_turma_por_diario on public.aulas_turma;
create trigger bloquear_aulas_turma_por_diario
before insert or update or delete on public.aulas_turma
for each row execute function public.bloquear_edicao_diario_disciplina();

drop trigger if exists bloquear_frequencia_por_diario on public.diario_frequencia;
create trigger bloquear_frequencia_por_diario
before insert or update or delete on public.diario_frequencia
for each row execute function public.bloquear_edicao_diario_disciplina();

drop trigger if exists bloquear_notas_por_diario on public.diario_notas;
create trigger bloquear_notas_por_diario
before insert or update or delete on public.diario_notas
for each row execute function public.bloquear_edicao_diario_disciplina();

drop trigger if exists bloquear_praticas_por_diario on public.diario_praticas;
create trigger bloquear_praticas_por_diario
before insert or update or delete on public.diario_praticas
for each row execute function public.bloquear_edicao_diario_disciplina();

drop trigger if exists bloquear_observacoes_por_diario on public.diario_observacoes;
create trigger bloquear_observacoes_por_diario
before insert or update or delete on public.diario_observacoes
for each row execute function public.bloquear_edicao_diario_disciplina();

create or replace function public.get_diario_fechamento(
  p_turma_id uuid,
  p_disciplina_id uuid
)
returns table (
  bloqueio text,
  status text,
  horas_realizadas numeric,
  carga_horaria numeric,
  progresso_percent numeric,
  bloqueado_em timestamp with time zone,
  motivo text
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not (
    public.can_operate_turma_academics(p_turma_id)
    or public.is_professor_assigned_disciplina(p_turma_id, p_disciplina_id)
  ) then
    raise exception 'Sem permissão para consultar o fechamento deste diário.'
      using errcode = '42501';
  end if;

  return query
  with carga as (
    select
      coalesce(sum(a.carga_horaria), 0)
      + coalesce((
        select sum(ae.carga_horaria_compensacao)
        from public.atividades_extra_classe ae
        where ae.turma_id = p_turma_id
          and ae.disciplina_id = p_disciplina_id
          and ae.status = 'PUBLICADA'
          and (
            ae.prazo_entrega is null
            or ae.prazo_entrega <= pg_catalog.timezone('America/Maceio', now())::date
          )
      ), 0) as realizadas
    from public.aulas_turma a
    where a.turma_id = p_turma_id
      and a.disciplina_id = p_disciplina_id
  )
  select
    td.bloqueio_diario,
    case
      when td.bloqueio_diario = 'TOTAL' then 'FECHADO'
      when td.bloqueio_diario = 'PROFESSOR' then 'EM_REVISAO'
      when c.realizadas >= d.carga_horaria then 'AGUARDANDO_REVISAO'
      else 'EM_ANDAMENTO'
    end,
    c.realizadas,
    d.carga_horaria,
    case when d.carga_horaria > 0
      then least(100, round((c.realizadas / d.carga_horaria) * 100, 1))
      else 0
    end,
    td.diario_bloqueado_em,
    td.diario_bloqueio_motivo
  from public.turmas_disciplinas td
  join public.disciplinas d on d.id = td.disciplina_id
  cross join carga c
  where td.turma_id = p_turma_id
    and td.disciplina_id = p_disciplina_id;
end;
$function$;

create or replace function public.set_diario_bloqueio(
  p_turma_id uuid,
  p_disciplina_id uuid,
  p_bloqueio text,
  p_motivo text default null
)
returns public.turmas_disciplinas
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_is_gestor boolean;
  v_is_professor boolean;
  v_carga numeric;
  v_realizadas numeric;
  v_result public.turmas_disciplinas;
begin
  p_bloqueio := upper(trim(coalesce(p_bloqueio, '')));
  if p_bloqueio not in ('ABERTO', 'PROFESSOR', 'TOTAL') then
    raise exception 'Bloqueio de diário inválido.';
  end if;

  v_is_gestor := public.can_operate_turma_academics(p_turma_id);
  v_is_professor := public.is_professor_assigned_disciplina(
    p_turma_id, p_disciplina_id
  );

  if not v_is_gestor and not (
    v_is_professor and p_bloqueio = 'PROFESSOR'
  ) then
    raise exception 'Sem permissão para alterar o fechamento deste diário.'
      using errcode = '42501';
  end if;

  select d.carga_horaria,
    coalesce(sum(a.carga_horaria), 0)
    + coalesce((
      select sum(ae.carga_horaria_compensacao)
      from public.atividades_extra_classe ae
      where ae.turma_id = p_turma_id
        and ae.disciplina_id = p_disciplina_id
        and ae.status = 'PUBLICADA'
        and (
          ae.prazo_entrega is null
          or ae.prazo_entrega <= pg_catalog.timezone('America/Maceio', now())::date
        )
    ), 0)
  into v_carga, v_realizadas
  from public.disciplinas d
  left join public.aulas_turma a
    on a.disciplina_id = d.id
   and a.turma_id = p_turma_id
  where d.id = p_disciplina_id
  group by d.carga_horaria;

  if p_bloqueio <> 'ABERTO' and coalesce(v_realizadas, 0) < coalesce(v_carga, 0) then
    raise exception 'A carga horária precisa atingir 100%% antes do fechamento.';
  end if;

  update public.turmas_disciplinas td
  set bloqueio_diario = p_bloqueio,
      concluida = p_bloqueio = 'TOTAL',
      diario_bloqueado_em = case when p_bloqueio = 'ABERTO' then null else now() end,
      diario_bloqueado_por = case when p_bloqueio = 'ABERTO' then null else auth.uid() end,
      diario_bloqueio_motivo = nullif(trim(p_motivo), '')
  where td.turma_id = p_turma_id
    and td.disciplina_id = p_disciplina_id
  returning td.* into v_result;

  if v_result.turma_id is null then
    raise exception 'Disciplina não vinculada à turma.';
  end if;

  return v_result;
end;
$function$;

revoke all on function public.get_diario_fechamento(uuid, uuid) from public;
grant execute on function public.get_diario_fechamento(uuid, uuid) to authenticated;

revoke all on function public.set_diario_bloqueio(uuid, uuid, text, text) from public;
grant execute on function public.set_diario_bloqueio(uuid, uuid, text, text) to authenticated;
