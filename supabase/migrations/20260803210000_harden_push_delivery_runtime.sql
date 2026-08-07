begin;

alter table public.push_notification_jobs
  add column if not exists expires_at timestamptz;

alter table public.push_notification_deliveries
  add column if not exists retryable boolean not null default false;

alter table public.push_notification_deliveries
  add column if not exists retry_after_at timestamptz;

create or replace function public.push_notification_default_expiry(
  p_category text,
  p_available_at timestamptz
)
returns timestamptz
language sql
stable
set search_path = pg_catalog
as $$
  select coalesce(p_available_at, now()) + case p_category
    when 'chat' then interval '1 day'
    when 'service' then interval '1 day'
    when 'financial' then interval '1 day'
    when 'academic' then interval '2 days'
    when 'calendar' then interval '2 days'
    when 'institutional' then interval '3 days'
    else interval '1 day'
  end;
$$;

update public.push_notification_jobs
set expires_at = public.push_notification_default_expiry(category, available_at)
where expires_at is null;

alter table public.push_notification_jobs
  alter column expires_at set not null;

create or replace function public.push_notification_set_job_expiry()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.expires_at is null then
    new.expires_at := public.push_notification_default_expiry(new.category, new.available_at);
  end if;
  return new;
end;
$$;

drop trigger if exists push_notification_jobs_set_expiry on public.push_notification_jobs;
create trigger push_notification_jobs_set_expiry
before insert
on public.push_notification_jobs
for each row execute function public.push_notification_set_job_expiry();

drop index if exists public.idx_push_notification_jobs_dispatch;
create index idx_push_notification_jobs_dispatch
  on public.push_notification_jobs (status, available_at, expires_at, created_at)
  where status in ('pending', 'failed', 'partial');

create or replace function public.push_notification_sensitive_content_reason(
  p_title text,
  p_body text
)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_content text := coalesce(p_title, '') || ' ' || coalesce(p_body, '');
begin
  if v_content ~* '(cpf|cnpj|matr[ií]cula|e-?mail|telefone|celular|boleto|pix|parcela|vencid|atras|inadimpl|mensalidade|pagamento|saldo|cobran[çc]a|cart[aã]o|senha|token|documento|identidade|\{\{)' then
    return 'A prévia contém informação financeira, credencial ou identificadora inadequada para a tela bloqueada.';
  end if;
  if v_content ~* 'r\$|[0-9]+[,.][0-9]{2}' then
    return 'A prévia contém valor financeiro inadequado para a tela bloqueada.';
  end if;
  if v_content ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}' then
    return 'A prévia contém endereço de e-mail inadequado para a tela bloqueada.';
  end if;
  if v_content ~* '\(?[0-9]{2}\)?[[:space:]-]*9?[0-9]{4}[[:space:]-]*[0-9]{4}' then
    return 'A prévia contém telefone inadequado para a tela bloqueada.';
  end if;
  if v_content ~ '([0-9][ .-]?){10,}[0-9]' then
    return 'A prévia contém uma sequência numérica que pode identificar o aluno.';
  end if;
  return null;
end;
$$;

revoke all on function public.push_notification_sensitive_content_reason(text, text)
  from public, anon, authenticated;

alter table public.comunicacao_push_campanhas
  drop constraint if exists comunicacao_push_campanhas_category;
alter table public.comunicacao_push_campanhas
  add constraint comunicacao_push_campanhas_category
  check (category in ('institutional', 'academic', 'service', 'financial', 'marketing'));

create or replace function public.push_notification_campaign_category_allowed(p_category text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(enabled, false)
    and coalesce((categories ->> 'marketing')::boolean, false)
    and case p_category
      when 'financial' then coalesce((categories ->> 'financial')::boolean, false)
      when 'academic' then coalesce((categories ->> 'academic')::boolean, false)
      when 'service' then coalesce((categories ->> 'chat')::boolean, false)
      when 'marketing' then true
      else coalesce((categories ->> 'institutional')::boolean, false)
    end
  from public.push_notification_policies
  where id = true;
$$;

revoke all on function public.push_notification_campaign_category_allowed(text)
  from public, anon, authenticated;

create or replace function public.comunicacao_push_campanha_previsualizar(
  p_title text,
  p_body text,
  p_category text,
  p_deep_link text,
  p_audience_type text,
  p_polo_id uuid default null,
  p_turma_id uuid default null,
  p_scheduled_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_users integer;
  v_devices integer;
  v_android integer;
  v_ios integer;
  v_label text;
  v_blocked text;
  v_warnings jsonb := '[]'::jsonb;
  v_token uuid;
  v_payload jsonb;
begin
  if not public.can_target_push_scope(p_audience_type, p_polo_id, p_turma_id) then
    raise exception 'INSUFFICIENT_PERMISSION' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 80
     or char_length(btrim(coalesce(p_body, ''))) not between 1 and 180 then
    raise exception 'INVALID_MESSAGE_LENGTH' using errcode = '22023';
  end if;
  if p_category not in ('institutional', 'academic', 'service', 'financial', 'marketing')
     or p_audience_type not in ('all', 'polo', 'turma')
     or coalesce(p_deep_link, '') !~ '^/aluno(?:/|$)' then
    raise exception 'INVALID_CAMPAIGN' using errcode = '22023';
  end if;
  if (p_audience_type = 'all' and (p_polo_id is not null or p_turma_id is not null))
     or (p_audience_type = 'polo' and (p_polo_id is null or p_turma_id is not null))
     or (p_audience_type = 'turma' and p_turma_id is null) then
    raise exception 'INVALID_AUDIENCE_SCOPE' using errcode = '22023';
  end if;

  v_blocked := public.push_notification_sensitive_content_reason(p_title, p_body);
  if v_blocked is null and not public.push_notification_campaign_category_allowed(p_category) then
    v_blocked := 'A política de push, a categoria ou os envios manuais em lote estão desativados.';
  end if;

  select count(*) into v_users
  from public.push_notification_resolve_audience(p_audience_type, p_polo_id, p_turma_id);
  select count(*),
         count(*) filter (where d.plataforma = 'android'),
         count(*) filter (where d.plataforma = 'ios')
  into v_devices, v_android, v_ios
  from public.aluno_app_dispositivos d
  where d.aluno_id in (
    select aluno_id
    from public.push_notification_resolve_audience(p_audience_type, p_polo_id, p_turma_id)
  )
    and d.active
    and d.session_active
    and d.notifications_enabled
    and d.permission_status in ('granted', 'provisional')
    and d.push_token is not null;

  if p_audience_type = 'all' then
    v_label := 'Todos os dispositivos elegíveis';
  elsif p_audience_type = 'polo' then
    select 'Polo ' || nome into v_label from public.polos where id = p_polo_id;
  else
    select 'Turma ' || nome into v_label from public.turmas where id = p_turma_id;
  end if;
  if coalesce(v_devices, 0) = 0 and v_blocked is null then
    v_blocked := 'Nenhum dispositivo elegível nesta audiência.';
  end if;
  if coalesce(v_devices, 0) < coalesce(v_users, 0) then
    v_warnings := v_warnings || jsonb_build_array('Parte dos alunos ainda não ativou notificações no aplicativo.');
  end if;

  v_payload := jsonb_build_object(
    'title', btrim(p_title),
    'body', btrim(p_body),
    'category', p_category,
    'deepLink', p_deep_link,
    'audienceType', p_audience_type,
    'poloId', p_polo_id,
    'turmaId', p_turma_id,
    'scheduledAt', p_scheduled_at
  );
  insert into public.comunicacao_push_previews (
    created_by, payload, eligible_users, eligible_devices,
    android_devices, ios_devices, audience_label, blocked_reason
  ) values (
    auth.uid(), v_payload, v_users, v_devices,
    v_android, v_ios, coalesce(v_label, 'Audiência selecionada'), v_blocked
  ) returning token into v_token;

  delete from public.comunicacao_push_previews
  where expires_at < now() - interval '1 day';
  return jsonb_build_object(
    'eligibleUsers', v_users,
    'eligibleDevices', v_devices,
    'androidDevices', v_android,
    'iosDevices', v_ios,
    'audienceLabel', coalesce(v_label, 'Audiência selecionada'),
    'blockedReason', v_blocked,
    'warnings', v_warnings,
    'validationToken', v_token
  );
end;
$$;

create or replace function public.comunicacao_push_campanha_enfileirar(
  p_campaign_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign public.comunicacao_push_campanhas;
  v_inserted integer;
begin
  if not public.can_manage_push_campaigns() then
    raise exception 'INSUFFICIENT_PERMISSION' using errcode = '42501';
  end if;
  select * into v_campaign
  from public.comunicacao_push_campanhas
  where id = p_campaign_id
  for update;
  if not found then
    raise exception 'CAMPAIGN_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not public.can_target_push_scope(v_campaign.audience_type, v_campaign.polo_id, v_campaign.turma_id) then
    raise exception 'INSUFFICIENT_PERMISSION' using errcode = '42501';
  end if;
  if v_campaign.status in ('queued', 'processing', 'completed', 'partial', 'failed') then
    return jsonb_build_object(
      'id', v_campaign.id,
      'status', v_campaign.status,
      'requestId', p_request_id,
      'replayed', true
    );
  end if;
  if v_campaign.status = 'cancelled' then
    raise exception 'CAMPAIGN_CANCELLED' using errcode = '22023';
  end if;
  if not public.push_notification_campaign_category_allowed(v_campaign.category) then
    raise exception 'PUSH_POLICY_BLOCKED' using errcode = '42501';
  end if;

  insert into public.push_notification_jobs (
    campaign_id, source_type, source_id, category, aluno_id,
    title, body, deep_link, data, available_at, idempotency_key
  )
  select v_campaign.id,
    'campaign',
    v_campaign.id,
    case v_campaign.category
      when 'financial' then 'financial'
      when 'academic' then 'academic'
      when 'service' then 'service'
      when 'marketing' then 'marketing'
      else 'institutional'
    end,
    audience.aluno_id,
    v_campaign.title,
    v_campaign.body,
    v_campaign.deep_link,
    jsonb_build_object('campaignId', v_campaign.id, 'category', v_campaign.category),
    greatest(coalesce(v_campaign.scheduled_at, now()), now()),
    'campaign:' || v_campaign.id || ':student:' || audience.aluno_id
  from public.push_notification_resolve_audience(
    v_campaign.audience_type,
    v_campaign.polo_id,
    v_campaign.turma_id
  ) audience
  on conflict (idempotency_key) do nothing;
  get diagnostics v_inserted = row_count;

  update public.comunicacao_push_campanhas
  set status = case
        when scheduled_at is not null and scheduled_at > now() then 'scheduled'
        else 'queued'
      end,
      queued_at = now()
  where id = v_campaign.id
  returning * into v_campaign;

  return jsonb_build_object(
    'id', v_campaign.id,
    'status', v_campaign.status,
    'requestId', p_request_id,
    'replayed', v_inserted = 0
  );
end;
$$;

create or replace function public.logout_aluno_app_device(p_installation_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.aluno_app_dispositivos
  set session_active = false,
      notifications_enabled = false,
      permission_status = 'not_determined',
      push_token = null,
      consent_revoked_at = now(),
      logged_out_at = now(),
      last_seen_at = now()
  where auth_user_id = auth.uid()
    and installation_id = trim(p_installation_id)
    and active;
  return found;
end;
$$;

create or replace function public.refresh_push_notification_campaign(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sent integer;
  v_failed integer;
  v_skipped integer;
  v_open integer;
begin
  select
    (select count(*)::integer
     from public.push_notification_deliveries d
     where d.campaign_id = p_campaign_id and d.status = 'sent'),
    (select count(*)::integer
     from public.push_notification_deliveries d
     where d.campaign_id = p_campaign_id and d.status = 'failed'),
    (select count(*)::integer
     from public.push_notification_jobs j
     where j.campaign_id = p_campaign_id and j.status in ('skipped', 'cancelled')),
    (select count(*)::integer
     from public.push_notification_jobs j
     where j.campaign_id = p_campaign_id
       and (
         j.status in ('pending', 'processing')
         or (
           j.status in ('failed', 'partial')
           and j.attempts < 5
           and j.expires_at > now()
           and exists (
             select 1
             from public.push_notification_deliveries d
             where d.job_id = j.id and d.status = 'failed' and d.retryable
           )
         )
       ))
  into v_sent, v_failed, v_skipped, v_open;

  update public.comunicacao_push_campanhas
  set sent_count = coalesce(v_sent, 0),
      failed_count = coalesce(v_failed, 0),
      skipped_count = coalesce(v_skipped, 0),
      status = case
        when coalesce(v_open, 0) > 0 then 'processing'
        when coalesce(v_sent, 0) > 0 and coalesce(v_failed, 0) > 0 then 'partial'
        when coalesce(v_sent, 0) > 0 then 'completed'
        else 'failed'
      end,
      completed_at = case when coalesce(v_open, 0) = 0 then now() else null end
  where id = p_campaign_id;
end;
$$;

revoke all on function public.refresh_push_notification_campaign(uuid)
  from public, anon, authenticated;

drop function if exists public.claim_push_notification_deliveries(text, integer);
create function public.claim_push_notification_deliveries(
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
declare
  v_campaign_id uuid;
begin
  update public.comunicacao_push_campanhas c
  set status = 'queued'
  where c.status = 'scheduled'
    and c.scheduled_at <= now();

  with expired_leases as (
    update public.push_notification_jobs j
    set status = case when j.expires_at <= now() then 'cancelled' else 'failed' end,
        available_at = case
          when j.attempts >= 5 or j.expires_at <= now() then j.available_at
          else least(
            j.expires_at,
            now() + make_interval(secs => least(3600, 30 * (2 ^ greatest(j.attempts - 1, 0))::integer))
          )
        end,
        locked_at = null,
        locked_by = null,
        processed_at = case when j.attempts >= 5 or j.expires_at <= now() then now() else null end,
        last_error = case when j.expires_at <= now() then 'PUSH_EXPIRED' else 'WORKER_LEASE_EXPIRED' end
    where j.status = 'processing'
      and j.locked_at < now() - interval '3 minutes'
    returning j.id, j.attempts, j.expires_at
  )
  update public.push_notification_deliveries d
  set status = case when lease.expires_at <= now() then 'skipped' else 'failed' end,
      retryable = lease.attempts < 5 and lease.expires_at > now(),
      retry_after_at = null,
      last_error = case when lease.expires_at <= now() then 'PUSH_EXPIRED' else 'WORKER_LEASE_EXPIRED' end
  from expired_leases lease
  where d.job_id = lease.id
    and (
      d.status = 'processing'
      or (d.status = 'failed' and (lease.attempts >= 5 or lease.expires_at <= now()))
    );

  update public.push_notification_jobs j
  set status = 'cancelled',
      processed_at = now(),
      locked_at = null,
      locked_by = null,
      last_error = 'PUSH_EXPIRED'
  where (
      j.status = 'pending'
      or (
        j.status in ('failed', 'partial')
        and exists (
          select 1 from public.push_notification_deliveries d
          where d.job_id = j.id and d.status = 'failed' and d.retryable
        )
      )
    )
    and j.expires_at <= now();

  update public.push_notification_deliveries d
  set status = 'skipped', retryable = false, last_error = 'PUSH_EXPIRED'
  from public.push_notification_jobs j
  where d.job_id = j.id
    and j.status = 'cancelled'
    and j.last_error = 'PUSH_EXPIRED'
    and (
      d.status in ('pending', 'processing')
      or (d.status = 'failed' and d.retryable)
    );

  update public.push_notification_jobs j
  set status = 'cancelled',
      processed_at = now(),
      locked_at = null,
      locked_by = null,
      last_error = 'PUSH_POLICY_DISABLED'
  where (
      j.status = 'pending'
      or (
        j.status in ('failed', 'partial')
        and exists (
          select 1 from public.push_notification_deliveries d
          where d.job_id = j.id and d.status = 'failed' and d.retryable
        )
      )
    )
    and not exists (
      select 1
      from public.push_notification_policies p
      where p.id = true
        and p.enabled
        and case j.category
          when 'chat' then coalesce((p.categories ->> 'chat')::boolean, false)
          when 'service' then coalesce((p.categories ->> 'chat')::boolean, false)
          when 'financial' then coalesce((p.categories ->> 'financial')::boolean, false)
          when 'academic' then coalesce((p.categories ->> 'academic')::boolean, false)
          when 'calendar' then coalesce((p.categories ->> 'calendar')::boolean, false)
          when 'marketing' then coalesce((p.categories ->> 'marketing')::boolean, false)
          else coalesce((p.categories ->> 'institutional')::boolean, false)
        end
    );

  with claimed as (
    select j.id
    from public.push_notification_jobs j
    where (
        j.status = 'pending'
        or (
          j.status in ('failed', 'partial')
          and exists (
            select 1 from public.push_notification_deliveries d
            where d.job_id = j.id and d.status = 'failed' and d.retryable
          )
        )
      )
      and j.available_at <= now()
      and j.expires_at > now()
      and j.attempts < 5
      and (j.category = 'chat' or not public.push_notification_quiet_hours_active())
    order by j.available_at, j.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 100))
  )
  update public.push_notification_jobs j
  set status = 'processing',
      locked_at = now(),
      locked_by = left(p_worker, 120),
      attempts = j.attempts + 1,
      processed_at = null,
      last_error = null
  from claimed
  where j.id = claimed.id;

  insert into public.push_notification_deliveries as delivery (
    job_id, campaign_id, aluno_id, device_id, platform
  )
  select j.id, j.campaign_id, j.aluno_id, d.id, d.plataforma
  from public.push_notification_jobs j
  join public.aluno_app_dispositivos d on d.aluno_id = j.aluno_id
  where j.status = 'processing'
    and j.locked_by = left(p_worker, 120)
    and d.active
    and d.session_active
    and d.notifications_enabled
    and d.permission_status in ('granted', 'provisional')
    and d.push_token is not null
    and not exists (
      select 1
      from public.push_notification_deliveries prior
      where prior.job_id = j.id
        and prior.device_id = d.id
        and prior.status = 'sent'
    )
  on conflict on constraint push_notification_deliveries_job_device_unique
  do update
  set status = 'processing',
      retryable = false,
      retry_after_at = null,
      updated_at = now()
  where delivery.status in ('pending', 'processing')
     or (delivery.status = 'failed' and delivery.retryable);

  with skipped_jobs as (
    update public.push_notification_jobs j
    set status = 'skipped',
        processed_at = now(),
        locked_at = null,
        locked_by = null,
        last_error = 'NO_ELIGIBLE_DEVICE'
    where j.status = 'processing'
      and j.locked_by = left(p_worker, 120)
      and not exists (
        select 1
        from public.push_notification_deliveries d
        where d.job_id = j.id
          and d.status = 'processing'
      )
    returning j.id
  )
  update public.push_notification_deliveries d
  set retryable = false,
      retry_after_at = null
  from skipped_jobs skipped
  where d.job_id = skipped.id
    and d.status = 'failed';

  update public.comunicacao_push_campanhas c
  set status = 'processing'
  where exists (
    select 1
    from public.push_notification_jobs j
    where j.campaign_id = c.id
      and j.status = 'processing'
      and j.locked_by = left(p_worker, 120)
  );

  for v_campaign_id in
    select c.id
    from public.comunicacao_push_campanhas c
    where c.status in ('queued', 'processing', 'scheduled')
      and exists (
        select 1 from public.push_notification_jobs j where j.campaign_id = c.id
      )
      and not exists (
        select 1
        from public.push_notification_jobs j
        where j.campaign_id = c.id
          and (
            j.status in ('pending', 'processing')
            or (j.status in ('failed', 'partial') and j.attempts < 5 and j.expires_at > now())
          )
      )
  loop
    perform public.refresh_push_notification_campaign(v_campaign_id);
  end loop;

  return query
  select d.id,
         j.id,
         j.campaign_id,
         d.device_id,
         device.push_token,
         d.platform,
         j.category,
         j.title,
         j.body,
         j.deep_link,
         j.data,
         j.expires_at
  from public.push_notification_deliveries d
  join public.push_notification_jobs j on j.id = d.job_id
  join public.aluno_app_dispositivos device on device.id = d.device_id
  where j.status = 'processing'
    and j.locked_by = left(p_worker, 120)
    and d.status = 'processing';
end;
$$;

drop function if exists public.complete_push_notification_delivery_v2(uuid, text, boolean, text, text, boolean, boolean, integer);
drop function if exists public.complete_push_notification_delivery_v2(uuid, boolean, text, text, boolean, boolean, integer);
create function public.complete_push_notification_delivery_v2(
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
  v_delivery public.push_notification_deliveries;
  v_job public.push_notification_jobs;
  v_retry_delay integer;
  v_has_sent boolean;
  v_has_failed boolean;
  v_has_retryable boolean;
  v_retry_after_at timestamptz;
  v_last_error text;
begin
  select j.* into v_job
  from public.push_notification_jobs j
  join public.push_notification_deliveries d on d.job_id = j.id
  where d.id = p_delivery_id
  for update of j;

  if not found
     or v_job.status <> 'processing'
     or v_job.locked_by is distinct from left(p_worker, 120) then
    return false;
  end if;

  update public.push_notification_deliveries
  set status = case when p_success then 'sent' else 'failed' end,
      provider_message_id = left(p_provider_message_id, 500),
      last_error = case when p_success then null else left(p_error, 1000) end,
      retryable = not p_success and coalesce(p_retryable, false),
      retry_after_at = case
        when not p_success and coalesce(p_retryable, false) and p_retry_after_seconds is not null
          then now() + make_interval(secs => greatest(10, least(p_retry_after_seconds, 3600)))
        else null
      end,
      attempts = attempts + 1,
      sent_at = case when p_success then now() else sent_at end
  where id = p_delivery_id
    and job_id = v_job.id
    and status = 'processing'
  returning * into v_delivery;
  if not found then return false; end if;

  if p_disable_device then
    update public.aluno_app_dispositivos
    set active = false,
        session_active = false,
        notifications_enabled = false,
        push_token = null,
        consent_revoked_at = now()
    where id = v_delivery.device_id;
  end if;

  if exists (
    select 1
    from public.push_notification_deliveries
    where job_id = v_job.id and status in ('pending', 'processing')
  ) then
    return true;
  end if;

  select
    exists (select 1 from public.push_notification_deliveries where job_id = v_job.id and status = 'sent'),
    exists (select 1 from public.push_notification_deliveries where job_id = v_job.id and status = 'failed'),
    exists (select 1 from public.push_notification_deliveries where job_id = v_job.id and status = 'failed' and retryable),
    (select max(retry_after_at) from public.push_notification_deliveries where job_id = v_job.id and status = 'failed' and retryable),
    (select d.last_error from public.push_notification_deliveries d
      where d.job_id = v_job.id and d.status = 'failed' and d.last_error is not null
      order by d.updated_at desc limit 1)
  into v_has_sent, v_has_failed, v_has_retryable, v_retry_after_at, v_last_error;

  if v_has_retryable and v_job.attempts < 5 and v_job.expires_at > now() then
    v_retry_delay := least(3600, 30 * (2 ^ greatest(v_job.attempts - 1, 0))::integer)
      + floor(random() * 16)::integer;
    if v_retry_after_at is not null then
      v_retry_delay := greatest(
        v_retry_delay,
        greatest(0, ceil(extract(epoch from (v_retry_after_at - now())))::integer)
      );
    end if;
    update public.push_notification_jobs
    set status = 'failed',
        available_at = least(expires_at, now() + make_interval(secs => v_retry_delay)),
        locked_at = null,
        locked_by = null,
        processed_at = null,
        last_error = left(coalesce(v_last_error, 'FCM_RETRYABLE_ERROR'), 1000)
    where id = v_job.id;
  else
    update public.push_notification_deliveries
    set retryable = false,
        retry_after_at = null
    where job_id = v_job.id and status = 'failed';
    update public.push_notification_jobs
    set status = case
          when v_has_sent and v_has_failed then 'partial'
          when v_has_sent then 'completed'
          else 'failed'
        end,
        processed_at = now(),
        locked_at = null,
        locked_by = null,
        last_error = case when v_has_failed then left(coalesce(v_last_error, 'FCM_DELIVERY_FAILED'), 1000) else null end
    where id = v_job.id;
  end if;

  if v_job.campaign_id is not null then
    perform public.refresh_push_notification_campaign(v_job.campaign_id);
  end if;
  return true;
end;
$$;

revoke all on function public.claim_push_notification_deliveries(text, integer)
  from public, anon, authenticated;
revoke all on function public.complete_push_notification_delivery_v2(uuid, text, boolean, text, text, boolean, boolean, integer)
  from public, anon, authenticated;
grant execute on function public.claim_push_notification_deliveries(text, integer)
  to service_role;
grant execute on function public.complete_push_notification_delivery_v2(uuid, text, boolean, text, text, boolean, boolean, integer)
  to service_role;

revoke all on function public.logout_aluno_app_device(text) from public, anon;
grant execute on function public.logout_aluno_app_device(text) to authenticated;

notify pgrst, 'reload schema';

commit;
