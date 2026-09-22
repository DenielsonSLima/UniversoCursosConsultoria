-- Pure scheduling checks. Integration uses rollback-only synthetic executions.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
DO $test$
DECLARE
  v_actor uuid; v_revision uuid; v_lease uuid; v_link uuid; v_unit text;
  v_run internal_proesc.sync_runs; v_cursor uuid; v_try integer; v_before timestamptz;
BEGIN
  IF internal_proesc.fetch_retry_delay(0)<>interval '0'
    OR internal_proesc.fetch_retry_delay(1)<>interval '4 minutes'
    OR internal_proesc.fetch_retry_delay(2)<>interval '8 minutes'
    OR internal_proesc.fetch_retry_delay(3)<>interval '16 minutes'
    OR internal_proesc.fetch_retry_delay(4)<>interval '30 minutes'
    OR internal_proesc.fetch_retry_delay(999)<>interval '30 minutes' THEN
    RAISE EXCEPTION 'Transient retry schedule is not bounded'; END IF;
  SELECT cursor_id INTO v_cursor FROM internal_proesc.sync_runtime WHERE id FOR UPDATE;
  SELECT updated_by,revision INTO v_actor,v_revision FROM internal_proesc.connection WHERE id;
  SELECT id,source_unit_id INTO v_link,v_unit FROM internal_proesc.obligation_links LIMIT 1;
  DELETE FROM internal_proesc.sync_fetch_backoff;
  FOR v_try IN 1..6 LOOP
    v_lease:=gen_random_uuid();
    INSERT INTO internal_proesc.sync_runs(id,actor_id,started_at,lease_until,finished_at,status,claimed,
      consulted,failed,error_code,stage) VALUES(v_lease,v_actor,now(),now()+interval '3 minutes',
      now(),'FAILED',1,0,1,'TIMEOUT','FETCH');
    PERFORM internal_proesc.refresh_fetch_backoff(v_lease);
    IF NOT internal_proesc.fetch_backoff_active() OR (SELECT consecutive_failures
      FROM internal_proesc.sync_fetch_backoff)<>least(v_try,5) THEN
      RAISE EXCEPTION 'Retry state did not accumulate'; END IF;
    SELECT retry_after INTO v_before FROM internal_proesc.sync_fetch_backoff;
    PERFORM internal_proesc.refresh_fetch_backoff(v_lease);
    IF (SELECT retry_after FROM internal_proesc.sync_fetch_backoff)<>v_before THEN
      RAISE EXCEPTION 'Same run extended backoff twice'; END IF;
  END LOOP;
  UPDATE internal_proesc.connection SET revision=gen_random_uuid() WHERE id;
  IF internal_proesc.fetch_backoff_active() THEN RAISE EXCEPTION 'Credential rotation did not invalidate backoff'; END IF;
  UPDATE internal_proesc.connection SET revision=v_revision WHERE id;
  v_lease:=gen_random_uuid();
  INSERT INTO internal_proesc.sync_runs(id,actor_id,started_at,lease_until,finished_at,status,claimed,
    consulted,failed,error_code,stage) VALUES(v_lease,v_actor,now(),now()+interval '3 minutes',
    now(),'FAILED',1,0,1,'SNAPSHOT_REJECTED','SNAPSHOT');
  PERFORM internal_proesc.refresh_fetch_backoff(v_lease);
  IF internal_proesc.fetch_backoff_active() OR (SELECT consecutive_failures
    FROM internal_proesc.sync_fetch_backoff)<>0 THEN RAISE EXCEPTION 'Non-FETCH error suppressed financial work'; END IF;
  IF (SELECT cursor_id FROM internal_proesc.sync_runtime WHERE id) IS DISTINCT FROM v_cursor THEN
    RAISE EXCEPTION 'Failure backoff advanced the financial cursor'; END IF;
  RAISE NOTICE 'PASS: delay cap, repeated-run idempotency, credential rotation, non-FETCH failure, unchanged cursor';
END;
$test$;
ROLLBACK;
