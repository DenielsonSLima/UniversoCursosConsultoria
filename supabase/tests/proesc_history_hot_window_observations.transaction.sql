-- Synthetic observations/runs are rolled back. Run while observation/item maintenance is idle.
-- Also run proesc_lossless_storage.transaction.sql and proesc_items_archive.transaction.sql.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
SET LOCAL plpgsql.check_asserts=on;
DO $test$
DECLARE
  v_link internal_proesc.obligation_links; v_source internal_proesc.financial_snapshots;
  v_snapshot internal_proesc.financial_snapshots; v_restored internal_proesc.financial_snapshots;
  v_ids jsonb:='{}'; v_case record; v_result jsonb; v_actor uuid; v_polo uuid;
  v_run uuid; v_request uuid; v_scope uuid; v_time timestamptz; v_finished timestamptz;
  v_fingerprint text:=encode(extensions.digest(gen_random_uuid()::text,'sha256'),'hex');
  v_before text; v_after text; v_finance jsonb;
BEGIN
  SELECT * INTO STRICT v_link FROM internal_proesc.obligation_links ORDER BY id LIMIT 1 FOR UPDATE;
  SELECT * INTO STRICT v_source FROM internal_proesc.financial_snapshots
    WHERE link_id=v_link.id ORDER BY observed_at DESC LIMIT 1;
  SELECT updated_by INTO STRICT v_actor FROM internal_proesc.connection WHERE id;
  SELECT polo_id INTO STRICT v_polo FROM public.turmas WHERE id=v_link.turma_id;
  SELECT to_jsonb(c) INTO STRICT v_finance FROM public.contas_receber c WHERE id=v_link.receivable_id;
  -- observed_at places this isolated identical-body block after existing physical rows.
  -- recorded_at/finished_at exercise the actual hot-window checks independently.
  FOR v_case IN SELECT * FROM (VALUES
    (1,'FIRST',interval '2 days'),
    (2,'AT_23H59',interval '23 hours 59 minutes'),
    (3,'AT_6H01',interval '6 hours 1 minute'),
    (4,'AT_6H',interval '6 hours'),
    (5,'AT_5H59',interval '5 hours 59 minutes'),
    (6,'PACKED_KEEPER',interval '7 hours'),
    (7,'CONFIRMED',interval '7 hours'),
    (8,'REVIEW_EVENT',interval '7 hours'),
    (9,'RECENT_RUN',interval '7 hours'),
    (10,'ACTIVE_RUN',interval '7 hours'),
    (11,'ERROR_ITEM',interval '7 hours'),
    (12,'FAILED_RUN',interval '7 hours'),
    (13,'APPLIED_EVENT',interval '7 hours'),
    (14,'HISTORY_KEEPER',interval '7 hours'),
    (15,'LAST',interval '7 hours')
  ) boundary(position,label,age) ORDER BY position
  LOOP
    v_time:=now()-v_case.age; v_run:=gen_random_uuid();
    SELECT * INTO v_snapshot FROM jsonb_populate_record(NULL::internal_proesc.financial_snapshots,
      to_jsonb(v_source)||jsonb_build_object('id',gen_random_uuid(),'source_fingerprint',v_fingerprint,
        'observed_at',greatest(now(),v_source.observed_at)+interval '1 day'
          +v_case.position*interval '1 second','recorded_at',v_time));
    INSERT INTO internal_proesc.financial_snapshots SELECT (v_snapshot).*;
    v_ids:=v_ids||jsonb_build_object(v_case.label,v_snapshot.id);
    INSERT INTO internal_proesc.sync_runs
      (id,actor_id,started_at,lease_until,finished_at,status,claimed,consulted,unchanged)
      VALUES(v_run,v_actor,v_time-interval '1 minute',v_time+interval '1 minute',v_time,'SUCCEEDED',1,1,1);
    INSERT INTO internal_proesc.sync_run_items
      (run_id,link_id,position,polo_id,class_id,snapshot_id,result,stage,error_code,recorded_at)
      VALUES(v_run,v_link.id,1,v_polo,v_link.turma_id,v_snapshot.id,'UNCHANGED','APPLY',
        CASE WHEN v_case.label='ERROR_ITEM' THEN internal_proesc.sync_safe_error_code('HTTP_TIMEOUT') END,v_time);
    IF v_case.label IN ('ACTIVE_RUN','RECENT_RUN','FAILED_RUN') THEN
      -- An old successful reference is insufficient while another reference is unsafe.
      -- This exercises NOT EXISTS independently of the positive successful-run guard.
      v_run:=gen_random_uuid();
      v_finished:=CASE WHEN v_case.label='ACTIVE_RUN' THEN NULL
        WHEN v_case.label='RECENT_RUN' THEN now()-interval '5 hours 59 minutes' ELSE v_time END;
      INSERT INTO internal_proesc.sync_runs
        (id,actor_id,started_at,lease_until,finished_at,status,claimed,consulted,unchanged)
        VALUES(v_run,v_actor,v_time-interval '1 minute',now()+interval '1 minute',v_finished,
          CASE v_case.label WHEN 'ACTIVE_RUN' THEN 'RUNNING' WHEN 'FAILED_RUN' THEN 'FAILED'
            ELSE 'SUCCEEDED' END,1,1,1);
      INSERT INTO internal_proesc.sync_run_items
        (run_id,link_id,position,polo_id,class_id,snapshot_id,result,stage,recorded_at)
        VALUES(v_run,v_link.id,1,v_polo,v_link.turma_id,v_snapshot.id,'UNCHANGED','APPLY',v_time);
    END IF;
    IF v_case.label='PACKED_KEEPER' THEN
      INSERT INTO internal_proesc.packed_item_snapshot_refs(snapshot_id) VALUES(v_snapshot.id);
    ELSIF v_case.label='HISTORY_KEEPER' THEN
      INSERT INTO internal_proesc.compacted_snapshot_observations(id,keeper_snapshot_id,observed_at,recorded_at)
        VALUES(gen_random_uuid(),v_snapshot.id,v_snapshot.observed_at+interval '0.5 seconds',v_time);
    ELSIF v_case.label IN ('CONFIRMED','REVIEW_EVENT','APPLIED_EVENT') THEN
      v_request:=gen_random_uuid();
      INSERT INTO internal_proesc.reconciliation_requests
        (request_id,action,actor_id,payload_hash,response,created_at,completed_at)
        VALUES(v_request,'APPLY',v_actor,repeat('a',64),'{"result":"REVIEW","replayed":false}',v_time,v_time);
      IF v_case.label='CONFIRMED' THEN
        SELECT id INTO v_scope FROM internal_proesc.class_scopes WHERE turma_id=v_link.turma_id;
        IF v_scope IS NULL THEN
          -- A valid confirmation fixture must also work before any enrollment is confirmed.
          INSERT INTO internal_proesc.class_scopes
            (source_unit_id,source_class_id,turma_id,polo_id,class_code,financial_mode,phase)
            VALUES('999999999999999999',txid_current()::text,v_link.turma_id,v_polo,
              'six-hour-fixture-'||gen_random_uuid()::text,'INDIVIDUAL_REVIEW','STAGED')
            RETURNING id INTO v_scope;
        END IF;
        INSERT INTO internal_proesc.enrollment_financial_confirmations
          (request_id,matricula_id,scope_id,source_manifest_hash,obligation_count,
            principal_cents,received_cents,confirmed_snapshots,confirmed_by,confirmed_at)
          VALUES(v_request,v_link.matricula_id,v_scope,v_fingerprint,1,v_snapshot.principal_cents,
            coalesce(v_snapshot.received_cents,0),jsonb_build_array(jsonb_build_object('snapshotId',v_snapshot.id)),
            v_actor,v_time);
      ELSE
        INSERT INTO internal_proesc.reconciliation_events(request_id,link_id,snapshot_id,mode,result,recorded_at)
          VALUES(v_request,v_link.id,v_snapshot.id,
            CASE WHEN v_case.label='REVIEW_EVENT' THEN 'IMPORT' ELSE 'AUTO' END,
            CASE WHEN v_case.label='REVIEW_EVENT' THEN 'REVIEW' ELSE 'APPLIED' END,v_time);
      END IF;
    END IF;
  END LOOP;
  SELECT md5(string_agg(to_jsonb(h)::text,'' ORDER BY id)) INTO v_before
    FROM internal_proesc.financial_observation_history h WHERE link_id=v_link.id;
  UPDATE internal_proesc.storage_compaction_state SET cursor_id=NULL WHERE singleton;
  v_result:=internal_proesc.compact_snapshot_observations(1);
  ASSERT v_result->>'historyVerified'='true','Six-hour compaction did not verify exact history';
  ASSERT (v_result->>'compacted')::integer>=2,'Six-hour candidates were not compacted';
  FOR v_case IN SELECT * FROM jsonb_each_text(v_ids)
  LOOP
    IF v_case.key IN ('AT_23H59','AT_6H01') THEN
      ASSERT NOT EXISTS(SELECT 1 FROM internal_proesc.financial_snapshots WHERE id=v_case.value::uuid)
        AND EXISTS(SELECT 1 FROM internal_proesc.compacted_snapshot_observations
          WHERE id=v_case.value::uuid AND keeper_snapshot_id=(v_ids->>'FIRST')::uuid),
        'Eligible interior observation did not preserve its original identity via the first keeper';
    ELSE
      ASSERT EXISTS(SELECT 1 FROM internal_proesc.financial_snapshots WHERE id=v_case.value::uuid)
        AND NOT EXISTS(SELECT 1 FROM internal_proesc.compacted_snapshot_observations WHERE id=v_case.value::uuid),
        'Hot, boundary, latest, first/last, referenced, confirmed or active/error observation was compacted';
    END IF;
  END LOOP;
  SELECT md5(string_agg(to_jsonb(h)::text,'' ORDER BY id)) INTO v_after
    FROM internal_proesc.financial_observation_history h WHERE link_id=v_link.id;
  ASSERT v_before=v_after,'Six-hour compaction changed full observation contents or times';
  ASSERT (SELECT id=(v_ids->>'LAST')::uuid FROM internal_proesc.financial_snapshots
    WHERE link_id=v_link.id ORDER BY observed_at DESC,recorded_at DESC,id DESC LIMIT 1),
    'Latest physical observation was replaced';
  SELECT h.* INTO STRICT v_restored FROM internal_proesc.financial_observation_history h
    WHERE h.id=(v_ids->>'AT_6H01')::uuid;
  PERFORM internal_proesc.rehydrate_financial_snapshot(v_restored);
  ASSERT (SELECT to_jsonb(s)=to_jsonb(v_restored) FROM internal_proesc.financial_snapshots s WHERE id=v_restored.id)
    AND NOT EXISTS(SELECT 1 FROM internal_proesc.compacted_snapshot_observations WHERE id=v_restored.id),
    'Six-to-24-hour observation did not rehydrate exactly';
  BEGIN
    UPDATE internal_proesc.financial_snapshots SET source_fingerprint=repeat('f',64) WHERE id=(v_ids->>'FIRST')::uuid;
    RAISE EXCEPTION 'Shared keeper allowed mutation';
  EXCEPTION WHEN SQLSTATE '40001' THEN NULL; END;
  BEGIN
    DELETE FROM internal_proesc.financial_snapshots WHERE id=(v_ids->>'PACKED_KEEPER')::uuid;
    RAISE EXCEPTION 'Packed item keeper lost its foreign-key protection';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  ASSERT (SELECT to_jsonb(c)=v_finance FROM public.contas_receber c WHERE id=v_link.receivable_id),
    'Observation compaction or recovery changed the financial obligation';
  SELECT md5(string_agg(to_jsonb(h)::text,'' ORDER BY id)) INTO v_after
    FROM internal_proesc.financial_observation_history h WHERE link_id=v_link.id;
  ASSERT v_before=v_after,'Rehydration changed full observation history';
END;
$test$;
ROLLBACK;
