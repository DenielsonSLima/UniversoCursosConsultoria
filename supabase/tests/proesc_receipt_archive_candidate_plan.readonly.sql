-- Bounded semantic comparison and plan inspection; no archive preparation or locks execute.
BEGIN READ ONLY;
SET LOCAL statement_timeout='8s';
SET LOCAL plpgsql.check_asserts=on;
DO $test$
DECLARE v_definition text; v_query text; v_plan json; v_count integer; v_differences integer;
BEGIN
  v_definition:=pg_get_functiondef('public.proesc_prepare_receipt_archive_service(integer,timestamptz)'::regprocedure);
  ASSERT strpos(v_definition,'a.request_id=r.request_id OFFSET 0')>0,
    'Cold receipt lookup lost its correlated planning barrier';
  ASSERT strpos(v_definition,'AND internal_proesc.receipt_archive_eligible(r,p_before)')>0
    AND strpos(v_definition,'LIMIT p_limit FOR UPDATE SKIP LOCKED')>0
    AND strpos(v_definition,'p_before>now()-interval ''6 hours''')>0,
    'Authoritative eligibility, cutoff or row locking changed';
  WITH sample AS MATERIALIZED (
    SELECT r FROM internal_proesc.reconciliation_requests r TABLESAMPLE SYSTEM(0.5) REPEATABLE(605) LIMIT 400
  ), evaluated AS MATERIALIZED (
    SELECT r,internal_proesc.receipt_archive_eligible(r,now()-interval '6 hours') eligible,
      NOT EXISTS(SELECT 1 FROM internal_proesc.archived_receipt_requests a
        WHERE a.request_id=(r).request_id OFFSET 0) unarchived FROM sample
  ), compared AS (
    SELECT eligible AND unarchived AS original,
      eligible AND unarchived AND (r).response->'replayed'='false'::jsonb
      AND ((r).action='SNAPSHOT' OR ((r).action='APPLY' AND (r).response->>'result'='UNCHANGED')) AS optimized
    FROM evaluated
  ) SELECT count(*),count(*) FILTER(WHERE (original IS TRUE) IS DISTINCT FROM (optimized IS TRUE))
    INTO v_count,v_differences FROM compared;
  ASSERT v_differences=0,'Necessary JSON predicates changed candidate eligibility';
  ASSERT v_count BETWEEN 1 AND 400,'Bounded candidate sample was empty or exceeded its limit';
  -- Derive the production candidate query rather than silently testing a second implementation.
  v_query:=split_part(split_part(v_definition,'    SELECT r.* FROM internal_proesc.reconciliation_requests r',2),
    '  ) r;',1);
  ASSERT v_query<>'' AND strpos(v_query,'LIMIT p_limit FOR UPDATE SKIP LOCKED')>0,
    'Candidate query extraction failed';
  v_query:='SELECT r.* FROM internal_proesc.reconciliation_requests r'||v_query;
  v_query:=replace(replace(v_query,'p_before','(now()-interval ''6 hours'')'),'p_limit','500');
  EXECUTE 'EXPLAIN (FORMAT JSON) '||v_query INTO v_plan;
  ASSERT v_plan::text LIKE '%archived_receipt_requests_pkey%',
    'Candidate plan no longer uses the cold UUID primary-key index';
  ASSERT NOT jsonb_path_exists(v_plan::jsonb,
    '$.** ? (@."Relation Name" == "archived_receipt_requests" && @."Node Type" == "Seq Scan")'),
    'Candidate plan scans the entire cold receipt map';
END;
$test$;
ROLLBACK;
