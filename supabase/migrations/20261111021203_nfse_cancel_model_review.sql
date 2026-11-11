BEGIN;

ALTER TABLE private.nfse_individual_cancellations
  DROP CONSTRAINT nfse_individual_cancellations_reason_code_check,
  ADD CONSTRAINT nfse_individual_cancellations_reason_code_check CHECK(reason_code IN('1','2','9')),
  ADD COLUMN cancellation_model_snapshot jsonb,
  ADD COLUMN cancellation_model_detail text;
ALTER TABLE private.nfse_individual_cancellations ADD CONSTRAINT nfse_cancel_model_snapshot_object CHECK(
  cancellation_model_snapshot IS NULL OR (jsonb_typeof(cancellation_model_snapshot)='object'
    AND cancellation_model_snapshot ?& ARRAY['id','version','eventCode','reasonCode','textTemplate']
    AND cancellation_model_snapshot->>'eventCode'='101101'
    AND cancellation_model_snapshot->>'reasonCode'=reason_code));

CREATE FUNCTION private.reject_nfse_cancellation_model_snapshot_change()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $function$
BEGIN
  IF NEW.cancellation_model_snapshot IS DISTINCT FROM OLD.cancellation_model_snapshot
    OR NEW.cancellation_model_detail IS DISTINCT FROM OLD.cancellation_model_detail THEN
    RAISE EXCEPTION 'O modelo e o detalhe da revisão de cancelamento são imutáveis.' USING ERRCODE='55000'; END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.reject_nfse_cancellation_model_snapshot_change() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER nfse_cancel_model_snapshot_immutable BEFORE UPDATE ON private.nfse_individual_cancellations
  FOR EACH ROW EXECUTE FUNCTION private.reject_nfse_cancellation_model_snapshot_change();

-- The authenticated executor has already authorized the operation scope. This
-- helper never dispatches and resolves a selected model only for a new review.
CREATE FUNCTION private.resolve_nfse_cancellation_model_review(
  p_polo_id uuid,p_environment text,p_input jsonb,p_existing private.nfse_individual_cancellations
) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $function$
DECLARE v_selection jsonb;v_model jsonb;v_detail text;v_text text;v_reason text;v_id text;v_version integer;
BEGIN
  IF p_input IS NULL OR jsonb_typeof(p_input)<>'object' THEN
    RAISE EXCEPTION 'Revisão de cancelamento inválida.' USING ERRCODE='22023'; END IF;
  v_selection:=p_input->'cancellationModel';
  IF p_input ? 'cancellationModel' THEN
    IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_input) key)
      IS DISTINCT FROM ARRAY['cancellationModel','detail']::text[] OR jsonb_typeof(v_selection) IS DISTINCT FROM 'object'
      OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(v_selection) key) IS DISTINCT FROM ARRAY['id','version']::text[]
      OR jsonb_typeof(v_selection->'id') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_selection->'version') IS DISTINCT FROM 'number'
      OR coalesce(v_selection->>'version','') !~ '^[1-9][0-9]{0,9}$' THEN
      RAISE EXCEPTION 'Selecione o modelo e a versão canônicos.' USING ERRCODE='22023'; END IF;
    IF (v_selection->>'version')::numeric>2147483647 THEN
      RAISE EXCEPTION 'Versão de modelo inválida.' USING ERRCODE='22023'; END IF;
    v_id:=v_selection->>'id';v_version:=(v_selection->>'version')::integer;
    IF v_id NOT LIKE 'SYSTEM:%' THEN v_id:=lower(v_id); END IF;
    IF p_existing.id IS NOT NULL THEN
      IF p_existing.cancellation_model_snapshot IS NULL OR v_id IS DISTINCT FROM p_existing.cancellation_model_snapshot->>'id'
        OR v_version IS DISTINCT FROM (p_existing.cancellation_model_snapshot->>'version')::integer THEN
        RAISE EXCEPTION 'Cancelamento já revisado com outro modelo.' USING ERRCODE='40001'; END IF;
      v_model:=p_existing.cancellation_model_snapshot;
    ELSIF v_id LIKE 'SYSTEM:%' THEN
      SELECT value INTO v_model FROM jsonb_array_elements(private.nfse_system_cancellation_models()) WHERE value->>'id'=v_id;
    ELSIF v_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT private.nfse_cancellation_model_projection(m) INTO v_model FROM private.nfse_cancellation_models m
        WHERE id=v_id::uuid AND polo_id=p_polo_id AND environment=p_environment;
    END IF;
    IF v_model IS NULL OR v_model->'active' IS DISTINCT FROM 'true'::jsonb
      OR v_model->>'eventCode' IS DISTINCT FROM '101101' OR (v_model->>'version')::integer IS DISTINCT FROM v_version THEN
      RAISE EXCEPTION 'Modelo inativo, alterado ou fora da unidade e ambiente.' USING ERRCODE='40001'; END IF;
    IF v_model->'requiresDetail'='true'::jsonb THEN
      IF jsonb_typeof(p_input->'detail') IS DISTINCT FROM 'string' THEN
        RAISE EXCEPTION 'Descreva os fatos específicos da operação.' USING ERRCODE='22023'; END IF;
      v_detail:=btrim(p_input->>'detail');
      IF length(v_detail) NOT BETWEEN 1 AND 255 OR v_detail ~ '[[:cntrl:]]'
        OR strpos(v_detail,'{{')>0 OR strpos(v_detail,'}}')>0 THEN
        RAISE EXCEPTION 'Resolva o detalhe sem variáveis ou controles.' USING ERRCODE='22023'; END IF;
    ELSIF p_input->'detail' IS DISTINCT FROM 'null'::jsonb THEN
      RAISE EXCEPTION 'O modelo literal não recebe detalhe separado.' USING ERRCODE='22023';
    END IF;
    v_text:=replace(v_model->>'textTemplate','{{detalhe}}',coalesce(v_detail,''));v_reason:=v_model->>'reasonCode';
    IF p_existing.id IS NOT NULL AND (v_detail IS DISTINCT FROM p_existing.cancellation_model_detail
      OR v_text IS DISTINCT FROM p_existing.justification) THEN
      RAISE EXCEPTION 'Cancelamento já revisado com outros fatos.' USING ERRCODE='40001'; END IF;
  ELSE
    IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_input) key)
      IS DISTINCT FROM ARRAY['justification','reasonCode']::text[] OR p_input->'reasonCode' IS DISTINCT FROM '"1"'::jsonb
      OR jsonb_typeof(p_input->'justification') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'A compatibilidade manual é exclusiva do motivo 1.' USING ERRCODE='22023'; END IF;
    v_reason:='1';v_text:=btrim(p_input->>'justification');
    IF p_existing.id IS NOT NULL AND (p_existing.cancellation_model_snapshot IS NOT NULL
      OR p_existing.reason_code IS DISTINCT FROM v_reason OR p_existing.justification IS DISTINCT FROM v_text) THEN
      RAISE EXCEPTION 'Cancelamento já revisado com outros dados.' USING ERRCODE='40001'; END IF;
  END IF;
  IF length(v_text) NOT BETWEEN 15 AND 255 OR v_text ~ '[[:cntrl:]]'
    OR strpos(v_text,'{{')>0 OR strpos(v_text,'}}')>0 OR v_reason NOT IN('1','2','9') THEN
    RAISE EXCEPTION 'Justificativa final de 15 a 255 caracteres, sem variáveis pendentes.' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('reasonCode',v_reason,'justification',v_text,'cancellationModel',v_model,'detail',v_detail);
END;
$function$;
REVOKE ALL ON FUNCTION private.resolve_nfse_cancellation_model_review(uuid,text,jsonb,private.nfse_individual_cancellations)
  FROM PUBLIC,anon,authenticated,service_role;

-- Function replacement follows below. The existing16bb review is not updated.
CREATE OR REPLACE FUNCTION public.nfse_individual_cancellation_internal(
  p_actor_id uuid,p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,
  p_request_id uuid,p_action text,p_preview_id uuid,p_cancel_preview_id uuid DEFAULT NULL,p_input jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET statement_timeout='10s' AS $function$
DECLARE v_op private.nfse_individual_operations%ROWTYPE; v_row private.nfse_individual_cancellations%ROWTYPE;
  v_dispatch boolean:=false; v_key text; v_issuer text; v_reference text; v_event jsonb; v_review jsonb;
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
    IF p_cancel_preview_id IS NOT NULL THEN
      RAISE EXCEPTION 'Prévia de cancelamento inválida.' USING ERRCODE='22023'; END IF;
    v_review:=private.resolve_nfse_cancellation_model_review(p_polo_id,p_environment,p_input,v_row);
    IF v_row.id IS NOT NULL THEN
      IF v_row.state='PREVIEWED' AND v_row.expires_at<=now() THEN
        -- Explicit review renewal only before the first lease. Identity, event time, text and signed bytes stay unchanged.
        UPDATE private.nfse_individual_cancellations SET expires_at=now()+interval '15 minutes',updated_at=now()
          WHERE id=v_row.id RETURNING * INTO v_row;
      END IF;
    ELSE
      INSERT INTO private.nfse_individual_cancellations(operation_id,reason_code,justification,access_key,event_reference_id,
        cancellation_model_snapshot,cancellation_model_detail)
        VALUES(v_op.id,v_review->>'reasonCode',v_review->>'justification',v_key,v_reference,
          nullif(v_review->'cancellationModel','null'::jsonb),v_review->>'detail') RETURNING * INTO v_row;
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
        OR v_event->>'eventCode' IS DISTINCT FROM '101101' OR v_event->>'reasonCode' IS DISTINCT FROM v_row.reason_code
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
        IF v_row.expires_at<=now() OR v_row.signed_event_xml IS NULL
          OR strpos(v_row.justification,'{{')>0 OR strpos(v_row.justification,'}}')>0 THEN
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
    'justification',v_row.justification,'cancellationModel',v_row.cancellation_model_snapshot,
    'detail',v_row.cancellation_model_detail,'eventReferenceId',v_row.event_reference_id,
    'occurredAt',to_char(v_row.created_at AT TIME ZONE 'America/Maceio','YYYY-MM-DD"T"HH24:MI:SS')||'-03:00',
    'issuerCnpj',v_issuer,'eventInput',v_row.event_input,'signedEventXml',v_row.signed_event_xml,'result',v_row.result);
END;
$function$;
REVOKE ALL ON FUNCTION public.nfse_individual_cancellation_internal(uuid,uuid,uuid,text,text,uuid,text,uuid,uuid,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.nfse_individual_cancellation_internal(uuid,uuid,uuid,text,text,uuid,text,uuid,uuid,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
