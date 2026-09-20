-- Run after the prefilter migration in the same rollback rehearsal or against its applied schema.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='8s';
DO $test$
DECLARE v_before jsonb; v_after jsonb; v_empty bigint; v_result jsonb; v_definition text;
BEGIN
  v_definition:=pg_get_functiondef('public.proesc_prepare_receipt_archive_service(integer,timestamptz)'::regprocedure);
  IF strpos(v_definition,$clause$WHERE r.action IN ('SNAPSHOT','APPLY')
      AND r.created_at<p_before AND r.completed_at<p_before
      AND internal_proesc.receipt_archive_eligible(r,p_before)$clause$)=0 THEN
    RAISE EXCEPTION 'Cheap action/date predicates missing from preparation.';
  END IF;
  SELECT jsonb_agg(to_jsonb(r) ORDER BY r.request_id) INTO v_before FROM (
    SELECT r.* FROM internal_proesc.reconciliation_requests r
    WHERE internal_proesc.receipt_archive_eligible(r,now()-interval '24 hours')
      AND NOT EXISTS(SELECT 1 FROM internal_proesc.archived_receipt_requests a WHERE a.request_id=r.request_id)
    LIMIT 20
  ) r;
  SELECT jsonb_agg(to_jsonb(r) ORDER BY r.request_id) INTO v_after FROM (
    SELECT r.* FROM internal_proesc.reconciliation_requests r
    WHERE r.action IN ('SNAPSHOT','APPLY') AND r.created_at<now()-interval '24 hours'
      AND r.completed_at<now()-interval '24 hours'
      AND internal_proesc.receipt_archive_eligible(r,now()-interval '24 hours')
      AND NOT EXISTS(SELECT 1 FROM internal_proesc.archived_receipt_requests a WHERE a.request_id=r.request_id)
    LIMIT 20
  ) r;
  IF v_before IS DISTINCT FROM v_after THEN RAISE EXCEPTION 'The selected immutable receipts changed.'; END IF;

  -- End-of-backlog path exercises a full heap scan without per-row eligibility work.
  SELECT count(*) INTO v_empty FROM (
    SELECT r.request_id FROM internal_proesc.reconciliation_requests r
    WHERE r.action IN ('SNAPSHOT','APPLY') AND r.created_at<'1900-01-01'::timestamptz
      AND r.completed_at<'1900-01-01'::timestamptz
      AND internal_proesc.receipt_archive_eligible(r,'1900-01-01'::timestamptz)
      AND NOT EXISTS(SELECT 1 FROM internal_proesc.archived_receipt_requests a WHERE a.request_id=r.request_id)
    LIMIT 500
  ) selected;
  IF v_empty<>0 THEN RAISE EXCEPTION 'Unexpected ancient receipt fixture.'; END IF;
  -- Never disturb a previously prepared batch; its idempotent recovery has priority.
  IF NOT EXISTS(SELECT 1 FROM internal_proesc.receipt_archive_batches WHERE status='PREPARED') THEN
    PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
    v_result:=public.proesc_prepare_receipt_archive_service(500,'1900-01-01'::timestamptz);
    IF v_result->>'status'<>'EMPTY' OR v_result->>'rowCount'<>'0' THEN
      RAISE EXCEPTION 'No-candidate preparation did not return EMPTY.';
    END IF;
  END IF;
  IF has_function_privilege('anon','public.proesc_prepare_receipt_archive_service(integer,timestamptz)','EXECUTE')
    OR has_function_privilege('authenticated','public.proesc_prepare_receipt_archive_service(integer,timestamptz)','EXECUTE') THEN
    RAISE EXCEPTION 'Preparation became available to public clients.';
  END IF;
END;
$test$;
ROLLBACK;
