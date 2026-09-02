begin;

do $migration$
declare
  v_definition text;
  v_updated text;
  v_old text := $old$when 'API_REVIEW' then
        new.gateway_submission_status = 'API_AMBIGUOUS'$old$;
  v_new text := $new$when 'API_REVIEW' then
        (
          coalesce(auth.role(), '') = 'service_role'
          or session_user in ('postgres', 'supabase_admin', 'service_role')
        )
        and new.gateway_submission_status = 'API_AMBIGUOUS'$new$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.enforce_receivable_gateway_submission_fence()'::regprocedure
  ) into v_definition;
  v_updated := pg_catalog.replace(v_definition, v_old, v_new);
  if v_updated is not distinct from v_definition then
    raise exception 'Bypass GET-only do fence não foi localizado.';
  end if;
  execute v_updated;
end;
$migration$;

comment on function public.enforce_receivable_gateway_submission_fence() is
  'Protege o canal externo; API_REVIEW só reabre em recuperação GET-only service-role.';

commit;
