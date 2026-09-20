BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='45s';
DO $test$
DECLARE
  v_result jsonb; v_snapshot internal_proesc.financial_snapshots;
  v_keeper uuid; v_link uuid; v_actor uuid; v_auth uuid; v_receivable public.contas_receber;
  v_request uuid:=gen_random_uuid(); v_apply_request uuid:=gen_random_uuid();
  v_payload jsonb:='{"fixture":"lossless-observation-replay"}';
  v_hash_before text; v_hash_after text; v_items_before text; v_items_after text;
  v_run uuid; v_feed jsonb;
BEGIN
  SELECT updated_by INTO STRICT v_actor FROM internal_proesc.connection WHERE id;
  SELECT auth_user_id INTO STRICT v_auth FROM public.usuarios_sistema WHERE id=v_actor;
  SELECT id INTO STRICT v_link FROM internal_proesc.obligation_links ORDER BY id LIMIT 1 FOR UPDATE;
  SELECT md5(string_agg(md5(to_jsonb(h)::text),'' ORDER BY h.id)) INTO v_hash_before
    FROM internal_proesc.financial_observation_history h WHERE link_id=v_link;
  -- Filter JSON before typed reconstruction: the history view otherwise converts every
  -- archived item before applying link_id. Still hash current contents, never manifests.
  SELECT md5(string_agg(concat_ws(':',run_id,polo_id,(snapshot_id IS NOT NULL)::text,result),'' ORDER BY run_id))
    INTO v_items_before FROM (
      SELECT run_id,polo_id,snapshot_id,result FROM internal_proesc.sync_run_items WHERE link_id=v_link
      UNION ALL
      SELECT a.run_id,i.polo_id,i.snapshot_id,i.result FROM internal_proesc.packed_run_items a
      CROSS JOIN LATERAL jsonb_populate_recordset(NULL::internal_proesc.sync_run_items,
        jsonb_path_query_array(a.records,'$[*] ? (@.link_id == $link)',
          jsonb_build_object('link',v_link::text))) i
    ) items;
  UPDATE internal_proesc.storage_compaction_state SET cursor_id=NULL WHERE singleton;
  v_result:=internal_proesc.compact_snapshot_observations(1);
  ASSERT v_result->>'historyVerified'='true','History verification did not complete';
  -- Also rerunnable after the initial production consolidation has completed.
  ASSERT EXISTS(SELECT 1 FROM internal_proesc.compacted_snapshot_observations a
    JOIN internal_proesc.financial_snapshots k ON k.id=a.keeper_snapshot_id WHERE k.link_id=v_link),
    'No representative consolidated observation is available';
  SELECT h.* INTO STRICT v_snapshot FROM internal_proesc.financial_observation_history h
    JOIN internal_proesc.compacted_snapshot_observations a ON a.id=h.id
    WHERE h.link_id=v_link ORDER BY h.observed_at LIMIT 1;
  SELECT keeper_snapshot_id INTO STRICT v_keeper
    FROM internal_proesc.compacted_snapshot_observations WHERE id=v_snapshot.id;
  ASSERT EXISTS(SELECT 1 FROM internal_proesc.financial_snapshots WHERE id=v_keeper),'Keeper missing';
  BEGIN
    UPDATE internal_proesc.financial_snapshots SET source_fingerprint=repeat('f',64) WHERE id=v_keeper;
    RAISE EXCEPTION 'Shared evidence mutation accepted';
  EXCEPTION WHEN SQLSTATE '40001' THEN NULL; END;
  SELECT md5(string_agg(concat_ws(':',run_id,polo_id,(snapshot_id IS NOT NULL)::text,result),'' ORDER BY run_id))
    INTO v_items_after FROM (
      SELECT run_id,polo_id,snapshot_id,result FROM internal_proesc.sync_run_items WHERE link_id=v_link
      UNION ALL
      SELECT a.run_id,i.polo_id,i.snapshot_id,i.result FROM internal_proesc.packed_run_items a
      CROSS JOIN LATERAL jsonb_populate_recordset(NULL::internal_proesc.sync_run_items,
        jsonb_path_query_array(a.records,'$[*] ? (@.link_id == $link)',
          jsonb_build_object('link',v_link::text))) i
    ) items;
  ASSERT v_items_before=v_items_after,'Execution or polo metrics changed';
  ASSERT NOT EXISTS(SELECT 1 FROM internal_proesc.enrollment_financial_confirmations c,
    LATERAL jsonb_array_elements(c.confirmed_snapshots) item
    JOIN internal_proesc.compacted_snapshot_observations a ON a.id=(item->>'snapshotId')::uuid),
    'Confirmed evidence was compacted';

  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','service_role')::text,true);
  INSERT INTO internal_proesc.reconciliation_requests(request_id,action,actor_id,payload_hash,response,completed_at)
  VALUES(v_request,'SNAPSHOT',v_actor,encode(extensions.digest(v_payload::text,'sha256'),'hex'),
    jsonb_build_object('snapshotId',v_snapshot.id,'replayed',false),now());
  v_result:=public.proesc_record_financial_snapshot_service(v_actor,v_request,v_payload);
  ASSERT (v_result->>'snapshotId')::uuid=v_snapshot.id AND v_result->>'replayed'='true',
    'Archived observation replay changed identity';
  BEGIN
    PERFORM public.proesc_record_financial_snapshot_service(v_actor,v_request,v_payload||'{"changed":true}');
    RAISE EXCEPTION 'Different replay payload accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;

  SELECT i.run_id INTO STRICT v_run FROM internal_proesc.runs_for_observation(v_snapshot.id) i
    JOIN internal_proesc.sync_runs r ON r.id=i.run_id ORDER BY r.started_at DESC LIMIT 1;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_auth)::text,true);
  PERFORM set_config('request.jwt.claim.sub',v_auth::text,true);
  v_feed:=public.get_proesc_reconciliation_feed_page('observations',NULL,v_run,now()-interval '8 days',now(),1,100);
  ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(v_feed->'items') item WHERE (item->>'id')::uuid=v_snapshot.id
    AND (item->>'observedAt')::timestamptz=v_snapshot.observed_at AND (item->>'runId')::uuid=v_run),
    'Monitor lost original observation identity or consultation time';
  v_feed:=public.get_proesc_reconciliation_feed_page('settlements',NULL,v_run,now()-interval '8 days',now(),1,100);
  ASSERT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_feed->'items') item
    JOIN internal_proesc.reconciliation_events e ON e.id=(item->>'id')::uuid
    WHERE NOT EXISTS(SELECT 1 FROM internal_proesc.sync_run_item_history i WHERE i.run_id=v_run
      AND coalesce(i.original_snapshot_id,i.snapshot_id)=coalesce(e.original_snapshot_id,e.snapshot_id))),
    'Historical settlement attributed to a later unchanged run';

  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  SELECT c.* INTO STRICT v_receivable FROM public.contas_receber c
    JOIN internal_proesc.obligation_links l ON l.receivable_id=c.id WHERE l.id=v_link FOR UPDATE OF c;
  v_result:=public.proesc_apply_financial_snapshot_service(v_actor,v_apply_request,
    jsonb_build_object('snapshotId',v_snapshot.id,'mode','IMPORT',
      'expectedBefore',internal_proesc.receivable_fingerprint(v_receivable)));
  ASSERT v_result->>'result'='REVIEW','Superseded observation was applied';
  ASSERT EXISTS(SELECT 1 FROM internal_proesc.financial_snapshots WHERE id=v_snapshot.id)
    AND NOT EXISTS(SELECT 1 FROM internal_proesc.compacted_snapshot_observations WHERE id=v_snapshot.id),
    'Archived evidence was not restored before creating a relevant event';
  ASSERT (SELECT to_jsonb(c)=to_jsonb(v_receivable) FROM public.contas_receber c WHERE id=v_receivable.id),
    'Financial record changed during historical review';
  SELECT md5(string_agg(md5(to_jsonb(h)::text),'' ORDER BY h.id)) INTO v_hash_after
    FROM internal_proesc.financial_observation_history h WHERE link_id=v_link;
  ASSERT v_hash_before=v_hash_after,'Observation history changed after consolidation/replay/rehydration';
END;
$test$;
ROLLBACK;
