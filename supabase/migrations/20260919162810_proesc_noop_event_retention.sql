-- Redundant AUTO no-op events are represented by observations and execution telemetry.
-- Their request responses stay intact for idempotent retries; real mutations are never removed.
CREATE FUNCTION internal_proesc.prune_unchanged_reconciliation_events(p_limit integer DEFAULT 5000)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
SET lock_timeout='2s'
AS $function$
DECLARE v_deleted integer;
BEGIN
  WITH expired AS (
    SELECT e.id FROM internal_proesc.reconciliation_events e
    WHERE e.mode='AUTO' AND e.result='UNCHANGED' AND e.recorded_at<now()-interval '24 hours'
      AND NOT EXISTS(SELECT 1 FROM internal_proesc.mutation_claims m WHERE m.request_id=e.request_id)
    LIMIT greatest(1,least(coalesce(p_limit,5000),5000)) FOR UPDATE OF e SKIP LOCKED
  )
  DELETE FROM internal_proesc.reconciliation_events e USING expired x WHERE e.id=x.id;
  GET DIAGNOSTICS v_deleted=ROW_COUNT;
  RETURN v_deleted;
END;
$function$;
REVOKE ALL ON FUNCTION internal_proesc.prune_unchanged_reconciliation_events(integer)
  FROM PUBLIC,anon,authenticated,service_role;
SELECT cron.schedule('prune-proesc-unchanged-events-hourly','47 * * * *',
  'select internal_proesc.prune_unchanged_reconciliation_events(5000)');
