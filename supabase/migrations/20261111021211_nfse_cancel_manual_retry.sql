BEGIN;

-- One separately audited manual retry of the SAME event. This is not an
-- assertion of HTTP idempotence or evidence that the first POST never occurred.
CREATE TABLE private.nfse_cancellation_retry_leases(
  cancellation_id uuid PRIMARY KEY REFERENCES private.nfse_individual_cancellations(id),
  operation_id uuid NOT NULL REFERENCES private.nfse_individual_operations(id),
  actor_id uuid NOT NULL,context_id uuid NOT NULL,polo_id uuid NOT NULL REFERENCES public.polos(id),
  environment text NOT NULL CHECK(environment='PRODUCAO'),month text NOT NULL,
  retry_request_id uuid NOT NULL,signed_event_sha256 text NOT NULL CHECK(signed_event_sha256~'^[a-f0-9]{64}$'),
  event_reference_id text NOT NULL,previous_state text NOT NULL,previous_updated_at timestamptz NOT NULL,
  probe_checked_at timestamptz NOT NULL,probe_status integer NOT NULL DEFAULT 404 CHECK(probe_status=404),
  probe_outcome text NOT NULL DEFAULT 'REGISTERED_EVENT_NOT_FOUND' CHECK(probe_outcome='REGISTERED_EVENT_NOT_FOUND'),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(actor_id,retry_request_id)
);
ALTER TABLE private.nfse_cancellation_retry_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.nfse_cancellation_retry_leases FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.reject_nfse_cancellation_retry_change() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $function$
BEGIN RAISE EXCEPTION 'O registro da retomada é imutável.' USING ERRCODE='55000';END;
$function$;
REVOKE ALL ON FUNCTION private.reject_nfse_cancellation_retry_change() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER nfse_cancellation_retry_immutable BEFORE UPDATE OR DELETE ON private.nfse_cancellation_retry_leases
  FOR EACH ROW EXECUTE FUNCTION private.reject_nfse_cancellation_retry_change();

ALTER FUNCTION public.nfse_individual_cancellation_internal(uuid,uuid,uuid,text,text,uuid,text,uuid,uuid,jsonb)
  RENAME TO nfse_individual_cancellation_core;
REVOKE ALL ON FUNCTION public.nfse_individual_cancellation_core(uuid,uuid,uuid,text,text,uuid,text,uuid,uuid,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.nfse_individual_cancellation_internal(
  p_actor_id uuid,p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,
  p_request_id uuid,p_action text,p_preview_id uuid,p_cancel_preview_id uuid DEFAULT NULL,p_input jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET statement_timeout='10s' AS $function$
DECLARE v_result jsonb;v_row private.nfse_individual_cancellations%ROWTYPE;
  v_retry private.nfse_cancellation_retry_leases%ROWTYPE;v_probe timestamptz;v_hash text;v_retry_id uuid;
BEGIN
  PERFORM private.authorize_nfse_individual_internal(p_actor_id,p_context_key,p_polo_id,p_environment,p_month);
  IF p_action IS DISTINCT FROM 'RETRY_CLAIM' THEN
    v_result:=public.nfse_individual_cancellation_core(p_actor_id,p_context_key,p_polo_id,p_environment,p_month,
      p_request_id,p_action,p_preview_id,p_cancel_preview_id,p_input);
    SELECT * INTO v_row FROM private.nfse_individual_cancellations WHERE id=(v_result->>'cancelPreviewId')::uuid;
    RETURN v_result||jsonb_build_object('retryAvailableAt',v_row.updated_at+interval '2 minutes',
      'retryUsed',EXISTS(SELECT 1 FROM private.nfse_cancellation_retry_leases WHERE cancellation_id=v_row.id));
  END IF;
  -- READ reauthorizes ownership and obtains the same operation/cancellation row locks.
  v_result:=public.nfse_individual_cancellation_core(p_actor_id,p_context_key,p_polo_id,p_environment,p_month,
    p_request_id,'READ',p_preview_id,p_cancel_preview_id,NULL);
  SELECT * INTO v_row FROM private.nfse_individual_cancellations WHERE id=p_cancel_preview_id FOR UPDATE;
  IF p_input IS NULL OR jsonb_typeof(p_input)<>'object'
    OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_input) key)
      IS DISTINCT FROM ARRAY['checkedAt','httpStatus','probeCode','retryRequestId','signedEventSha256']::text[]
    OR p_input->'httpStatus' IS DISTINCT FROM '404'::jsonb
    OR p_input->'probeCode' IS DISTINCT FROM '"REGISTERED_EVENT_NOT_FOUND"'::jsonb
    OR jsonb_typeof(p_input->'retryRequestId') IS DISTINCT FROM 'string'
    OR coalesce(p_input->>'retryRequestId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR jsonb_typeof(p_input->'checkedAt') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_input->'signedEventSha256') IS DISTINCT FROM 'string'
    OR coalesce(p_input->>'signedEventSha256','') !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Prova da consulta e identificação da retomada obrigatórias.' USING ERRCODE='22023'; END IF;
  BEGIN v_probe:=(p_input->>'checkedAt')::timestamptz;v_retry_id:=(p_input->>'retryRequestId')::uuid;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'Horário da consulta inválido.' USING ERRCODE='22023'; END;
  v_hash:=encode(sha256(convert_to(v_row.signed_event_xml,'UTF8')),'hex');
  IF v_hash IS NULL OR v_hash IS DISTINCT FROM p_input->>'signedEventSha256' THEN
    RAISE EXCEPTION 'Os bytes assinados da operação devem permanecer idênticos.' USING ERRCODE='40001'; END IF;
  SELECT * INTO v_retry FROM private.nfse_cancellation_retry_leases WHERE cancellation_id=v_row.id;
  IF FOUND THEN
    IF v_retry.retry_request_id IS DISTINCT FROM v_retry_id OR v_retry.actor_id IS DISTINCT FROM p_actor_id
      OR v_retry.signed_event_sha256 IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION 'A retomada manual única já foi utilizada.' USING ERRCODE='40001'; END IF;
    RETURN v_result||jsonb_build_object('dispatch',false,'retryAvailableAt',NULL,'retryUsed',true);
  END IF;
  IF v_row.state IS DISTINCT FROM 'CANCELLATION_PENDING' OR v_row.event_input IS NULL OR v_row.event_xml IS NOT NULL
    OR v_row.updated_at>now()-interval '2 minutes' OR v_probe<now()-interval '60 seconds' OR v_probe>now()+interval '5 seconds'
    OR v_row.event_input->>'eventCode' IS DISTINCT FROM '101101'
    OR v_row.event_input->>'accessKey' IS DISTINCT FROM v_row.access_key
    OR v_row.event_reference_id IS DISTINCT FROM 'PRE'||v_row.access_key||'101101'
    OR strpos(v_row.justification,'{{')>0 OR strpos(v_row.justification,'}}')>0 THEN
    RAISE EXCEPTION 'Retomada exige consulta recente sem evento e dois minutos desde a última atualização.' USING ERRCODE='40001'; END IF;
  INSERT INTO private.nfse_cancellation_retry_leases(cancellation_id,operation_id,actor_id,context_id,polo_id,environment,
    month,retry_request_id,signed_event_sha256,event_reference_id,previous_state,previous_updated_at,probe_checked_at)
  VALUES(v_row.id,v_row.operation_id,p_actor_id,p_context_key,p_polo_id,p_environment,p_month,v_retry_id,v_hash,
    v_row.event_reference_id,v_row.state,v_row.updated_at,v_probe);
  -- Original state/lease/snapshot, identity and signed bytes are never reset.
  RETURN v_result||jsonb_build_object('dispatch',true,'retryAvailableAt',NULL,'retryUsed',true);
END;
$function$;
REVOKE ALL ON FUNCTION public.nfse_individual_cancellation_internal(uuid,uuid,uuid,text,text,uuid,text,uuid,uuid,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.nfse_individual_cancellation_internal(uuid,uuid,uuid,text,text,uuid,text,uuid,uuid,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
