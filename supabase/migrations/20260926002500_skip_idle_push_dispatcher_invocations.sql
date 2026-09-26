-- Retain the one-minute scheduler and every worker claim/CAS.
-- Keep the predicate out of cron.command, which is copied into every run log.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '15s';

do $migration$
declare
  v_job cron.job%rowtype;
  v_contract record;
  v_command text;
  v_gate text := $gate$
    exists (
      select 1 from public.push_notification_jobs j
      where (j.status = 'processing' and j.locked_at < now() - interval '3 minutes')
        or ((j.status = 'pending' or (
          j.status in ('failed', 'partial') and exists (
            select 1 from public.push_notification_deliveries d
            where d.job_id = j.id and d.status = 'failed' and d.retryable
          ))) and (
          j.expires_at <= now()
          or (j.available_at <= now() and j.attempts < 5 and j.expires_at > now()
            and (j.category = 'chat' or not public.push_notification_quiet_hours_active()))
          or not exists (
            select 1 from public.push_notification_policies p
            where p.id = true and p.enabled and case j.category
              when 'chat' then coalesce((p.categories ->> 'chat')::boolean, false)
              when 'service' then coalesce((p.categories ->> 'chat')::boolean, false)
              when 'financial' then coalesce((p.categories ->> 'financial')::boolean, false)
              when 'academic' then coalesce((p.categories ->> 'academic')::boolean, false)
              when 'calendar' then coalesce((p.categories ->> 'calendar')::boolean, false)
              when 'marketing' then coalesce((p.categories ->> 'marketing')::boolean, false)
              else coalesce((p.categories ->> 'institutional')::boolean, false)
            end
          )
        ))
        or (j.status = 'cancelled' and j.last_error = 'PUSH_EXPIRED' and exists (
          select 1 from public.push_notification_deliveries d
          where d.job_id = j.id and (d.status in ('pending', 'processing')
            or (d.status = 'failed' and d.retryable))
        ))
    )
    or exists (
      select 1 from public.public_support_push_jobs j
      where (j.status = 'pending' and j.available_at <= now()
          and j.expires_at > now() and j.attempts < 5)
        or (j.status = 'processing' and j.locked_at < now() - interval '3 minutes'
          and j.attempts < 5 and j.expires_at > now())
        or (j.status in ('pending', 'processing')
          and (j.expires_at <= now() or j.attempts >= 5))
        or (j.status = 'pending' and exists (
          select 1 from public.public_support_push_deliveries d
          where d.job_id = j.id and d.status = 'processing'
        ))
    )
    or exists (
      select 1 from public.push_notification_asset_cleanup_queue q
      where q.status in ('pending', 'failed', 'processing') and (
        public.push_notification_asset_is_referenced(q.asset_id)
        or (q.status = 'processing' and q.locked_at < now() - interval '10 minutes')
        or (q.status in ('pending', 'failed') and q.available_at <= now()
          and q.attempts < 5 and exists (
            select 1 from public.push_notification_assets a
            where a.id = q.asset_id and a.status = 'cleanup_pending'
          ))
      )
    )
    or exists (
      select 1 from public.comunicacao_push_campanhas c
      where (c.status = 'scheduled' and c.scheduled_at <= now())
        or (c.status in ('queued', 'processing', 'scheduled')
          and exists (select 1 from public.push_notification_jobs j where j.campaign_id = c.id)
          and not exists (
            select 1 from public.push_notification_jobs j where j.campaign_id = c.id
              and (j.status in ('pending', 'processing')
                or (j.status in ('failed', 'partial') and j.attempts < 5 and j.expires_at > now()))
          ))
    )
  $gate$;
begin
  if not exists (
    select 1 from pg_namespace n where n.nspname = 'comunicacao_private'
      and pg_get_userbyid(n.nspowner) = 'postgres'
      and not has_schema_privilege('anon', n.oid, 'usage')
      and not has_schema_privilege('authenticated', n.oid, 'usage')
      and not has_schema_privilege('service_role', n.oid, 'usage')
  ) or to_regprocedure('comunicacao_private.push_dispatch_required()') is not null then
    raise exception 'Private push gate namespace changed; review before applying.';
  end if;
  select * into strict v_job from cron.job
    where jobname = 'dispatch-push-notifications';
  if v_job.schedule <> '* * * * *' or not v_job.active
    or v_job.username <> 'postgres'
    or md5(v_job.command) <> 'b6cc37fd81046d6ae09d5590f3763d0e'
  then
    raise exception 'Push cron changed; review the live command before applying.';
  end if;
  for v_contract in select * from (values
    ('public.claim_push_notification_deliveries(text,integer)', '75d33909a1d8c5a9ed543b756c350299'),
    ('public.claim_public_support_push_deliveries(text,integer)', 'aa37d41cbd58eee5e0a91bcc158a61b5'),
    ('public.claim_push_notification_asset_cleanup(text,integer)', '0164ce8782c82c24384c97038df3ee38')
  ) contracts(signature, fingerprint)
  loop
    if md5(pg_get_functiondef(v_contract.signature::regprocedure)) <> v_contract.fingerprint then
      raise exception 'Push claim contract changed: %', v_contract.signature;
    end if;
  end loop;

  execute format($definition$
    create function comunicacao_private.push_dispatch_required()
    returns boolean language sql stable security invoker set search_path = ''
    as %L
  $definition$, 'select (' || v_gate || ');');
  execute 'alter function comunicacao_private.push_dispatch_required() owner to postgres';
  execute 'revoke all on function comunicacao_private.push_dispatch_required()
    from public, anon, authenticated, service_role';
  execute 'grant execute on function comunicacao_private.push_dispatch_required() to postgres';
  if not exists (
    select 1 from pg_proc p
    where p.oid = 'comunicacao_private.push_dispatch_required()'::regprocedure
      and p.proowner = 'postgres'::regrole and not p.prosecdef and p.provolatile = 's'
      and p.proconfig = array['search_path=""']::text[]
      and p.prosrc = 'select (' || v_gate || ');'
      and not exists (
        select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        where a.grantee <> 'postgres'::regrole or a.privilege_type <> 'EXECUTE'
      )
  ) then
    raise exception 'Unexpected push gate definition or privileges.';
  end if;

  -- Keep endpoint, secret lookup, payload, timeout, owner and schedule intact.
  v_command := regexp_replace(v_job.command, ';[[:space:]]*$', '')
    || E'\nwhere comunicacao_private.push_dispatch_required();';
  perform cron.alter_job(v_job.jobid, command := v_command);
  if not exists (
    select 1 from cron.job j where j.jobid = v_job.jobid and j.command = v_command
      and (to_jsonb(j) - 'command') = (to_jsonb(v_job) - 'command')
  ) then
    raise exception 'Unexpected push cron metadata change.';
  end if;
end;
$migration$;
commit;
