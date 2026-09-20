-- Cheap predicates avoid invoking the private eligibility function on recent/non-archivable actions.
-- Keep JSON/FK validation inside the helper: duplicating JSON predicates here severely
-- underestimates cardinality and can replace the cold-receipt PK lookup with a full scan.
DO $migration$
DECLARE
  v_definition text;
  v_old text:='WHERE internal_proesc.receipt_archive_eligible(r,p_before)';
  v_new text:=$replacement$WHERE r.action IN ('SNAPSHOT','APPLY')
      AND r.created_at<p_before AND r.completed_at<p_before
      AND internal_proesc.receipt_archive_eligible(r,p_before)$replacement$;
BEGIN
  v_definition:=pg_get_functiondef('public.proesc_prepare_receipt_archive_service(integer,timestamptz)'::regprocedure);
  IF md5(v_definition)<>'97409f967d86c9482f76d55906699ed6'
    OR (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old)<>1 THEN
    RAISE EXCEPTION 'Receipt archive preparation changed; rebase the prefilter migration.';
  END IF;
  EXECUTE replace(v_definition,v_old,v_new);
END;
$migration$;
