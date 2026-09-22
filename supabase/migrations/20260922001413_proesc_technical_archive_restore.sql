-- A verified object can rehydrate its exact original packs, never financial facts.
CREATE FUNCTION public.proesc_restore_technical_archive_service(p_run_id uuid,p_payload_text text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
SET lock_timeout='3s' SET statement_timeout='15s' AS $function$
DECLARE
  v_batch internal_proesc.technical_archive_batches; v_entry jsonb;
  v_items internal_proesc.packed_run_items; v_http internal_proesc.packed_run_http;
  v_actual jsonb;
BEGIN
  PERFORM internal_proesc.require_receipt_archive_service();
  IF p_run_id IS NULL OR p_payload_text IS NULL OR octet_length(p_payload_text)>1048576 THEN
    RAISE EXCEPTION 'Invalid technical restoration' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('proesc:technical-archive',0));
  PERFORM 1 FROM internal_proesc.sync_runs WHERE id=p_run_id FOR UPDATE;
  SELECT b.* INTO v_batch FROM internal_proesc.archived_technical_runs a
    JOIN internal_proesc.technical_archive_batches b ON b.id=a.batch_id
    WHERE a.run_id=p_run_id AND b.status='COMMITTED';
  IF NOT FOUND THEN
    -- Restoration may be retried, but the complete supplied row must still match.
    SELECT b.* INTO v_batch FROM internal_proesc.technical_archive_batches b
      WHERE b.status='COMMITTED' AND b.payload_sha256=encode(extensions.digest(p_payload_text,'sha256'),'hex')
      ORDER BY b.created_at LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'Committed technical archive not found' USING ERRCODE='22023'; END IF;
  END IF;
  IF encode(extensions.digest(p_payload_text,'sha256'),'hex') IS DISTINCT FROM v_batch.payload_sha256 THEN
    RAISE EXCEPTION 'Technical restoration hash mismatch' USING ERRCODE='22023';
  END IF;
  IF (p_payload_text::jsonb)->>'kind'<>'proesc-technical-history'
    OR ((p_payload_text::jsonb)->>'formatVersion')::integer<>1
    OR jsonb_array_length((p_payload_text::jsonb)->'runs')<>v_batch.run_count
    OR (SELECT count(*) FROM jsonb_array_elements((p_payload_text::jsonb)->'runs') e
      WHERE e->>'runId'=p_run_id::text)<>1 THEN
    RAISE EXCEPTION 'Technical restoration format mismatch' USING ERRCODE='22023';
  END IF;
  SELECT value INTO STRICT v_entry FROM jsonb_array_elements((p_payload_text::jsonb)->'runs')
    WHERE value->>'runId'=p_run_id::text;
  IF v_entry->'items'<>'null'::jsonb THEN
    SELECT * INTO STRICT v_items FROM jsonb_populate_record(NULL::internal_proesc.packed_run_items,v_entry->'items');
    IF v_items.run_id IS DISTINCT FROM p_run_id THEN RAISE EXCEPTION 'Technical restoration run mismatch'; END IF;
    INSERT INTO internal_proesc.packed_run_items SELECT (v_items).* ON CONFLICT(run_id) DO NOTHING;
  END IF;
  SELECT to_jsonb(i) INTO v_actual FROM internal_proesc.packed_run_items i WHERE run_id=p_run_id;
  IF coalesce(v_actual,'null'::jsonb) IS DISTINCT FROM v_entry->'items' THEN
    RAISE EXCEPTION 'Current items differ from archive' USING ERRCODE='40001';
  END IF;
  IF v_entry->'http'<>'null'::jsonb THEN
    SELECT * INTO STRICT v_http FROM jsonb_populate_record(NULL::internal_proesc.packed_run_http,v_entry->'http');
    IF v_http.run_id IS DISTINCT FROM p_run_id THEN RAISE EXCEPTION 'Technical HTTP run mismatch'; END IF;
    INSERT INTO internal_proesc.packed_run_http SELECT (v_http).* ON CONFLICT(run_id) DO NOTHING;
  END IF;
  SELECT to_jsonb(h) INTO v_actual FROM internal_proesc.packed_run_http h WHERE run_id=p_run_id;
  IF coalesce(v_actual,'null'::jsonb) IS DISTINCT FROM v_entry->'http' THEN
    RAISE EXCEPTION 'Current HTTP differs from archive' USING ERRCODE='40001';
  END IF;
  INSERT INTO internal_proesc.run_reused_observation_counts
    SELECT c.* FROM jsonb_populate_recordset(NULL::internal_proesc.run_reused_observation_counts,v_entry->'reusedCounts') c
    ON CONFLICT(run_id,polo_id,class_id) DO NOTHING;
  SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.polo_id,c.class_id),'[]'::jsonb) INTO v_actual
    FROM internal_proesc.run_reused_observation_counts c WHERE c.run_id=p_run_id;
  IF v_actual IS DISTINCT FROM v_entry->'reusedCounts' THEN
    RAISE EXCEPTION 'Current reused counts differ from archive' USING ERRCODE='40001';
  END IF;
  DELETE FROM internal_proesc.archived_technical_runs WHERE run_id=p_run_id;
  RETURN jsonb_build_object('restored',true,'runId',p_run_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.proesc_restore_technical_archive_service(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.proesc_restore_technical_archive_service(uuid,text) TO service_role;
