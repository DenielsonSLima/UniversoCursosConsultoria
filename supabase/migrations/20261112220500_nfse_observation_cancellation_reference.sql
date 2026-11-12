BEGIN;

-- Observation reuses the current multiuser operation READ guard. It neither
-- borrows the creator's identity nor opens any cancellation dispatch path.
CREATE FUNCTION public.get_nfse_individual_observation_internal(
  p_actor_id uuid,p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,
  p_request_id uuid,p_preview_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET statement_timeout='10s' AS $$
DECLARE v_result jsonb; v_cancellation uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Internal observation executor required.' USING ERRCODE='42501'; END IF;
  v_result:=public.nfse_individual_operation_internal(
    p_actor_id,p_context_key,p_polo_id,p_environment,p_month,p_request_id,'READ',p_preview_id,NULL);
  IF v_result IS NULL OR jsonb_typeof(v_result)<>'object'
    OR v_result->>'previewId' IS DISTINCT FROM p_preview_id::text THEN
    RAISE EXCEPTION 'Observation reference unavailable.' USING ERRCODE='42501'; END IF;
  -- operation_id is UNIQUE, matching the one-to-one read-model join. A preview,
  -- pending cancellation or confirmed event always retains this same identity.
  SELECT id INTO v_cancellation FROM private.nfse_individual_cancellations WHERE operation_id=p_preview_id;
  RETURN v_result||jsonb_build_object('cancelPreviewId',v_cancellation);
END$$;
REVOKE ALL ON FUNCTION public.get_nfse_individual_observation_internal(uuid,uuid,uuid,text,text,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_nfse_individual_observation_internal(uuid,uuid,uuid,text,text,uuid,uuid) TO service_role;

-- An authorized colleague may observe the same event without impersonating its
-- original creator. Legacy CANCEL/RETRY and their owner/dispatch guards stay as-is.
CREATE FUNCTION public.get_nfse_individual_cancellation_observation_internal(
  p_actor_id uuid,p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,
  p_request_id uuid,p_preview_id uuid,p_cancel_preview_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET statement_timeout='10s' AS $$
DECLARE v_operation jsonb; v_cancellation private.nfse_individual_cancellations%ROWTYPE; v_retry_owner boolean;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Internal observation executor required.' USING ERRCODE='42501'; END IF;
  v_operation:=public.nfse_individual_operation_internal(
    p_actor_id,p_context_key,p_polo_id,p_environment,p_month,p_request_id,'READ',p_preview_id,NULL);
  IF v_operation IS NULL OR jsonb_typeof(v_operation)<>'object'
    OR v_operation->>'previewId' IS DISTINCT FROM p_preview_id::text
    OR v_operation->>'state' IS DISTINCT FROM 'AUTHORIZED'
    OR nullif(v_operation->>'authorizedXml','') IS NULL THEN
    RAISE EXCEPTION 'Authorized observation reference unavailable.' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_cancellation FROM private.nfse_individual_cancellations
    WHERE id=p_cancel_preview_id AND operation_id=p_preview_id;
  IF v_cancellation.id IS NULL
    OR v_cancellation.access_key IS DISTINCT FROM v_operation#>>'{result,accessKey}' THEN
    RAISE EXCEPTION 'Cancellation observation reference unavailable.' USING ERRCODE='42501'; END IF;
  -- Observation is multiuser; the separately confirmed manual retry still uses
  -- its original actor/context guard. Do not advertise that mutation to peers.
  SELECT actor_id=p_actor_id AND context_id=p_context_key INTO v_retry_owner
    FROM private.nfse_individual_operations WHERE id=p_preview_id;
  -- Only public review/status fields are projected. No signed XML, event input,
  -- credential, raw fiscal response, or dispatch capability leaves this read RPC.
  RETURN jsonb_build_object('previewId',p_preview_id,'cancelPreviewId',v_cancellation.id,
    'expiresAt',v_cancellation.expires_at,'state',v_cancellation.state,'dispatch',false,
    'accessKey',v_cancellation.access_key,'number',v_operation#>>'{result,number}',
    'reasonCode',v_cancellation.reason_code,'justification',v_cancellation.justification,
    'cancellationModel',v_cancellation.cancellation_model_snapshot,'detail',v_cancellation.cancellation_model_detail,
    'result',CASE WHEN v_cancellation.result IS NULL THEN NULL ELSE jsonb_build_object(
      'message',v_cancellation.result->'message','codes',v_cancellation.result->'codes') END,
    'retryAvailableAt',CASE WHEN v_retry_owner THEN v_cancellation.updated_at+interval '2 minutes' ELSE NULL END,
    'retryUsed',EXISTS(SELECT 1 FROM private.nfse_cancellation_retry_leases WHERE cancellation_id=v_cancellation.id));
END$$;
REVOKE ALL ON FUNCTION public.get_nfse_individual_cancellation_observation_internal(uuid,uuid,uuid,text,text,uuid,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_nfse_individual_cancellation_observation_internal(uuid,uuid,uuid,text,text,uuid,uuid,uuid) TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
