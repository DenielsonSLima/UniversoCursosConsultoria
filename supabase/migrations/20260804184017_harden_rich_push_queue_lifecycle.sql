begin;

-- Campaign progress is canonical in recipient/job units. Device counts remain a
-- preview statistic and are never mixed into persisted progress anymore.
alter table public.comunicacao_push_campanhas
  add column if not exists recipient_count integer not null default 0,
  add column if not exists processed_count integer not null default 0,
  add column if not exists progress_percent integer not null default 0;

create or replace function public.refresh_push_notification_campaign(
  p_campaign_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_campaign public.comunicacao_push_campanhas%rowtype;
  v_total integer := 0;
  v_open integer := 0;
  v_sent integer := 0;
  v_failed integer := 0;
  v_skipped integer := 0;
  v_processed integer := 0;
  v_progress integer := 0;
begin
  select * into v_campaign
  from public.comunicacao_push_campanhas campaign
  where campaign.id = p_campaign_id
  for update;

  if not found then
    return;
  end if;

  select
    count(*)::integer,
    count(*) filter (
      where job.status in ('pending', 'processing')
         or (
           job.status in ('failed', 'partial')
           and job.attempts < 5
           and job.expires_at > now()
           and exists (
             select 1
             from public.push_notification_deliveries delivery
             where delivery.job_id = job.id
               and delivery.status = 'failed'
               and delivery.retryable
           )
         )
    )::integer,
    count(*) filter (where job.status in ('completed', 'partial'))::integer,
    count(*) filter (
      where job.status = 'failed'
        and not (
          job.attempts < 5
          and job.expires_at > now()
          and exists (
            select 1
            from public.push_notification_deliveries delivery
            where delivery.job_id = job.id
              and delivery.status = 'failed'
              and delivery.retryable
          )
        )
    )::integer,
    count(*) filter (where job.status in ('skipped', 'cancelled'))::integer
  into v_total, v_open, v_sent, v_failed, v_skipped
  from public.push_notification_jobs job
  where job.campaign_id = p_campaign_id;

  v_processed := least(
    coalesce(v_total, 0),
    coalesce(v_sent, 0) + coalesce(v_failed, 0) + coalesce(v_skipped, 0)
  );
  v_progress := case
    when coalesce(v_total, 0) = 0
      then case when v_campaign.status = 'draft' then 0 else 100 end
    else least(100, round(v_processed * 100.0 / v_total)::integer)
  end;

  update public.comunicacao_push_campanhas
  set recipient_count = coalesce(v_total, 0),
      processed_count = v_processed,
      progress_percent = v_progress,
      sent_count = coalesce(v_sent, 0),
      failed_count = coalesce(v_failed, 0),
      skipped_count = coalesce(v_skipped, 0),
      status = case
        when coalesce(v_total, 0) = 0 and v_campaign.status = 'draft' then 'draft'
        when coalesce(v_total, 0) = 0 then 'failed'
        when v_campaign.status = 'scheduled'
          and v_campaign.scheduled_at > now() then 'scheduled'
        when coalesce(v_open, 0) > 0 then 'processing'
        when coalesce(v_sent, 0) > 0
          and coalesce(v_failed, 0) + coalesce(v_skipped, 0) > 0 then 'partial'
        when coalesce(v_sent, 0) > 0 then 'completed'
        else 'failed'
      end,
      completed_at = case
        when coalesce(v_total, 0) = 0 and v_campaign.status = 'draft' then null
        when v_campaign.status = 'scheduled' and v_campaign.scheduled_at > now() then null
        when coalesce(v_open, 0) = 0 then coalesce(v_campaign.completed_at, now())
        else null
      end
  where id = p_campaign_id;
end;
$$;

revoke all on function public.refresh_push_notification_campaign(uuid)
from public, anon, authenticated;
grant execute on function public.refresh_push_notification_campaign(uuid)
to service_role;

-- Backfill historical campaigns with mutually-exclusive recipient outcomes.
do $$
declare
  v_campaign_id uuid;
begin
  for v_campaign_id in
    select campaign.id
    from public.comunicacao_push_campanhas campaign
    where exists (
      select 1
      from public.push_notification_jobs job
      where job.campaign_id = campaign.id
    )
  loop
    perform public.refresh_push_notification_campaign(v_campaign_id);
  end loop;
end;
$$;

update public.comunicacao_push_campanhas campaign
set status = case
      when campaign.status in ('scheduled', 'queued', 'processing') then 'failed'
      else campaign.status
    end,
    completed_at = case
      when campaign.status in ('scheduled', 'queued', 'processing')
        then coalesce(campaign.completed_at, now())
      else campaign.completed_at
    end,
    recipient_count = 0,
    processed_count = 0,
    progress_percent = case when campaign.status = 'draft' then 0 else 100 end,
    sent_count = 0,
    failed_count = 0,
    skipped_count = 0
where not exists (
  select 1
  from public.push_notification_jobs job
  where job.campaign_id = campaign.id
);

alter table public.comunicacao_push_campanhas
  drop constraint if exists comunicacao_push_campanhas_progress_counts;
alter table public.comunicacao_push_campanhas
  add constraint comunicacao_push_campanhas_progress_counts check (
    recipient_count >= 0
    and processed_count >= 0
    and processed_count <= recipient_count
    and progress_percent between 0 and 100
    and sent_count + failed_count + skipped_count = processed_count
  );

create or replace function public.guard_push_campaign_has_jobs()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status in ('queued', 'processing')
     and not exists (
       select 1
       from public.push_notification_jobs job
       where job.campaign_id = new.id
     ) then
    new.status := 'failed';
    new.completed_at := coalesce(new.completed_at, now());
    new.recipient_count := 0;
    new.processed_count := 0;
    new.progress_percent := 100;
    new.sent_count := 0;
    new.failed_count := 0;
    new.skipped_count := 0;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_push_campaign_has_jobs()
from public, anon, authenticated;

drop trigger if exists comunicacao_push_campanhas_require_jobs
on public.comunicacao_push_campanhas;
create trigger comunicacao_push_campanhas_require_jobs
before update of status on public.comunicacao_push_campanhas
for each row
when (new.status in ('queued', 'processing'))
execute function public.guard_push_campaign_has_jobs();

-- New campaigns remain drafts until their jobs are materialized atomically by
-- the enqueue RPC. This removes the scheduled-without-jobs intermediate state.
create or replace function public.comunicacao_push_campanha_criar_v2(
  p_title text,
  p_body text,
  p_category text,
  p_deep_link text,
  p_audience_type text,
  p_polo_id uuid default null,
  p_turma_id uuid default null,
  p_scheduled_at timestamptz default null,
  p_image_asset_id uuid default null,
  p_preview_token uuid default null,
  p_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_preview public.comunicacao_push_previews%rowtype;
  v_campaign public.comunicacao_push_campanhas%rowtype;
  v_payload jsonb;
begin
  if not public.can_target_push_scope(p_audience_type, p_polo_id, p_turma_id) then
    raise exception 'INSUFFICIENT_PERMISSION' using errcode = '42501';
  end if;
  if p_request_id is null or p_preview_token is null then
    raise exception 'IDEMPOTENCY_REQUIRED' using errcode = '22023';
  end if;

  select * into v_campaign
  from public.comunicacao_push_campanhas campaign
  where campaign.created_by = auth.uid()
    and campaign.request_id = p_request_id;
  if found then
    return jsonb_build_object(
      'id', v_campaign.id,
      'status', v_campaign.status,
      'requestId', p_request_id,
      'replayed', true
    );
  end if;

  select * into v_preview
  from public.comunicacao_push_previews preview
  where preview.token = p_preview_token
    and preview.created_by = auth.uid()
    and preview.consumed_at is null
    and preview.expires_at > now()
  for update;
  if not found or v_preview.blocked_reason is not null then
    raise exception 'VALID_PREVIEW_REQUIRED' using errcode = '22023';
  end if;

  v_payload := jsonb_build_object(
    'title', btrim(p_title),
    'body', btrim(p_body),
    'category', p_category,
    'deepLink', p_deep_link,
    'audienceType', p_audience_type,
    'poloId', p_polo_id,
    'turmaId', p_turma_id,
    'scheduledAt', p_scheduled_at,
    'imageAssetId', p_image_asset_id
  );
  if v_preview.payload <> v_payload then
    raise exception 'PREVIEW_MISMATCH' using errcode = '22023';
  end if;

  insert into public.comunicacao_push_campanhas (
    title, body, category, deep_link, audience_type, polo_id, turma_id,
    audience_label, eligible_users, eligible_devices, android_devices,
    ios_devices, status, scheduled_at, image_asset_id, request_id, created_by
  ) values (
    btrim(p_title), btrim(p_body), p_category, p_deep_link, p_audience_type,
    p_polo_id, p_turma_id, v_preview.audience_label,
    v_preview.eligible_users, v_preview.eligible_devices,
    v_preview.android_devices, v_preview.ios_devices,
    'draft', p_scheduled_at, p_image_asset_id, p_request_id, auth.uid()
  )
  returning * into v_campaign;

  update public.comunicacao_push_previews
  set consumed_at = now()
  where token = p_preview_token;

  return jsonb_build_object(
    'id', v_campaign.id,
    'status', v_campaign.status,
    'requestId', p_request_id,
    'replayed', false
  );
end;
$$;

create or replace function public.comunicacao_push_campanha_enfileirar_v2(
  p_campaign_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_campaign public.comunicacao_push_campanhas%rowtype;
  v_inserted integer := 0;
  v_recipients integer := 0;
  v_image_path text;
begin
  if not public.can_manage_push_campaigns() then
    raise exception 'INSUFFICIENT_PERMISSION' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'IDEMPOTENCY_REQUIRED' using errcode = '22023';
  end if;

  select * into v_campaign
  from public.comunicacao_push_campanhas campaign
  where campaign.id = p_campaign_id
  for update;
  if not found then
    raise exception 'CAMPAIGN_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not public.can_target_push_scope(
    v_campaign.audience_type,
    v_campaign.polo_id,
    v_campaign.turma_id
  ) then
    raise exception 'INSUFFICIENT_PERMISSION' using errcode = '42501';
  end if;

  if v_campaign.status in ('queued', 'processing', 'completed', 'partial', 'failed') then
    select count(*)::integer into v_recipients
    from public.push_notification_jobs job
    where job.campaign_id = v_campaign.id;

    if v_campaign.status in ('queued', 'processing') and v_recipients = 0 then
      update public.comunicacao_push_campanhas
      set status = 'failed',
          completed_at = now(),
          recipient_count = 0,
          processed_count = 0,
          progress_percent = 100
      where id = v_campaign.id
      returning * into v_campaign;
    end if;

    return jsonb_build_object(
      'id', v_campaign.id,
      'status', v_campaign.status,
      'requestId', p_request_id,
      'replayed', true,
      'recipientCount', v_recipients,
      'reason', case when v_recipients = 0 then 'NO_ELIGIBLE_RECIPIENTS' else null end
    );
  end if;
  if v_campaign.status = 'cancelled' then
    raise exception 'CAMPAIGN_CANCELLED' using errcode = '22023';
  end if;
  if not public.push_notification_campaign_category_allowed(v_campaign.category) then
    raise exception 'PUSH_POLICY_BLOCKED' using errcode = '42501';
  end if;

  select asset.object_path into v_image_path
  from public.push_notification_assets asset
  where asset.id = v_campaign.image_asset_id
    and asset.purpose = 'campaign'
    and asset.status = 'ready';
  if v_campaign.image_asset_id is not null and v_image_path is null then
    raise exception 'INVALID_PUSH_IMAGE' using errcode = '22023';
  end if;

  insert into public.push_notification_jobs (
    campaign_id, source_type, source_id, category, aluno_id, title, body,
    deep_link, image_asset_id, data, available_at, idempotency_key
  )
  select
    v_campaign.id,
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
    v_campaign.image_asset_id,
    jsonb_strip_nulls(jsonb_build_object(
      'campaignId', v_campaign.id,
      'category', v_campaign.category,
      'imagePath', v_image_path
    )),
    greatest(coalesce(v_campaign.scheduled_at, now()), now()),
    'campaign:' || v_campaign.id || ':student:' || audience.aluno_id
  from public.push_notification_resolve_campaign_audience(
    v_campaign.category,
    v_campaign.audience_type,
    v_campaign.polo_id,
    v_campaign.turma_id
  ) audience
  on conflict (idempotency_key) do nothing;
  get diagnostics v_inserted = row_count;

  select count(*)::integer into v_recipients
  from public.push_notification_jobs job
  where job.campaign_id = v_campaign.id;

  update public.comunicacao_push_campanhas
  set status = case
        when v_recipients = 0 then 'failed'
        when scheduled_at is not null and scheduled_at > now() then 'scheduled'
        else 'queued'
      end,
      queued_at = case when v_recipients > 0 then now() else null end,
      completed_at = case when v_recipients = 0 then now() else null end,
      recipient_count = v_recipients,
      processed_count = 0,
      progress_percent = case when v_recipients = 0 then 100 else 0 end,
      sent_count = 0,
      failed_count = 0,
      skipped_count = 0
  where id = v_campaign.id
  returning * into v_campaign;

  return jsonb_build_object(
    'id', v_campaign.id,
    'status', v_campaign.status,
    'requestId', p_request_id,
    'replayed', v_inserted = 0 and v_recipients > 0,
    'recipientCount', v_recipients,
    'reason', case when v_recipients = 0 then 'NO_ELIGIBLE_RECIPIENTS' else null end
  );
end;
$$;

revoke all on function public.comunicacao_push_campanha_criar_v2(text, text, text, text, text, uuid, uuid, timestamptz, uuid, uuid, uuid)
from public, anon;
revoke all on function public.comunicacao_push_campanha_enfileirar_v2(uuid, uuid)
from public, anon;
grant execute on function public.comunicacao_push_campanha_criar_v2(text, text, text, text, text, uuid, uuid, timestamptz, uuid, uuid, uuid)
to authenticated;
grant execute on function public.comunicacao_push_campanha_enfileirar_v2(uuid, uuid)
to authenticated;

-- Legacy campaign mutations are revoked so they cannot bypass the rich-push
-- preview, immutable asset validation, or the zero-audience terminal state.
revoke execute on function public.comunicacao_push_campanha_criar(text, text, text, text, text, uuid, uuid, timestamptz, uuid, uuid)
from authenticated;
revoke execute on function public.comunicacao_push_campanha_enfileirar(uuid, uuid)
from authenticated;

-- A single backend predicate is shared by proactive cancellation and by the
-- transition to processing. Claims therefore fail closed on current policy,
-- consent, birthday settings, student state and enrollment state.
create or replace function public.push_notification_job_block_reason(
  p_job_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.push_notification_jobs%rowtype;
  v_policy public.push_notification_policies%rowtype;
  v_settings public.push_birthday_settings%rowtype;
  v_local_date date := timezone('America/Maceio', now())::date;
  v_birthday_date text;
  v_allowed boolean := false;
  v_is_birthday boolean := false;
begin
  select * into v_job
  from public.push_notification_jobs job
  where job.id = p_job_id;
  if not found then
    return 'PUSH_JOB_NOT_FOUND';
  end if;

  select * into v_policy
  from public.push_notification_policies policy
  where policy.id is true;
  if not found or not coalesce(v_policy.enabled, false) then
    return 'PUSH_POLICY_DISABLED';
  end if;

  v_allowed := case
    when coalesce(v_job.data ->> 'event', '') = 'birthday'
      then coalesce((v_policy.categories ->> 'marketing')::boolean, false)
    else case v_job.category
      when 'chat' then coalesce((v_policy.categories ->> 'chat')::boolean, false)
      when 'service' then coalesce((v_policy.categories ->> 'chat')::boolean, false)
      when 'financial' then coalesce((v_policy.categories ->> 'financial')::boolean, false)
      when 'academic' then coalesce((v_policy.categories ->> 'academic')::boolean, false)
      when 'calendar' then coalesce((v_policy.categories ->> 'calendar')::boolean, false)
      when 'marketing' then coalesce((v_policy.categories ->> 'marketing')::boolean, false)
      else coalesce((v_policy.categories ->> 'institutional')::boolean, false)
    end
  end;
  if not v_allowed then
    return 'PUSH_CATEGORY_DISABLED';
  end if;

  if (v_job.category = 'marketing' or coalesce(v_job.data ->> 'event', '') = 'birthday')
     and not public.push_marketing_consent_allowed(v_job.aluno_id) then
    return 'PUSH_MARKETING_CONSENT_REVOKED';
  end if;

  if coalesce(v_job.data ->> 'event', '') = 'birthday' then
    select * into v_settings
    from public.push_birthday_settings settings
    where settings.id is true;
    if not found or not coalesce(v_settings.enabled, false) then
      return 'BIRTHDAY_PUSH_DISABLED';
    end if;
    if v_settings.image_asset_id is null
       or v_settings.image_asset_id is distinct from v_job.image_asset_id
       or not exists (
         select 1
         from public.push_notification_assets asset
         where asset.id = v_settings.image_asset_id
           and asset.purpose = 'birthday'
           and asset.status = 'ready'
       ) then
      return 'BIRTHDAY_PUSH_IMAGE_CHANGED';
    end if;

    v_birthday_date := coalesce(
      v_job.data ->> 'birthdayDate',
      v_job.data ->> 'birthday_date'
    );
    if v_birthday_date is null
       or v_birthday_date !~ '^\d{4}-\d{2}-\d{2}$'
       or v_birthday_date::date <> v_local_date then
      return 'BIRTHDAY_PUSH_WINDOW_EXPIRED';
    end if;

    select (
      student.tipo = 'Aluno'
      and student.status = 'ATIVO'
      and student.data_nascimento is not null
      and (
        (
          extract(month from student.data_nascimento)::integer = extract(month from v_local_date)::integer
          and extract(day from student.data_nascimento)::integer = extract(day from v_local_date)::integer
        )
        or (
          extract(month from student.data_nascimento)::integer = 2
          and extract(day from student.data_nascimento)::integer = 29
          and extract(month from v_local_date)::integer = 2
          and extract(day from v_local_date)::integer = 28
          and extract(day from (make_date(extract(year from v_local_date)::integer, 3, 1) - interval '1 day'))::integer = 28
        )
      )
      and exists (
        select 1
        from public.matriculas enrollment
        where enrollment.aluno_id = student.id
          and enrollment.status in ('ATIVO', 'EM_DEPENDENCIA')
      )
    ) into v_is_birthday
    from public.parceiros student
    where student.id = v_job.aluno_id;

    if not coalesce(v_is_birthday, false) then
      return 'BIRTHDAY_STUDENT_INELIGIBLE';
    end if;
  end if;

  return null;
exception
  when invalid_datetime_format or datetime_field_overflow then
    return 'BIRTHDAY_PUSH_WINDOW_INVALID';
end;
$$;

revoke all on function public.push_notification_job_block_reason(uuid)
from public, anon, authenticated;
grant execute on function public.push_notification_job_block_reason(uuid)
to service_role;

create or replace function public.cascade_cancelled_push_job()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status <> 'cancelled' or old.status = 'cancelled' then
    return new;
  end if;

  update public.push_notification_deliveries delivery
  set status = 'skipped',
      retryable = false,
      retry_after_at = null,
      last_error = coalesce(new.last_error, 'PUSH_CANCELLED')
  where delivery.job_id = new.id
    and (
      delivery.status in ('pending', 'processing')
      or (delivery.status = 'failed' and delivery.retryable)
    );

  update public.aluno_notificacoes inbox
  set archived_at = coalesce(inbox.archived_at, now()),
      read_at = coalesce(inbox.read_at, now())
  where inbox.source_job_id = new.id
    and inbox.archived_at is null
    and inbox.visible_at > now();

  return new;
end;
$$;

revoke all on function public.cascade_cancelled_push_job()
from public, anon, authenticated;

drop trigger if exists push_notification_jobs_cascade_cancellation
on public.push_notification_jobs;
create trigger push_notification_jobs_cascade_cancellation
after update of status on public.push_notification_jobs
for each row
when (new.status = 'cancelled' and old.status is distinct from new.status)
execute function public.cascade_cancelled_push_job();

create or replace function public.guard_push_notification_job_claim()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reason text;
begin
  if new.status <> 'processing' or old.status = 'processing' then
    return new;
  end if;

  v_reason := public.push_notification_job_block_reason(old.id);
  if v_reason is not null then
    new.status := 'cancelled';
    new.processed_at := now();
    new.locked_at := null;
    new.locked_by := null;
    new.last_error := v_reason;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_push_notification_job_claim()
from public, anon, authenticated;

drop trigger if exists push_notification_jobs_revalidate_claim
on public.push_notification_jobs;
create trigger push_notification_jobs_revalidate_claim
before update of status on public.push_notification_jobs
for each row
when (new.status = 'processing' and old.status is distinct from new.status)
execute function public.guard_push_notification_job_claim();

create index if not exists idx_push_notification_jobs_open_by_student
  on public.push_notification_jobs (aluno_id, status, available_at)
  where status in ('pending', 'processing', 'failed', 'partial');

create index if not exists idx_push_notification_jobs_open_birthday
  on public.push_notification_jobs (status, available_at, aluno_id)
  where status in ('pending', 'processing', 'failed', 'partial')
    and data ->> 'event' = 'birthday';

create or replace function public.cancel_invalid_push_notification_jobs(
  p_aluno_id uuid default null,
  p_birthday_only boolean default false
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cancelled integer := 0;
  v_campaign_id uuid;
  v_campaign_ids uuid[] := array[]::uuid[];
begin
  with invalid as (
    select job.id, reason.block_reason
    from public.push_notification_jobs job
    cross join lateral (
      select public.push_notification_job_block_reason(job.id) as block_reason
    ) reason
    where job.status in ('pending', 'processing', 'failed', 'partial')
      and (p_aluno_id is null or job.aluno_id = p_aluno_id)
      and (not p_birthday_only or coalesce(job.data ->> 'event', '') = 'birthday')
      and reason.block_reason is not null
  ), cancelled as (
    update public.push_notification_jobs job
    set status = 'cancelled',
        processed_at = now(),
        locked_at = null,
        locked_by = null,
        last_error = invalid.block_reason
    from invalid
    where job.id = invalid.id
    returning job.campaign_id
  )
  select
    count(*)::integer,
    coalesce(
      array_agg(distinct cancelled.campaign_id)
        filter (where cancelled.campaign_id is not null),
      array[]::uuid[]
    )
  into v_cancelled, v_campaign_ids
  from cancelled;

  foreach v_campaign_id in array v_campaign_ids loop
    perform public.refresh_push_notification_campaign(v_campaign_id);
  end loop;

  return v_cancelled;
end;
$$;

revoke all on function public.cancel_invalid_push_notification_jobs(uuid, boolean)
from public, anon, authenticated;
grant execute on function public.cancel_invalid_push_notification_jobs(uuid, boolean)
to service_role;

create or replace function public.cancel_push_jobs_after_preference_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_aluno_id uuid;
  v_channel text;
  v_purpose text;
begin
  if tg_op = 'DELETE' then
    v_aluno_id := old.aluno_id;
    v_channel := old.canal;
    v_purpose := old.finalidade;
  else
    v_aluno_id := new.aluno_id;
    v_channel := new.canal;
    v_purpose := new.finalidade;
  end if;

  if v_channel = 'push' and v_purpose = 'marketing' then
    perform public.cancel_invalid_push_notification_jobs(v_aluno_id, false);
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.cancel_push_jobs_after_preference_change()
from public, anon, authenticated;

drop trigger if exists comunicacao_preferencias_cancel_invalid_push
on public.comunicacao_preferencias;
create trigger comunicacao_preferencias_cancel_invalid_push
after insert or update or delete on public.comunicacao_preferencias
for each row execute function public.cancel_push_jobs_after_preference_change();

create or replace function public.cancel_push_jobs_after_policy_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.cancel_invalid_push_notification_jobs(null, false);
  return new;
end;
$$;

revoke all on function public.cancel_push_jobs_after_policy_change()
from public, anon, authenticated;

drop trigger if exists push_notification_policies_cancel_invalid_jobs
on public.push_notification_policies;
create trigger push_notification_policies_cancel_invalid_jobs
after update of enabled, categories on public.push_notification_policies
for each row
when (
  old.enabled is distinct from new.enabled
  or old.categories is distinct from new.categories
)
execute function public.cancel_push_jobs_after_policy_change();

create or replace function public.cancel_push_jobs_after_birthday_settings_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.cancel_invalid_push_notification_jobs(null, true);
  return new;
end;
$$;

revoke all on function public.cancel_push_jobs_after_birthday_settings_change()
from public, anon, authenticated;

drop trigger if exists push_birthday_settings_cancel_invalid_jobs
on public.push_birthday_settings;
create trigger push_birthday_settings_cancel_invalid_jobs
after update of enabled, image_asset_id on public.push_birthday_settings
for each row
when (
  old.enabled is distinct from new.enabled
  or old.image_asset_id is distinct from new.image_asset_id
)
execute function public.cancel_push_jobs_after_birthday_settings_change();

-- One row per Maceio calendar day is the claim. The cron can run frequently,
-- but only the first eligible invocation scans the indexed birthday slice.
create table if not exists public.push_birthday_runs (
  run_date date primary key,
  status text not null default 'pending',
  available_at timestamptz not null default now(),
  attempts integer not null default 0,
  locked_at timestamptz,
  locked_by text,
  queued_count integer not null default 0,
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_birthday_runs_status_check
    check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  constraint push_birthday_runs_attempts_check check (attempts between 0 and 3),
  constraint push_birthday_runs_queued_count_check check (queued_count >= 0)
);

create index if not exists idx_push_birthday_runs_claim
  on public.push_birthday_runs (status, available_at, run_date)
  where status in ('pending', 'failed', 'processing');

create index if not exists idx_parceiros_active_birthday
  on public.parceiros (
    (extract(month from data_nascimento)::integer),
    (extract(day from data_nascimento)::integer),
    id
  )
  where tipo = 'Aluno'
    and status = 'ATIVO'
    and data_nascimento is not null;

alter table public.push_birthday_runs enable row level security;
revoke all on table public.push_birthday_runs from public, anon, authenticated;
revoke insert, update, delete on table public.push_birthday_runs from service_role;
grant select on table public.push_birthday_runs to service_role;

drop trigger if exists push_birthday_runs_touch on public.push_birthday_runs;
create trigger push_birthday_runs_touch
before update on public.push_birthday_runs
for each row execute function public.push_notification_touch_updated_at();

create or replace function public.enqueue_birthday_push_notifications()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_settings public.push_birthday_settings%rowtype;
  v_policy public.push_notification_policies%rowtype;
  v_run public.push_birthday_runs%rowtype;
  v_local_now timestamp := timezone('America/Maceio', now());
  v_local_date date := timezone('America/Maceio', now())::date;
  v_expires_at timestamptz := (v_local_date + 1)::timestamp at time zone 'America/Maceio';
  v_image_path text;
  v_inserted integer := 0;
  v_retry_minutes integer := 0;
  v_error text;
begin
  select * into v_settings
  from public.push_birthday_settings settings
  where settings.id is true;
  select * into v_policy
  from public.push_notification_policies policy
  where policy.id is true;

  if not found
     or not coalesce(v_settings.enabled, false)
     or not coalesce(v_policy.enabled, false)
     or not coalesce((v_policy.categories ->> 'marketing')::boolean, false) then
    perform public.cancel_invalid_push_notification_jobs(null, true);
    return jsonb_build_object(
      'enabled', coalesce(v_settings.enabled, false),
      'status', 'disabled',
      'queued', 0
    );
  end if;

  if v_local_now::time < v_settings.send_time then
    return jsonb_build_object(
      'enabled', true,
      'status', 'before_window',
      'queued', 0,
      'runDate', v_local_date
    );
  end if;

  select asset.object_path into v_image_path
  from public.push_notification_assets asset
  where asset.id = v_settings.image_asset_id
    and asset.purpose = 'birthday'
    and asset.status = 'ready';
  if v_image_path is null then
    perform public.cancel_invalid_push_notification_jobs(null, true);
    return jsonb_build_object(
      'enabled', true,
      'status', 'image_unavailable',
      'queued', 0,
      'runDate', v_local_date
    );
  end if;

  insert into public.push_birthday_runs (run_date, status, available_at)
  values (v_local_date, 'pending', now())
  on conflict (run_date) do nothing;

  update public.push_birthday_runs run
  set status = 'failed',
      locked_at = null,
      locked_by = null,
      available_at = case
        when run.attempts < 3 then now() + interval '5 minutes'
        else run.available_at
      end,
      processed_at = case when run.attempts >= 3 then now() else null end,
      last_error = 'BIRTHDAY_RUN_LEASE_EXPIRED'
  where run.run_date = v_local_date
    and run.status = 'processing'
    and run.locked_at < now() - interval '10 minutes';

  select * into v_run
  from public.push_birthday_runs run
  where run.run_date = v_local_date
    and run.status in ('pending', 'failed')
    and run.attempts < 3
    and run.available_at <= now()
  for update skip locked;

  if not found then
    select * into v_run
    from public.push_birthday_runs run
    where run.run_date = v_local_date;
    return jsonb_build_object(
      'enabled', true,
      'status', coalesce(v_run.status, 'not_claimed'),
      'queued', coalesce(v_run.queued_count, 0),
      'attempts', coalesce(v_run.attempts, 0),
      'runDate', v_local_date
    );
  end if;

  update public.push_birthday_runs run
  set status = 'processing',
      attempts = run.attempts + 1,
      locked_at = now(),
      locked_by = 'birthday-cron',
      processed_at = null,
      last_error = null
  where run.run_date = v_local_date
  returning * into v_run;

  begin
    insert into public.push_notification_jobs (
      source_type, source_id, category, aluno_id, title, body, deep_link,
      image_asset_id, data, available_at, expires_at, idempotency_key
    )
    select
      'institutional',
      null,
      'marketing',
      student.id,
      v_settings.title,
      v_settings.body,
      '/aluno/?module=notificacoes',
      v_settings.image_asset_id,
      jsonb_build_object(
        'event', 'birthday',
        'birthdayDate', v_local_date,
        'imagePath', v_image_path,
        'collapse_key', format(
          'birthday:%s:%s',
          student.id,
          extract(year from v_local_date)::integer
        )
      ),
      now(),
      v_expires_at,
      format(
        'marketing:birthday:%s:%s',
        student.id,
        extract(year from v_local_date)::integer
      )
    from public.parceiros student
    where student.tipo = 'Aluno'
      and student.status = 'ATIVO'
      and student.data_nascimento is not null
      and (
        (
          extract(month from student.data_nascimento)::integer = extract(month from v_local_date)::integer
          and extract(day from student.data_nascimento)::integer = extract(day from v_local_date)::integer
        )
        or (
          extract(month from student.data_nascimento)::integer = 2
          and extract(day from student.data_nascimento)::integer = 29
          and extract(month from v_local_date)::integer = 2
          and extract(day from v_local_date)::integer = 28
          and extract(day from (make_date(extract(year from v_local_date)::integer, 3, 1) - interval '1 day'))::integer = 28
        )
      )
      and exists (
        select 1
        from public.matriculas enrollment
        where enrollment.aluno_id = student.id
          and enrollment.status in ('ATIVO', 'EM_DEPENDENCIA')
      )
      and public.push_marketing_consent_allowed(student.id)
    on conflict (idempotency_key) do nothing;
    get diagnostics v_inserted = row_count;

    update public.push_birthday_runs run
    set status = 'completed',
        queued_count = v_inserted,
        locked_at = null,
        locked_by = null,
        processed_at = now(),
        last_error = null
    where run.run_date = v_local_date;
  exception
    when others then
      v_error := left(sqlstate || ':' || sqlerrm, 1000);
      v_retry_minutes := least(30, 5 * (2 ^ greatest(v_run.attempts - 1, 0))::integer);
      update public.push_birthday_runs run
      set status = 'failed',
          available_at = case
            when run.attempts < 3 then now() + make_interval(mins => v_retry_minutes)
            else run.available_at
          end,
          locked_at = null,
          locked_by = null,
          processed_at = case when run.attempts >= 3 then now() else null end,
          last_error = v_error
      where run.run_date = v_local_date;

      return jsonb_build_object(
        'enabled', true,
        'status', 'failed',
        'queued', 0,
        'attempts', v_run.attempts,
        'retryable', v_run.attempts < 3,
        'runDate', v_local_date
      );
  end;

  return jsonb_build_object(
    'enabled', true,
    'status', 'completed',
    'queued', v_inserted,
    'attempts', v_run.attempts,
    'runDate', v_local_date
  );
end;
$$;

revoke all on function public.enqueue_birthday_push_notifications()
from public, anon, authenticated;
grant execute on function public.enqueue_birthday_push_notifications()
to service_role;

-- Keep transactional reminders separate from marketing birthdays. This daily
-- routine no longer scans parceiros for birthdays; the claimed routine above
-- is the only producer for that event.
create or replace function public.enqueue_scheduled_push_notifications()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_policy public.push_notification_policies%rowtype;
  v_today date := timezone('America/Maceio', now())::date;
  v_financial integer := 0;
  v_academic integer := 0;
  v_calendar integer := 0;
begin
  select * into v_policy
  from public.push_notification_policies policy
  where policy.id is true;

  if not found or not v_policy.enabled then
    return jsonb_build_object(
      'enabled', false,
      'financial', 0,
      'academic', 0,
      'calendar', 0
    );
  end if;

  if coalesce((v_policy.categories ->> 'financial')::boolean, false) then
    insert into public.push_notification_jobs (
      source_type, source_id, category, aluno_id, title, body, deep_link,
      data, idempotency_key
    )
    select
      'financial',
      receivable.id,
      'financial',
      receivable.cliente_id,
      reminder.title,
      reminder.body,
      '/aluno/?module=financeiro',
      jsonb_build_object(
        'receivable_id', receivable.id,
        'days_before_due', reminder.days_before_due,
        'event', 'payment_due',
        'collapse_key', 'financial:' || receivable.id::text
      ),
      format(
        'financial:due:%s:%s:%s',
        receivable.id,
        receivable.data_vencimento,
        reminder.days_before_due
      )
    from public.contas_receber receivable
    cross join (
      values
        (3, 'Lembrete de vencimento'::text, 'Você tem uma cobrança com vencimento em 3 dias. Consulte o Financeiro no app.'::text),
        (0, 'Vencimento hoje'::text, 'Você tem uma cobrança com vencimento hoje. Consulte o Financeiro no app.'::text)
    ) as reminder(days_before_due, title, body)
    where receivable.cliente_id is not null
      and receivable.data_pagamento is null
      and receivable.data_vencimento = v_today + reminder.days_before_due
      and upper(coalesce(receivable.status, '')) not in (
        'PAGO', 'CANCELADO', 'CANCELADA', 'RECEBIDO'
      )
    on conflict (idempotency_key) do nothing;
    get diagnostics v_financial = row_count;
  end if;

  if coalesce((v_policy.categories ->> 'academic')::boolean, false) then
    insert into public.push_notification_jobs (
      source_type, source_id, category, aluno_id, title, body, deep_link,
      data, idempotency_key
    )
    select
      'academic',
      class.id,
      'academic',
      enrollment.aluno_id,
      'Aula amanhã',
      'Há uma aula programada para amanhã. Consulte o calendário no app.',
      '/aluno/?module=calendario',
      jsonb_build_object(
        'class_id', class.id,
        'class_date', class.data_aula,
        'turma_id', class.turma_id,
        'event', 'class_reminder',
        'collapse_key', 'academic:' || class.id::text
      ),
      format('academic:class:%s:%s:d-1', class.id, enrollment.aluno_id)
    from public.aulas_turma class
    join public.matriculas enrollment on enrollment.turma_id = class.turma_id
    where class.data_aula = v_today + 1
      and enrollment.status = 'ATIVO'
    on conflict (idempotency_key) do nothing;
    get diagnostics v_academic = row_count;
  end if;

  if coalesce((v_policy.categories ->> 'calendar')::boolean, false) then
    with recipients as (
      select distinct
        event.id as event_id,
        event.event_date,
        event.type_id,
        enrollment.aluno_id
      from public.calendar_events event
      join public.turmas class_group on class_group.polo_id = event.polo_id
      join public.matriculas enrollment
        on enrollment.turma_id = class_group.id
       and enrollment.status = 'ATIVO'
      where event.event_date = v_today + 1
        and event.visibility = 'GENERAL'

      union

      select distinct
        event.id as event_id,
        event.event_date,
        event.type_id,
        enrollment.aluno_id
      from public.calendar_events event
      join public.matriculas enrollment
        on enrollment.turma_id = event.turma_id
       and enrollment.status = 'ATIVO'
      where event.event_date = v_today + 1
        and event.visibility = 'TURMA'
    )
    insert into public.push_notification_jobs (
      source_type, source_id, category, aluno_id, title, body, deep_link,
      data, idempotency_key
    )
    select
      'calendar',
      recipient.event_id,
      'calendar',
      recipient.aluno_id,
      case
        when lower(recipient.type_id) like '%feriad%' then 'Feriado amanhã'
        else 'Evento amanhã'
      end,
      case
        when lower(recipient.type_id) like '%feriad%'
          then 'Confira no app como o feriado afeta o calendário acadêmico.'
        else 'Há uma atualização no calendário de amanhã. Consulte os detalhes no app.'
      end,
      '/aluno/?module=calendario',
      jsonb_build_object(
        'calendar_event_id', recipient.event_id,
        'event_date', recipient.event_date,
        'event', 'calendar_reminder',
        'collapse_key', 'calendar:' || recipient.event_id::text
      ),
      format(
        'calendar:event:%s:%s:d-1',
        recipient.event_id,
        recipient.aluno_id
      )
    from recipients recipient
    on conflict (idempotency_key) do nothing;
    get diagnostics v_calendar = row_count;
  end if;

  return jsonb_build_object(
    'enabled', true,
    'financial', v_financial,
    'academic', v_academic,
    'calendar', v_calendar
  );
end;
$$;

revoke all on function public.enqueue_scheduled_push_notifications()
from public, anon, authenticated;
grant execute on function public.enqueue_scheduled_push_notifications()
to service_role;

-- Asset upload reservations make the quota atomic per manager. The Edge
-- Function receives a short-lived reservation and must consume it when it
-- records the immutable object metadata.
alter table public.push_notification_assets
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists cleanup_requested_at timestamptz;

alter table public.push_notification_assets
  drop constraint if exists push_notification_assets_status_check;
alter table public.push_notification_assets
  add constraint push_notification_assets_status_check
  check (status in ('ready', 'quarantined', 'cleanup_pending', 'deleted'));
alter table public.push_notification_assets
  drop constraint if exists push_notification_assets_metadata_check;
alter table public.push_notification_assets
  add constraint push_notification_assets_metadata_check
  check (jsonb_typeof(metadata) = 'object');

create index if not exists idx_push_notification_assets_creator_recent
  on public.push_notification_assets (created_by, created_at desc)
  where status in ('ready', 'cleanup_pending');

create index if not exists idx_push_notification_assets_cleanup_candidates
  on public.push_notification_assets (created_at, id)
  where status = 'ready';

create table if not exists public.push_notification_asset_upload_reservations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null,
  purpose text not null,
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes',
  consumed_at timestamptz,
  constraint push_asset_upload_reservation_purpose_check
    check (purpose in ('campaign', 'birthday')),
  constraint push_asset_upload_reservation_expiry_check
    check (expires_at > requested_at),
  constraint push_asset_upload_reservation_consumed_check
    check (consumed_at is null or consumed_at >= requested_at)
);

create index if not exists idx_push_asset_upload_reservations_rate
  on public.push_notification_asset_upload_reservations (
    created_by,
    requested_at desc
  );
create index if not exists idx_push_asset_upload_reservations_expiry
  on public.push_notification_asset_upload_reservations (expires_at)
  where consumed_at is null;

alter table public.push_notification_asset_upload_reservations enable row level security;
revoke all on table public.push_notification_asset_upload_reservations
from public, anon, authenticated;
revoke insert, update, delete
on table public.push_notification_asset_upload_reservations
from service_role;
grant select on table public.push_notification_asset_upload_reservations
to service_role;

revoke insert, update, delete on table public.push_notification_assets
from service_role;
grant select on table public.push_notification_assets to service_role;

create or replace function public.comunicacao_push_asset_upload_autorizar_v2(
  p_purpose text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_recent_requests integer := 0;
  v_recent_assets integer := 0;
  v_reservation_id uuid;
begin
  if p_purpose not in ('campaign', 'birthday') then
    raise exception 'INVALID_PUSH_ASSET_PURPOSE' using errcode = '22023';
  end if;
  if v_actor is null
     or not public.can_manage_push_campaigns()
     or (p_purpose = 'birthday' and not public.is_gestor_global()) then
    raise exception 'INSUFFICIENT_PERMISSION' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('push-asset-upload:' || v_actor::text, 0)
  );

  select count(*)::integer into v_recent_requests
  from public.push_notification_asset_upload_reservations reservation
  where reservation.created_by = v_actor
    and reservation.requested_at >= now() - interval '10 minutes';
  if v_recent_requests >= 10 then
    raise exception 'PUSH_ASSET_UPLOAD_RATE_LIMITED' using errcode = 'P0001';
  end if;

  select count(*)::integer into v_recent_assets
  from public.push_notification_assets asset
  where asset.created_by = v_actor
    and asset.created_at >= now() - interval '30 days'
    and asset.status in ('ready', 'cleanup_pending');
  if v_recent_assets >= 100 then
    raise exception 'PUSH_ASSET_RECENT_QUOTA_EXCEEDED' using errcode = 'P0001';
  end if;

  insert into public.push_notification_asset_upload_reservations (
    created_by,
    purpose
  ) values (
    v_actor,
    p_purpose
  )
  returning id into v_reservation_id;

  delete from public.push_notification_asset_upload_reservations reservation
  where reservation.requested_at < now() - interval '30 days';

  return jsonb_build_object(
    'authorized', true,
    'reservationId', v_reservation_id,
    'expiresAt', now() + interval '10 minutes',
    'remainingInWindow', greatest(0, 9 - v_recent_requests)
  );
end;
$$;

-- Compatibility for an already-running Edge version. It still receives the
-- boolean it expects, but every authorization consumes the same rate window.
create or replace function public.comunicacao_push_asset_upload_autorizar(
  p_purpose text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.comunicacao_push_asset_upload_autorizar_v2(p_purpose);
  return true;
end;
$$;

create or replace function public.comunicacao_push_asset_upload_registrar(
  p_reservation_id uuid,
  p_asset_id uuid,
  p_object_path text,
  p_mime_type text,
  p_size_bytes integer,
  p_width integer,
  p_height integer,
  p_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reservation public.push_notification_asset_upload_reservations%rowtype;
  v_expected_path text;
begin
  if p_reservation_id is null or p_asset_id is null then
    raise exception 'PUSH_ASSET_RESERVATION_REQUIRED' using errcode = '22023';
  end if;

  select * into v_reservation
  from public.push_notification_asset_upload_reservations reservation
  where reservation.id = p_reservation_id
  for update;
  if not found
     or v_reservation.consumed_at is not null
     or v_reservation.expires_at <= now() then
    raise exception 'PUSH_ASSET_RESERVATION_INVALID' using errcode = '22023';
  end if;

  v_expected_path := case v_reservation.purpose
    when 'campaign' then 'campaigns/'
    else 'birthday/'
  end || p_asset_id::text || case p_mime_type
    when 'image/jpeg' then '.jpg'
    when 'image/png' then '.png'
    else ''
  end;
  if p_object_path is distinct from v_expected_path then
    raise exception 'PUSH_ASSET_PATH_MISMATCH' using errcode = '22023';
  end if;

  insert into public.push_notification_assets (
    id, purpose, bucket_id, object_path, mime_type, size_bytes,
    width, height, sha256, status, created_by, metadata
  ) values (
    p_asset_id,
    v_reservation.purpose,
    'push-notification-images',
    p_object_path,
    p_mime_type,
    p_size_bytes,
    p_width,
    p_height,
    lower(p_sha256),
    'ready',
    v_reservation.created_by,
    jsonb_build_object('uploadReservationId', v_reservation.id)
  );

  update public.push_notification_asset_upload_reservations
  set consumed_at = now()
  where id = v_reservation.id;

  return jsonb_build_object(
    'id', p_asset_id,
    'purpose', v_reservation.purpose,
    'objectPath', p_object_path,
    'mimeType', p_mime_type,
    'sizeBytes', p_size_bytes,
    'width', p_width,
    'height', p_height
  );
end;
$$;

revoke all on function public.comunicacao_push_asset_upload_autorizar_v2(text)
from public, anon;
revoke all on function public.comunicacao_push_asset_upload_autorizar(text)
from public, anon;
revoke all on function public.comunicacao_push_asset_upload_registrar(uuid, uuid, text, text, integer, integer, integer, text)
from public, anon, authenticated;
grant execute on function public.comunicacao_push_asset_upload_autorizar_v2(text)
to authenticated;
grant execute on function public.comunicacao_push_asset_upload_autorizar(text)
to authenticated;
grant execute on function public.comunicacao_push_asset_upload_registrar(uuid, uuid, text, text, integer, integer, integer, text)
to service_role;

create table if not exists public.push_notification_asset_cleanup_queue (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null unique
    references public.push_notification_assets(id) on delete restrict,
  bucket_id text not null,
  object_path text not null,
  status text not null default 'pending',
  available_at timestamptz not null default now(),
  attempts integer not null default 0,
  locked_at timestamptz,
  locked_by text,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_asset_cleanup_bucket_check
    check (bucket_id = 'push-notification-images'),
  constraint push_asset_cleanup_path_check
    check (object_path ~ '^(campaigns|birthday)/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png)$'),
  constraint push_asset_cleanup_status_check
    check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  constraint push_asset_cleanup_attempts_check check (attempts between 0 and 5)
);

create index if not exists idx_push_asset_cleanup_claim
  on public.push_notification_asset_cleanup_queue (
    status,
    available_at,
    created_at
  )
  where status in ('pending', 'failed', 'processing');

alter table public.push_notification_asset_cleanup_queue enable row level security;
revoke all on table public.push_notification_asset_cleanup_queue
from public, anon, authenticated;
revoke insert, update, delete
on table public.push_notification_asset_cleanup_queue
from service_role;
grant select on table public.push_notification_asset_cleanup_queue
to service_role;

drop trigger if exists push_notification_asset_cleanup_touch
on public.push_notification_asset_cleanup_queue;
create trigger push_notification_asset_cleanup_touch
before update on public.push_notification_asset_cleanup_queue
for each row execute function public.push_notification_touch_updated_at();

create or replace function public.push_notification_asset_is_referenced(
  p_asset_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    exists (
      select 1
      from public.comunicacao_push_campanhas campaign
      where campaign.image_asset_id = p_asset_id
    )
    or exists (
      select 1
      from public.push_birthday_settings settings
      where settings.image_asset_id = p_asset_id
    )
    or exists (
      select 1
      from public.push_notification_jobs job
      where job.image_asset_id = p_asset_id
    )
    or exists (
      select 1
      from public.aluno_notificacoes inbox
      where inbox.image_asset_id = p_asset_id
    );
$$;

revoke all on function public.push_notification_asset_is_referenced(uuid)
from public, anon, authenticated;
grant execute on function public.push_notification_asset_is_referenced(uuid)
to service_role;

create or replace function public.enqueue_orphan_push_notification_assets_for_cleanup()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_queued integer := 0;
begin
  with candidates as (
    select asset.id
    from public.push_notification_assets asset
    where asset.status = 'ready'
      and asset.created_at < now() - interval '30 days'
      and not public.push_notification_asset_is_referenced(asset.id)
    order by asset.created_at, asset.id
    for update skip locked
    limit 100
  ), marked as (
    update public.push_notification_assets asset
    set status = 'cleanup_pending',
        cleanup_requested_at = now(),
        metadata = asset.metadata || jsonb_build_object(
          'cleanupReason', 'UNREFERENCED_RETENTION_EXPIRED',
          'cleanupQueuedAt', now()
        )
    from candidates candidate
    where asset.id = candidate.id
      and not public.push_notification_asset_is_referenced(asset.id)
    returning asset.id, asset.bucket_id, asset.object_path
  )
  insert into public.push_notification_asset_cleanup_queue (
    asset_id,
    bucket_id,
    object_path,
    status,
    available_at
  )
  select
    marked.id,
    marked.bucket_id,
    marked.object_path,
    'pending',
    now()
  from marked
  on conflict (asset_id) do nothing;
  get diagnostics v_queued = row_count;

  return jsonb_build_object(
    'queued', v_queued,
    'retentionDays', 30,
    'storageDeleted', false
  );
end;
$$;

create or replace function public.claim_push_notification_asset_cleanup(
  p_worker text,
  p_limit integer default 50
)
returns table (
  cleanup_id uuid,
  asset_id uuid,
  bucket_id text,
  object_path text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  with referenced as (
    select queue.id, queue.asset_id
    from public.push_notification_asset_cleanup_queue queue
    where queue.status in ('pending', 'failed', 'processing')
      and public.push_notification_asset_is_referenced(queue.asset_id)
  ), cancelled as (
    update public.push_notification_asset_cleanup_queue queue
    set status = 'cancelled',
        locked_at = null,
        locked_by = null,
        completed_at = now(),
        last_error = 'ASSET_BECAME_REFERENCED'
    from referenced reference
    where queue.id = reference.id
    returning queue.asset_id
  )
  update public.push_notification_assets asset
  set status = 'ready',
      cleanup_requested_at = null,
      metadata = asset.metadata || jsonb_build_object(
        'cleanupCancelledAt', now(),
        'cleanupCancelReason', 'ASSET_BECAME_REFERENCED'
      )
  from cancelled
  where asset.id = cancelled.asset_id
    and asset.status = 'cleanup_pending';

  update public.push_notification_asset_cleanup_queue queue
  set status = 'failed',
      available_at = case
        when queue.attempts < 5 then now() + interval '5 minutes'
        else queue.available_at
      end,
      locked_at = null,
      locked_by = null,
      last_error = 'ASSET_CLEANUP_LEASE_EXPIRED'
  where queue.status = 'processing'
    and queue.locked_at < now() - interval '10 minutes';

  return query
  with candidates as (
    select queue.id
    from public.push_notification_asset_cleanup_queue queue
    join public.push_notification_assets asset on asset.id = queue.asset_id
    where queue.status in ('pending', 'failed')
      and queue.available_at <= now()
      and queue.attempts < 5
      and asset.status = 'cleanup_pending'
      and not public.push_notification_asset_is_referenced(asset.id)
    order by queue.available_at, queue.created_at
    for update of queue skip locked
    limit greatest(1, least(coalesce(p_limit, 50), 100))
  ), claimed as (
    update public.push_notification_asset_cleanup_queue queue
    set status = 'processing',
        attempts = queue.attempts + 1,
        locked_at = now(),
        locked_by = left(coalesce(nullif(btrim(p_worker), ''), 'asset-cleanup'), 120),
        last_error = null
    from candidates candidate
    where queue.id = candidate.id
    returning queue.*
  )
  select
    claimed.id,
    claimed.asset_id,
    claimed.bucket_id,
    claimed.object_path
  from claimed;
end;
$$;

create or replace function public.complete_push_notification_asset_cleanup(
  p_cleanup_id uuid,
  p_worker text,
  p_success boolean,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_queue public.push_notification_asset_cleanup_queue%rowtype;
  v_retry_minutes integer;
begin
  select * into v_queue
  from public.push_notification_asset_cleanup_queue queue
  where queue.id = p_cleanup_id
  for update;
  if not found
     or v_queue.status <> 'processing'
     or v_queue.locked_by is distinct from left(
       coalesce(nullif(btrim(p_worker), ''), 'asset-cleanup'),
       120
     ) then
    return false;
  end if;

  if public.push_notification_asset_is_referenced(v_queue.asset_id) then
    update public.push_notification_asset_cleanup_queue
    set status = 'cancelled',
        locked_at = null,
        locked_by = null,
        completed_at = now(),
        last_error = 'ASSET_BECAME_REFERENCED'
    where id = v_queue.id;
    update public.push_notification_assets
    set status = 'ready',
        cleanup_requested_at = null,
        metadata = metadata || jsonb_build_object(
          'cleanupCancelledAt', now(),
          'cleanupCancelReason', 'ASSET_BECAME_REFERENCED'
        )
    where id = v_queue.asset_id
      and status = 'cleanup_pending';
    return false;
  end if;

  if p_success then
    update public.push_notification_assets
    set status = 'deleted',
        metadata = metadata || jsonb_build_object(
          'storageDeletedAt', now(),
          'cleanupQueueId', v_queue.id
        )
    where id = v_queue.asset_id
      and status = 'cleanup_pending';
    update public.push_notification_asset_cleanup_queue
    set status = 'completed',
        locked_at = null,
        locked_by = null,
        completed_at = now(),
        last_error = null
    where id = v_queue.id;
  else
    v_retry_minutes := least(60, 5 * (2 ^ greatest(v_queue.attempts - 1, 0))::integer);
    update public.push_notification_asset_cleanup_queue
    set status = 'failed',
        available_at = case
          when attempts < 5 then now() + make_interval(mins => v_retry_minutes)
          else available_at
        end,
        locked_at = null,
        locked_by = null,
        completed_at = case when attempts >= 5 then now() else null end,
        last_error = left(coalesce(nullif(p_error, ''), 'STORAGE_DELETE_FAILED'), 1000)
    where id = v_queue.id;
  end if;

  return true;
end;
$$;

revoke all on function public.enqueue_orphan_push_notification_assets_for_cleanup()
from public, anon, authenticated;
revoke all on function public.claim_push_notification_asset_cleanup(text, integer)
from public, anon, authenticated;
revoke all on function public.complete_push_notification_asset_cleanup(uuid, text, boolean, text)
from public, anon, authenticated;
grant execute on function public.enqueue_orphan_push_notification_assets_for_cleanup()
to service_role;
grant execute on function public.claim_push_notification_asset_cleanup(text, integer)
to service_role;
grant execute on function public.complete_push_notification_asset_cleanup(uuid, text, boolean, text)
to service_role;

-- V3 preserves campaign pagination while exposing backend-owned progress in one
-- unit. The frontend renders these values and does no denominator arithmetic.
create or replace function public.comunicacao_push_campanhas_listar_v3(
  p_status text default null,
  p_search text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  title text,
  body text,
  category text,
  audience_type text,
  polo_id uuid,
  polo_name text,
  turma_id uuid,
  turma_name text,
  audience_label text,
  eligible_users integer,
  eligible_devices integer,
  status text,
  scheduled_at timestamptz,
  created_at timestamptz,
  queued_at timestamptz,
  completed_at timestamptz,
  sent_count integer,
  failed_count integer,
  skipped_count integer,
  recipient_count integer,
  processed_count integer,
  progress_percent integer,
  total_count bigint,
  created_by_name text,
  image_asset_id uuid,
  image_path text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.can_manage_push_campaigns() then
    raise exception 'INSUFFICIENT_PERMISSION' using errcode = '42501';
  end if;

  return query
  select
    campaign.id,
    campaign.title,
    campaign.body,
    campaign.category,
    campaign.audience_type,
    campaign.polo_id,
    polo.nome,
    campaign.turma_id,
    turma.nome,
    campaign.audience_label,
    campaign.eligible_users,
    campaign.eligible_devices,
    campaign.status,
    campaign.scheduled_at,
    campaign.created_at,
    campaign.queued_at,
    campaign.completed_at,
    campaign.sent_count,
    campaign.failed_count,
    campaign.skipped_count,
    campaign.recipient_count,
    campaign.processed_count,
    campaign.progress_percent,
    count(*) over(),
    coalesce(manager.nome, 'Administrador'),
    campaign.image_asset_id,
    asset.object_path
  from public.comunicacao_push_campanhas campaign
  left join public.polos polo on polo.id = campaign.polo_id
  left join public.turmas turma on turma.id = campaign.turma_id
  left join public.usuarios_sistema manager
    on manager.auth_user_id = campaign.created_by
  left join public.push_notification_assets asset
    on asset.id = campaign.image_asset_id
   and asset.status = 'ready'
  where public.can_target_push_scope(
      campaign.audience_type,
      campaign.polo_id,
      campaign.turma_id
    )
    and (p_status is null or campaign.status = p_status)
    and (
      nullif(btrim(coalesce(p_search, '')), '') is null
      or campaign.title ilike '%' || btrim(p_search) || '%'
      or campaign.body ilike '%' || btrim(p_search) || '%'
      or campaign.audience_label ilike '%' || btrim(p_search) || '%'
    )
  order by campaign.created_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 100))
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.comunicacao_push_campanhas_listar_v3(text, text, integer, integer)
from public, anon;
grant execute on function public.comunicacao_push_campanhas_listar_v3(text, text, integer, integer)
to authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (
      select 1 from cron.job
      where jobname = 'enqueue-birthday-push-notifications'
    ) then
      perform cron.unschedule('enqueue-birthday-push-notifications');
    end if;
    perform cron.schedule(
      'enqueue-birthday-push-notifications',
      '*/5 * * * *',
      'select public.enqueue_birthday_push_notifications()'
    );

    if exists (
      select 1 from cron.job
      where jobname = 'enqueue-orphan-push-assets-cleanup'
    ) then
      perform cron.unschedule('enqueue-orphan-push-assets-cleanup');
    end if;
    perform cron.schedule(
      'enqueue-orphan-push-assets-cleanup',
      '17 6 * * *',
      'select public.enqueue_orphan_push_notification_assets_for_cleanup()'
    );
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
