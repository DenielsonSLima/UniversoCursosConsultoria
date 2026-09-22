-- Immutable technical payloads live in private Storage; SQL retains one scoped manifest per run.
CREATE TABLE internal_proesc.technical_archive_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_token uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'PREPARED' CHECK(status IN ('PREPARED','COMMITTED','ABORTED')),
  bucket text NOT NULL DEFAULT 'proesc-history' CHECK(bucket='proesc-history'),
  object_path text NOT NULL UNIQUE,
  payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[0-9a-f]{64}$'),
  payload_text text,
  run_count integer NOT NULL CHECK(run_count BETWEEN 1 AND 25),
  compressed_sha256 text CHECK(compressed_sha256 ~ '^[0-9a-f]{64}$'),
  compressed_bytes integer CHECK(compressed_bytes BETWEEN 1 AND 1048576),
  created_at timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz,
  aborted_at timestamptz,
  CHECK((status='PREPARED')=(payload_text IS NOT NULL)),
  CHECK((status='COMMITTED')=(committed_at IS NOT NULL)),
  CHECK((status='ABORTED')=(aborted_at IS NOT NULL)),
  CHECK(status<>'COMMITTED' OR (compressed_sha256 IS NOT NULL AND compressed_bytes IS NOT NULL)),
  CHECK(object_path='technical/v1/'||id::text||'.json.gz')
);
CREATE TABLE internal_proesc.archived_technical_runs (
  run_id uuid PRIMARY KEY REFERENCES internal_proesc.sync_runs(id),
  batch_id uuid NOT NULL REFERENCES internal_proesc.technical_archive_batches(id),
  polo_ids uuid[] NOT NULL,
  original_snapshot_ids uuid[] NOT NULL,
  scoped_counts jsonb NOT NULL CHECK(jsonb_typeof(scoped_counts)='array'),
  reused_counts jsonb NOT NULL CHECK(jsonb_typeof(reused_counts)='array'),
  error_records jsonb NOT NULL CHECK(jsonb_typeof(error_records)='array'),
  item_row_count integer NOT NULL CHECK(item_row_count BETWEEN 0 AND 60),
  http_row_count integer NOT NULL CHECK(http_row_count BETWEEN 0 AND 256),
  item_content_sha256 text CHECK(item_content_sha256 ~ '^[0-9a-f]{64}$'),
  http_content_sha256 text CHECK(http_content_sha256 ~ '^[0-9a-f]{64}$'),
  archived_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX archived_technical_observations_idx
  ON internal_proesc.archived_technical_runs USING gin(original_snapshot_ids);
CREATE INDEX archived_technical_batches_idx ON internal_proesc.archived_technical_runs(batch_id);
CREATE TABLE internal_proesc.technical_archive_runtime (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  readers_ready boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT false,
  last_request_id bigint,
  last_enqueued_at timestamptz
);
INSERT INTO internal_proesc.technical_archive_runtime(singleton) VALUES(true);
ALTER TABLE internal_proesc.technical_archive_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_proesc.archived_technical_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_proesc.technical_archive_runtime ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON internal_proesc.technical_archive_batches,internal_proesc.archived_technical_runs,
  internal_proesc.technical_archive_runtime FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION internal_proesc.technical_archive_descriptor(
  p_batch internal_proesc.technical_archive_batches,p_include_payload boolean DEFAULT false
) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $function$
  SELECT jsonb_build_object('status',p_batch.status,'batchId',p_batch.id,'formatVersion',1,
    'bucket',p_batch.bucket,'objectPath',p_batch.object_path,'payloadSha256',p_batch.payload_sha256,
    'compressedSha256',p_batch.compressed_sha256,'compressedBytes',p_batch.compressed_bytes,
    'runCount',p_batch.run_count)
    ||CASE WHEN p_include_payload THEN jsonb_build_object('leaseToken',p_batch.lease_token,
      'payloadText',p_batch.payload_text) ELSE '{}'::jsonb END;
$function$;
REVOKE ALL ON FUNCTION internal_proesc.technical_archive_descriptor(
  internal_proesc.technical_archive_batches,boolean) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.proesc_prepare_technical_archive_service(p_limit integer DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
SET lock_timeout='3s' SET statement_timeout='15s' AS $function$
DECLARE
  v_batch internal_proesc.technical_archive_batches;
  v_run uuid; v_items jsonb; v_http jsonb; v_reused jsonb; v_runs jsonb:='[]'::jsonb;
  v_text text; v_id uuid:=gen_random_uuid();
BEGIN
  PERFORM internal_proesc.require_receipt_archive_service();
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 25 THEN
    RAISE EXCEPTION 'Invalid technical archive limit' USING ERRCODE='22023';
  END IF;
  IF NOT (SELECT readers_ready FROM internal_proesc.technical_archive_runtime WHERE singleton) THEN
    RAISE EXCEPTION 'Technical archive readers are not ready' USING ERRCODE='55000';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('proesc:technical-archive',0));
  SELECT * INTO v_batch FROM internal_proesc.technical_archive_batches
    WHERE status='PREPARED' ORDER BY created_at,id LIMIT 1 FOR UPDATE;
  IF FOUND THEN RETURN internal_proesc.technical_archive_descriptor(v_batch,true); END IF;
  FOR v_run IN
    SELECT r.id FROM internal_proesc.sync_runs r
    WHERE r.status IN ('SUCCEEDED','PARTIAL','FAILED','ABANDONED')
      AND (EXISTS(SELECT 1 FROM internal_proesc.packed_run_items i WHERE i.run_id=r.id)
        OR EXISTS(SELECT 1 FROM internal_proesc.run_reused_observation_counts c WHERE c.run_id=r.id)
        OR EXISTS(SELECT 1 FROM internal_proesc.packed_run_http h WHERE h.run_id=r.id))
      AND coalesce(r.finished_at,r.abandoned_at)<now()-interval '24 hours'
      AND NOT EXISTS(SELECT 1 FROM internal_proesc.archived_technical_runs a WHERE a.run_id=r.id)
      -- Do not export a partial pack which a future compactor could recreate or extend.
      AND NOT EXISTS(SELECT 1 FROM internal_proesc.sync_run_items h WHERE h.run_id=r.id
        AND h.result IN ('UNCHANGED','FAILED','NOT_RECORDED'))
      AND NOT EXISTS(SELECT 1 FROM internal_proesc.sync_run_http h WHERE h.run_id=r.id AND h.error_code IS NULL)
    ORDER BY r.started_at,r.id LIMIT p_limit FOR UPDATE OF r SKIP LOCKED
  LOOP
    SELECT to_jsonb(i) INTO v_items FROM internal_proesc.packed_run_items i
      WHERE i.run_id=v_run FOR UPDATE;
    SELECT to_jsonb(h) INTO v_http FROM internal_proesc.packed_run_http h WHERE h.run_id=v_run FOR UPDATE;
    SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.polo_id,c.class_id),'[]'::jsonb) INTO v_reused
      FROM internal_proesc.run_reused_observation_counts c WHERE c.run_id=v_run;
    v_runs:=v_runs||jsonb_build_array(jsonb_build_object('runId',v_run,'items',v_items,'http',v_http,'reusedCounts',v_reused));
  END LOOP;
  IF jsonb_array_length(v_runs)=0 THEN RETURN jsonb_build_object('status','EMPTY','runCount',0); END IF;
  v_text:=jsonb_build_object('formatVersion',1,'kind','proesc-technical-history','runs',v_runs)::text;
  IF octet_length(v_text)>1048576 THEN
    RAISE EXCEPTION 'Technical archive exceeds 1 MiB; reduce batch size' USING ERRCODE='54000';
  END IF;
  INSERT INTO internal_proesc.technical_archive_batches(id,object_path,payload_sha256,payload_text,run_count)
    VALUES(v_id,'technical/v1/'||v_id::text||'.json.gz',
      encode(extensions.digest(v_text,'sha256'),'hex'),v_text,jsonb_array_length(v_runs))
    RETURNING * INTO v_batch;
  RETURN internal_proesc.technical_archive_descriptor(v_batch,true);
END;
$function$;
REVOKE ALL ON FUNCTION public.proesc_prepare_technical_archive_service(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.proesc_prepare_technical_archive_service(integer) TO service_role;
