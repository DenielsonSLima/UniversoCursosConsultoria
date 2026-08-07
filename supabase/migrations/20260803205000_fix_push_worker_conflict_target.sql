begin;

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(p.oid)
  into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'claim_push_notification_deliveries'
  order by p.oid
  limit 1;

  if v_definition is null then
    raise exception 'PUSH_WORKER_FUNCTION_NOT_FOUND';
  end if;

  v_definition := replace(
    v_definition,
    'on conflict (job_id, device_id) do update',
    'on conflict on constraint push_notification_deliveries_job_device_unique do update'
  );

  execute v_definition;
end;
$$;

revoke all on function public.claim_push_notification_deliveries(text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_push_notification_deliveries(text, integer)
  to service_role;

commit;
