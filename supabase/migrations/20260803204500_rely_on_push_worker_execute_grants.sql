begin;

do $$
declare
  v_function_name text;
  v_definition text;
begin
  foreach v_function_name in array array[
    'claim_push_notification_deliveries',
    'complete_push_notification_delivery'
  ]
  loop
    select pg_get_functiondef(p.oid)
    into v_definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = v_function_name
    order by p.oid
    limit 1;

    if v_definition is null then
      raise exception 'PUSH_WORKER_FUNCTION_NOT_FOUND: %', v_function_name;
    end if;

    v_definition := replace(
      v_definition,
      E'  if coalesce(auth.role(), \'\') <> \'service_role\' then\n    raise exception \'SERVICE_ROLE_REQUIRED\' using errcode = \'42501\';\n  end if;\n',
      ''
    );

    execute v_definition;
  end loop;
end;
$$;

revoke all on function public.claim_push_notification_deliveries(text, integer)
  from public, anon, authenticated;
revoke all on function public.complete_push_notification_delivery(uuid, boolean, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.claim_push_notification_deliveries(text, integer)
  to service_role;
grant execute on function public.complete_push_notification_delivery(uuid, boolean, text, text, boolean)
  to service_role;

commit;
