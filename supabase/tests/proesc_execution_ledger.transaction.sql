-- Explicit rollback rehearsal: only telemetry/runtime state changes; no HTTP,
-- token reads, source queries, receivable writes or persisted fixture records.
begin;
set local app.proesc_test_rollback='on';
do $ledger_rehearsal$
declare
  v_actor uuid;
  v_link uuid;
  v_lease uuid:=gen_random_uuid();
  v_old uuid;
  v_payload jsonb;
  v_result jsonb;
  v_before text;
  v_after text;
  v_base_count bigint;
begin
  assert current_setting('app.proesc_test_rollback',true)='on','Rollback rehearsal required';
  perform 1 from internal_proesc.sync_runtime where id for update;
  if exists(select 1 from internal_proesc.sync_runtime where id and lease_until>now()) then
    raise exception 'Há execução ativa; repetir o ensaio após sua conclusão.' using errcode='40001'; end if;
  select updated_by into strict v_actor from internal_proesc.connection where id;
  select l.id into strict v_link from internal_proesc.obligation_links l
    where internal_proesc.sync_link_allowed(l.id) order by l.id limit 1;
  select count(*) into v_base_count from internal_proesc.sync_runs;
  select md5(string_agg(concat_ws(':',id,status,valor,valor_pago,data_pagamento,conta_bancaria_id),',' order by id))
    into v_before from public.contas_receber;
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claim.sub','',true);
  update internal_proesc.sync_runtime set enabled=true,lease_id=v_lease,lease_until=now()+interval '3 minutes',
    lease_links=array[v_link],lease_last_id=v_link,last_started_at=now(),
    credential_revision=(select revision from internal_proesc.connection where id) where id;
  perform internal_proesc.start_sync_run(v_actor,v_lease);
  v_result:=public.proesc_sync_runtime_service('claim',v_actor,'{}');
  assert v_result->>'claimed'='false','Overlapping lease accepted';
  v_payload:=jsonb_build_object('leaseId',v_lease,'lastId',v_link,'completedCount',0,'completedLastId',null,
    'success',false,'counts',jsonb_build_object('consulted',0,'applied',0,'unchanged',0,'review',0,'failed',1),
    'telemetry',jsonb_build_object('http','[]'::jsonb,'items','[]'::jsonb,'errorCode','TIMEOUT','stage','FETCH'));
  begin
    perform public.proesc_sync_runtime_service('finish',v_actor,jsonb_set(v_payload,'{telemetry,token}','"FORBIDDEN_TEST_FIELD"'));
    raise exception 'Unrecognized telemetry field accepted';
  exception when sqlstate '22023' then null; end;
  assert (select status='RUNNING' from internal_proesc.sync_runs where id=v_lease),'Rejected telemetry partially finished run';
  perform public.proesc_sync_runtime_service('finish',v_actor,v_payload);
  assert (select status='FAILED' and error_code='TIMEOUT' and finished_at is not null
    and duration_ms>=0 and not telemetry_complete from internal_proesc.sync_runs where id=v_lease),'Timeout result was not durable';
  assert (select result='NOT_RECORDED' from internal_proesc.sync_run_items where run_id=v_lease),'Missing outcomes were fabricated';
  begin
    perform public.proesc_sync_runtime_service('finish',v_actor,v_payload);
    raise exception 'Finished lease replay unexpectedly accepted';
  exception when sqlstate '40001' then null; end;
  assert (select count(*)=v_base_count+1 from internal_proesc.sync_runs),'Retry duplicated an execution';

  -- The old worker may finish during deployment without the new telemetry.
  v_lease:=gen_random_uuid();
  update internal_proesc.sync_runtime set lease_id=v_lease,lease_until=now()+interval '3 minutes',
    lease_links=array[v_link],lease_last_id=v_link,last_started_at=now(),
    credential_revision=(select revision from internal_proesc.connection where id) where id;
  perform internal_proesc.start_sync_run(v_actor,v_lease);
  perform public.proesc_sync_runtime_service('finish',v_actor,jsonb_build_object('leaseId',v_lease,'lastId',v_link,
    'success',true,'counts',jsonb_build_object('consulted',1,'applied',0,'unchanged',1,'review',0,'failed',0)));
  assert (select status='SUCCEEDED' and not telemetry_complete from internal_proesc.sync_runs where id=v_lease),
    'Deployment gap was mistaken for complete item telemetry';

  -- A later claim records an expired predecessor without inventing its finish time.
  v_old:=gen_random_uuid();
  update internal_proesc.sync_runtime set lease_id=v_old,lease_until=now()+interval '3 minutes',
    lease_links=array[v_link],lease_last_id=v_link,last_started_at=now(),
    credential_revision=(select revision from internal_proesc.connection where id) where id;
  perform internal_proesc.start_sync_run(v_actor,v_old);
  update internal_proesc.sync_runtime set lease_until=now()-interval '1 second' where id;
  update internal_proesc.sync_runs set lease_until=now()-interval '1 second' where id=v_old;
  v_result:=public.proesc_sync_runtime_service('claim',v_actor,'{}');
  assert v_result->>'claimed'='true','New execution blocked by expired lease';
  assert (select status='ABANDONED' and finished_at is null and duration_ms is null
    from internal_proesc.sync_runs where id=v_old),'Abandoned execution has fabricated duration';
  assert (select count(*)=v_base_count+4 from internal_proesc.sync_runs),'Execution ledger count changed unexpectedly';
  select md5(string_agg(concat_ws(':',id,status,valor,valor_pago,data_pagamento,conta_bancaria_id),',' order by id))
    into v_after from public.contas_receber;
  assert v_before=v_after,'Execution logging changed financial records';
end;
$ledger_rehearsal$;
rollback;
