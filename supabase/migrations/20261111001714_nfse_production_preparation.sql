BEGIN;

-- Explicit source review, never a fallback from production to homologation.
CREATE TABLE private.nfse_production_setup_requests (
  actor_id uuid NOT NULL, request_id uuid NOT NULL, payload jsonb NOT NULL,
  response jsonb NOT NULL, source_snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(actor_id,request_id)
);
ALTER TABLE private.nfse_production_setup_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.nfse_production_setup_requests FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.review_nfse_production_preparation_secure(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,p_source_model_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET statement_timeout='8s' AS $function$
DECLARE v_matrix uuid; v_model private.nfse_models%ROWTYPE; v_cfg private.nfse_configurations%ROWTYPE;
  v_cert private.nfse_certificates%ROWTYPE;
BEGIN
  v_matrix:=private.authorize_nfse_configuration_scope(p_context_key,p_polo_id,p_environment,p_month);
  IF auth.role() IS DISTINCT FROM 'authenticated' OR p_environment IS DISTINCT FROM 'PRODUCAO' OR p_polo_id IS DISTINCT FROM v_matrix THEN
    RAISE EXCEPTION 'Operação restrita à matriz em produção.' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_model FROM private.nfse_models WHERE id=p_source_model_id
    AND polo_id=p_polo_id AND environment='HOMOLOGACAO';
  IF NOT FOUND OR v_model.definition->'active' IS DISTINCT FROM 'true'::jsonb
    OR v_model.definition->>'nationalServiceCode' IS DISTINCT FROM '080201' THEN
    RAISE EXCEPTION 'Selecione o modelo de origem confirmado.' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_cfg FROM private.nfse_configurations WHERE polo_id=p_polo_id AND environment='HOMOLOGACAO';
  SELECT * INTO v_cert FROM private.nfse_certificates WHERE polo_id=p_polo_id AND environment='HOMOLOGACAO';
  RETURN jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,
    'poloId',p_polo_id,'environment',p_environment,'month',p_month),'data',jsonb_build_object(
    'sourceEnvironment','HOMOLOGACAO','modelId',v_model.id,'modelVersion',v_model.version,
    'modelName',v_model.definition->>'name','configurationVersion',v_cfg.version,
    'configuration',v_cfg.definition,'certificate',jsonb_build_object('fingerprint',v_cert.fingerprint,
      'cnpj',v_cert.cnpj,'notBefore',v_cert.not_before,'expiresAt',v_cert.expires_at),
    'readiness','NOT_VERIFIED'));
END;
$function$;
REVOKE ALL ON FUNCTION public.review_nfse_production_preparation_secure(uuid,uuid,text,text,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.review_nfse_production_preparation_secure(uuid,uuid,text,text,uuid) TO authenticated;

CREATE FUNCTION public.prepare_nfse_production_individual_secure(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,p_request_id uuid,
  p_source_model_id uuid,p_expected_source_version integer,p_expected_configuration_version integer,
  p_expected_certificate_fingerprint text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET statement_timeout='8s' AS $function$
DECLARE
  v_actor uuid:=auth.uid(); v_matrix uuid; v_payload jsonb; v_previous private.nfse_production_setup_requests%ROWTYPE;
  v_model private.nfse_models%ROWTYPE; v_cfg private.nfse_configurations%ROWTYPE;
  v_prod private.nfse_configurations%ROWTYPE; v_cert private.nfse_certificates%ROWTYPE;
  v_prod_cert private.nfse_certificates%ROWTYPE; v_cnpj text; v_model_id uuid; v_response jsonb;
BEGIN
  v_matrix:=private.authorize_nfse_configuration_scope(p_context_key,p_polo_id,p_environment,p_month);
  IF auth.role() IS DISTINCT FROM 'authenticated' OR p_environment IS DISTINCT FROM 'PRODUCAO' OR p_polo_id IS DISTINCT FROM v_matrix OR v_actor IS NULL THEN
    RAISE EXCEPTION 'Operação restrita à matriz em produção.' USING ERRCODE='42501'; END IF;
  IF p_request_id IS NULL OR p_source_model_id IS NULL OR p_expected_source_version<1
    OR p_expected_configuration_version<1 OR coalesce(p_expected_certificate_fingerprint,'')='' THEN
    RAISE EXCEPTION 'Revise a origem da preparação.' USING ERRCODE='22023'; END IF;
  v_payload:=jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,'environment',p_environment,
    'month',p_month,'sourceModelId',p_source_model_id,'sourceVersion',p_expected_source_version,
    'configurationVersion',p_expected_configuration_version,'certificateFingerprint',p_expected_certificate_fingerprint);
  PERFORM pg_advisory_xact_lock(hashtextextended('nfse-production-setup:'||v_actor||':'||p_request_id,0));
  SELECT * INTO v_previous FROM private.nfse_production_setup_requests WHERE actor_id=v_actor AND request_id=p_request_id;
  IF FOUND THEN
    IF v_previous.payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'Requisição divergente.' USING ERRCODE='22023'; END IF;
    RETURN v_previous.response;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('nfse-config:'||p_polo_id||':PRODUCAO',0));
  SELECT * INTO v_model FROM private.nfse_models WHERE id=p_source_model_id AND polo_id=p_polo_id
    AND environment='HOMOLOGACAO' FOR SHARE;
  SELECT * INTO v_cfg FROM private.nfse_configurations WHERE polo_id=p_polo_id AND environment='HOMOLOGACAO' FOR SHARE;
  SELECT * INTO v_cert FROM private.nfse_certificates WHERE polo_id=p_polo_id AND environment='HOMOLOGACAO' FOR SHARE;
  SELECT regexp_replace(coalesce(cnpj,''),'[^0-9]','','g') INTO v_cnpj FROM public.polos WHERE id=p_polo_id;
  IF v_model.id IS NULL OR v_model.version IS DISTINCT FROM p_expected_source_version
    OR v_model.definition->'active' IS DISTINCT FROM 'true'::jsonb
    OR v_model.definition->>'nationalServiceCode' IS DISTINCT FROM '080201'
    OR v_cfg.version IS DISTINCT FROM p_expected_configuration_version
    OR v_cfg.credential_polo_id IS DISTINCT FROM p_polo_id
    OR v_cfg.definition->>'portalAccess' IS DISTINCT FROM 'CERTIFICATE'
    OR v_cert.fingerprint IS DISTINCT FROM p_expected_certificate_fingerprint
    OR v_cert.cnpj IS DISTINCT FROM v_cnpj OR NOT private.nfse_review_valid_document(v_cnpj)
    OR v_cert.not_before>now() OR v_cert.expires_at<=now() OR v_cert.vault_secret_id IS NULL THEN
    RAISE EXCEPTION 'Origem alterada ou indisponível. Revise novamente.' USING ERRCODE='40001'; END IF;
  SELECT * INTO v_prod FROM private.nfse_configurations WHERE polo_id=p_polo_id AND environment='PRODUCAO' FOR UPDATE;
  IF FOUND AND (v_prod.definition IS DISTINCT FROM v_cfg.definition OR v_prod.credential_polo_id IS DISTINCT FROM p_polo_id) THEN
    RAISE EXCEPTION 'Configuração de produção existente diverge da origem revisada.' USING ERRCODE='40001'; END IF;
  IF v_prod.version IS NULL THEN
    INSERT INTO private.nfse_configurations(polo_id,environment,credential_polo_id,definition,version,updated_by)
      VALUES(p_polo_id,'PRODUCAO',p_polo_id,v_cfg.definition,1,v_actor) RETURNING * INTO v_prod;
  END IF;
  SELECT * INTO v_prod_cert FROM private.nfse_certificates WHERE polo_id=p_polo_id AND environment='PRODUCAO' FOR UPDATE;
  IF FOUND AND (v_prod_cert.fingerprint IS DISTINCT FROM v_cert.fingerprint
    OR v_prod_cert.vault_secret_id IS DISTINCT FROM v_cert.vault_secret_id OR v_prod_cert.cnpj IS DISTINCT FROM v_cnpj) THEN
    RAISE EXCEPTION 'Certificado de produção existente diverge da origem revisada.' USING ERRCODE='40001'; END IF;
  IF v_prod_cert.fingerprint IS NULL THEN
    INSERT INTO private.nfse_certificates(polo_id,environment,vault_secret_id,fingerprint,cnpj,not_before,expires_at,updated_by)
      VALUES(p_polo_id,'PRODUCAO',v_cert.vault_secret_id,v_cert.fingerprint,v_cert.cnpj,v_cert.not_before,v_cert.expires_at,v_actor);
  END IF;
  INSERT INTO private.nfse_models(polo_id,environment,definition,version,created_by,updated_by)
    VALUES(p_polo_id,'PRODUCAO',v_model.definition,1,v_actor,v_actor) RETURNING id INTO v_model_id;
  v_response:=jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,
    'environment',p_environment,'month',p_month),'data',jsonb_build_object('modelId',v_model_id,'modelVersion',1,
    'configurationVersion',v_prod.version,'certificateRegistered',true,'sourceEnvironment','HOMOLOGACAO','readiness','NOT_VERIFIED'));
  INSERT INTO private.nfse_production_setup_requests(actor_id,request_id,payload,response,source_snapshot)
    VALUES(v_actor,p_request_id,v_payload,v_response,jsonb_build_object('environment','HOMOLOGACAO',
      'model',jsonb_build_object('id',v_model.id,'version',v_model.version,'definition',v_model.definition),
      'configuration',jsonb_build_object('version',v_cfg.version,'definition',v_cfg.definition),
      'certificate',jsonb_build_object('fingerprint',v_cert.fingerprint,'cnpj',v_cert.cnpj,
        'notBefore',v_cert.not_before,'expiresAt',v_cert.expires_at)));
  RETURN v_response;
END;
$function$;
REVOKE ALL ON FUNCTION public.prepare_nfse_production_individual_secure(uuid,uuid,text,text,uuid,uuid,integer,integer,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.prepare_nfse_production_individual_secure(uuid,uuid,text,text,uuid,uuid,integer,integer,text) TO authenticated;
COMMENT ON FUNCTION public.prepare_nfse_production_individual_secure(uuid,uuid,text,text,uuid,uuid,integer,integer,text) IS
  'Explicit authenticated production preparation from reviewed homologation sources; no readiness claim, no transmission, no decrypted material.';
NOTIFY pgrst,'reload schema';
COMMIT;
