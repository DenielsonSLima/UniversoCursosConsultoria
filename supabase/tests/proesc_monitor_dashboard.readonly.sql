-- Run this file alone through MCP. Stop on timeout; do not concatenate units.
-- Read-only transaction, real Auth identity, no external API or financial writes.
begin read only;
set local statement_timeout='3s';
do $monitor_check$
declare
  v_actor uuid; v_email text;
  v_started timestamptz:=clock_timestamp(); v_duration_ms numeric;
  v_dashboard jsonb;
begin
  select a.id,a.email into strict v_actor,v_email from internal_proesc.connection c
  join public.usuarios_sistema u on u.id=c.updated_by
  join auth.users a on lower(btrim(a.email))=lower(btrim(u.email))
  where lower(u.status)='ativo' limit 1;
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_actor,'email',v_email)::text,true);
  v_started:=clock_timestamp();
  v_dashboard:=public.get_proesc_reconciliation_dashboard();
  v_duration_ms:=round(extract(epoch from clock_timestamp()-v_started)*1000);
  assert v_dashboard->>'available'='true','Dashboard unavailable';
  assert not v_dashboard ?| array['token','secret','revision','secret_id','leaseId','cursorId','rawResponse'],
    'Dashboard contains protected runtime fields';
  assert v_dashboard#>>'{capabilities,historicalRunsReconstructed}'='false',
    'Historic executions were inferred';
  assert (v_dashboard#>>'{totals,monitored}')::bigint>=0,'Invalid monitored count';
  assert (v_dashboard#>>'{totals,appliedAuto}')::bigint>=0,'Invalid automatic settlement count';
  assert (v_dashboard#>>'{totals,appliedImport}')::bigint>=0,'Invalid import settlement count';
  assert v_dashboard->'polos' @> jsonb_build_array(jsonb_build_object(
    'id',(public.gestor_allowed_polo_ids())[1])),'Authorized polo omitted';
  if not exists(select 1 from internal_proesc.sync_runs) then
    assert v_dashboard->'historyStartedAt'='null'::jsonb,
      'Run-history start invented before first execution';
  end if;
  perform set_config('app.proesc_monitor_test_result',jsonb_build_object('unit','proesc_monitor_dashboard.readonly','passed',true,'durationMs',coalesce(v_duration_ms,round(extract(epoch from clock_timestamp()-v_started)*1000)))::text,true);
end;
$monitor_check$;
select current_setting('app.proesc_monitor_test_result',true)::jsonb as test_result;
rollback;
