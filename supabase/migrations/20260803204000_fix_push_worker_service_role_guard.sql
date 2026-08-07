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
      'coalesce(current_setting(''request.jwt.claim.role'', true), '''')',
      'coalesce(auth.role(), '''')'
    );

    execute v_definition;
  end loop;
end;
$$;

commit;
