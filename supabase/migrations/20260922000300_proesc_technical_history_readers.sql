-- Keep monitor scope, pagination and financial identities independent of cold technical payloads.
-- The archive manifest is server-only and retains only the indexes needed by these SQL readers.
DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.get_proesc_reconciliation_dashboard(uuid,timestamptz,timestamptz)'::regprocedure))
      <> '36ed039001c006ee1c930a7765ea6aac'
    OR md5(pg_get_functiondef('public.get_proesc_reconciliation_feed_page(text,uuid,uuid,timestamptz,timestamptz,integer,integer)'::regprocedure))
      <> '6107162caa75b64ea7c73e38d9c5b17a' THEN
    RAISE EXCEPTION 'Monitor Proesc alterado; revisar os leitores antes de arquivar.';
  END IF;
END;
$guard$;

CREATE VIEW internal_proesc.technical_run_scopes WITH (security_invoker=true) AS
SELECT run_id,polo_ids FROM internal_proesc.packed_run_items
UNION ALL
SELECT run_id,polo_ids FROM internal_proesc.archived_technical_runs
UNION ALL
SELECT run_id,ARRAY[polo_id] FROM internal_proesc.run_reused_observation_counts;

CREATE OR REPLACE FUNCTION internal_proesc.runs_for_observation(p_snapshot_id uuid)
RETURNS TABLE(run_id uuid) LANGUAGE sql STABLE SET search_path='' AS $function$
  SELECT i.run_id FROM internal_proesc.sync_run_items i WHERE coalesce(i.original_snapshot_id,i.snapshot_id)=p_snapshot_id
  UNION
  SELECT a.run_id FROM internal_proesc.packed_run_items a WHERE a.original_snapshot_ids@>ARRAY[p_snapshot_id]
  UNION
  SELECT a.run_id FROM internal_proesc.archived_technical_runs a WHERE a.original_snapshot_ids@>ARRAY[p_snapshot_id];
$function$;

CREATE FUNCTION internal_proesc.run_observation_ids(p_run_id uuid)
RETURNS TABLE(snapshot_id uuid) LANGUAGE sql STABLE SET search_path='' AS $function$
  SELECT coalesce(i.original_snapshot_id,i.snapshot_id) FROM internal_proesc.sync_run_items i
    WHERE i.run_id=p_run_id AND coalesce(i.original_snapshot_id,i.snapshot_id) IS NOT NULL
  UNION
  SELECT unnest(original_snapshot_ids) FROM internal_proesc.packed_run_items WHERE run_id=p_run_id
  UNION
  SELECT unnest(original_snapshot_ids) FROM internal_proesc.archived_technical_runs WHERE run_id=p_run_id;
$function$;

CREATE OR REPLACE FUNCTION internal_proesc.run_item_counts(p_run_id uuid,p_polo_ids uuid[])
RETURNS TABLE(claimed bigint,consulted bigint,applied bigint,unchanged bigint,review bigint,failed bigint)
LANGUAGE sql STABLE SET search_path='' AS $function$
  SELECT coalesce(sum(c.claimed),0)::bigint,coalesce(sum(c.consulted),0)::bigint,
    coalesce(sum(c.applied),0)::bigint,coalesce(sum(c.unchanged),0)::bigint,
    coalesce(sum(c.review),0)::bigint,coalesce(sum(c.failed),0)::bigint FROM (
    SELECT count(*) claimed,count(*) FILTER(WHERE snapshot_id IS NOT NULL) consulted,
      count(*) FILTER(WHERE result='APPLIED') applied,count(*) FILTER(WHERE result='UNCHANGED') unchanged,
      count(*) FILTER(WHERE result='REVIEW') review,count(*) FILTER(WHERE result='FAILED') failed
    FROM internal_proesc.sync_run_items WHERE run_id=p_run_id AND polo_id=ANY(p_polo_ids)
    UNION ALL
    SELECT sum(reused_count),sum(reused_count),0::bigint,sum(reused_count),0::bigint,0::bigint
    FROM internal_proesc.run_reused_observation_counts WHERE run_id=p_run_id AND polo_id=ANY(p_polo_ids)
    UNION ALL
    SELECT sum(s.reused_count),sum(s.reused_count),0::bigint,sum(s.reused_count),0::bigint,0::bigint
    FROM internal_proesc.archived_technical_runs a
    CROSS JOIN LATERAL jsonb_to_recordset(a.reused_counts) s(polo_id uuid,reused_count integer)
    WHERE a.run_id=p_run_id AND s.polo_id=ANY(p_polo_ids)
    UNION ALL
    SELECT s.claimed,s.consulted,s.applied,s.unchanged,s.review,s.failed FROM (
      SELECT scoped_counts FROM internal_proesc.packed_run_items WHERE run_id=p_run_id
      UNION ALL
      SELECT scoped_counts FROM internal_proesc.archived_technical_runs WHERE run_id=p_run_id
    ) a CROSS JOIN LATERAL jsonb_to_recordset(a.scoped_counts)
      s(polo_id uuid,claimed bigint,consulted bigint,applied bigint,unchanged bigint,review bigint,failed bigint)
    WHERE s.polo_id=ANY(p_polo_ids)
  ) c;
$function$;

CREATE OR REPLACE VIEW internal_proesc.sync_run_item_errors WITH (security_invoker=true) AS
SELECT * FROM internal_proesc.sync_run_items WHERE error_code IS NOT NULL
UNION ALL
SELECT a.run_id,i.link_id,i.position,i.polo_id,i.class_id,i.snapshot_id,i.result,i.stage,
  i.error_code,i.recorded_at,i.original_snapshot_id
FROM (
  SELECT run_id,error_records FROM internal_proesc.packed_run_items
  UNION ALL
  SELECT run_id,error_records FROM internal_proesc.archived_technical_runs
) a CROSS JOIN LATERAL jsonb_populate_recordset(NULL::internal_proesc.sync_run_items,a.error_records) i;

CREATE OR REPLACE VIEW internal_proesc.sync_run_http_counts WITH (security_invoker=true) AS
SELECT run_id,count(*) AS total,count(*) FILTER(WHERE error_code IS NOT NULL) AS failed
FROM internal_proesc.sync_run_http GROUP BY run_id
UNION ALL
SELECT run_id,row_count::bigint,0::bigint FROM internal_proesc.packed_run_http
UNION ALL
SELECT run_id,http_row_count::bigint,0::bigint FROM internal_proesc.archived_technical_runs WHERE http_row_count>0;

REVOKE ALL ON internal_proesc.technical_run_scopes,
  internal_proesc.sync_run_item_errors,internal_proesc.sync_run_http_counts FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION internal_proesc.run_observation_ids(uuid),
  internal_proesc.runs_for_observation(uuid),internal_proesc.run_item_counts(uuid,uuid[])
  FROM PUBLIC,anon,authenticated,service_role;

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
      'httpRequests',case when p_polo_id is null then (select coalesce(sum(h.total),0) from internal_proesc.sync_run_http_counts h join runs r on r.id=h.run_id) end),
    'capabilities',jsonb_build_object('runHistory',true,'httpHistory',true,'observationHistory',true,'settlementHistory',true,
      'historicalRunsReconstructed',false,'httpMetricsScope','GLOBAL_SHARED_WORKER')
  ) into v_result;
  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_proesc_reconciliation_feed_page(p_context text DEFAULT 'runs'::text, p_polo_id uuid DEFAULT NULL::uuid, p_run_id uuid DEFAULT NULL::uuid, p_started_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_started_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_page integer DEFAULT 1, p_page_size integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_polos uuid[]; v_from timestamptz; v_to timestamptz;
  v_context text:=lower(coalesce(p_context,'runs'));
  v_page integer:=greatest(1,coalesce(p_page,1));
  v_size integer:=greatest(1,least(100,coalesce(p_page_size,20)));
  v_details boolean; v_items jsonb:='[]'; v_total bigint:=0;
begin
  v_polos:=internal_proesc.monitor_scope(p_polo_id);
  select started_from,started_to into v_from,v_to from internal_proesc.monitor_period(p_started_from,p_started_to);
  v_details:=public.gestor_has_module('financeiro') and public.gestor_has_financeiro_tab('receber');
  if v_context not in ('runs','observations','settlements','errors') or v_page>100000 then
    raise exception 'Filtro de consulta inválido.' using errcode='22023'; end if;

  if v_context='runs' then
    with filtered as materialized(
      select r.* from internal_proesc.sync_runs r
      where r.started_at>=v_from and r.started_at<=v_to and (p_run_id is null or r.id=p_run_id)
        and (exists(select 1 from internal_proesc.sync_run_items i where i.run_id=r.id and i.polo_id=any(v_polos)) or exists(select 1 from internal_proesc.technical_run_scopes a where a.run_id=r.id and a.polo_ids&&v_polos))
    ), page as materialized(select * from filtered order by started_at desc,id desc limit v_size offset (v_page::bigint-1)*v_size)
    select (select count(*) from filtered),coalesce(jsonb_agg(jsonb_build_object(
      'id',r.id,'startedAt',r.started_at,'finishedAt',r.finished_at,'status',r.status,'durationMs',r.duration_ms,
      'claimed',case when p_polo_id is null then r.claimed else scoped.claimed end,
      'consulted',case when p_polo_id is null then r.consulted else scoped.consulted end,
      'applied',case when p_polo_id is null then r.applied else scoped.applied end,
      'unchanged',case when p_polo_id is null then r.unchanged else scoped.unchanged end,
      'review',case when p_polo_id is null then r.review else scoped.review end,
      'failed',case when p_polo_id is null then r.failed else scoped.failed end,
      'httpRequests',case when p_polo_id is null and (r.telemetry_complete or http.total>0) then http.total end,
      'httpFailed',case when p_polo_id is null and (r.telemetry_complete or http.total>0) then http.failed end,
      'errorCode',r.error_code,'errorMessage',internal_proesc.sync_error_message(r.error_code),'stage',r.stage,
      'telemetryComplete',r.telemetry_complete,'metricsScope',case when p_polo_id is null then 'GLOBAL' else 'POLO_ITEMS_SHARED_EXECUTION' end
    ) order by r.started_at desc,r.id desc),'[]'::jsonb) into v_total,v_items
    from page r
    cross join lateral internal_proesc.run_item_counts(r.id,v_polos) scoped
    cross join lateral(select coalesce(sum(total),0) total,coalesce(sum(failed),0) failed
      from internal_proesc.sync_run_http_counts h where h.run_id=r.id) http;

  elsif v_context='observations' then
    with links as materialized(select * from internal_proesc.monitor_links(v_polos)),
    filtered as materialized(
      select s.id,s.link_id,s.observed_at from (
        select h.id,h.link_id,h.observed_at from internal_proesc.financial_observation_history h
        where p_run_id is null and h.observed_at>=v_from and h.observed_at<=v_to
        union all
        select h.id,h.link_id,h.observed_at from internal_proesc.run_observation_ids(p_run_id) i
        cross join lateral(select h.id,h.link_id,h.observed_at
          from internal_proesc.financial_observation_history h
          where h.id=i.snapshot_id offset 0) h
        where p_run_id is not null
          and h.observed_at>=v_from and h.observed_at<=v_to
      ) s join links l on l.link_id=s.link_id),
    page as materialized(select * from filtered order by observed_at desc,id desc limit v_size offset (v_page::bigint-1)*v_size)
    select (select count(*) from filtered),coalesce(jsonb_agg(jsonb_build_object(
      'id',s.id,'observedAt',s.observed_at,'recordedAt',s.recorded_at,
      'runId',(select i.run_id from internal_proesc.runs_for_observation(s.id) i
        join internal_proesc.sync_runs r on r.id=i.run_id order by r.started_at desc limit 1),
      'classId',t.id,'classCode',t.codigo,'className',t.nome,'poloId',p.id,'poloName',concat_ws(' · ',p.nome,p.cidade),
      'sourceStatus',s.source_status,'verification',s.verification,
      'reviewReasons',(select coalesce(jsonb_agg(reason),'[]'::jsonb) from jsonb_array_elements_text(s.review_reasons) reason
        where reason in ('PRINCIPAL_DIVERGENTE','ESTADO_REQUER_REVISAO','PAGAMENTO_INCOMPLETO',
          'MULTIPLICIDADE_OU_AUSENCIA_PAGAMENTO','PRINCIPAL_NAO_CONFIRMADO','PAGAMENTO_NAO_CONFIRMADO',
          'COMPONENTES_NAO_COMPROVADOS','ABERTO_COM_PAGAMENTO_INCOERENTE','HISTORICO_ABERTO_NAO_COMPROVADO','SEM_CONFIRMACAO'))
    ) || case when v_details then jsonb_build_object('receivableId',l.receivable_id,
      'studentName',student.nome,'description',c.descricao,'externalKey',source_link.source_key,
      'principalAmount',s.principal_cents::numeric/100,
      'receivedAmount',case when s.verification='VERIFIED' then s.received_cents::numeric/100 end,
      'paymentDate',case when s.verification='VERIFIED' then s.payment_date end)
      else '{}'::jsonb end order by s.observed_at desc,s.id desc),'[]'::jsonb) into v_total,v_items
    from page selected cross join lateral(select h.* from internal_proesc.financial_observation_history h
      where h.id=selected.id offset 0) s
    join links l on l.link_id=s.link_id join public.turmas t on t.id=l.class_id join public.polos p on p.id=l.polo_id
    join internal_proesc.obligation_links source_link on source_link.id=l.link_id
    join public.contas_receber c on c.id=l.receivable_id
    left join public.matriculas m on m.id=c.matricula_id left join public.parceiros student on student.id=m.aluno_id;

  elsif v_context='settlements' then
    with links as materialized(select * from internal_proesc.monitor_links(v_polos)),
    filtered as materialized(select e.id,e.link_id,e.recorded_at from internal_proesc.reconciliation_events e
      join links l on l.link_id=e.link_id
      where e.result='APPLIED' and e.mode in ('AUTO','IMPORT','CORRECTION')
        and e.after_state->>'status'='PAGO' and exists(select 1 from internal_proesc.financial_snapshots s
          where s.id=e.snapshot_id and s.source_status='PAID' and s.verification='VERIFIED')
        and e.recorded_at>=v_from and e.recorded_at<=v_to
        and (p_run_id is null or exists(select 1 from internal_proesc.runs_for_observation(coalesce(e.original_snapshot_id,e.snapshot_id)) i
          where i.run_id=p_run_id))),
    page as materialized(select * from filtered order by recorded_at desc,id desc limit v_size offset (v_page::bigint-1)*v_size)
    select (select count(*) from filtered),coalesce(jsonb_agg(jsonb_build_object(
      'id',e.id,'recordedAt',e.recorded_at,'mode',e.mode,'result',e.result,
      'classCode',t.codigo,'poloName',concat_ws(' · ',p.nome,p.cidade)
    ) || case when v_details then jsonb_build_object('receivableId',l.receivable_id,
      'studentName',student.nome,'description',c.descricao,'externalKey',source_link.source_key,
      'principalAmount',e.after_state->'valor','receivedAmount',e.after_state->'valor_pago','paymentDate',e.after_state->'data_pagamento')
      else '{}'::jsonb end order by e.recorded_at desc,e.id desc),'[]'::jsonb) into v_total,v_items
    from page selected join internal_proesc.reconciliation_events e on e.id=selected.id
    join links l on l.link_id=e.link_id join public.turmas t on t.id=l.class_id join public.polos p on p.id=l.polo_id
    join internal_proesc.obligation_links source_link on source_link.id=l.link_id
    join public.contas_receber c on c.id=l.receivable_id
    left join public.matriculas m on m.id=c.matricula_id left join public.parceiros student on student.id=m.aluno_id;

  else
    with runs as materialized(select r.* from internal_proesc.sync_runs r
      where (p_run_id is null or r.id=p_run_id)
        and (exists(select 1 from internal_proesc.sync_run_items i where i.run_id=r.id and i.polo_id=any(v_polos)) or exists(select 1 from internal_proesc.technical_run_scopes a where a.run_id=r.id and a.polo_ids&&v_polos))),
    errors as materialized(
      select concat(h.run_id,':http:',h.source_unit_id,':',h.source_year,':',h.source_month) id,h.run_id,
        h.recorded_at,'FETCH'::text stage,h.error_code,h.http_status,h.duration_ms,null::uuid class_id,null::uuid polo_id,null::uuid link_id
      from internal_proesc.sync_run_http_history h join runs r on r.id=h.run_id where h.error_code is not null
      union all
      select concat(i.run_id,':item:',i.link_id),i.run_id,i.recorded_at,i.stage,i.error_code,null::integer,null::integer,i.class_id,i.polo_id,i.link_id
      from internal_proesc.sync_run_item_errors i join runs r on r.id=i.run_id where i.error_code is not null and i.polo_id=any(v_polos)
      union all
      select concat(r.id,':run'),r.id,coalesce(r.finished_at,r.abandoned_at),r.stage,r.error_code,null::integer,r.duration_ms,null::uuid,null::uuid,null::uuid
      from runs r where r.error_code is not null
        and not exists(select 1 from internal_proesc.sync_run_http_history h where h.run_id=r.id and h.error_code is not null)
        and not exists(select 1 from internal_proesc.sync_run_item_errors i where i.run_id=r.id and i.error_code is not null)
    ), filtered as materialized(select * from errors where recorded_at>=v_from and recorded_at<=v_to),
    page as materialized(select * from filtered order by recorded_at desc,id desc limit v_size offset (v_page::bigint-1)*v_size)
    select (select count(*) from filtered),coalesce(jsonb_agg(jsonb_build_object(
      'id',e.id,'runId',e.run_id,'recordedAt',e.recorded_at,'stage',e.stage,'errorCode',e.error_code,
      'errorMessage',internal_proesc.sync_error_message(e.error_code),'httpStatus',e.http_status,'durationMs',e.duration_ms,
      'classCode',t.codigo,'poloName',case when p.id is not null then concat_ws(' · ',p.nome,p.cidade) end,
      'metricsScope',case when e.polo_id is null then 'GLOBAL_SHARED_WORKER' else 'OBLIGATION' end
    ) || case when v_details and e.link_id is not null then jsonb_build_object(
      'receivableId',source_link.receivable_id,'studentName',student.nome,'description',c.descricao,'externalKey',source_link.source_key)
      else '{}'::jsonb end order by e.recorded_at desc,e.id desc),'[]'::jsonb) into v_total,v_items
    from page e left join public.turmas t on t.id=e.class_id left join public.polos p on p.id=e.polo_id
    left join internal_proesc.obligation_links source_link on source_link.id=e.link_id
    left join public.contas_receber c on c.id=source_link.receivable_id
    left join public.matriculas m on m.id=c.matricula_id left join public.parceiros student on student.id=m.aluno_id;
  end if;
  return jsonb_build_object('items',v_items,'page',v_page,'pageSize',v_size,'totalCount',v_total,
    'totalPages',greatest(1,ceil(v_total::numeric/v_size)::integer),'context',v_context,
    'period',jsonb_build_object('startedFrom',v_from,'startedTo',v_to),'canViewReceivableDetails',v_details);
end;
$function$;
