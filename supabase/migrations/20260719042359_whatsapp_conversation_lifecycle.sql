alter table public.whatsapp_flow_settings
  add column if not exists auto_close_enabled boolean not null default true,
  add column if not exists auto_close_hours integer not null default 24;

alter table public.whatsapp_flow_settings
  drop constraint if exists whatsapp_flow_settings_auto_close_hours_check;

alter table public.whatsapp_flow_settings
  add constraint whatsapp_flow_settings_auto_close_hours_check
  check (auto_close_hours between 1 and 168);

alter table public.whatsapp_conversas
  add column if not exists closed_at timestamptz,
  add column if not exists closed_reason text;

update public.whatsapp_flow_settings
set
  auto_close_enabled = coalesce(auto_close_enabled, true),
  auto_close_hours = coalesce(auto_close_hours, 24),
  welcome_message = 'Para proteger seus dados e localizar seu cadastro com segurança, informe seu CPF. Pode enviar com ou sem pontuação.',
  menu_message = E'🎓Olá! Eu sou a Uni.\n\nSou a assistente virtual da Universo Cursos e Consultoria e estou aqui para ajudar.\nEscolha uma das opções abaixo:\n1️⃣ Boleto ou link de pagamento;\n2️⃣ PIX Copia e Cola;\n3️⃣ Declaração para IRPF;\n4️⃣ Falar com um atendente.',
  updated_at = now()
where scope = 'default';

create index if not exists idx_whatsapp_conversas_open_last_activity
  on public.whatsapp_conversas (ultima_data)
  where status = 'aberta';

create or replace function public.whatsapp_close_stale_handoffs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_closed integer := 0;
begin
  with due as (
    select c.id
    from public.whatsapp_conversas c
    join public.whatsapp_flow_sessions s on s.conversa_id = c.id
    join public.whatsapp_flow_settings cfg on cfg.scope = 'default'
    where cfg.enabled = true
      and cfg.auto_close_enabled = true
      and c.status = 'aberta'
      and (s.handoff_required = true or s.status = 'handoff')
      and c.ultima_data <= now() - make_interval(hours => cfg.auto_close_hours)
    for update of c skip locked
  ), closed as (
    update public.whatsapp_conversas c
    set
      status = 'arquivada',
      unread_count = 0,
      closed_at = now(),
      closed_reason = 'inactivity',
      updated_at = now()
    from due
    where c.id = due.id
    returning c.id
  )
  update public.whatsapp_flow_sessions s
  set
    status = 'closed',
    handoff_required = false,
    data = coalesce(s.data, '{}'::jsonb) || jsonb_build_object(
      'closedReason', 'inactivity',
      'closedAt', now()
    ),
    updated_at = now()
  from closed
  where s.conversa_id = closed.id;

  get diagnostics v_closed = row_count;
  return v_closed;
end;
$$;

revoke all on function public.whatsapp_close_stale_handoffs() from public, anon, authenticated;
grant execute on function public.whatsapp_close_stale_handoffs() to service_role;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'whatsapp-close-stale-handoffs-every-15-minutes'
  limit 1;

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

  perform cron.schedule(
    'whatsapp-close-stale-handoffs-every-15-minutes',
    '*/15 * * * *',
    'select public.whatsapp_close_stale_handoffs();'
  );
end;
$$;
