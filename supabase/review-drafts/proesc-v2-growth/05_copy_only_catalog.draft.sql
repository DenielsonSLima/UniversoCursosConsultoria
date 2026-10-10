-- LOCAL PREPARATION ONLY. No production installation, approval, export or upload.
-- Copy plans are database-operator approved; service callers can use only those IDs.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';

DO $authorization$
BEGIN
  IF current_user<>'postgres' THEN RAISE EXCEPTION 'Database operator required' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('internal_proesc.require_receipt_archive_service()')
    AND md5(prosrc)='1c73b1562b18891547b23c295cc7a84b' AND NOT prosecdef
    AND proowner='postgres'::regrole AND proconfig=ARRAY['search_path=""']::text[]) THEN
    RAISE EXCEPTION 'Existing archive authorizer changed: review before copy integration';
  END IF;
END;
$authorization$;

CREATE TABLE internal_proesc.v2_copy_archive_plans (
  id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES internal_proesc.v2_runs(id),
  unit_id text NOT NULL CHECK(unit_id ~ '^[1-9][0-9]{0,17}$'),
  observation_ids uuid[] NOT NULL CHECK(cardinality(observation_ids) BETWEEN 1 AND 100),
  source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
  raw_bytes integer NOT NULL CHECK(raw_bytes BETWEEN 1 AND 1048576),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE internal_proesc.v2_copy_archive_receipts (
  batch_id uuid PRIMARY KEY REFERENCES internal_proesc.v2_copy_archive_plans(id),
  receipt jsonb NOT NULL CHECK(jsonb_typeof(receipt)='object'),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE internal_proesc.v2_copy_archive_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_proesc.v2_copy_archive_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON internal_proesc.v2_copy_archive_plans,
  internal_proesc.v2_copy_archive_receipts FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION internal_proesc.v2_copy_archive_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $function$
BEGIN
  RAISE EXCEPTION 'Copy-only catalog entries are immutable' USING ERRCODE='55000';
END;
$function$;
CREATE TRIGGER v2_copy_plan_immutable BEFORE UPDATE OR DELETE ON internal_proesc.v2_copy_archive_plans
  FOR EACH ROW EXECUTE FUNCTION internal_proesc.v2_copy_archive_immutable();
CREATE TRIGGER v2_copy_receipt_immutable BEFORE UPDATE OR DELETE ON internal_proesc.v2_copy_archive_receipts
  FOR EACH ROW EXECUTE FUNCTION internal_proesc.v2_copy_archive_immutable();

CREATE FUNCTION internal_proesc.v2_copy_archive_source(p_run uuid,p_unit text,p_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' SET timezone='UTC' AS $function$
DECLARE v_run internal_proesc.v2_runs; v_row internal_proesc.v2_invoice_observations;
  v_ids uuid[]; v_rows text:=''; v_count integer:=0; v_text text; v_line text;
BEGIN
  IF p_run IS NULL OR p_unit IS NULL OR p_unit !~ '^[1-9][0-9]{0,17}$'
    OR p_ids IS NULL OR array_ndims(p_ids) IS DISTINCT FROM 1
    OR cardinality(p_ids) NOT BETWEEN 1 AND 100 OR array_position(p_ids,NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Invalid bounded copy selection' USING ERRCODE='22023';
  END IF;
  SELECT array_agg(DISTINCT x ORDER BY x) INTO v_ids FROM unnest(p_ids) x;
  IF cardinality(v_ids)<>cardinality(p_ids) THEN
    RAISE EXCEPTION 'Duplicate copy observation IDs' USING ERRCODE='22023';
  END IF;
  SELECT * INTO STRICT v_run FROM internal_proesc.v2_runs WHERE id=p_run;
  IF v_run.status<>'COMPLETE' OR v_run.finished_at IS NULL THEN
    RAISE EXCEPTION 'Copy requires a complete source run' USING ERRCODE='55000';
  END IF;
  -- STABLE uses the caller statement snapshot. PK-selected rows only, no history scan.
  FOR v_row IN SELECT o.* FROM internal_proesc.v2_invoice_observations o
    JOIN internal_proesc.v2_tasks t ON t.id=o.task_id AND t.run_id=o.run_id AND t.unit_id=o.unit_id
    WHERE o.id=ANY(v_ids) AND o.run_id=p_run AND o.unit_id=p_unit
      AND o.result<>'STAGED' AND t.status='COMPLETE' AND t.resource='invoices' ORDER BY o.id LOOP
    -- normalized stays PostgreSQL JSON text inside a JSON string: no JS numeric roundtrip.
    v_line:=jsonb_build_object('observation',jsonb_build_object(
      'id',v_row.id,'run_id',v_row.run_id,'task_id',v_row.task_id,'unit_id',v_row.unit_id,
      'invoice_id',v_row.invoice_id,'link_id',v_row.link_id,'snapshot_id',v_row.snapshot_id,
      'source_status',v_row.source_status,'result',v_row.result,'reason',v_row.reason,
      'observed_at',v_row.observed_at,'recorded_at',v_row.recorded_at,
      'normalized_payload_id',v_row.normalized_payload_id),
      'normalizedJson',internal_proesc.v2_invoice_normalized(v_row)::text)::text;
    IF octet_length(v_rows)+octet_length(v_line)>1040000 THEN
      RAISE EXCEPTION 'Copy source exceeds byte limit' USING ERRCODE='54000';
    END IF;
    v_rows:=v_rows||CASE WHEN v_count=0 THEN '' ELSE ',' END||v_line;
    v_count:=v_count+1;
  END LOOP;
  IF v_count<>cardinality(v_ids) THEN
    RAISE EXCEPTION 'Copy selection missing or outside complete run/unit scope' USING ERRCODE='22023';
  END IF;
  v_text:='{"format":"proesc-v2-copy-v1","normalizationVersion":1,"run":'
    ||jsonb_build_object('id',v_run.id,'actor_id',v_run.actor_id,'credential_revision',v_run.credential_revision,
      'mode',v_run.mode,'status',v_run.status,'created_at',v_run.created_at,'finished_at',v_run.finished_at)::text
    ||',"unitId":'||to_jsonb(p_unit)::text||',"rows":['||v_rows||']}';
  IF octet_length(v_text)>1048576 THEN RAISE EXCEPTION 'Copy source exceeds byte limit' USING ERRCODE='54000'; END IF;
  RETURN jsonb_build_object('format','proesc-v2-copy-v1','runId',p_run,'tenantId',p_unit,
    'observationIds',to_jsonb(v_ids),'rowCount',v_count,'payloadText',v_text,
    'payloadSha256',encode(extensions.digest(v_text,'sha256'),'hex'),'rawBytes',octet_length(v_text));
END;
$function$;

CREATE FUNCTION internal_proesc.v2_prepare_copy_archive(p_batch uuid,p_run uuid,p_unit text,p_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $function$
DECLARE v_source jsonb; v_plan internal_proesc.v2_copy_archive_plans; v_ids uuid[];
BEGIN
  IF current_user<>'postgres' OR p_batch IS NULL THEN
    RAISE EXCEPTION 'Database operator approval required for copy plan' USING ERRCODE='42501';
  END IF;
  v_source:=internal_proesc.v2_copy_archive_source(p_run,p_unit,p_ids);
  SELECT array_agg(x::uuid ORDER BY x::uuid) INTO v_ids
    FROM jsonb_array_elements_text(v_source->'observationIds') x;
  INSERT INTO internal_proesc.v2_copy_archive_plans(id,run_id,unit_id,observation_ids,source_sha256,raw_bytes)
    VALUES(p_batch,p_run,p_unit,v_ids,v_source->>'payloadSha256',(v_source->>'rawBytes')::integer)
    ON CONFLICT(id) DO NOTHING;
  SELECT * INTO STRICT v_plan FROM internal_proesc.v2_copy_archive_plans WHERE id=p_batch;
  IF v_plan.run_id IS DISTINCT FROM p_run OR v_plan.unit_id IS DISTINCT FROM p_unit
    OR v_plan.observation_ids IS DISTINCT FROM v_ids
    OR v_plan.source_sha256 IS DISTINCT FROM v_source->>'payloadSha256'
    OR v_plan.raw_bytes IS DISTINCT FROM (v_source->>'rawBytes')::integer THEN
    RAISE EXCEPTION 'Copy plan replay conflict' USING ERRCODE='40001';
  END IF;
  RETURN jsonb_build_object('batchId',p_batch,'status','PREPARED_COPY_ONLY',
    'rowCount',cardinality(v_ids),'payloadSha256',v_plan.source_sha256,'rawBytes',v_plan.raw_bytes);
END;
$function$;

CREATE FUNCTION public.proesc_v2_export_copy_service(p_batch uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET statement_timeout='5s' AS $function$
DECLARE v_plan internal_proesc.v2_copy_archive_plans; v_source jsonb;
BEGIN
  PERFORM internal_proesc.require_receipt_archive_service();
  SELECT * INTO STRICT v_plan FROM internal_proesc.v2_copy_archive_plans WHERE id=p_batch;
  v_source:=internal_proesc.v2_copy_archive_source(v_plan.run_id,v_plan.unit_id,v_plan.observation_ids);
  IF v_source->>'payloadSha256' IS DISTINCT FROM v_plan.source_sha256
    OR (v_source->>'rawBytes')::integer IS DISTINCT FROM v_plan.raw_bytes THEN
    RAISE EXCEPTION 'Copy source changed after approved plan' USING ERRCODE='40001';
  END IF;
  RETURN v_source||jsonb_build_object('batchId',p_batch,'projectRef','kfekgwyqozhicpfuunpo',
    'bucket','proesc-history','namespace','proesc-v2-copy');
END;
$function$;

CREATE FUNCTION public.proesc_v2_record_copy_receipt_service(p_batch uuid,p_receipt jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='3s' AS $function$
DECLARE v_plan internal_proesc.v2_copy_archive_plans; v_existing jsonb; v_scope jsonb; v_field text;
BEGIN
  -- Authorize before any replay lookup. Only an approved batch can receive a receipt.
  PERFORM internal_proesc.require_receipt_archive_service();
  SELECT * INTO STRICT v_plan FROM internal_proesc.v2_copy_archive_plans WHERE id=p_batch;
  v_scope:=jsonb_build_object('projectRef','kfekgwyqozhicpfuunpo','bucket','proesc-history',
    'namespace','proesc-v2-copy','tenantId',v_plan.unit_id,'prefix','proesc-v2-copy/'||v_plan.unit_id);
  IF jsonb_typeof(p_receipt) IS DISTINCT FROM 'object' OR octet_length(p_receipt::text)>16384 THEN
    RAISE EXCEPTION 'Invalid copy-only receipt' USING ERRCODE='22023';
  END IF;
  IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_receipt) key) IS DISTINCT FROM
    ARRAY['batchId','compressedBytes','compressedSha256','copyOnly','format','manifestCompressedBytes',
      'manifestCompressedSha256','manifestJsonBytes','manifestJsonSha256','manifestObjectName',
      'objectName','payloadSha256','rawBytes','rowCount','storageScope']::text[]
    OR p_receipt->>'format' IS DISTINCT FROM 'proesc-v2-copy-receipt-v1'
    OR p_receipt->>'batchId' IS DISTINCT FROM p_batch::text
    OR p_receipt->'copyOnly' IS DISTINCT FROM 'true'::jsonb
    OR p_receipt->'storageScope' IS DISTINCT FROM v_scope
    OR p_receipt->>'payloadSha256' IS DISTINCT FROM v_plan.source_sha256
    OR p_receipt->'rawBytes' IS DISTINCT FROM to_jsonb(v_plan.raw_bytes)
    OR p_receipt->'rowCount' IS DISTINCT FROM to_jsonb(cardinality(v_plan.observation_ids)) THEN
    RAISE EXCEPTION 'Copy receipt identity or scope mismatch' USING ERRCODE='22023';
  END IF;
  FOREACH v_field IN ARRAY ARRAY['compressedSha256','manifestJsonSha256','manifestCompressedSha256'] LOOP
    IF jsonb_typeof(p_receipt->v_field) IS DISTINCT FROM 'string'
      OR coalesce(p_receipt->>v_field,'') !~ '^[a-f0-9]{64}$' THEN
      RAISE EXCEPTION 'Invalid receipt digest' USING ERRCODE='22023';
    END IF;
  END LOOP;
  FOREACH v_field IN ARRAY ARRAY['compressedBytes','manifestJsonBytes','manifestCompressedBytes'] LOOP
    IF jsonb_typeof(p_receipt->v_field) IS DISTINCT FROM 'number'
      OR coalesce(p_receipt->>v_field,'') !~ '^[1-9][0-9]{0,6}$' THEN
      RAISE EXCEPTION 'Invalid receipt byte count' USING ERRCODE='22023';
    END IF;
    IF (p_receipt->>v_field)::integer>(CASE WHEN v_field='compressedBytes' THEN 4194304 ELSE 65536 END) THEN
      RAISE EXCEPTION 'Receipt exceeds byte limits' USING ERRCODE='22023';
    END IF;
  END LOOP;
  IF p_receipt->>'objectName' IS DISTINCT FROM p_batch::text||'.'||(p_receipt->>'compressedSha256')||'.jsonl.gz'
    OR p_receipt->>'manifestObjectName' IS DISTINCT FROM p_batch::text||'.'||(p_receipt->>'manifestCompressedSha256')||'.manifest.json.gz' THEN
    RAISE EXCEPTION 'Receipt object name mismatch' USING ERRCODE='22023';
  END IF;
  -- HTTP verification is performed by the trusted worker. SQL cannot attest Storage bytes.
  INSERT INTO internal_proesc.v2_copy_archive_receipts(batch_id,receipt) VALUES(p_batch,p_receipt)
    ON CONFLICT(batch_id) DO NOTHING;
  SELECT receipt INTO STRICT v_existing FROM internal_proesc.v2_copy_archive_receipts WHERE batch_id=p_batch;
  IF v_existing IS DISTINCT FROM p_receipt THEN
    RAISE EXCEPTION 'Copy receipt replay conflict' USING ERRCODE='40001';
  END IF;
  RETURN jsonb_build_object('batchId',p_batch,'status','COPY_RECEIPT_RECORDED','copyOnly',true);
END;
$function$;

REVOKE ALL ON FUNCTION internal_proesc.v2_copy_archive_immutable(),
  internal_proesc.v2_copy_archive_source(uuid,text,uuid[]),
  internal_proesc.v2_prepare_copy_archive(uuid,uuid,text,uuid[]),
  public.proesc_v2_export_copy_service(uuid),public.proesc_v2_record_copy_receipt_service(uuid,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.proesc_v2_export_copy_service(uuid),
  public.proesc_v2_record_copy_receipt_service(uuid,jsonb) TO service_role;

-- Extend the existing exact-hash reader inventory atomically. Never relax its detector.
DO $inventory$
DECLARE v_definition text; v_hash text;
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='internal_proesc.v2_assert_payload_readers()'::regprocedure)
    IS DISTINCT FROM 'e55278f81cf0bd5dc634208d31a9db35' THEN
    RAISE EXCEPTION 'Reader inventory changed: review copy-only integration first';
  END IF;
  SELECT md5(prosrc) INTO STRICT v_hash FROM pg_proc
    WHERE oid='internal_proesc.v2_copy_archive_source(uuid,text,uuid[])'::regprocedure;
  IF v_hash IS DISTINCT FROM '78815efc4775cd1683c36e37627ba577' THEN RAISE EXCEPTION 'Copy source was not reviewed'; END IF;
  SELECT pg_get_functiondef('internal_proesc.v2_assert_payload_readers()'::regprocedure) INTO v_definition;
  v_definition:=replace(v_definition,'$allowed$[','$allowed$["internal_proesc.v2_copy_archive_source(uuid,text,uuid[])",');
  v_definition:=replace(v_definition,'$after$[','$after$['||jsonb_build_object(
    'signature','internal_proesc.v2_copy_archive_source(uuid,text,uuid[])','hash',v_hash)::text||',');
  EXECUTE v_definition;
  PERFORM internal_proesc.v2_assert_payload_readers();
END;
$inventory$;
COMMIT;
