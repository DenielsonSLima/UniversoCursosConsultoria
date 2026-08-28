begin;

set local lock_timeout = '5s';

do $migration$
declare
  v_function regprocedure :=
    'public.persist_banese_discount_removal_correction(uuid,timestamp with time zone,jsonb,jsonb,jsonb,jsonb,text,text,jsonb,uuid)'::regprocedure;
  v_definition text;
  v_old_guard constant text := $guard$
  if coalesce(current_setting('request.jwt.claim.role', true), '')
      <> 'service_role'
    and session_user not in ('postgres', 'supabase_admin', 'service_role')
  then
$guard$;
  v_new_guard constant text := $guard$
  if coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
      ''
    ) <> 'service_role'
    and session_user not in ('postgres', 'supabase_admin', 'service_role')
  then
$guard$;
begin
  select pg_catalog.pg_get_functiondef(v_function) into v_definition;

  if pg_catalog.strpos(v_definition, v_new_guard) > 0
    and pg_catalog.strpos(v_definition, v_old_guard) = 0
  then
    return;
  end if;
  if pg_catalog.strpos(v_definition, v_old_guard) = 0
    or pg_catalog.strpos(v_definition, v_new_guard) > 0
  then
    raise exception
      'Guarda da persistência Banese diverge do estado esperado.'
      using errcode = '23514';
  end if;

  execute pg_catalog.replace(v_definition, v_old_guard, v_new_guard);

  select pg_catalog.pg_get_functiondef(v_function) into v_definition;
  if pg_catalog.strpos(v_definition, v_new_guard) = 0
    or pg_catalog.strpos(v_definition, v_old_guard) > 0
  then
    raise exception
      'Guarda service_role não foi aplicada à persistência Banese.'
      using errcode = '23514';
  end if;
end;
$migration$;

commit;
