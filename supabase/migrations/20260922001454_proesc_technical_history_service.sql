-- Only the authenticated Edge handler may fetch private archive pointers.
-- Recheck actor and scope after download; payload supplied by a client is never trusted.
CREATE FUNCTION public.proesc_technical_history_service(
  p_actor_id uuid,p_run_id uuid,p_polo_id uuid DEFAULT NULL,p_payload_text text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
SET statement_timeout='10s' AS $function$
DECLARE
  v_manifest internal_proesc.archived_technical_runs;
  v_batch internal_proesc.technical_archive_batches;
  v_document jsonb; v_cold jsonb; v_items jsonb; v_http jsonb; v_reused jsonb;
BEGIN
  -- This route intentionally matches monitor_scope: active GLOBAL gestor with Configurações.
  -- The actor comes from requireGestorAtivo, never from the HTTP body. The private helper
  -- independently checks service_role, effective permissions, no restricted polo_ids/context.
  PERFORM internal_proesc.authorize_financial_operator(p_actor_id);
  IF p_run_id IS NULL OR (p_polo_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.polos WHERE id=p_polo_id
  )) THEN RAISE EXCEPTION 'Histórico fora do escopo autorizado.' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM internal_proesc.sync_run_items WHERE run_id=p_run_id
      AND (p_polo_id IS NULL OR polo_id=p_polo_id)
    UNION ALL
    SELECT 1 FROM internal_proesc.technical_run_scopes WHERE run_id=p_run_id
      AND (p_polo_id IS NULL OR polo_ids@>ARRAY[p_polo_id])
    UNION ALL
    SELECT 1 FROM internal_proesc.packed_run_http WHERE p_polo_id IS NULL AND run_id=p_run_id
    UNION ALL
    SELECT 1 FROM internal_proesc.sync_run_http WHERE p_polo_id IS NULL AND run_id=p_run_id
  ) THEN RAISE EXCEPTION 'Histórico fora do escopo autorizado.' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_manifest FROM internal_proesc.archived_technical_runs WHERE run_id=p_run_id;
  IF FOUND THEN
    SELECT * INTO STRICT v_batch FROM internal_proesc.technical_archive_batches
      WHERE id=v_manifest.batch_id AND status='COMMITTED';
    IF p_payload_text IS NULL THEN
      RETURN jsonb_build_object('archive',internal_proesc.technical_archive_descriptor(v_batch,false));
    END IF;
    IF octet_length(p_payload_text)>1048576
      OR encode(extensions.digest(p_payload_text,'sha256'),'hex') IS DISTINCT FROM v_batch.payload_sha256 THEN
      RAISE EXCEPTION 'Arquivo de histórico inválido.' USING ERRCODE='22023';
    END IF;
    v_document:=p_payload_text::jsonb;
    IF v_document->>'kind' IS DISTINCT FROM 'proesc-technical-history'
      OR v_document->'formatVersion' IS DISTINCT FROM '1'::jsonb
      OR jsonb_typeof(v_document->'runs') IS DISTINCT FROM 'array'
      OR jsonb_array_length(v_document->'runs') IS DISTINCT FROM v_batch.run_count THEN
      RAISE EXCEPTION 'Formato de histórico inválido.' USING ERRCODE='22023';
    END IF;
    SELECT value INTO STRICT v_cold FROM jsonb_array_elements(v_document->'runs')
      WHERE value->>'runId'=p_run_id::text;
    IF (v_manifest.item_row_count>0 AND v_cold->'items'->>'run_id' IS DISTINCT FROM p_run_id::text)
      OR coalesce((v_cold->'items'->>'row_count')::integer,0) IS DISTINCT FROM v_manifest.item_row_count
      OR v_cold->'items'->>'content_sha256' IS DISTINCT FROM v_manifest.item_content_sha256
      OR coalesce((v_cold->'http'->>'row_count')::integer,0) IS DISTINCT FROM v_manifest.http_row_count
      OR v_cold->'http'->>'content_sha256' IS DISTINCT FROM v_manifest.http_content_sha256 THEN
      RAISE EXCEPTION 'Identidade de histórico inválida.' USING ERRCODE='22023';
    END IF;
  END IF;
  WITH all_items AS (
    SELECT i.* FROM internal_proesc.sync_run_item_history i WHERE run_id=p_run_id
    UNION ALL
    SELECT p_run_id,i.link_id,i.position,i.polo_id,i.class_id,i.snapshot_id,i.result,i.stage,
      i.error_code,i.recorded_at,i.original_snapshot_id
    FROM jsonb_populate_recordset(NULL::internal_proesc.sync_run_items,
      coalesce(v_cold->'items'->'records','[]'::jsonb)) i
  ) SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY position,link_id),'[]'::jsonb)
    INTO v_items FROM all_items i WHERE p_polo_id IS NULL OR polo_id=p_polo_id;
  -- HTTP requests are shared across polos. Follow the monitor's global-metrics contract.
  IF p_polo_id IS NULL THEN
    WITH all_http AS (
      SELECT h.* FROM internal_proesc.sync_run_http_history h WHERE run_id=p_run_id
      UNION ALL
      SELECT p_run_id,h.source_unit_id,h.source_year,h.source_month,h.http_status,h.duration_ms,
        NULL::text,h.recorded_at
      FROM jsonb_populate_recordset(NULL::internal_proesc.sync_run_http,
        coalesce(v_cold->'http'->'records','[]'::jsonb)) h
    ) SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY source_unit_id,source_year,source_month),'[]'::jsonb)
      INTO v_http FROM all_http h;
  ELSE v_http:='[]'::jsonb;
  END IF;
  WITH reused AS (
    SELECT r.* FROM internal_proesc.run_reused_observation_counts r WHERE run_id=p_run_id
    UNION ALL
    SELECT r.* FROM internal_proesc.archived_technical_runs a
    CROSS JOIN LATERAL jsonb_populate_recordset(NULL::internal_proesc.run_reused_observation_counts,a.reused_counts) r
    WHERE a.run_id=p_run_id
  ) SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY polo_id,class_id),'[]'::jsonb)
    INTO v_reused FROM reused r WHERE p_polo_id IS NULL OR polo_id=p_polo_id;
  RETURN jsonb_build_object('runId',p_run_id,'poloId',p_polo_id,'items',v_items,'http',v_http,'reusedCounts',v_reused,
    'httpMetricsScope','GLOBAL_SHARED_WORKER');
END;
$function$;
REVOKE ALL ON FUNCTION public.proesc_technical_history_service(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.proesc_technical_history_service(uuid,uuid,uuid,text) TO service_role;
