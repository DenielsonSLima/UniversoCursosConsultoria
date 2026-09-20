CREATE TABLE internal_proesc.storage_compaction_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  cursor_id uuid,
  last_finished_at timestamptz,
  total_compacted bigint NOT NULL DEFAULT 0
);
ALTER TABLE internal_proesc.storage_compaction_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON internal_proesc.storage_compaction_state FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO internal_proesc.storage_compaction_state(singleton) VALUES(true);

CREATE FUNCTION internal_proesc.compact_snapshot_observations(p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
SET lock_timeout='2s' SET work_mem='16MB'
AS $function$
DECLARE
  v_cursor uuid; v_links uuid[]; v_map jsonb; v_before text; v_after text;
  v_count integer; v_deleted integer; v_last uuid;
BEGIN
  SELECT cursor_id INTO v_cursor FROM internal_proesc.storage_compaction_state
    WHERE singleton FOR UPDATE;
  SELECT array_agg(id ORDER BY id) INTO v_links FROM (
    SELECT l.id FROM internal_proesc.obligation_links l
    WHERE v_cursor IS NULL OR l.id>v_cursor ORDER BY l.id
    LIMIT greatest(1,least(coalesce(p_limit,100),250))
    FOR UPDATE OF l SKIP LOCKED
  ) selected;
  IF coalesce(cardinality(v_links),0)=0 THEN
    UPDATE internal_proesc.storage_compaction_state SET cursor_id=NULL,last_finished_at=now() WHERE singleton;
    RETURN jsonb_build_object('compacted',0,'wrapped',true);
  END IF;
  v_last:=v_links[cardinality(v_links)];
  SELECT md5(coalesce(string_agg(md5(to_jsonb(h)::text),'' ORDER BY h.id),''))
    INTO v_before FROM internal_proesc.financial_observation_history h WHERE h.link_id=ANY(v_links);

  WITH signatures AS MATERIALIZED (
    SELECT s.id,s.link_id,s.observed_at,s.recorded_at,
      encode(extensions.digest((to_jsonb(s)-ARRAY['id','observed_at','recorded_at'])::text,'sha256'),'hex') body_hash
    FROM internal_proesc.financial_snapshots s WHERE s.link_id=ANY(v_links)
  ), changes AS (
    SELECT s.*,CASE WHEN body_hash IS DISTINCT FROM lag(body_hash) OVER
      (PARTITION BY link_id ORDER BY observed_at,recorded_at,id) THEN 1 ELSE 0 END changed
    FROM signatures s
  ), blocks AS (
    SELECT c.*,sum(changed) OVER (PARTITION BY link_id ORDER BY observed_at,recorded_at,id) block_no
    FROM changes c
  ), ranked AS (
    SELECT b.*,
      first_value(id) OVER (PARTITION BY link_id,block_no ORDER BY observed_at,recorded_at,id) keeper_id,
      row_number() OVER (PARTITION BY link_id,block_no ORDER BY observed_at,recorded_at,id) first_position,
      row_number() OVER (PARTITION BY link_id,block_no ORDER BY observed_at DESC,recorded_at DESC,id DESC) last_position
    FROM blocks b
  ), confirmed AS MATERIALIZED (
    SELECT DISTINCT item->>'snapshotId' snapshot_id
    FROM internal_proesc.enrollment_financial_confirmations c
    CROSS JOIN LATERAL jsonb_array_elements(c.confirmed_snapshots) item
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'keeper',r.keeper_id)),'[]'::jsonb)
  INTO v_map FROM ranked r
  JOIN internal_proesc.financial_snapshots s ON s.id=r.id
  JOIN internal_proesc.financial_snapshots k ON k.id=r.keeper_id
  WHERE r.first_position>1 AND r.last_position>1
    AND s.recorded_at<now()-interval '24 hours'
    -- Exact comparison prevents even a fingerprint/hash collision from changing evidence.
    AND (to_jsonb(s)-ARRAY['id','observed_at','recorded_at'])
      =(to_jsonb(k)-ARRAY['id','observed_at','recorded_at'])
    AND NOT EXISTS(SELECT 1 FROM confirmed c WHERE c.snapshot_id=s.id::text)
    AND NOT EXISTS(SELECT 1 FROM internal_proesc.compacted_snapshot_observations a WHERE a.keeper_snapshot_id=s.id)
    AND NOT EXISTS(SELECT 1 FROM internal_proesc.reconciliation_events e WHERE e.snapshot_id=s.id
      AND (e.mode<>'AUTO' OR e.result<>'UNCHANGED'))
    AND EXISTS(SELECT 1 FROM internal_proesc.sync_run_items i JOIN internal_proesc.sync_runs r ON r.id=i.run_id
      WHERE i.snapshot_id=s.id AND i.original_snapshot_id IS NULL AND i.result='UNCHANGED'
        AND i.error_code IS NULL AND r.status='SUCCEEDED' AND r.finished_at<now()-interval '24 hours')
    AND NOT EXISTS(SELECT 1 FROM internal_proesc.sync_run_items i JOIN internal_proesc.sync_runs r ON r.id=i.run_id
      WHERE i.snapshot_id=s.id AND (i.result IS DISTINCT FROM 'UNCHANGED' OR i.error_code IS NOT NULL
        OR r.status IS DISTINCT FROM 'SUCCEEDED' OR r.finished_at IS NULL OR r.finished_at>=now()-interval '24 hours'));
  v_count:=jsonb_array_length(v_map);
  IF v_count>0 THEN
    INSERT INTO internal_proesc.compacted_snapshot_observations(id,keeper_snapshot_id,observed_at,recorded_at)
    SELECT s.id,(m->>'keeper')::uuid,s.observed_at,s.recorded_at
    FROM jsonb_array_elements(v_map) m JOIN internal_proesc.financial_snapshots s ON s.id=(m->>'id')::uuid;

    UPDATE internal_proesc.reconciliation_events e
    SET original_snapshot_id=coalesce(e.original_snapshot_id,e.snapshot_id),snapshot_id=(m->>'keeper')::uuid
    FROM jsonb_array_elements(v_map) m WHERE e.snapshot_id=(m->>'id')::uuid
      AND e.mode='AUTO' AND e.result='UNCHANGED';
    UPDATE internal_proesc.sync_run_items i
    SET original_snapshot_id=coalesce(i.original_snapshot_id,i.snapshot_id),snapshot_id=(m->>'keeper')::uuid
    FROM jsonb_array_elements(v_map) m WHERE i.snapshot_id=(m->>'id')::uuid AND i.result='UNCHANGED';
    DELETE FROM internal_proesc.financial_snapshots s USING jsonb_array_elements(v_map) m
      WHERE s.id=(m->>'id')::uuid;
    GET DIAGNOSTICS v_deleted=ROW_COUNT;
    IF v_deleted<>v_count THEN RAISE EXCEPTION 'Snapshot consolidation count mismatch'; END IF;

    SELECT md5(coalesce(string_agg(md5(to_jsonb(h)::text),'' ORDER BY h.id),''))
      INTO v_after FROM internal_proesc.financial_observation_history h WHERE h.link_id=ANY(v_links);
    IF v_before IS DISTINCT FROM v_after THEN
      RAISE EXCEPTION 'Observation identity, time or evidence changed';
    END IF;
  END IF;
  UPDATE internal_proesc.storage_compaction_state
    SET cursor_id=v_last,last_finished_at=now(),total_compacted=total_compacted+v_count WHERE singleton;
  RETURN jsonb_build_object('compacted',v_count,'links',cardinality(v_links),'wrapped',false,'historyVerified',true);
END;
$function$;
REVOKE ALL ON FUNCTION internal_proesc.compact_snapshot_observations(integer)
  FROM PUBLIC,anon,authenticated,service_role;
