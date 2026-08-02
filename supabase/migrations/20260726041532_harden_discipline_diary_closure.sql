create table if not exists public.diario_fechamento_historico (
  id uuid primary key default gen_random_uuid(),
  turma_id uuid not null references public.turmas(id) on delete cascade,
  disciplina_id uuid not null references public.disciplinas(id) on delete cascade,
  bloqueio_anterior text not null,
  bloqueio_novo text not null,
  motivo text,
  responsavel_id uuid,
  created_at timestamp with time zone not null default now()
);

alter table public.diario_fechamento_historico enable row level security;

revoke all on table public.diario_fechamento_historico from anon, authenticated;
grant select on table public.diario_fechamento_historico to authenticated;

create policy "gestao_consulta_historico_fechamento_diario"
on public.diario_fechamento_historico for select to authenticated
using (
  public.can_operate_turma_academics(turma_id)
  or public.is_professor_assigned_disciplina(turma_id, disciplina_id)
);

create or replace function public.get_pendencias_fechamento_diario(
  p_turma_id uuid,
  p_disciplina_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_alunos integer;
  v_aulas integer;
  v_frequencias integer;
  v_notas_pendentes integer;
begin
  if not (
    public.can_operate_turma_academics(p_turma_id)
    or public.is_professor_assigned_disciplina(p_turma_id, p_disciplina_id)
  ) then
    raise exception 'Sem permissão para consultar as pendências deste diário.'
      using errcode = '42501';
  end if;

  with alunos as (
    select aluno_id
    from public.get_diario_alunos(p_turma_id, p_disciplina_id)
    where status = 'ATIVO'
  ), aulas as (
    select id
    from public.aulas_turma
    where turma_id = p_turma_id
      and disciplina_id = p_disciplina_id
      and (data_aula is null or data_aula <= pg_catalog.timezone('America/Maceio', now())::date)
  )
  select
    (select count(*) from alunos),
    (select count(*) from aulas),
    (
      select count(*)
      from public.diario_frequencia f
      join alunos al on al.aluno_id = f.aluno_id
      join aulas au on au.id = f.aula_id
      where f.turma_id = p_turma_id
        and f.disciplina_id = p_disciplina_id
        and f.status in ('P', 'F', 'J')
    )
  into v_alunos, v_aulas, v_frequencias;

  with alunos as (
    select aluno_id
    from public.get_diario_alunos(p_turma_id, p_disciplina_id)
    where status = 'ATIVO'
  ), resultados as (
    select r.aluno_id, r.media_parcial
    from public.get_diario_resultados(p_turma_id, p_disciplina_id) r
  )
  select count(*)
  into v_notas_pendentes
  from alunos al
  left join resultados r on r.aluno_id = al.aluno_id
  where r.media_parcial is null;

  return jsonb_build_object(
    'alunosAtivos', v_alunos,
    'aulasRealizadas', v_aulas,
    'frequenciasPendentes', greatest(0, v_alunos * v_aulas - v_frequencias),
    'notasPendentes', v_notas_pendentes,
    'podeFechar', (
      v_alunos > 0
      and v_aulas > 0
      and v_alunos * v_aulas = v_frequencias
      and v_notas_pendentes = 0
    )
  );
end;
$function$;

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
      coalesce(sum(a.carga_horaria) filter (
        where a.data_aula is null
          or a.data_aula <= pg_catalog.timezone('America/Maceio', now())::date
      ), 0)
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
    d.carga_horaria::numeric,
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
  if tg_op = 'DELETE' then
    v_turma_id := old.turma_id;
    v_disciplina_id := old.disciplina_id;
  else
    v_turma_id := new.turma_id;
    v_disciplina_id := new.disciplina_id;
  end if;

  perform pg_advisory_xact_lock(
    hashtext(v_turma_id::text),
    hashtext(v_disciplina_id::text)
  );

  select td.bloqueio_diario into v_bloqueio
  from public.turmas_disciplinas td
  where td.turma_id = v_turma_id and td.disciplina_id = v_disciplina_id;

  if v_bloqueio = 'TOTAL'
    and coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Este diário foi fechado pela Gestão e está bloqueado para todos.';
  end if;
  if v_bloqueio = 'PROFESSOR'
    and coalesce((select auth.role()), '') <> 'service_role'
    and not public.can_operate_turma_academics(v_turma_id) then
    raise exception 'Este diário foi enviado para revisão e está bloqueado para o professor.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

drop trigger if exists bloquear_atividades_por_diario on public.atividades_extra_classe;
create trigger bloquear_atividades_por_diario
before insert or update or delete on public.atividades_extra_classe
for each row execute function public.bloquear_edicao_diario_disciplina();

create or replace function public.proteger_estado_fechamento_diario()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if (
    new.bloqueio_diario is distinct from old.bloqueio_diario
    or new.diario_bloqueado_em is distinct from old.diario_bloqueado_em
    or new.diario_bloqueado_por is distinct from old.diario_bloqueado_por
    or new.diario_bloqueio_motivo is distinct from old.diario_bloqueio_motivo
  )
  and coalesce(current_setting('app.diario_lock_rpc', true), '') <> '1'
  and coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Use o fluxo de Fechamento do diário para alterar as travas.';
  end if;
  return new;
end;
$function$;

drop trigger if exists proteger_estado_fechamento_diario on public.turmas_disciplinas;
create trigger proteger_estado_fechamento_diario
before update on public.turmas_disciplinas
for each row execute function public.proteger_estado_fechamento_diario();

revoke all on function public.bloquear_edicao_diario_disciplina() from public, anon, authenticated;
revoke all on function public.proteger_estado_fechamento_diario() from public, anon, authenticated;

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
  v_anterior text;
  v_periodo_status text;
  v_pendencias jsonb;
  v_result public.turmas_disciplinas;
begin
  perform pg_advisory_xact_lock(hashtext(p_turma_id::text), hashtext(p_disciplina_id::text));
  p_bloqueio := upper(trim(coalesce(p_bloqueio, '')));
  if p_bloqueio not in ('ABERTO', 'PROFESSOR', 'TOTAL') then
    raise exception 'Bloqueio de diário inválido.';
  end if;

  v_is_gestor := public.can_operate_turma_academics(p_turma_id);
  v_is_professor := public.is_professor_assigned_disciplina(p_turma_id, p_disciplina_id);
  if not v_is_gestor and not (v_is_professor and p_bloqueio = 'PROFESSOR') then
    raise exception 'Sem permissão para alterar o fechamento deste diário.' using errcode = '42501';
  end if;

  select td.bloqueio_diario, pl.status
  into v_anterior, v_periodo_status
  from public.turmas_disciplinas td
  left join public.periodos_letivos pl on pl.id = td.periodo_letivo_id
  where td.turma_id = p_turma_id and td.disciplina_id = p_disciplina_id
  for update of td;

  if not found then
    raise exception 'Disciplina não vinculada à turma.';
  end if;
  if v_periodo_status = 'FECHADO' then
    raise exception 'Reabra o período letivo antes de alterar este diário.';
  end if;
  if not v_is_gestor and v_anterior <> 'ABERTO' then
    raise exception 'Somente a Gestão pode alterar um diário que já está em revisão ou fechado.'
      using errcode = '42501';
  end if;
  if p_bloqueio = v_anterior then
    select td.* into v_result
    from public.turmas_disciplinas td
    where td.turma_id = p_turma_id and td.disciplina_id = p_disciplina_id;
    return v_result;
  end if;
  if p_bloqueio = 'ABERTO' and v_anterior <> 'ABERTO'
    and nullif(trim(p_motivo), '') is null then
    raise exception 'Informe o motivo da reabertura ou devolução para ajustes.';
  end if;

  select d.carga_horaria,
    coalesce(sum(a.carga_horaria) filter (
      where a.data_aula is null
        or a.data_aula <= pg_catalog.timezone('America/Maceio', now())::date
    ), 0)
    + coalesce((
      select sum(ae.carga_horaria_compensacao)
      from public.atividades_extra_classe ae
      where ae.turma_id = p_turma_id and ae.disciplina_id = p_disciplina_id
        and ae.status = 'PUBLICADA'
        and (ae.prazo_entrega is null or ae.prazo_entrega <= pg_catalog.timezone('America/Maceio', now())::date)
    ), 0)
  into v_carga, v_realizadas
  from public.disciplinas d
  left join public.aulas_turma a on a.disciplina_id = d.id and a.turma_id = p_turma_id
  where d.id = p_disciplina_id
  group by d.carga_horaria;

  if p_bloqueio <> 'ABERTO' and coalesce(v_realizadas, 0) < coalesce(v_carga, 0) then
    raise exception 'A carga horária precisa atingir 100%% antes do fechamento.';
  end if;
  if p_bloqueio = 'TOTAL' then
    v_pendencias := public.get_pendencias_fechamento_diario(p_turma_id, p_disciplina_id);
    if not coalesce((v_pendencias ->> 'podeFechar')::boolean, false) then
      raise exception 'Existem pendências de frequência ou notas neste diário.';
    end if;
  end if;

  perform set_config('app.diario_lock_rpc', '1', true);

  update public.turmas_disciplinas td
  set bloqueio_diario = p_bloqueio,
      concluida = p_bloqueio = 'TOTAL',
      diario_bloqueado_em = case when p_bloqueio = 'ABERTO' then null else now() end,
      diario_bloqueado_por = case when p_bloqueio = 'ABERTO' then null else auth.uid() end,
      diario_bloqueio_motivo = nullif(trim(p_motivo), '')
  where td.turma_id = p_turma_id and td.disciplina_id = p_disciplina_id
  returning td.* into v_result;

  insert into public.diario_fechamento_historico (
    turma_id, disciplina_id, bloqueio_anterior, bloqueio_novo, motivo, responsavel_id
  ) values (
    p_turma_id, p_disciplina_id, v_anterior, p_bloqueio,
    nullif(trim(p_motivo), ''), auth.uid()
  );
  return v_result;
end;
$function$;

revoke all on function public.get_pendencias_fechamento_diario(uuid, uuid) from public;
grant execute on function public.get_pendencias_fechamento_diario(uuid, uuid) to authenticated;

revoke all on function public.get_diario_fechamento(uuid, uuid) from public;
grant execute on function public.get_diario_fechamento(uuid, uuid) to authenticated;
