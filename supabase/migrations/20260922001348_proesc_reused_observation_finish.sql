-- Old snapshot IDs are accepted in telemetry only after server-proven reuse in
-- this exact lease. Financial timestamps are not rewritten to the check time.
DO $migration$
DECLARE
  v_definition text;
  v_poll_filter text:='WHERE i.run_id=p_run_id AND r.status<>''RUNNING'' AND r.finished_at IS NOT NULL';
  v_old text:='where s.id=v_snapshot and s.link_id=v_link and s.recorded_at>=v_run.started_at';
  v_new text:=$replacement$where s.id=v_snapshot and s.link_id=v_link and (
            s.recorded_at>=v_run.started_at OR EXISTS(
              SELECT 1 FROM internal_proesc.unchanged_observation_state n
              WHERE n.link_id=v_link AND n.snapshot_id=v_snapshot AND n.last_run_id=v_run.id
                AND n.last_seen_at>=v_run.started_at AND v_item->>'result'='UNCHANGED'
                AND n.stage=v_item->>'stage' AND (v_item->>'errorCode') IS NULL
            ))$replacement$;
BEGIN
  v_definition:=pg_get_functiondef('internal_proesc.finish_sync_run(internal_proesc.sync_runtime,jsonb)'::regprocedure);
  IF md5(v_definition)<>'af5baae39de8a012ba1fb3b01cd359df'
    OR (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old)<>1 THEN
    RAISE EXCEPTION 'Proesc finish contract changed; rebase observation reuse.';
  END IF;
  EXECUTE replace(v_definition,v_old,v_new);
  IF md5(pg_get_functiondef('internal_proesc.refresh_settled_polling(uuid)'::regprocedure))
    <>'4a13e7fa63af22a74431cf1c27cdaadb' THEN
    RAISE EXCEPTION 'Proesc polling contract changed; rebase observation reuse.';
  END IF;
  v_definition:=pg_get_functiondef('internal_proesc.refresh_settled_polling(uuid)'::regprocedure);
  IF (length(v_definition)-length(replace(v_definition,v_poll_filter,'')))/length(v_poll_filter)<>1 THEN
    RAISE EXCEPTION 'Proesc polling selector changed; rebase observation reuse.';
  END IF;
  -- The old rule uses snapshot.recorded_at. Reused observations must pass only
  -- the new rule below, including latest-proof and current financial guards.
  EXECUTE replace(v_definition,v_poll_filter,v_poll_filter||$exclude$
    AND NOT EXISTS(SELECT 1 FROM internal_proesc.unchanged_observation_state n
      WHERE n.last_run_id=i.run_id AND n.link_id=i.link_id AND n.snapshot_id=i.snapshot_id
        AND i.result='UNCHANGED' AND i.stage=n.stage AND i.error_code IS NULL)$exclude$);
END;
$migration$;

ALTER FUNCTION internal_proesc.refresh_settled_polling(uuid)
  RENAME TO refresh_settled_polling_before_observation_reuse;
CREATE FUNCTION internal_proesc.refresh_settled_polling(p_run_id uuid)
RETURNS void LANGUAGE plpgsql SET search_path='' SET timezone='UTC'
AS $function$
BEGIN
  PERFORM internal_proesc.refresh_settled_polling_before_observation_reuse(p_run_id);
  -- A failed/partial run, credential rotation, newer snapshot or changed
  -- receivable cannot grant a new cooldown from an earlier reuse proof.
  UPDATE internal_proesc.settled_polling_state state SET
    next_due_at=n.last_seen_at+internal_proesc.settled_polling_delay(
      c,s,'UNCHANGED',n.stage,true,encode(n.receivable_sha256,'hex')),
    checked_at=n.last_seen_at
  FROM internal_proesc.unchanged_observation_state n
  JOIN internal_proesc.sync_run_items i ON i.run_id=n.last_run_id AND i.link_id=n.link_id
  JOIN internal_proesc.sync_runs r ON r.id=i.run_id
  JOIN internal_proesc.obligation_links l ON l.id=n.link_id
  JOIN public.contas_receber c ON c.id=l.receivable_id
  JOIN internal_proesc.financial_snapshots s ON s.id=n.snapshot_id
  WHERE n.last_run_id=p_run_id AND state.link_id=n.link_id AND state.last_snapshot_id=n.snapshot_id
    AND i.snapshot_id=n.snapshot_id AND i.original_snapshot_id IS NULL
    AND i.result='UNCHANGED' AND i.stage=n.stage AND i.error_code IS NULL
    AND r.status='SUCCEEDED' AND r.finished_at IS NOT NULL AND n.last_seen_at>=r.started_at
    AND n.credential_revision=(SELECT revision FROM internal_proesc.connection WHERE id)
    AND n.receivable_sha256=decode(internal_proesc.receivable_fingerprint(c),'hex')
    AND NOT EXISTS(SELECT 1 FROM internal_proesc.financial_snapshots newer
      WHERE newer.link_id=n.link_id AND (newer.observed_at,newer.recorded_at,newer.id)
        >(s.observed_at,s.recorded_at,s.id))
    AND internal_proesc.settled_polling_delay(c,s,'UNCHANGED',n.stage,true,
      encode(n.receivable_sha256,'hex'))>interval '0';
  -- Validation/count reconciliation above still sees every transient item.
  -- Afterward preserve scoped execution totals and the bounded link proof only.
  -- Changed/review/failed items and every legacy item remain untouched.
  WITH removed AS (
    DELETE FROM internal_proesc.sync_run_items i USING internal_proesc.unchanged_observation_state n,
      internal_proesc.sync_runs r
    WHERE i.run_id=p_run_id AND n.last_run_id=i.run_id AND n.link_id=i.link_id
      AND r.id=i.run_id AND r.status<>'RUNNING' AND r.finished_at IS NOT NULL
      AND n.last_seen_at>=r.started_at AND i.snapshot_id=n.snapshot_id
      AND i.original_snapshot_id IS NULL AND i.result='UNCHANGED'
      AND i.stage=n.stage AND i.error_code IS NULL
    RETURNING i.run_id,i.polo_id,i.class_id,n.last_observed_at
  )
  INSERT INTO internal_proesc.run_reused_observation_counts(
    run_id,polo_id,class_id,reused_count,first_checked_at,last_checked_at)
  SELECT run_id,polo_id,class_id,count(*)::integer,min(last_observed_at),max(last_observed_at)
  FROM removed GROUP BY run_id,polo_id,class_id;
END;
$function$;
REVOKE ALL ON FUNCTION internal_proesc.refresh_settled_polling(uuid)
  FROM PUBLIC,anon,authenticated,service_role;
