CREATE FUNCTION public.proesc_technical_archive_state_service(p_batch_id uuid,p_lease_token uuid,p_abort boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
SET lock_timeout='3s' SET statement_timeout='15s' AS $function$
DECLARE v_batch internal_proesc.technical_archive_batches;
BEGIN
  PERFORM internal_proesc.require_receipt_archive_service();
  IF p_abort IS NULL THEN RAISE EXCEPTION 'Invalid archive action' USING ERRCODE='22023'; END IF;
  SELECT * INTO STRICT v_batch FROM internal_proesc.technical_archive_batches WHERE id=p_batch_id FOR UPDATE;
  IF v_batch.lease_token IS DISTINCT FROM p_lease_token THEN
    RAISE EXCEPTION 'Invalid archive lease' USING ERRCODE='22023';
  END IF;
  IF p_abort AND v_batch.status='COMMITTED' THEN
    RAISE EXCEPTION 'Committed archive cannot be aborted' USING ERRCODE='40001';
  END IF;
  IF p_abort AND v_batch.status='PREPARED' THEN
    UPDATE internal_proesc.technical_archive_batches SET status='ABORTED',payload_text=NULL,aborted_at=now()
      WHERE id=p_batch_id RETURNING * INTO v_batch;
  END IF;
  RETURN internal_proesc.technical_archive_descriptor(v_batch);
END;
$function$;

CREATE FUNCTION public.proesc_commit_technical_archive_service(
  p_batch_id uuid,p_lease_token uuid,p_verified_payload_text text,
  p_compressed_sha256 text,p_compressed_bytes integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
SET lock_timeout='3s' SET statement_timeout='15s' AS $function$
DECLARE
  v_batch internal_proesc.technical_archive_batches;
  v_entry jsonb; v_items internal_proesc.packed_run_items; v_http internal_proesc.packed_run_http;
  v_current_items jsonb; v_current_http jsonb; v_reused jsonb; v_run_id uuid; v_count integer:=0;
BEGIN
  PERFORM internal_proesc.require_receipt_archive_service();
  PERFORM pg_advisory_xact_lock(hashtextextended('proesc:technical-archive',0));
  SELECT * INTO STRICT v_batch FROM internal_proesc.technical_archive_batches WHERE id=p_batch_id FOR UPDATE;
  IF v_batch.lease_token IS DISTINCT FROM p_lease_token OR p_verified_payload_text IS NULL
    OR octet_length(p_verified_payload_text)>1048576
    OR encode(extensions.digest(p_verified_payload_text,'sha256'),'hex') IS DISTINCT FROM v_batch.payload_sha256
    OR p_compressed_sha256 IS NULL OR p_compressed_sha256 !~ '^[0-9a-f]{64}$'
    OR p_compressed_bytes IS NULL OR p_compressed_bytes NOT BETWEEN 1 AND 1048576 THEN
    RAISE EXCEPTION 'Technical archive integrity mismatch' USING ERRCODE='22023';
  END IF;
  IF v_batch.status='COMMITTED' THEN
    IF v_batch.compressed_sha256 IS DISTINCT FROM p_compressed_sha256
      OR v_batch.compressed_bytes IS DISTINCT FROM p_compressed_bytes THEN
      RAISE EXCEPTION 'Committed object differs' USING ERRCODE='22023';
    END IF;
    RETURN internal_proesc.technical_archive_descriptor(v_batch)||jsonb_build_object('archivedRuns',0,'replayed',true);
  END IF;
  IF v_batch.status<>'PREPARED' OR v_batch.payload_text IS DISTINCT FROM p_verified_payload_text THEN
    RAISE EXCEPTION 'Technical archive changed or aborted' USING ERRCODE='40001';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM storage.objects o JOIN storage.buckets b ON b.id=o.bucket_id
    WHERE o.bucket_id=v_batch.bucket AND o.name=v_batch.object_path AND NOT b.public
      AND (o.metadata->>'size')::bigint=p_compressed_bytes) THEN
    RAISE EXCEPTION 'Verified private object is unavailable' USING ERRCODE='55000';
  END IF;
  -- Preparation uses started_at/id order, matching existing compactors' run locks.
  FOR v_entry IN SELECT value FROM jsonb_array_elements((p_verified_payload_text::jsonb)->'runs') WITH ORDINALITY
    ORDER BY ordinality
  LOOP
    v_run_id:=(v_entry->>'runId')::uuid;
    PERFORM 1 FROM internal_proesc.sync_runs r WHERE r.id=(v_entry->>'runId')::uuid
      AND r.status IN ('SUCCEEDED','PARTIAL','FAILED','ABANDONED')
      AND coalesce(r.finished_at,r.abandoned_at)<now()-interval '24 hours' FOR UPDATE;
    IF NOT FOUND OR EXISTS(SELECT 1 FROM internal_proesc.sync_run_items h
      WHERE h.run_id=(v_entry->>'runId')::uuid AND h.result IN ('UNCHANGED','FAILED','NOT_RECORDED'))
      OR EXISTS(SELECT 1 FROM internal_proesc.sync_run_http h
        WHERE h.run_id=(v_entry->>'runId')::uuid AND h.error_code IS NULL) THEN
      RAISE EXCEPTION 'Technical source is not terminal' USING ERRCODE='40001';
    END IF;
    SELECT to_jsonb(i) INTO v_current_items FROM internal_proesc.packed_run_items i
      WHERE i.run_id=(v_entry->>'runId')::uuid FOR UPDATE;
    SELECT to_jsonb(h) INTO v_current_http FROM internal_proesc.packed_run_http h
      WHERE h.run_id=(v_entry->>'runId')::uuid FOR UPDATE;
    SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.polo_id,c.class_id),'[]'::jsonb) INTO v_reused
      FROM internal_proesc.run_reused_observation_counts c WHERE c.run_id=v_run_id;
    IF coalesce(v_current_items,'null'::jsonb) IS DISTINCT FROM v_entry->'items'
      OR coalesce(v_current_http,'null'::jsonb) IS DISTINCT FROM v_entry->'http'
      OR v_reused IS DISTINCT FROM v_entry->'reusedCounts' THEN
      RAISE EXCEPTION 'Technical payload changed after preparation' USING ERRCODE='40001';
    END IF;
    SELECT * INTO v_items FROM jsonb_populate_record(NULL::internal_proesc.packed_run_items,NULLIF(v_entry->'items','null'::jsonb));
    IF v_items.run_id IS NOT NULL AND v_items.run_id IS DISTINCT FROM v_run_id THEN
      RAISE EXCEPTION 'Technical run identity mismatch' USING ERRCODE='22023';
    END IF;
    SELECT * INTO v_http FROM jsonb_populate_record(NULL::internal_proesc.packed_run_http,NULLIF(v_entry->'http','null'::jsonb));
    INSERT INTO internal_proesc.archived_technical_runs(run_id,batch_id,polo_ids,original_snapshot_ids,
      scoped_counts,reused_counts,error_records,item_row_count,http_row_count,item_content_sha256,http_content_sha256)
    VALUES(v_run_id,v_batch.id,ARRAY(SELECT DISTINCT p FROM (
        SELECT unnest(coalesce(v_items.polo_ids,ARRAY[]::uuid[])) p
        UNION ALL SELECT (e->>'polo_id')::uuid FROM jsonb_array_elements(v_reused) e
      ) scopes ORDER BY p),coalesce(v_items.original_snapshot_ids,ARRAY[]::uuid[]),
      coalesce(v_items.scoped_counts,'[]'::jsonb),v_reused,coalesce(v_items.error_records,'[]'::jsonb),
      coalesce(v_items.row_count,0),coalesce(v_http.row_count,0),v_items.content_sha256,v_http.content_sha256);
    DELETE FROM internal_proesc.packed_run_items WHERE run_id=v_run_id;
    DELETE FROM internal_proesc.packed_run_http WHERE run_id=v_run_id;
    DELETE FROM internal_proesc.run_reused_observation_counts WHERE run_id=v_run_id;
    -- Keeper/scope references remain intact: the archived evidence still needs them.
    v_count:=v_count+1;
  END LOOP;
  IF v_count<>v_batch.run_count THEN RAISE EXCEPTION 'Technical run count mismatch'; END IF;
  UPDATE internal_proesc.technical_archive_batches SET status='COMMITTED',payload_text=NULL,
    compressed_sha256=p_compressed_sha256,compressed_bytes=p_compressed_bytes,committed_at=now()
    WHERE id=v_batch.id RETURNING * INTO v_batch;
  RETURN internal_proesc.technical_archive_descriptor(v_batch)||jsonb_build_object('archivedRuns',v_count,'replayed',false);
END;
$function$;
REVOKE ALL ON FUNCTION public.proesc_technical_archive_state_service(uuid,uuid,boolean),
  public.proesc_commit_technical_archive_service(uuid,uuid,text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.proesc_technical_archive_state_service(uuid,uuid,boolean),
  public.proesc_commit_technical_archive_service(uuid,uuid,text,text,integer) TO service_role;
