-- Run after the six-hour migration while the archive worker is idle; no changes persist.
-- Also run proesc_receipt_archive.transaction.sql for the full permission/corruption contract.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='20s';
SET LOCAL plpgsql.check_asserts=on;
DO $test$
DECLARE
  v_actor uuid; v_snapshot uuid; v_receivable uuid; v_case record;
  v_request uuid; v_batch uuid; v_lease uuid; v_payload jsonb; v_response jsonb;
  v_row internal_proesc.reconciliation_requests; v_result jsonb;
  v_text text; v_sha text; v_detail text; v_event uuid; v_claim uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('proesc:receipt-archive:prepare',0));
  IF EXISTS(SELECT 1 FROM internal_proesc.receipt_archive_batches WHERE status='PREPARED') THEN
    RAISE EXCEPTION 'Archive worker must finish its prepared batch before this test.' USING ERRCODE='40001';
  END IF;
  SELECT updated_by INTO STRICT v_actor FROM internal_proesc.connection WHERE id;
  SELECT s.id,l.receivable_id INTO STRICT v_snapshot,v_receivable
    FROM internal_proesc.financial_snapshots s JOIN internal_proesc.obligation_links l ON l.id=s.link_id LIMIT 1;
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  ASSERT (SELECT position('06:00:00' IN pg_get_expr(proargdefaults,0))>0 FROM pg_proc
    WHERE oid='public.proesc_prepare_receipt_archive_service(integer,timestamptz)'::regprocedure),
    'Prepare default is not six hours';
  BEGIN
    PERFORM public.proesc_prepare_receipt_archive_service(1,now()-interval '5 hours 59 minutes');
    RAISE EXCEPTION 'Preparation admitted a cutoff younger than six hours';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;

  FOR v_case IN SELECT * FROM (VALUES
    (interval '5 hours 59 minutes','SNAPSHOT',false),
    (interval '6 hours','SNAPSHOT',false),
    (interval '6 hours 1 minute','APPLY',true),
    (interval '23 hours 59 minutes','SNAPSHOT',true),
    (interval '2 days','SNAPSHOT',true)
  ) boundary(age,action,eligible)
  LOOP
    v_request:=gen_random_uuid(); v_batch:=gen_random_uuid(); v_lease:=gen_random_uuid();
    v_payload:=jsonb_build_object('fixture','six-hour-receipt','case',v_case.age::text);
    v_response:=CASE WHEN v_case.action='SNAPSHOT'
      THEN jsonb_build_object('snapshotId',v_snapshot,'replayed',false)
      ELSE '{"result":"UNCHANGED","reviewReason":null,"replayed":false}'::jsonb END;
    INSERT INTO internal_proesc.reconciliation_requests
      (request_id,action,actor_id,payload_hash,response,created_at,completed_at)
      VALUES(v_request,v_case.action,v_actor,encode(extensions.digest(v_payload::text,'sha256'),'hex'),
        v_response,now()-v_case.age,now()-v_case.age) RETURNING * INTO v_row;
    ASSERT internal_proesc.receipt_archive_eligible(v_row,now()-interval '6 hours')=v_case.eligible,
      'Receipt boundary eligibility differs';
    v_text:=jsonb_build_object('formatVersion',1,'rows',jsonb_build_array(to_jsonb(v_row)))::text;
    v_sha:=encode(extensions.digest(v_text,'sha256'),'hex');
    INSERT INTO internal_proesc.receipt_archive_batches
      (id,lease_token,object_path,payload_sha256,payload_text,row_count)
      VALUES(v_batch,v_lease,'receipts/v1/'||v_batch::text||'.json.gz',v_sha,v_text,1);
    IF v_case.age=interval '2 days' THEN
      -- A batch staged under the previous 24-hour contract remains retryable unchanged.
      v_result:=public.proesc_prepare_receipt_archive_service();
      ASSERT v_result->>'batchId'=v_batch::text AND v_result->>'payloadText'=v_text,
        'Existing prepared batch changed after the cutoff update';
      ASSERT public.proesc_prepare_receipt_archive_service(1,now()-interval '24 hours')=v_result,
        'Explicit old cutoff did not reuse the same immutable batch';
    END IF;
    IF NOT v_case.eligible THEN
      BEGIN
        PERFORM public.proesc_commit_receipt_archive_service(v_batch,v_lease,v_text,repeat('a',64),200);
        RAISE EXCEPTION 'Young receipt was committed';
      EXCEPTION WHEN SQLSTATE '40001' THEN NULL; END;
      ASSERT EXISTS(SELECT 1 FROM internal_proesc.reconciliation_requests WHERE request_id=v_request)
        AND NOT EXISTS(SELECT 1 FROM internal_proesc.archived_receipt_requests WHERE request_id=v_request),
        'Rejected boundary commit changed the source';
      PERFORM public.proesc_abort_receipt_archive_service(v_batch,v_lease);
      CONTINUE;
    END IF;
    v_result:=public.proesc_commit_receipt_archive_service(v_batch,v_lease,v_text,repeat('a',64),200);
    ASSERT v_result->>'status'='COMMITTED','Eligible six-hour receipt not committed';
    BEGIN
      PERFORM internal_proesc.begin_financial_request(v_case.action,v_actor,v_request,v_payload);
      RAISE EXCEPTION 'Cold receipt admitted as a fresh operation';
    EXCEPTION WHEN SQLSTATE 'PZ001' THEN
      GET STACKED DIAGNOSTICS v_detail=PG_EXCEPTION_DETAIL;
      ASSERT v_detail::jsonb->>'payloadSha256'=v_sha,'Cold descriptor changed';
    END;
    BEGIN
      PERFORM public.proesc_restore_receipt_archive_service(v_request,v_text||' ');
      RAISE EXCEPTION 'Unavailable/corrupt archive bypassed exact verification';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
    ASSERT NOT EXISTS(SELECT 1 FROM internal_proesc.reconciliation_requests WHERE request_id=v_request),
      'Failed recovery created a hot receipt';
    PERFORM public.proesc_restore_receipt_archive_service(v_request,v_text);
    ASSERT (SELECT to_jsonb(r)=to_jsonb(v_row) FROM internal_proesc.reconciliation_requests r
      WHERE request_id=v_request),'Six-hour receipt restoration changed original fields';
    ASSERT internal_proesc.begin_financial_request(v_case.action,v_actor,v_request,v_payload)
      =v_response||'{"replayed":true}'::jsonb,'Six-hour replay changed the original response';
  END LOOP;

  -- The shorter receipt window does not bypass an event or a financial mutation claim.
  v_event:=gen_random_uuid(); v_claim:=gen_random_uuid();
  INSERT INTO internal_proesc.reconciliation_requests
    (request_id,action,actor_id,payload_hash,response,created_at,completed_at)
    SELECT id,'APPLY',v_actor,repeat('a',64),'{"result":"UNCHANGED","replayed":false}'::jsonb,
      now()-interval '7 hours',now()-interval '7 hours' FROM unnest(ARRAY[v_event,v_claim]) id;
  INSERT INTO internal_proesc.reconciliation_events(request_id,snapshot_id,mode,result,recorded_at)
    VALUES(v_event,v_snapshot,'AUTO','UNCHANGED',now()-interval '7 hours');
  INSERT INTO internal_proesc.mutation_claims(request_id,transaction_id,receivable_id,kind,expected_new)
    VALUES(v_claim,txid_current(),v_receivable,'AUTO','{}'::jsonb);
  ASSERT NOT EXISTS(SELECT 1 FROM internal_proesc.reconciliation_requests r
    WHERE request_id=ANY(ARRAY[v_event,v_claim])
      AND internal_proesc.receipt_archive_eligible(r,now()-interval '6 hours')),
    'Financial event or mutation claim lost its physical receipt';
  ASSERT EXISTS(SELECT 1 FROM internal_proesc.reconciliation_events WHERE request_id=v_event),
    'Seven-hour event was removed';
END;
$test$;
ROLLBACK;
