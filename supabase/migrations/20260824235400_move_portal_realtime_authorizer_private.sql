begin;

create schema if not exists portal_private;

revoke all on schema portal_private
  from public, anon, authenticated, service_role;
grant usage on schema portal_private to authenticated;

-- SET SCHEMA moves the existing pg_proc entry instead of recreating it, so
-- the policy dependency and function OID remain stable while it leaves the API.
alter function public.can_read_portal_realtime_signal(text, uuid, uuid)
  set schema portal_private;

alter function portal_private.can_read_portal_realtime_signal(text, uuid, uuid)
  security definer
  set search_path = '';

revoke all on function portal_private.can_read_portal_realtime_signal(
  text, uuid, uuid
) from public, anon, authenticated, service_role;
grant execute on function portal_private.can_read_portal_realtime_signal(
  text, uuid, uuid
) to authenticated;

comment on function portal_private.can_read_portal_realtime_signal(
  text, uuid, uuid
) is
  'Autorizador interno da outbox Realtime; não exposto como RPC pública.';

notify pgrst, 'reload schema';

commit;
