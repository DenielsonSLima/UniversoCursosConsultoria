-- Run this file alone through MCP. Stop on timeout; do not concatenate units.
-- Read-only transaction, real Auth identity, no external API or financial writes.
begin read only;
set local statement_timeout='3s';
do $monitor_check$
declare
  v_actor uuid; v_email text;
  v_started timestamptz:=clock_timestamp(); v_duration_ms numeric;

begin
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
  begin
    perform public.get_proesc_reconciliation_dashboard();
    raise exception 'Unidentified actor obtained monitoring data';
  exception when sqlstate '42501' then null; end;
  begin
    perform public.get_proesc_reconciliation_feed_page();
    raise exception 'Unidentified actor obtained execution feed';
  exception when sqlstate '42501' then null; end;
  assert not has_function_privilege('anon',
    'public.get_proesc_reconciliation_dashboard(uuid,timestamptz,timestamptz)','execute'),
    'Anonymous dashboard exposure';
  assert not has_table_privilege('authenticated','internal_proesc.sync_runs','select'),
    'Private ledger exposed';
  assert not has_table_privilege('authenticated','internal_proesc.sync_run_http','select'),
    'Private HTTP ledger exposed';
  assert not has_function_privilege('authenticated',
    'internal_proesc.start_sync_run(uuid,uuid)','execute'),'Ordinary actor can create a run';
  select a.id,a.email into strict v_actor,v_email from internal_proesc.connection c
  join public.usuarios_sistema u on u.id=c.updated_by
  join auth.users a on lower(btrim(a.email))=lower(btrim(u.email))
  where lower(u.status)='ativo' limit 1;
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_actor,'email',v_email)::text,true);
  begin
    perform public.get_proesc_reconciliation_dashboard('00000000-0000-0000-0000-000000000000');
    raise exception 'Out-of-scope polo accepted';
  exception when sqlstate '42501' then null; end;
  begin
    perform public.get_proesc_reconciliation_dashboard(null,now()-interval '33 days',now());
    raise exception 'Unbounded monitoring period accepted';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.get_proesc_reconciliation_feed_page('token');
    raise exception 'Undocumented monitoring context accepted';
  exception when sqlstate '22023' then null; end;
  perform set_config('app.proesc_monitor_test_result',jsonb_build_object('unit','proesc_monitor.readonly','passed',true,'durationMs',coalesce(v_duration_ms,round(extract(epoch from clock_timestamp()-v_started)*1000)))::text,true);
end;
$monitor_check$;
select current_setting('app.proesc_monitor_test_result',true)::jsonb as test_result;
rollback;
