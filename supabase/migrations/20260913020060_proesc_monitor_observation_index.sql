begin;

-- The dashboard and observation feed need these narrow columns for all rows in
-- the period. Avoid scanning the heap containing the full accounting payload.
create index proesc_monitor_observations_cover_idx
  on internal_proesc.financial_snapshots(observed_at desc,id desc)
  include(link_id,verification);

-- Every event admitted by this CTE already has result APPLIED. Project that
-- proven constant, allowing the covering paid-event index to serve the count
-- without fetching each event heap tuple just to reread its result column.
create or replace function public.get_proesc_reconciliation_dashboard(
  p_polo_id uuid default null,p_started_from timestamptz default null,p_started_to timestamptz default null
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_polos uuid[]; v_from timestamptz; v_to timestamptz; v_result jsonb;
begin
  v_polos:=internal_proesc.monitor_scope(p_polo_id);
  select started_from,started_to into v_from,v_to from internal_proesc.monitor_period(p_started_from,p_started_to);
  with links as materialized(select * from internal_proesc.monitor_links(v_polos)),
  observations as materialized(select s.id,s.verification from internal_proesc.financial_snapshots s
    join links l on l.link_id=s.link_id where s.observed_at>=v_from and s.observed_at<=v_to),
  runs as materialized(select r.* from internal_proesc.sync_runs r
    where r.started_at>=v_from and r.started_at<=v_to
      and exists(select 1 from internal_proesc.sync_run_items i where i.run_id=r.id and i.polo_id=any(v_polos))),
  events as materialized(select e.mode,'APPLIED'::text result from internal_proesc.reconciliation_events e
    join links l on l.link_id=e.link_id where e.result='APPLIED' and e.mode in ('AUTO','IMPORT','CORRECTION')
      and e.recorded_at>=v_from and e.recorded_at<=v_to
      and e.after_state->>'status'='PAGO' and exists(select 1 from internal_proesc.financial_snapshots s
        where s.id=e.snapshot_id and s.source_status='PAID' and s.verification='VERIFIED'))
  select jsonb_build_object('available',true,
    'configured',exists(select 1 from internal_proesc.connection where id and secret_id is not null),
    'canViewReceivableDetails',public.gestor_has_module('financeiro') and public.gestor_has_financeiro_tab('receber'),
    'selectedPoloId',p_polo_id,'period',jsonb_build_object('startedFrom',v_from,'startedTo',v_to),
    'polos',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',concat_ws(' · ',p.nome,p.cidade)) order by p.cidade),'[]'::jsonb)
      from public.polos p where p.id=any(public.gestor_allowed_polo_ids())),
    'historyStartedAt',(select min(started_at) from internal_proesc.sync_runs),
    'monitor',(select jsonb_build_object('enabled',r.enabled,
      'schedule',(select schedule from cron.job where jobname='proesc-confirmed-obligations' limit 1),
      'running',coalesce(r.lease_until>now(),false),'leaseExpired',coalesce(r.lease_until<=now(),false),
      'lastStartedAt',r.last_started_at,'lastFinishedAt',r.last_finished_at,
      'lastDurationMs',case when r.last_finished_at>=r.last_started_at
        then round(extract(epoch from r.last_finished_at-r.last_started_at)*1000) end,
      'lastCounts',case when p_polo_id is null then jsonb_build_object(
        'consulted',r.last_result->'consulted','applied',r.last_result->'applied','unchanged',r.last_result->'unchanged',
        'review',r.last_result->'review','failed',r.last_result->'failed') end,
      'metricsScope','GLOBAL_SHARED_WORKER') from internal_proesc.sync_runtime r where id),
    'totals',jsonb_build_object('monitored',(select count(*) from links),
      'autoEnabled',(select count(*) from links where auto_enabled),
      'observations',(select count(*) from observations),'review',(select count(*) from observations where verification='REVIEW'),
      'appliedAuto',(select count(*) from events where result='APPLIED' and mode='AUTO'),
      'appliedImport',(select count(*) from events where result='APPLIED' and mode in ('IMPORT','CORRECTION')),
      'failedRuns',(select count(*) from runs where status in ('FAILED','PARTIAL','ABANDONED')),
      'httpRequests',case when p_polo_id is null then (select count(*) from internal_proesc.sync_run_http h join runs r on r.id=h.run_id) end),
    'capabilities',jsonb_build_object('runHistory',true,'httpHistory',true,'observationHistory',true,'settlementHistory',true,
      'historicalRunsReconstructed',false,'httpMetricsScope','GLOBAL_SHARED_WORKER')
  ) into v_result;
  return v_result;
end;
$$;

notify pgrst,'reload schema';
commit;
