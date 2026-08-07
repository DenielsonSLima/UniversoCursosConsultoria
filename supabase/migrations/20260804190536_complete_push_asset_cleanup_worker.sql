begin;

-- Assets whose cleanup was cancelled can become orphaned again. Reactivate the
-- existing queue row instead of leaving the asset stuck in cleanup_pending.
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
  on conflict (asset_id) do update
  set bucket_id = excluded.bucket_id,
      object_path = excluded.object_path,
      status = 'pending',
      available_at = excluded.available_at,
      attempts = 0,
      locked_at = null,
      locked_by = null,
      completed_at = null,
      last_error = null
  where push_notification_asset_cleanup_queue.status in ('cancelled', 'completed')
    and not public.push_notification_asset_is_referenced(excluded.asset_id);
  get diagnostics v_queued = row_count;

  return jsonb_build_object(
    'queued', v_queued,
    'retentionDays', 30,
    'storageDeleted', false
  );
end;
$$;

-- A preview does not itself reference the asset. Lock and recheck the asset
-- when a campaign or birthday configuration starts referencing it, preventing
-- a new reference from racing cleanup_pending -> Storage deletion.
create or replace function public.guard_push_asset_reference_ready()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_expected_purpose text := nullif(tg_argv[0], '');
begin
  if new.image_asset_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.image_asset_id is not distinct from old.image_asset_id then
      return new;
    end if;
  end if;

  perform 1
  from public.push_notification_assets asset
  where asset.id = new.image_asset_id
    and asset.status = 'ready'
    and (v_expected_purpose is null or asset.purpose = v_expected_purpose)
  for update;
  if not found then
    raise exception 'PUSH_ASSET_NOT_READY' using errcode = '22023';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_push_asset_reference_ready()
from public, anon, authenticated;

drop trigger if exists comunicacao_push_campanhas_asset_ready
on public.comunicacao_push_campanhas;
create trigger comunicacao_push_campanhas_asset_ready
before insert or update of image_asset_id on public.comunicacao_push_campanhas
for each row execute function public.guard_push_asset_reference_ready('campaign');

drop trigger if exists push_birthday_settings_asset_ready
on public.push_birthday_settings;
create trigger push_birthday_settings_asset_ready
before insert or update of image_asset_id on public.push_birthday_settings
for each row execute function public.guard_push_asset_reference_ready('birthday');

drop trigger if exists push_notification_jobs_asset_ready
on public.push_notification_jobs;
create trigger push_notification_jobs_asset_ready
before insert or update of image_asset_id on public.push_notification_jobs
for each row execute function public.guard_push_asset_reference_ready('');

drop trigger if exists aluno_notificacoes_asset_ready
on public.aluno_notificacoes;
create trigger aluno_notificacoes_asset_ready
before insert or update of image_asset_id on public.aluno_notificacoes
for each row execute function public.guard_push_asset_reference_ready('');

-- The worker calls this immediately before touching Storage. It rechecks the
-- lease, immutable bucket/path pair, asset state and every reference source.
create or replace function public.revalidate_push_notification_asset_cleanup(
  p_cleanup_id uuid,
  p_worker text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_queue public.push_notification_asset_cleanup_queue%rowtype;
  v_asset public.push_notification_assets%rowtype;
  v_worker text := left(
    coalesce(nullif(btrim(p_worker), ''), 'asset-cleanup'),
    120
  );
begin
  if p_cleanup_id is null then
    return jsonb_build_object(
      'eligible', false,
      'reason', 'ASSET_CLEANUP_ID_REQUIRED'
    );
  end if;

  select queue.* into v_queue
  from public.push_notification_asset_cleanup_queue queue
  where queue.id = p_cleanup_id
  for update;
  if not found
     or v_queue.status <> 'processing'
     or v_queue.locked_by is distinct from v_worker
     or v_queue.locked_at is null
     or v_queue.locked_at < now() - interval '10 minutes' then
    return jsonb_build_object(
      'eligible', false,
      'reason', 'ASSET_CLEANUP_LEASE_INVALID'
    );
  end if;

  select asset.* into v_asset
  from public.push_notification_assets asset
  where asset.id = v_queue.asset_id
  for update;
  if not found
     or v_asset.status <> 'cleanup_pending'
     or v_asset.bucket_id is distinct from v_queue.bucket_id
     or v_asset.object_path is distinct from v_queue.object_path then
    return jsonb_build_object(
      'eligible', false,
      'reason', 'ASSET_CLEANUP_STATE_INVALID'
    );
  end if;

  if public.push_notification_asset_is_referenced(v_queue.asset_id) then
    return jsonb_build_object(
      'eligible', false,
      'reason', 'ASSET_BECAME_REFERENCED'
    );
  end if;

  return jsonb_build_object(
    'eligible', true,
    'assetId', v_queue.asset_id,
    'bucketId', v_queue.bucket_id,
    'objectPath', v_queue.object_path
  );
end;
$$;

revoke all on function public.revalidate_push_notification_asset_cleanup(uuid, text)
from public, anon, authenticated;
grant execute on function public.revalidate_push_notification_asset_cleanup(uuid, text)
to service_role;

-- A reference appearing before completion is a safely handled cancellation,
-- not an audit failure for the worker.
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
    return true;
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

revoke all on function public.complete_push_notification_asset_cleanup(uuid, text, boolean, text)
from public, anon, authenticated;
grant execute on function public.complete_push_notification_asset_cleanup(uuid, text, boolean, text)
to service_role;

notify pgrst, 'reload schema';

commit;
