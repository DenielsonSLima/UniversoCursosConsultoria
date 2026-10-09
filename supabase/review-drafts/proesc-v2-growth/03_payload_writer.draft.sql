-- LOCAL REVIEW DRAFT. Flag remains false; no backfill, scheduling or data removal.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
DO $patch$
DECLARE v_oid oid:='internal_proesc.v2_stage_invoice(internal_proesc.v2_tasks,jsonb,timestamp with time zone)'::regprocedure;
  v_body text; v_definition text; v_meta jsonb; v_new text;
BEGIN
  SELECT p.prosrc,pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc'
    INTO v_body,v_definition,v_meta FROM pg_proc p WHERE p.oid=v_oid;
  IF md5(v_body)<>'1bd14b66bb10cac772a2619646f857d8' THEN RAISE EXCEPTION 'V2 writer drift'; END IF;
  v_new:=replace(v_body,$old$  INSERT INTO internal_proesc.v2_invoice_observations(run_id,task_id,unit_id,invoice_id,
    source_status,normalized,result,observed_at)
  VALUES(p_task.run_id,p_task.id,p_task.unit_id,p_row->>'invoiceId',p_row->>'sourceStatus',p_row,'STAGED',p_observed);$old$,$new$  IF (SELECT enabled FROM internal_proesc.v2_payload_storage_control WHERE singleton) THEN
    INSERT INTO internal_proesc.v2_invoice_observations(run_id,task_id,unit_id,invoice_id,
      source_status,normalized,normalized_payload_id,result,observed_at)
    VALUES(p_task.run_id,p_task.id,p_task.unit_id,p_row->>'invoiceId',p_row->>'sourceStatus',NULL,
      internal_proesc.v2_intern_invoice_payload(p_task.unit_id,p_row->>'invoiceId',p_row),'STAGED',p_observed);
  ELSE
  INSERT INTO internal_proesc.v2_invoice_observations(run_id,task_id,unit_id,invoice_id,
    source_status,normalized,result,observed_at)
  VALUES(p_task.run_id,p_task.id,p_task.unit_id,p_row->>'invoiceId',p_row->>'sourceStatus',p_row,'STAGED',p_observed);
  END IF;$new$);
  IF md5(v_new)<>'2a1b1ae96ebbc411b6b17c5a8295787f' THEN RAISE EXCEPTION 'V2 writer anchor drift'; END IF;
  EXECUTE replace(v_definition,v_body,v_new);
  IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE p.oid=v_oid) IS DISTINCT FROM v_meta THEN
    RAISE EXCEPTION 'Writer privileges or metadata changed';
  END IF;
END;
$patch$;
COMMIT;
