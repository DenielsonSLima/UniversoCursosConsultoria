begin;

create table if not exists public.public_support_push_devices (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.comunicacao_chats(id) on delete cascade,
  installation_id text not null,
  platform text not null check (platform in ('android', 'ios')),
  push_token text not null,
  permission_status text not null check (permission_status in ('granted', 'provisional')),
  active boolean not null default true,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint public_support_push_devices_installation_length check (char_length(installation_id) between 8 and 255),
  constraint public_support_push_devices_token_length check (char_length(push_token) between 8 and 4096),
  unique (chat_id, installation_id)
);

create table if not exists public.public_support_push_jobs (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.comunicacao_chats(id) on delete cascade,
  message_id uuid not null references public.comunicacao_mensagens(id) on delete cascade,
  title text not null,
  body text not null,
  deep_link text not null default '/aluno/atendimento-publico',
  data jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'partial', 'failed', 'skipped')),
  available_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '3 days'),
  attempts integer not null default 0 check (attempts between 0 and 5),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (message_id)
);

create table if not exists public.public_support_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.public_support_push_jobs(id) on delete cascade,
  device_id uuid not null references public.public_support_push_devices(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  retryable boolean not null default false,
  provider_message_id text,
  last_error text,
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (job_id, device_id)
);

create index if not exists public_support_push_devices_chat_active_idx
  on public.public_support_push_devices (chat_id, active, expires_at);
create index if not exists public_support_push_jobs_dispatch_idx
  on public.public_support_push_jobs (status, available_at, expires_at, created_at);

alter table public.public_support_push_devices enable row level security;
alter table public.public_support_push_jobs enable row level security;
alter table public.public_support_push_deliveries enable row level security;
revoke all on public.public_support_push_devices from public, anon, authenticated;
revoke all on public.public_support_push_jobs from public, anon, authenticated;
revoke all on public.public_support_push_deliveries from public, anon, authenticated;

create or replace function public.enqueue_public_support_push_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chat public.comunicacao_chats;
begin
  if new.remetente_tipo not in ('gestor', 'sistema') then return new; end if;

  select * into v_chat
  from public.comunicacao_chats
  where id = new.chat_id;

  if not found
     or v_chat.origem <> 'publico'
     or not coalesce(v_chat.notificar_resposta, false)
     or v_chat.public_access_expires_at is null
     or v_chat.public_access_expires_at <= now()
     or not exists (
       select 1 from public.public_support_push_devices device
       where device.chat_id = v_chat.id
         and device.active
         and device.expires_at > now()
     ) then
    return new;
  end if;

  insert into public.public_support_push_jobs (
    chat_id, message_id, title, body, deep_link, data
  ) values (
    v_chat.id,
    new.id,
    'Nova mensagem da Universo',
    'Você recebeu uma nova resposta no atendimento.',
    '/aluno/atendimento-publico',
    jsonb_build_object(
      'publicSupport', true,
      'chatId', v_chat.id,
      'messageId', new.id,
      'collapseKey', 'public-chat:' || v_chat.id::text
    )
  ) on conflict (message_id) do nothing;
  return new;
end;
$$;

revoke all on function public.enqueue_public_support_push_notification()
  from public, anon, authenticated;

drop trigger if exists comunicacao_mensagens_enqueue_public_support_push
  on public.comunicacao_mensagens;
create trigger comunicacao_mensagens_enqueue_public_support_push
after insert on public.comunicacao_mensagens
for each row execute function public.enqueue_public_support_push_notification();

create or replace function public.claim_public_support_push_deliveries(
  p_worker text,
  p_limit integer default 100
)
returns table (
  delivery_id uuid,
  job_id uuid,
  campaign_id uuid,
  device_id uuid,
  push_token text,
  platform text,
  category text,
  title text,
  body text,
  deep_link text,
  data jsonb,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.public_support_push_jobs job
  set status = 'pending', locked_at = null, locked_by = null,
      available_at = now() + interval '30 seconds', last_error = 'WORKER_LEASE_EXPIRED'
  where job.status = 'processing'
    and job.locked_at < now() - interval '3 minutes'
    and job.attempts < 5
    and job.expires_at > now();

  update public.public_support_push_deliveries delivery
  set status = 'pending', retryable = true, last_error = 'WORKER_LEASE_EXPIRED', updated_at = now()
  from public.public_support_push_jobs job
  where delivery.job_id = job.id
    and delivery.status = 'processing'
    and job.status = 'pending';

  update public.public_support_push_jobs job
  set status = 'failed', processed_at = now(), locked_at = null, locked_by = null,
      last_error = case when job.expires_at <= now() then 'PUSH_EXPIRED' else 'MAX_ATTEMPTS' end
  where job.status in ('pending', 'processing')
    and (job.expires_at <= now() or job.attempts >= 5);

  with claimed as (
    select job.id
    from public.public_support_push_jobs job
    where job.status = 'pending'
      and job.available_at <= now()
      and job.expires_at > now()
      and job.attempts < 5
    order by job.available_at, job.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 100))
  )
  update public.public_support_push_jobs job
  set status = 'processing', locked_at = now(), locked_by = left(p_worker, 120),
      attempts = job.attempts + 1, last_error = null
  from claimed
  where job.id = claimed.id;

  insert into public.public_support_push_deliveries as delivery (
    job_id, device_id, status, attempts, retryable, updated_at
  )
  select job.id, device.id, 'processing', 1, false, now()
  from public.public_support_push_jobs job
  join public.public_support_push_devices device on device.chat_id = job.chat_id
  where job.status = 'processing'
    and job.locked_by = left(p_worker, 120)
    and device.active
    and device.expires_at > now()
  on conflict (job_id, device_id) do update
  set status = 'processing', attempts = delivery.attempts + 1,
      retryable = false, last_error = null, updated_at = now()
  where delivery.status = 'pending'
     or (delivery.status = 'failed' and delivery.retryable);

  update public.public_support_push_jobs job
  set status = 'skipped', processed_at = now(), locked_at = null, locked_by = null,
      last_error = 'NO_ELIGIBLE_DEVICE'
  where job.status = 'processing'
    and job.locked_by = left(p_worker, 120)
    and not exists (
      select 1 from public.public_support_push_deliveries delivery
      where delivery.job_id = job.id and delivery.status = 'processing'
    );

  return query
  select delivery.id, job.id, null::uuid, device.id, device.push_token,
         device.platform, 'chat'::text, job.title, job.body, job.deep_link,
         job.data, job.expires_at
  from public.public_support_push_deliveries delivery
  join public.public_support_push_jobs job on job.id = delivery.job_id
  join public.public_support_push_devices device on device.id = delivery.device_id
  where job.status = 'processing'
    and job.locked_by = left(p_worker, 120)
    and delivery.status = 'processing';
end;
$$;

revoke all on function public.claim_public_support_push_deliveries(text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_public_support_push_deliveries(text, integer)
  to service_role;

create or replace function public.complete_public_support_push_delivery(
  p_delivery_id uuid,
  p_worker text,
  p_success boolean,
  p_provider_message_id text default null,
  p_error text default null,
  p_disable_device boolean default false,
  p_retryable boolean default false,
  p_retry_after_seconds integer default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery public.public_support_push_deliveries;
  v_job public.public_support_push_jobs;
begin
  select * into v_delivery from public.public_support_push_deliveries where id = p_delivery_id for update;
  if not found then return false; end if;
  select * into v_job from public.public_support_push_jobs where id = v_delivery.job_id for update;
  if not found or v_job.locked_by is distinct from left(p_worker, 120) then return false; end if;

  update public.public_support_push_deliveries
  set status = case when p_success then 'sent' else 'failed' end,
      provider_message_id = case when p_success then left(p_provider_message_id, 500) else null end,
      last_error = case when p_success then null else left(coalesce(p_error, 'FCM_ERROR'), 120) end,
      retryable = not p_success and p_retryable and v_job.attempts < 5 and v_job.expires_at > now(),
      sent_at = case when p_success then now() else null end,
      updated_at = now()
  where id = p_delivery_id;

  if p_disable_device then
    update public.public_support_push_devices
    set active = false, updated_at = now()
    where id = v_delivery.device_id;
  end if;

  if exists (
    select 1 from public.public_support_push_deliveries
    where job_id = v_job.id and status = 'processing'
  ) then return true; end if;

  if exists (
    select 1 from public.public_support_push_deliveries
    where job_id = v_job.id and status = 'failed' and retryable
  ) then
    update public.public_support_push_jobs
    set status = 'pending', locked_at = null, locked_by = null,
        available_at = least(expires_at, now() + make_interval(secs => greatest(30, coalesce(p_retry_after_seconds, 30)))),
        last_error = left(coalesce(p_error, 'FCM_RETRY'), 120), updated_at = now()
    where id = v_job.id;
  else
    update public.public_support_push_jobs
    set status = case
          when not exists (select 1 from public.public_support_push_deliveries where job_id = v_job.id and status <> 'sent') then 'completed'
          when exists (select 1 from public.public_support_push_deliveries where job_id = v_job.id and status = 'sent') then 'partial'
          else 'failed'
        end,
        processed_at = now(), locked_at = null, locked_by = null,
        last_error = case when p_success then null else left(coalesce(p_error, 'FCM_ERROR'), 120) end,
        updated_at = now()
    where id = v_job.id;
  end if;
  return true;
end;
$$;

revoke all on function public.complete_public_support_push_delivery(uuid, text, boolean, text, text, boolean, boolean, integer)
  from public, anon, authenticated;
grant execute on function public.complete_public_support_push_delivery(uuid, text, boolean, text, text, boolean, boolean, integer)
  to service_role;

commit;
