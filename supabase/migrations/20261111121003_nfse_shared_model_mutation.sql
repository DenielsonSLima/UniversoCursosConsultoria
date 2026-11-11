BEGIN;

CREATE OR REPLACE FUNCTION private.publish_nfse_resource_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_resource text;
  v_old_month text;
  v_new_month text;
  v_dependent record;
BEGIN
  IF TG_TABLE_SCHEMA <> 'private' THEN
    RAISE EXCEPTION 'Invalid NFS-e change source' USING ERRCODE = '22023';
  END IF;
  v_resource := CASE TG_TABLE_NAME
    WHEN 'nfse_models' THEN 'models'
    WHEN 'nfse_configurations' THEN 'configuration'
    WHEN 'nfse_certificates' THEN 'configuration'
    WHEN 'nfse_cancellation_models' THEN 'cancellation-models'
    WHEN 'nfse_partner_services' THEN 'services'
    ELSE NULL END;
  IF v_resource IS NULL THEN
    RAISE EXCEPTION 'Invalid NFS-e change source' USING ERRCODE = '22023';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
  IF v_resource = 'services' THEN
    IF TG_OP <> 'INSERT' THEN v_old_month := pg_catalog.to_char(OLD.service_date,'YYYY-MM'); END IF;
    IF TG_OP <> 'DELETE' THEN v_new_month := pg_catalog.to_char(NEW.service_date,'YYYY-MM'); END IF;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    INSERT INTO public.nfse_change_events(polo_id,environment,month,resource)
      VALUES(OLD.polo_id,OLD.environment,v_old_month,v_resource);
  END IF;
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND
    (NEW.polo_id,NEW.environment,v_new_month) IS DISTINCT FROM
    (OLD.polo_id,OLD.environment,v_old_month)) THEN
    INSERT INTO public.nfse_change_events(polo_id,environment,month,resource)
      VALUES(NEW.polo_id,NEW.environment,v_new_month,v_resource);
  END IF;
  IF TG_TABLE_NAME = 'nfse_models' THEN
    FOR v_dependent IN
      SELECT DISTINCT destination.id polo_id,source.environment
      FROM public.polos destination
      JOIN public.polos origin ON origin.company_id=destination.company_id
      CROSS JOIN LATERAL (
        SELECT OLD.polo_id polo_id,OLD.environment environment WHERE TG_OP<>'INSERT'
        UNION SELECT NEW.polo_id,NEW.environment WHERE TG_OP<>'DELETE'
      ) source
      WHERE origin.id=source.polo_id AND origin.company_id IS NOT NULL
        AND origin.is_matriz IS TRUE AND destination.is_matriz IS FALSE
        AND public.is_active_status(origin.status) AND public.is_active_status(destination.status)
    LOOP
      INSERT INTO public.nfse_change_events(polo_id,environment,month,resource)
        VALUES(v_dependent.polo_id,v_dependent.environment,NULL,'models');
    END LOOP;
  END IF;
  IF TG_TABLE_NAME = 'nfse_certificates' THEN
    -- Inherited A1 changes invalidate each configured unit in the same environment.
    -- Only existing scope references are read; credential contents never enter events.
    FOR v_dependent IN SELECT DISTINCT c.polo_id,c.environment
      FROM private.nfse_configurations c
      WHERE ((TG_OP <> 'INSERT' AND (c.credential_polo_id,c.environment) = (OLD.polo_id,OLD.environment))
        OR (TG_OP <> 'DELETE' AND (c.credential_polo_id,c.environment) = (NEW.polo_id,NEW.environment)))
        AND NOT ((TG_OP <> 'INSERT' AND (c.polo_id,c.environment) = (OLD.polo_id,OLD.environment))
          OR (TG_OP <> 'DELETE' AND (c.polo_id,c.environment) = (NEW.polo_id,NEW.environment)))
    LOOP
      INSERT INTO public.nfse_change_events(polo_id,environment,month,resource)
        VALUES(v_dependent.polo_id,v_dependent.environment,NULL,'configuration');
    END LOOP;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;


CREATE FUNCTION public.mutate_nfse_model_secure(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,
  p_request_id uuid,p_action text,p_id uuid,p_expected_version integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
SET statement_timeout='8s' SET lock_timeout='5s' AS $function$
DECLARE v_actor uuid:=auth.uid();v_payload jsonb;v_response jsonb;v_definition jsonb;v_audit jsonb;
  v_previous private.nfse_model_requests%ROWTYPE;v_model private.nfse_models%ROWTYPE;
BEGIN
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Identidade autenticada obrigatória.' USING ERRCODE='42501'; END IF;
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Alterar o modelo exige READ COMMITTED.' USING ERRCODE='25001'; END IF;
  IF p_request_id IS NULL OR p_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1
    OR p_action IS NULL OR p_action NOT IN('CLONE','DEACTIVATE') THEN
    RAISE EXCEPTION 'Ação ou identificação do modelo inválida.' USING ERRCODE='22023'; END IF;
  v_payload:=jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,'environment',p_environment,
    'month',p_month,'action',p_action,'id',p_id,'expectedVersion',p_expected_version);
  -- Same request namespace as save: a request cannot change its purpose.
  PERFORM pg_advisory_xact_lock(hashtextextended('nfse-model-request:'||v_actor::text||':'||p_request_id::text,0));
  SELECT * INTO v_previous FROM private.nfse_model_requests WHERE actor_id=v_actor AND request_id=p_request_id;
  IF FOUND THEN
    IF (v_previous.payload-'audit') IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'Solicitação já utilizada com outros dados.' USING ERRCODE='22023'; END IF;
    RETURN v_previous.response;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('nfse-model-polo:'||p_polo_id::text||':'||p_environment,0));
  SELECT * INTO v_model FROM private.nfse_models WHERE id=p_id AND environment=p_environment
    AND private.nfse_model_visible_to_polo(polo_id,p_polo_id,definition) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Modelo fora da unidade e ambiente autorizados.' USING ERRCODE='42501'; END IF;
  IF v_model.version<>p_expected_version THEN
    RAISE EXCEPTION 'O modelo mudou. Atualize os modelos.' USING ERRCODE='40001'; END IF;
  v_audit:=jsonb_build_object('sourceModelId',v_model.id,'sourcePoloId',v_model.polo_id,
    'sourceVersion',v_model.version,'beforeDefinition',v_model.definition);
  IF p_action='DEACTIVATE' THEN
    IF v_model.polo_id<>p_polo_id THEN
      RAISE EXCEPTION 'Inative o modelo somente na unidade de origem.' USING ERRCODE='42501'; END IF;
    UPDATE private.nfse_models SET definition=jsonb_set(definition,'{active}','false'::jsonb),
      version=version+1,updated_by=v_actor,updated_at=now() WHERE id=p_id RETURNING * INTO v_model;
  ELSE
    IF (SELECT count(*) FROM private.nfse_models WHERE polo_id=p_polo_id AND environment=p_environment)>=100 THEN
      RAISE EXCEPTION 'Limite de 100 modelos por estabelecimento e ambiente atingido.' USING ERRCODE='22023'; END IF;
    -- Copy all stored presets, never display labels or inherited ownership metadata.
    v_definition:=v_model.definition||jsonb_build_object('name',left(v_model.definition->>'name',112)||' (cópia)','active',true);
    INSERT INTO private.nfse_models(polo_id,environment,definition,created_by,updated_by)
      VALUES(p_polo_id,p_environment,v_definition,v_actor,v_actor) RETURNING * INTO v_model;
  END IF;
  v_response:=jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,
    'poloId',p_polo_id,'environment',p_environment,'month',p_month),'data',jsonb_build_object(
      'id',v_model.id,'version',v_model.version,'message',CASE p_action WHEN 'CLONE' THEN 'Modelo clonado.' ELSE 'Modelo inativado.' END));
  -- Snapshot once after locking the source. Replay compares intent only and
  -- returns the original result without resolving or rewriting historical facts.
  v_payload:=v_payload||jsonb_build_object('audit',v_audit||jsonb_build_object(
    'resultDefinition',v_model.definition,'resultModelId',v_model.id,'resultVersion',v_model.version));
  INSERT INTO private.nfse_model_requests(actor_id,request_id,context_id,polo_id,environment,payload,response)
    VALUES(v_actor,p_request_id,p_context_key,p_polo_id,p_environment,v_payload,v_response);
  RETURN v_response;
END;
$function$;
REVOKE ALL ON FUNCTION public.mutate_nfse_model_secure(uuid,uuid,text,text,uuid,text,uuid,integer)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.mutate_nfse_model_secure(uuid,uuid,text,text,uuid,text,uuid,integer) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
