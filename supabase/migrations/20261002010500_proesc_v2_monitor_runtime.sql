BEGIN;

-- Public dashboard keeps its existing scope/RBAC and financial-history projection.
-- Only the current runtime source changes; old execution telemetry stays labelled V1.
CREATE FUNCTION internal_proesc.v2_monitor_state(p_polo_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
  SELECT jsonb_build_object('version','v2','enabled',runtime.enabled,
    'schedule',(SELECT schedule FROM cron.job WHERE jobname='proesc-v2-observations' LIMIT 1),
    'running',coalesce(r.status='RUNNING',false),
    'leaseExpired',EXISTS(SELECT 1 FROM internal_proesc.v2_tasks t
      WHERE t.run_id=r.id AND t.lease_until<=now()),
    'lastStartedAt',r.created_at,'lastFinishedAt',r.finished_at,
    'lastDurationMs',CASE WHEN r.finished_at>=r.created_at
      THEN round(extract(epoch FROM r.finished_at-r.created_at)*1000) END,
    'lastCounts',CASE WHEN p_polo_id IS NULL THEN jsonb_build_object(
      'consulted',(SELECT count(*) FROM internal_proesc.v2_invoice_observations o WHERE o.run_id=r.id),
      'applied',(SELECT count(*) FROM internal_proesc.v2_invoice_observations o WHERE o.run_id=r.id AND o.result='APPLIED'),
      'unchanged',(SELECT count(*) FROM internal_proesc.v2_invoice_observations o WHERE o.run_id=r.id AND o.result IN ('OPEN_CONFIRMED','PRESERVED')),
      'review',(SELECT count(*) FROM internal_proesc.v2_invoice_observations o WHERE o.run_id=r.id AND o.result='REVIEW'),
      'failed',(SELECT count(*) FROM internal_proesc.v2_tasks t WHERE t.run_id=r.id AND t.status='FAILED')) END,
    'metricsScope','GLOBAL_SHARED_WORKER')
  FROM internal_proesc.v2_runtime runtime
  LEFT JOIN LATERAL (SELECT * FROM internal_proesc.v2_runs ORDER BY created_at DESC LIMIT 1) r ON true
  WHERE runtime.singleton;
$function$;
REVOKE ALL ON FUNCTION internal_proesc.v2_monitor_state(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_proesc_reconciliation_dashboard(p_polo_id uuid DEFAULT NULL::uuid, p_started_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_started_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_polos uuid[]; v_from timestamptz; v_to timestamptz; v_result jsonb;
begin
  v_polos:=internal_proesc.monitor_scope(p_polo_id);
  select started_from,started_to into v_from,v_to from internal_proesc.monitor_period(p_started_from,p_started_to);
  with links as materialized(select * from internal_proesc.monitor_links(v_polos)),
  observations as materialized(select s.id,s.verification from internal_proesc.financial_observation_history s
    join links l on l.link_id=s.link_id where s.observed_at>=v_from and s.observed_at<=v_to),
  runs as materialized(select r.* from internal_proesc.sync_runs r
    where r.started_at>=v_from and r.started_at<=v_to
      and (exists(select 1 from internal_proesc.sync_run_items i where i.run_id=r.id and i.polo_id=any(v_polos)) or exists(select 1 from internal_proesc.technical_run_scopes a where a.run_id=r.id and a.polo_ids&&v_polos))),
  events as materialized(select e.mode,'APPLIED'::text result from internal_proesc.reconciliation_events e
    join links l on l.link_id=e.link_id where e.result='APPLIED' and e.mode in ('AUTO','IMPORT','CORRECTION')
      and e.recorded_at>=v_from and e.recorded_at<=v_to
      and e.after_state->>'status'='PAGO' and exists(select 1 from internal_proesc.financial_snapshots s
        where s.id=e.snapshot_id and s.source_status='PAID' and s.verification='VERIFIED'))
  select jsonb_build_object('available',true,
    'configured',exists(select 1 from internal_proesc.connection_v2 where id and token_secret_id is not null),
    'canViewReceivableDetails',public.gestor_has_module('financeiro') and public.gestor_has_financeiro_tab('receber'),
    'selectedPoloId',p_polo_id,'period',jsonb_build_object('startedFrom',v_from,'startedTo',v_to),
    'polos',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',concat_ws(' · ',p.nome,p.cidade)) order by p.cidade),'[]'::jsonb)
      from public.polos p where p.id=any(public.gestor_allowed_polo_ids())),
    'historyStartedAt',(select min(started_at) from internal_proesc.sync_runs),
    'monitor',internal_proesc.v2_monitor_state(p_polo_id),
    'totals',jsonb_build_object('monitored',(select count(*) from links),
      'autoEnabled',(select count(*) from links where auto_enabled),
      'observations',(select count(*) from observations),'review',(select count(*) from observations where verification='REVIEW'),
      'appliedAuto',(select count(*) from events where result='APPLIED' and mode='AUTO'),
      'appliedImport',(select count(*) from events where result='APPLIED' and mode in ('IMPORT','CORRECTION')),
      'failedRuns',(select count(*) from runs where status in ('FAILED','PARTIAL','ABANDONED')),
      'httpRequests',case when p_polo_id is null then (select coalesce(sum(h.total),0) from internal_proesc.sync_run_http_counts h join runs r on r.id=h.run_id) end),
    'capabilities',jsonb_build_object('executionHistoryVersion','v1','monitorVersion','v2','runHistory',true,'httpHistory',true,'observationHistory',true,'settlementHistory',true,
      'historicalRunsReconstructed',false,'httpMetricsScope','GLOBAL_SHARED_WORKER')
  ) into v_result;
  return v_result;
end;
$function$;

NOTIFY pgrst,'reload schema';
COMMIT;
