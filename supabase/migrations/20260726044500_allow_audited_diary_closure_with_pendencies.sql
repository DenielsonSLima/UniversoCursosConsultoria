alter table public.diario_fechamento_historico
add column if not exists pendencias jsonb not null default '{}'::jsonb;

create or replace function public.set_diario_bloqueio_confirmado(
  p_turma_id uuid,
  p_disciplina_id uuid,
  p_bloqueio text,
  p_motivo text default null,
  p_confirmar_pendencias boolean default false
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
  v_pendencias jsonb := '{}'::jsonb;
  v_motivo text;
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
    if not coalesce((v_pendencias ->> 'podeFechar')::boolean, false)
      and not coalesce(p_confirmar_pendencias, false) then
      raise exception 'Confirme explicitamente o fechamento com pendências.';
    end if;
  end if;

  v_motivo := nullif(trim(p_motivo), '');
  if p_bloqueio = 'TOTAL'
    and not coalesce((v_pendencias ->> 'podeFechar')::boolean, false)
    and v_motivo is null then
    v_motivo := 'Fechamento confirmado pela Gestão com pendências.';
  end if;

  perform set_config('app.diario_lock_rpc', '1', true);

  update public.turmas_disciplinas td
  set bloqueio_diario = p_bloqueio,
      concluida = p_bloqueio = 'TOTAL',
      diario_bloqueado_em = case when p_bloqueio = 'ABERTO' then null else now() end,
      diario_bloqueado_por = case when p_bloqueio = 'ABERTO' then null else auth.uid() end,
      diario_bloqueio_motivo = v_motivo
  where td.turma_id = p_turma_id and td.disciplina_id = p_disciplina_id
  returning td.* into v_result;

  insert into public.diario_fechamento_historico (
    turma_id,
    disciplina_id,
    bloqueio_anterior,
    bloqueio_novo,
    motivo,
    responsavel_id,
    pendencias
  ) values (
    p_turma_id,
    p_disciplina_id,
    v_anterior,
    p_bloqueio,
    v_motivo,
    auth.uid(),
    case when p_bloqueio = 'TOTAL' then v_pendencias else '{}'::jsonb end
  );
  return v_result;
end;
$function$;

create or replace function public.set_diario_bloqueio(
  p_turma_id uuid,
  p_disciplina_id uuid,
  p_bloqueio text,
  p_motivo text default null
)
returns public.turmas_disciplinas
language sql
security definer
set search_path to ''
as $function$
  select public.set_diario_bloqueio_confirmado(
    p_turma_id,
    p_disciplina_id,
    p_bloqueio,
    p_motivo,
    false
  );
$function$;

revoke all on function public.set_diario_bloqueio_confirmado(uuid, uuid, text, text, boolean)
from public, anon;
grant execute on function public.set_diario_bloqueio_confirmado(uuid, uuid, text, text, boolean)
to authenticated;

revoke all on function public.set_diario_bloqueio(uuid, uuid, text, text)
from public, anon;
grant execute on function public.set_diario_bloqueio(uuid, uuid, text, text)
to authenticated;

notify pgrst, 'reload schema';
