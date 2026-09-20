-- Technical success logs have seven-day retention. Failures and running jobs survive.
CREATE FUNCTION internal_proesc.prune_cron_success_history(p_limit integer DEFAULT 10000)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
SET lock_timeout = '2s'
AS $function$
DECLARE v_deleted integer;
BEGIN
  WITH expired AS (
    SELECT runid FROM cron.job_run_details
    WHERE status = 'succeeded' AND end_time < now() - interval '7 days'
    ORDER BY runid LIMIT greatest(1, least(coalesce(p_limit, 10000), 10000))
  )
  DELETE FROM cron.job_run_details d USING expired e
  WHERE d.runid = e.runid AND d.status = 'succeeded'
    AND d.end_time < now() - interval '7 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$;
REVOKE ALL ON FUNCTION internal_proesc.prune_cron_success_history(integer)
  FROM PUBLIC, anon, authenticated, service_role;
SELECT cron.schedule('prune-cron-success-history-hourly', '43 * * * *',
  'select internal_proesc.prune_cron_success_history(10000)');
