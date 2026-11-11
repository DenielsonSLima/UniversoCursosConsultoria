BEGIN;
CREATE OR REPLACE FUNCTION public.nfse_individual_cancellation_internal(
  p_actor_id uuid,p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,
  p_request_id uuid,p_action text,p_preview_id uuid,p_cancel_preview_id uuid DEFAULT NULL,p_input jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET statement_timeout='10s' AS $function$
DECLARE v_op private.nfse_individual_operations%ROWTYPE; v_row private.nfse_individual_cancellations%ROWTYPE;
  v_dispatch boolean:=false; v_key text; v_issuer text; v_reference text; v_event jsonb;
BEGIN
  PERFORM private.authorize_nfse_individual_internal(p_actor_id,p_context_key,p_polo_id,p_environment,p_month);
  IF p_request_id IS NULL OR p_preview_id IS NULL OR p_action IS NULL OR p_action NOT IN ('PREVIEW','READ','PREPARE','CLAIM','FINISH') THEN
    RAISE EXCEPTION 'Comando de cancelamento inválido.' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_op FROM private.nfse_individual_operations WHERE id=p_preview_id AND actor_id=p_actor_id
    AND context_id=p_context_key AND polo_id=p_polo_id AND environment=p_environment AND month=p_month
    AND request_id=p_request_id FOR UPDATE;
  IF NOT FOUND OR v_op.state<>'AUTHORIZED' OR v_op.authorized_xml IS NULL THEN
    RAISE EXCEPTION 'Cancelamento exclusivo da nota própria autorizada nesta operação.' USING ERRCODE='42501'; END IF;
  v_key:=v_op.result->>'accessKey'; v_issuer:=regexp_replace(v_op.snapshot#>>'{issuer,cnpj}','[^0-9]','','g');
  v_reference:='PRE'||v_key||'101101';
  SELECT * INTO v_row FROM private.nfse_individual_cancellations WHERE operation_id=v_op.id FOR UPDATE;
  IF p_action='PREVIEW' THEN
    IF p_cancel_preview_id IS NOT NULL OR p_input IS NULL OR jsonb_typeof(p_input)<>'object'
      OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_input) key)
      IS DISTINCT FROM ARRAY['justification','reasonCode']::text[]
      OR p_input->>'reasonCode' IS DISTINCT FROM '1'
      OR jsonb_typeof(p_input->'justification') IS DISTINCT FROM 'string'
      OR length(btrim(p_input->>'justification')) NOT BETWEEN 15 AND 255
      OR p_input->>'justification' ~ '[[:cntrl:]]' THEN
      RAISE EXCEPTION 'Informe o motivo 1 e a justificativa do erro no valor.' USING ERRCODE='22023'; END IF;
    IF v_row.id IS NOT NULL THEN
      IF v_row.reason_code IS DISTINCT FROM p_input->>'reasonCode'
        OR v_row.justification IS DISTINCT FROM btrim(p_input->>'justification') THEN
        RAISE EXCEPTION 'Cancelamento já revisado com outros dados.' USING ERRCODE='40001'; END IF;
      IF v_row.state='PREVIEWED' AND v_row.expires_at<=now() THEN
        -- Explicit review renewal only before the first lease. Identity, event time, text and signed bytes stay unchanged.
        UPDATE private.nfse_individual_cancellations SET expires_at=now()+interval '15 minutes',updated_at=now()
          WHERE id=v_row.id RETURNING * INTO v_row;
      END IF;
    ELSE
      INSERT INTO private.nfse_individual_cancellations(operation_id,reason_code,justification,access_key,event_reference_id)
        VALUES(v_op.id,'1',btrim(p_input->>'justification'),v_key,v_reference) RETURNING * INTO v_row;
    END IF;
  ELSE
    IF v_row.id IS NULL OR p_cancel_preview_id IS DISTINCT FROM v_row.id THEN
      RAISE EXCEPTION 'Cancelamento fora da operação autorizada.' USING ERRCODE='42501'; END IF;
    IF p_action='READ' THEN
      IF p_input IS NOT NULL THEN RAISE EXCEPTION 'Payload não permitido.' USING ERRCODE='22023'; END IF;
    ELSIF p_action='PREPARE' THEN
      v_event:=p_input->'eventInput';
      IF v_row.state<>'PREVIEWED' OR v_row.expires_at<=now() OR p_input IS NULL
        OR jsonb_typeof(p_input)<>'object' OR octet_length(p_input::text)>4500000
        OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_input) key)
        IS DISTINCT FROM ARRAY['eventInput','eventReferenceId','signedEventXml']::text[]
        OR p_input->>'eventReferenceId' IS DISTINCT FROM v_reference
        OR v_event->>'environment' IS DISTINCT FROM 'PRODUCAO' OR v_event->>'accessKey' IS DISTINCT FROM v_key
        OR v_event->>'eventCode' IS DISTINCT FROM '101101' OR v_event->>'reasonCode' IS DISTINCT FROM '1'
        OR v_event->>'reason' IS DISTINCT FROM v_row.justification
        OR v_event#>>'{author,type}' IS DISTINCT FROM 'CNPJ' OR v_event#>>'{author,value}' IS DISTINCT FROM v_issuer
        OR v_event->>'occurredAt' IS DISTINCT FROM to_char(v_row.created_at AT TIME ZONE 'America/Maceio','YYYY-MM-DD"T"HH24:MI:SS')||'-03:00'
        OR coalesce(p_input->>'signedEventXml','') NOT LIKE '%Signature%'
        OR p_input->>'signedEventXml' NOT LIKE '%'||v_reference||'%'
        OR upper(p_input->>'signedEventXml') LIKE '%<!DOCTYPE%' THEN
        RAISE EXCEPTION 'Evento divergente da revisão canônica.' USING ERRCODE='22023'; END IF;
      IF v_row.signed_event_xml IS NOT NULL AND (v_row.signed_event_xml IS DISTINCT FROM p_input->>'signedEventXml'
        OR v_row.event_input IS DISTINCT FROM v_event) THEN
        RAISE EXCEPTION 'Evento já preparado com outros bytes.' USING ERRCODE='40001'; END IF;
      UPDATE private.nfse_individual_cancellations SET event_input=v_event,signed_event_xml=p_input->>'signedEventXml',updated_at=now()
        WHERE id=v_row.id RETURNING * INTO v_row;
    ELSIF p_action='CLAIM' THEN
      IF p_input IS NOT NULL THEN RAISE EXCEPTION 'Payload não permitido.' USING ERRCODE='22023'; END IF;
      IF v_row.state='PREVIEWED' THEN
        IF v_row.expires_at<=now() OR v_row.signed_event_xml IS NULL THEN
          RAISE EXCEPTION 'Revise e prepare o cancelamento antes de confirmar.' USING ERRCODE='40001'; END IF;
        UPDATE private.nfse_individual_cancellations SET state='PROCESSING',updated_at=now()
          WHERE id=v_row.id RETURNING * INTO v_row;
        v_dispatch:=true;
      END IF;
    ELSE
      IF p_input IS NULL OR jsonb_typeof(p_input)<>'object' OR octet_length(p_input::text)>4500000
        OR p_input->>'state' IS NULL OR p_input->>'state' NOT IN
          ('CANCELLED','CANCELLATION_REJECTED','CANCELLATION_PENDING','BLOCKED')
        OR p_input->>'accessKey' IS DISTINCT FROM v_key
        OR length(coalesce(p_input->>'message','')) NOT BETWEEN 1 AND 500 THEN
        RAISE EXCEPTION 'Resultado de cancelamento inválido.' USING ERRCODE='22023'; END IF;
      IF v_row.state='CANCELLED' THEN
        IF p_input->>'state'<>'CANCELLED' OR v_row.result->>'eventId' IS DISTINCT FROM p_input->>'eventId' THEN
          RAISE EXCEPTION 'Cancelamento já comprovado.' USING ERRCODE='40001'; END IF;
      ELSIF v_row.state IN ('PROCESSING','CANCELLATION_PENDING') THEN
        IF p_input->>'state'='CANCELLED' AND (p_input->>'eventCode' IS DISTINCT FROM '101101'
          OR coalesce(p_input->>'eventId','') !~ ('^EVT'||v_key||'101101[0-9]{3}$')
          OR coalesce(p_input->>'eventXml','') NOT LIKE '%'||(p_input->>'eventId')||'%'
          OR upper(p_input->>'eventXml') LIKE '%<!DOCTYPE%' OR p_input->>'eventXml' NOT LIKE '%Signature%') THEN
          RAISE EXCEPTION 'Prova do evento de cancelamento ausente.' USING ERRCODE='22023'; END IF;
        UPDATE private.nfse_individual_cancellations SET state=p_input->>'state',result=p_input-'eventXml'-'signedEventXml',
          event_xml=CASE WHEN p_input->>'state'='CANCELLED' THEN p_input->>'eventXml' ELSE event_xml END,updated_at=now()
          WHERE id=v_row.id RETURNING * INTO v_row;
      ELSIF v_row.state IS DISTINCT FROM p_input->>'state' THEN
        RAISE EXCEPTION 'Transição de cancelamento inválida.' USING ERRCODE='40001'; END IF;
    END IF;
  END IF;
  RETURN jsonb_build_object('previewId',v_op.id,'cancelPreviewId',v_row.id,'expiresAt',v_row.expires_at,'state',v_row.state,
    'dispatch',v_dispatch,'accessKey',v_row.access_key,'number',v_op.result->>'number','reasonCode',v_row.reason_code,
    'justification',v_row.justification,'eventReferenceId',v_row.event_reference_id,
    'occurredAt',to_char(v_row.created_at AT TIME ZONE 'America/Maceio','YYYY-MM-DD"T"HH24:MI:SS')||'-03:00',
    'issuerCnpj',v_issuer,'eventInput',v_row.event_input,'signedEventXml',v_row.signed_event_xml,'result',v_row.result);
END;
$function$;
REVOKE ALL ON FUNCTION public.nfse_individual_cancellation_internal(uuid,uuid,uuid,text,text,uuid,text,uuid,uuid,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.nfse_individual_cancellation_internal(uuid,uuid,uuid,text,text,uuid,text,uuid,uuid,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
