-- Cheap necessary JSON predicates avoid scanning protected receipts through the full helper.
-- OFFSET 0 keeps the cold UUID check correlated: do not hash-scan the growing archive map.
-- The complete eligibility helper, six-hour window and row locks remain authoritative.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
DO $migration$
DECLARE
  v_definition text; v_patch record;
BEGIN
  v_definition:=pg_get_functiondef('public.proesc_prepare_receipt_archive_service(integer,timestamptz)'::regprocedure);
  IF md5(v_definition)<>'749b9cea31536022234dd74e0fd4c7ff' THEN
    RAISE EXCEPTION 'Receipt preparation drift; review the six-hour source before changing the candidate plan.';
  END IF;
  FOR v_patch IN SELECT * FROM (VALUES
    ('AND internal_proesc.receipt_archive_eligible(r,p_before)',
      $replacement$AND r.response->'replayed'='false'::jsonb
      AND (r.action='SNAPSHOT' OR (r.action='APPLY' AND r.response->>'result'='UNCHANGED'))
      AND internal_proesc.receipt_archive_eligible(r,p_before)$replacement$),
    ('NOT EXISTS(SELECT 1 FROM internal_proesc.archived_receipt_requests a WHERE a.request_id=r.request_id)',
      'NOT EXISTS(SELECT 1 FROM internal_proesc.archived_receipt_requests a WHERE a.request_id=r.request_id OFFSET 0)')
  ) patches(old_sql,new_sql)
  LOOP
    IF (length(v_definition)-length(replace(v_definition,v_patch.old_sql,'')))/length(v_patch.old_sql)<>1 THEN
      RAISE EXCEPTION 'Receipt candidate predicate does not occur exactly once.';
    END IF;
    v_definition:=replace(v_definition,v_patch.old_sql,v_patch.new_sql);
  END LOOP;
  EXECUTE v_definition;
END;
$migration$;
