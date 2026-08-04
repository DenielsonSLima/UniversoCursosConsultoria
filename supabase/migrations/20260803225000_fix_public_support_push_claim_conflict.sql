begin;

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
  on conflict on constraint public_support_push_deliveries_job_id_device_id_key do update
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

commit;
