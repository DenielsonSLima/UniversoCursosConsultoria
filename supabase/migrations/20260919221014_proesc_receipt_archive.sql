-- Immutable Storage archives retain complete request receipts and exact replay semantics.
-- Storage upload/download verification precedes the atomic commit below.
CREATE TABLE internal_proesc.receipt_archive_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_token uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'PREPARED' CHECK (status IN ('PREPARED','COMMITTED','ABORTED')),
  bucket text NOT NULL DEFAULT 'proesc-history' CHECK (bucket='proesc-history'),
  object_path text NOT NULL UNIQUE,
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  payload_text text,
  row_count integer NOT NULL CHECK (row_count BETWEEN 1 AND 500),
  compressed_sha256 text CHECK (compressed_sha256 ~ '^[0-9a-f]{64}$'),
  compressed_bytes bigint CHECK (compressed_bytes BETWEEN 1 AND 1048576),
  created_at timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz,
  aborted_at timestamptz,
  CHECK ((status='PREPARED')=(payload_text IS NOT NULL)),
  CHECK ((status='COMMITTED')=(committed_at IS NOT NULL)),
  CHECK ((status='ABORTED')=(aborted_at IS NOT NULL)),
  CHECK (status<>'COMMITTED' OR (compressed_sha256 IS NOT NULL AND compressed_bytes IS NOT NULL)),
  CHECK (object_path='receipts/v1/' || id::text || '.json.gz')
);
CREATE TABLE internal_proesc.archived_receipt_requests (
  request_id uuid PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES internal_proesc.receipt_archive_batches(id)
);
ALTER TABLE internal_proesc.receipt_archive_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_proesc.archived_receipt_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON internal_proesc.receipt_archive_batches,internal_proesc.archived_receipt_requests
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION internal_proesc.require_receipt_archive_service()
RETURNS void LANGUAGE plpgsql SET search_path='' AS $function$
BEGIN
  IF coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb->>'role'
    IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Acesso interno ao arquivo Proesc não autorizado.' USING ERRCODE='42501';
  END IF;
END;
$function$;

CREATE FUNCTION internal_proesc.receipt_archive_eligible(
  p_request internal_proesc.reconciliation_requests,p_before timestamptz
) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $function$
  SELECT p_request.created_at<p_before AND p_request.completed_at<p_before
    AND jsonb_typeof(p_request.response)='object'
    AND p_request.response->'replayed'='false'::jsonb
    AND (
      (p_request.action='APPLY' AND p_request.response->>'result'='UNCHANGED') OR
      (p_request.action='SNAPSHOT' AND EXISTS(
        SELECT 1 FROM internal_proesc.financial_observation_history s
        WHERE s.id=CASE WHEN p_request.response->>'snapshotId'
          ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN (p_request.response->>'snapshotId')::uuid END
      ))
    )
    AND NOT EXISTS(SELECT 1 FROM internal_proesc.reconciliation_events e WHERE e.request_id=p_request.request_id)
    AND NOT EXISTS(SELECT 1 FROM internal_proesc.mutation_claims c WHERE c.request_id=p_request.request_id)
    AND NOT EXISTS(SELECT 1 FROM internal_proesc.obligation_imports i WHERE i.request_id=p_request.request_id)
    AND NOT EXISTS(SELECT 1 FROM internal_proesc.enrollment_financial_confirmations c WHERE c.request_id=p_request.request_id);
$function$;

CREATE FUNCTION internal_proesc.receipt_archive_descriptor(
  p_batch internal_proesc.receipt_archive_batches,p_include_payload boolean DEFAULT false
) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $function$
  SELECT jsonb_build_object('status',p_batch.status,'batchId',p_batch.id,'formatVersion',1,
    'bucket',p_batch.bucket,'objectPath',p_batch.object_path,'payloadSha256',p_batch.payload_sha256,
    'compressedSha256',p_batch.compressed_sha256,'compressedBytes',p_batch.compressed_bytes,
    'rowCount',p_batch.row_count)
    || CASE WHEN p_include_payload THEN jsonb_build_object('leaseToken',p_batch.lease_token,
      'payloadText',p_batch.payload_text) ELSE '{}'::jsonb END;
$function$;

CREATE FUNCTION public.proesc_prepare_receipt_archive_service(
  p_limit integer DEFAULT 500,p_before timestamptz DEFAULT now()-interval '24 hours'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
SET lock_timeout='3s' SET statement_timeout='15s' AS $function$
DECLARE
  v_batch internal_proesc.receipt_archive_batches;
  v_rows jsonb; v_text text; v_id uuid:=gen_random_uuid();
BEGIN
  PERFORM internal_proesc.require_receipt_archive_service();
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500 OR p_before IS NULL
    OR p_before>now()-interval '24 hours' THEN
    RAISE EXCEPTION 'Janela ou tamanho do arquivo inválido.' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('proesc:receipt-archive:prepare',0));
  SELECT * INTO v_batch FROM internal_proesc.receipt_archive_batches
    WHERE status='PREPARED' ORDER BY created_at,id LIMIT 1 FOR UPDATE;
  IF FOUND THEN RETURN internal_proesc.receipt_archive_descriptor(v_batch,true); END IF;
  SELECT jsonb_agg(to_jsonb(r) ORDER BY r.request_id) INTO v_rows FROM (
    SELECT r.* FROM internal_proesc.reconciliation_requests r
    WHERE internal_proesc.receipt_archive_eligible(r,p_before)
      AND NOT EXISTS(SELECT 1 FROM internal_proesc.archived_receipt_requests a WHERE a.request_id=r.request_id)
    LIMIT p_limit FOR UPDATE SKIP LOCKED
  ) r;
  IF v_rows IS NULL THEN RETURN jsonb_build_object('status','EMPTY','rowCount',0); END IF;
  v_text:=jsonb_build_object('formatVersion',1,'rows',v_rows)::text;
  IF octet_length(v_text)>1048576 THEN
    RAISE EXCEPTION 'Lote excede 1 MiB; repetir com menos registros.' USING ERRCODE='54000';
  END IF;
  INSERT INTO internal_proesc.receipt_archive_batches(id,object_path,payload_sha256,payload_text,row_count)
    VALUES(v_id,'receipts/v1/'||v_id::text||'.json.gz',
      encode(extensions.digest(v_text,'sha256'),'hex'),v_text,jsonb_array_length(v_rows))
    RETURNING * INTO v_batch;
  RETURN internal_proesc.receipt_archive_descriptor(v_batch,true);
END;
$function$;

CREATE FUNCTION public.proesc_receipt_archive_status_service(p_batch_id uuid,p_lease_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
SET lock_timeout='3s' SET statement_timeout='15s' AS $function$
DECLARE v_batch internal_proesc.receipt_archive_batches;
BEGIN
  PERFORM internal_proesc.require_receipt_archive_service();
  SELECT * INTO v_batch FROM internal_proesc.receipt_archive_batches WHERE id=p_batch_id;
  IF NOT FOUND OR v_batch.lease_token IS DISTINCT FROM p_lease_token THEN
    RAISE EXCEPTION 'Arquivo ou concessão inválida.' USING ERRCODE='22023';
  END IF;
  RETURN internal_proesc.receipt_archive_descriptor(v_batch);
END;
$function$;

CREATE FUNCTION public.proesc_abort_receipt_archive_service(p_batch_id uuid,p_lease_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
SET lock_timeout='3s' SET statement_timeout='15s' AS $function$
DECLARE v_batch internal_proesc.receipt_archive_batches;
BEGIN
  PERFORM internal_proesc.require_receipt_archive_service();
  SELECT * INTO v_batch FROM internal_proesc.receipt_archive_batches WHERE id=p_batch_id FOR UPDATE;
  IF NOT FOUND OR v_batch.lease_token IS DISTINCT FROM p_lease_token THEN
    RAISE EXCEPTION 'Arquivo ou concessão inválida.' USING ERRCODE='22023';
  END IF;
  IF v_batch.status='COMMITTED' OR EXISTS(
    SELECT 1 FROM internal_proesc.archived_receipt_requests WHERE batch_id=v_batch.id
  ) THEN
    RAISE EXCEPTION 'Arquivo confirmado não pode ser cancelado.' USING ERRCODE='40001';
  END IF;
  IF v_batch.status='PREPARED' THEN
    UPDATE internal_proesc.receipt_archive_batches SET status='ABORTED',payload_text=NULL,aborted_at=now()
      WHERE id=v_batch.id RETURNING * INTO v_batch;
  END IF;
  -- Source receipts and any uploaded object remain untouched. The hash/path are retained for audit.
  RETURN internal_proesc.receipt_archive_descriptor(v_batch)||jsonb_build_object('aborted',true);
END;
$function$;

CREATE FUNCTION public.proesc_commit_receipt_archive_service(
  p_batch_id uuid,p_lease_token uuid,p_verified_payload_text text,
  p_compressed_sha256 text,p_compressed_bytes bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
SET lock_timeout='3s' SET statement_timeout='15s' AS $function$
DECLARE
  v_batch internal_proesc.receipt_archive_batches;
  v_row internal_proesc.reconciliation_requests;
  v_current internal_proesc.reconciliation_requests;
  v_rows jsonb; v_deleted integer; v_count integer:=0;
BEGIN
  PERFORM internal_proesc.require_receipt_archive_service();
  SELECT * INTO STRICT v_batch FROM internal_proesc.receipt_archive_batches WHERE id=p_batch_id FOR UPDATE;
  IF v_batch.lease_token IS DISTINCT FROM p_lease_token
    OR p_verified_payload_text IS NULL OR octet_length(p_verified_payload_text)>1048576
    OR encode(extensions.digest(p_verified_payload_text,'sha256'),'hex') IS DISTINCT FROM v_batch.payload_sha256
    OR p_compressed_sha256 IS NULL OR p_compressed_sha256 !~ '^[0-9a-f]{64}$'
    OR p_compressed_bytes IS NULL OR p_compressed_bytes NOT BETWEEN 1 AND 1048576 THEN
    RAISE EXCEPTION 'Arquivo ou concessão de escrita não confere.' USING ERRCODE='22023';
  END IF;
  IF v_batch.status='COMMITTED' THEN
    IF v_batch.compressed_sha256 IS DISTINCT FROM p_compressed_sha256
      OR v_batch.compressed_bytes IS DISTINCT FROM p_compressed_bytes THEN
      RAISE EXCEPTION 'Arquivo já confirmado com outro conteúdo.' USING ERRCODE='22023';
    END IF;
    RETURN internal_proesc.receipt_archive_descriptor(v_batch)||jsonb_build_object('archivedCount',0,'replayed',true);
  END IF;
  IF v_batch.status='ABORTED' THEN
    RAISE EXCEPTION 'Arquivo cancelado; preparar um novo lote.' USING ERRCODE='40001';
  END IF;
  IF v_batch.payload_text IS DISTINCT FROM p_verified_payload_text THEN
    RAISE EXCEPTION 'Conteúdo canônico divergente.' USING ERRCODE='22023';
  END IF;
  v_rows:=(p_verified_payload_text::jsonb)->'rows';
  FOR v_row IN SELECT * FROM jsonb_populate_recordset(NULL::internal_proesc.reconciliation_requests,v_rows)
    ORDER BY request_id LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('proesc:financial-request:'||v_row.request_id::text,0));
    SELECT * INTO v_current FROM internal_proesc.reconciliation_requests WHERE request_id=v_row.request_id FOR UPDATE;
    IF NOT FOUND OR to_jsonb(v_current) IS DISTINCT FROM to_jsonb(v_row)
      OR NOT internal_proesc.receipt_archive_eligible(v_current,now()-interval '24 hours') THEN
      RAISE EXCEPTION 'Recibo alterado ou vinculado após a preparação.' USING ERRCODE='40001';
    END IF;
    INSERT INTO internal_proesc.archived_receipt_requests(request_id,batch_id) VALUES(v_row.request_id,v_batch.id);
    DELETE FROM internal_proesc.reconciliation_requests WHERE request_id=v_row.request_id;
    GET DIAGNOSTICS v_deleted=ROW_COUNT;
    IF v_deleted<>1 THEN RAISE EXCEPTION 'Recibo não removido atomicamente.'; END IF;
    v_count:=v_count+1;
  END LOOP;
  IF v_count<>v_batch.row_count THEN RAISE EXCEPTION 'Contagem do arquivo divergente.'; END IF;
  UPDATE internal_proesc.receipt_archive_batches SET status='COMMITTED',payload_text=NULL,
    compressed_sha256=p_compressed_sha256,compressed_bytes=p_compressed_bytes,committed_at=now()
    WHERE id=v_batch.id RETURNING * INTO v_batch;
  RETURN internal_proesc.receipt_archive_descriptor(v_batch)||jsonb_build_object('archivedCount',v_count,'replayed',false);
END;
$function$;

CREATE OR REPLACE FUNCTION internal_proesc.begin_financial_request(
  p_action text,p_actor_id uuid,p_request_id uuid,p_payload jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE
  v_request internal_proesc.reconciliation_requests; v_hash text;
  v_batch internal_proesc.receipt_archive_batches;
BEGIN
  PERFORM internal_proesc.authorize_financial_operator(p_actor_id);
  IF p_request_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Requisição financeira Proesc inválida.' USING ERRCODE='22023';
  END IF;
  v_hash:=encode(extensions.digest(p_payload::text,'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended('proesc:financial-request:'||p_request_id::text,0));
  SELECT * INTO v_request FROM internal_proesc.reconciliation_requests WHERE request_id=p_request_id;
  IF FOUND THEN
    IF v_request.action IS DISTINCT FROM p_action OR v_request.actor_id IS DISTINCT FROM p_actor_id
      OR v_request.payload_hash IS DISTINCT FROM v_hash OR v_request.response IS NULL THEN
      RAISE EXCEPTION 'requestId já utilizado com outra intenção.' USING ERRCODE='22023';
    END IF;
    RETURN v_request.response||jsonb_build_object('replayed',true);
  END IF;
  SELECT b.* INTO v_batch FROM internal_proesc.archived_receipt_requests a
    JOIN internal_proesc.receipt_archive_batches b ON b.id=a.batch_id WHERE a.request_id=p_request_id;
  IF FOUND THEN
    RAISE EXCEPTION 'PROESC_RECEIPT_ARCHIVE_REQUIRED' USING ERRCODE='PZ001',
      DETAIL=(internal_proesc.receipt_archive_descriptor(v_batch)||jsonb_build_object('requestId',p_request_id))::text;
  END IF;
  INSERT INTO internal_proesc.reconciliation_requests(request_id,action,actor_id,payload_hash)
    VALUES(p_request_id,p_action,p_actor_id,v_hash);
  RETURN NULL;
END;
$function$;

CREATE FUNCTION public.proesc_restore_receipt_archive_service(p_request_id uuid,p_payload_text text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
SET lock_timeout='3s' SET statement_timeout='15s' AS $function$
DECLARE
  v_batch internal_proesc.receipt_archive_batches;
  v_row internal_proesc.reconciliation_requests; v_current internal_proesc.reconciliation_requests;
  v_document jsonb; v_count integer;
BEGIN
  PERFORM internal_proesc.require_receipt_archive_service();
  IF p_request_id IS NULL OR p_payload_text IS NULL OR octet_length(p_payload_text)>1048576 THEN
    RAISE EXCEPTION 'Conteúdo do arquivo inválido.' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('proesc:financial-request:'||p_request_id::text,0));
  SELECT b.* INTO v_batch FROM internal_proesc.archived_receipt_requests a
    JOIN internal_proesc.receipt_archive_batches b ON b.id=a.batch_id
    WHERE a.request_id=p_request_id AND b.status='COMMITTED';
  IF NOT FOUND THEN
    -- A concurrent successful restore is idempotent, but arbitrary missing IDs are never inserted.
    IF EXISTS(SELECT 1 FROM internal_proesc.reconciliation_requests WHERE request_id=p_request_id AND response IS NOT NULL) THEN
      RETURN jsonb_build_object('restored',true,'requestId',p_request_id,'replayed',true);
    END IF;
    RAISE EXCEPTION 'Recibo não possui arquivo confirmado.' USING ERRCODE='22023';
  END IF;
  IF encode(extensions.digest(p_payload_text,'sha256'),'hex') IS DISTINCT FROM v_batch.payload_sha256 THEN
    RAISE EXCEPTION 'Integridade do arquivo inválida.' USING ERRCODE='22023';
  END IF;
  v_document:=p_payload_text::jsonb;
  IF v_document->>'formatVersion'<>'1' OR jsonb_typeof(v_document->'rows') IS DISTINCT FROM 'array'
    OR jsonb_array_length(v_document->'rows')<>v_batch.row_count THEN
    RAISE EXCEPTION 'Formato do arquivo inválido.' USING ERRCODE='22023';
  END IF;
  SELECT count(*) INTO v_count FROM jsonb_array_elements(v_document->'rows') r WHERE r->>'request_id'=p_request_id::text;
  IF v_count<>1 THEN RAISE EXCEPTION 'Recibo ausente ou duplicado no arquivo.' USING ERRCODE='22023'; END IF;
  SELECT r.* INTO STRICT v_row FROM jsonb_populate_recordset(NULL::internal_proesc.reconciliation_requests,v_document->'rows') r
    WHERE r.request_id=p_request_id;
  IF v_row.response IS NULL OR v_row.completed_at IS NULL THEN
    RAISE EXCEPTION 'Recibo arquivado incompleto.' USING ERRCODE='22023';
  END IF;
  INSERT INTO internal_proesc.reconciliation_requests SELECT (v_row).* ON CONFLICT(request_id) DO NOTHING;
  SELECT * INTO STRICT v_current FROM internal_proesc.reconciliation_requests WHERE request_id=p_request_id;
  IF to_jsonb(v_current) IS DISTINCT FROM to_jsonb(v_row) THEN
    RAISE EXCEPTION 'Recibo atual diverge do arquivo.' USING ERRCODE='40001';
  END IF;
  DELETE FROM internal_proesc.archived_receipt_requests WHERE request_id=p_request_id;
  RETURN jsonb_build_object('restored',true,'requestId',p_request_id,'replayed',false);
END;
$function$;

REVOKE ALL ON FUNCTION internal_proesc.require_receipt_archive_service(),
  internal_proesc.receipt_archive_eligible(internal_proesc.reconciliation_requests,timestamptz),
  internal_proesc.receipt_archive_descriptor(internal_proesc.receipt_archive_batches,boolean)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.proesc_prepare_receipt_archive_service(integer,timestamptz),
  public.proesc_receipt_archive_status_service(uuid,uuid),
  public.proesc_abort_receipt_archive_service(uuid,uuid),
  public.proesc_commit_receipt_archive_service(uuid,uuid,text,text,bigint),
  public.proesc_restore_receipt_archive_service(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.proesc_prepare_receipt_archive_service(integer,timestamptz),
  public.proesc_receipt_archive_status_service(uuid,uuid),
  public.proesc_abort_receipt_archive_service(uuid,uuid),
  public.proesc_commit_receipt_archive_service(uuid,uuid,text,text,bigint),
  public.proesc_restore_receipt_archive_service(uuid,text) TO service_role;
