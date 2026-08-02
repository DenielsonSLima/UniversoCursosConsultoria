alter table public.whatsapp_conversas
  add column if not exists csat_requested_at timestamptz;

alter table public.whatsapp_conversas
  drop constraint if exists whatsapp_conversas_csat_score_check;

alter table public.whatsapp_conversas
  add constraint whatsapp_conversas_csat_score_check
  check (csat_score is null or csat_score between 0 and 5);

alter table public.whatsapp_flow_sessions
  drop constraint if exists whatsapp_flow_sessions_status_check;

alter table public.whatsapp_flow_sessions
  add constraint whatsapp_flow_sessions_status_check
  check (
    status in (
      'awaiting_cpf',
      'menu',
      'course_agent',
      'choosing_receivable',
      'choosing_irpf_year',
      'awaiting_csat',
      'handoff',
      'closed'
    )
  );

create index if not exists idx_whatsapp_conversas_pending_csat
  on public.whatsapp_conversas (csat_requested_at)
  where status = 'aberta'
    and status_atendimento = 'aguardando_avaliacao';

create or replace function public.whatsapp_transfer_conversation(
  p_conversation_id uuid,
  p_setor text,
  p_polo_id uuid,
  p_motivo text default null
)
returns public.whatsapp_conversas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.whatsapp_conversas%rowtype;
  v_updated public.whatsapp_conversas%rowtype;
  v_user_name text;
begin
  if p_setor is null or p_setor not in (
    'pedagogico_coordenacao',
    'financeiro',
    'comercial_matriculas',
    'secretaria',
    'atendimento_geral'
  ) then
    raise exception 'Setor de destino inválido.';
  end if;
  if p_polo_id is null then
    raise exception 'Selecione o polo de destino.';
  end if;

  select *
  into v_current
  from public.whatsapp_conversas
  where id = p_conversation_id
  for update;

  if v_current.id is null then
    raise exception 'Conversa não encontrada.';
  end if;
  if not public.whatsapp_gestor_can_access(
    v_current.setor,
    v_current.polo_id
  ) then
    raise exception 'Usuário sem acesso ao atendimento atual.';
  end if;

  select usuario.nome
  into v_user_name
  from public.usuarios_sistema usuario
  where lower(usuario.email) = public.auth_email()
    and public.is_active_status(usuario.status)
  limit 1;

  update public.whatsapp_conversas
  set
    setor = p_setor,
    polo_id = p_polo_id,
    atendente_id = null,
    status_atendimento = 'pendente_setor',
    updated_at = now()
  where id = p_conversation_id
  returning * into v_updated;

  insert into public.whatsapp_mensagens (
    conversa_id,
    aluno_id,
    direcao,
    remetente_tipo,
    remetente_nome,
    conteudo,
    message_type,
    status,
    lida
  )
  values (
    p_conversation_id,
    v_current.aluno_id,
    'saida',
    'sistema',
    'Sistema',
    '🔄 Atendimento transferido por '
      || coalesce(v_user_name, 'gestor')
      || ' para o setor '
      || p_setor
      || case
        when nullif(trim(coalesce(p_motivo, '')), '') is not null
          then ' — ' || left(trim(p_motivo), 240)
        else ''
      end
      || '.',
    'system',
    'sent',
    true
  );

  return v_updated;
end;
$$;

revoke all on function public.whatsapp_transfer_conversation(
  uuid,
  text,
  uuid,
  text
) from public, anon;
grant execute on function public.whatsapp_transfer_conversation(
  uuid,
  text,
  uuid,
  text
) to authenticated, service_role;

create or replace function public.whatsapp_begin_csat(
  p_conversation_id uuid
)
returns public.whatsapp_conversas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.whatsapp_conversas%rowtype;
  v_updated public.whatsapp_conversas%rowtype;
begin
  select *
  into v_current
  from public.whatsapp_conversas
  where id = p_conversation_id
  for update;

  if v_current.id is null then
    raise exception 'Conversa não encontrada.';
  end if;
  if not public.whatsapp_gestor_can_access(
    v_current.setor,
    v_current.polo_id
  ) then
    raise exception 'Usuário sem acesso a esta conversa.';
  end if;

  update public.whatsapp_conversas
  set
    status = 'aberta',
    status_atendimento = 'aguardando_avaliacao',
    csat_score = null,
    csat_comentario = null,
    csat_requested_at = now(),
    data_fim_atendimento = now(),
    closed_at = null,
    closed_reason = null,
    updated_at = now()
  where id = p_conversation_id
  returning * into v_updated;

  insert into public.whatsapp_flow_sessions (
    conversa_id,
    telefone,
    aluno_id,
    status,
    attempts,
    handoff_required,
    data,
    updated_at
  )
  values (
    v_current.id,
    v_current.telefone,
    v_current.aluno_id,
    'awaiting_csat',
    0,
    false,
    jsonb_build_object('csatRequestedAt', now()),
    now()
  )
  on conflict (conversa_id) do update
  set
    status = 'awaiting_csat',
    attempts = 0,
    handoff_required = false,
    data = coalesce(whatsapp_flow_sessions.data, '{}'::jsonb)
      || jsonb_build_object('csatRequestedAt', now()),
    updated_at = now();

  return v_updated;
end;
$$;

revoke all on function public.whatsapp_begin_csat(uuid)
  from public, anon;
grant execute on function public.whatsapp_begin_csat(uuid)
  to authenticated, service_role;

create or replace function public.whatsapp_close_stale_handoffs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_csat_closed integer := 0;
  v_handoff_closed integer := 0;
begin
  with due_csat as (
    select conversa.id
    from public.whatsapp_conversas conversa
    where conversa.status = 'aberta'
      and conversa.status_atendimento = 'aguardando_avaliacao'
      and conversa.csat_requested_at <= now() - interval '1 hour'
    for update of conversa skip locked
  ),
  closed_csat as (
    update public.whatsapp_conversas conversa
    set
      status = 'arquivada',
      status_atendimento = 'solucionada',
      unread_count = 0,
      closed_at = now(),
      closed_reason = 'csat_timeout',
      updated_at = now()
    from due_csat
    where conversa.id = due_csat.id
    returning conversa.id
  )
  update public.whatsapp_flow_sessions session
  set
    status = 'closed',
    handoff_required = false,
    data = coalesce(session.data, '{}'::jsonb) || jsonb_build_object(
      'closedReason',
      'csat_timeout',
      'closedAt',
      now()
    ),
    updated_at = now()
  from closed_csat
  where session.conversa_id = closed_csat.id;

  get diagnostics v_csat_closed = row_count;

  with due_handoff as (
    select conversa.id
    from public.whatsapp_conversas conversa
    join public.whatsapp_flow_sessions session
      on session.conversa_id = conversa.id
    join public.whatsapp_flow_settings settings
      on settings.conexao_id = conversa.conexao_id
    where settings.enabled = true
      and settings.auto_close_enabled = true
      and conversa.status = 'aberta'
      and conversa.status_atendimento <> 'aguardando_avaliacao'
      and (
        session.handoff_required = true
        or session.status = 'handoff'
      )
      and conversa.ultima_data
        <= now() - make_interval(hours => settings.auto_close_hours)
    for update of conversa skip locked
  ),
  closed_handoff as (
    update public.whatsapp_conversas conversa
    set
      status = 'arquivada',
      unread_count = 0,
      closed_at = now(),
      closed_reason = 'inactivity',
      updated_at = now()
    from due_handoff
    where conversa.id = due_handoff.id
    returning conversa.id
  )
  update public.whatsapp_flow_sessions session
  set
    status = 'closed',
    handoff_required = false,
    data = coalesce(session.data, '{}'::jsonb) || jsonb_build_object(
      'closedReason',
      'inactivity',
      'closedAt',
      now()
    ),
    updated_at = now()
  from closed_handoff
  where session.conversa_id = closed_handoff.id;

  get diagnostics v_handoff_closed = row_count;
  return v_csat_closed + v_handoff_closed;
end;
$$;

revoke all on function public.whatsapp_close_stale_handoffs()
  from public, anon, authenticated;
grant execute on function public.whatsapp_close_stale_handoffs()
  to service_role;
