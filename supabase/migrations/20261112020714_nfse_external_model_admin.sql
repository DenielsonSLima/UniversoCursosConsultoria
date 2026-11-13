BEGIN;

-- The administrative request UUID is the explicit author of this one-off operation.
-- No JWT/user impersonation and no application grants. Existing model validators remain authoritative.
CREATE FUNCTION private.create_nfse_model_administrative(
  p_request_id uuid,p_polo_id uuid,p_definition jsonb
) RETURNS jsonb LANGUAGE plpgsql SET search_path='' SET statement_timeout='10s' AS $function$
DECLARE v_definition jsonb:='{}'; v_payload jsonb; v_previous private.nfse_model_requests%ROWTYPE;
  v_model private.nfse_models%ROWTYPE; v_field record; v_text text; v_partner uuid; v_response jsonb;
BEGIN
  IF current_user NOT IN ('postgres','supabase_admin') OR p_request_id IS NULL
    OR NOT private.nfse_model_management_allowed(p_polo_id) THEN
    RAISE EXCEPTION 'Canal administrativo e matriz ativa obrigatórios.' USING ERRCODE='42501'; END IF;
  IF p_definition IS NULL OR jsonb_typeof(p_definition)<>'object' OR octet_length(p_definition::text)>1048576
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_definition) f(key) WHERE key NOT IN
      ('name','active','nationalServiceCode','nbsCode','operationIndicatorCode','serviceDescription','issTreatment',
      'immunityType','technicalResponsibilityDocument','referenceDocument','complementaryInfo','orderReference',
      'serviceOptions','peopleOptions','additionalOptions','valuesOptions')) THEN
    RAISE EXCEPTION 'Dados do modelo NFS-e inválidos.' USING ERRCODE='22023'; END IF;
  FOR v_field IN SELECT * FROM (VALUES ('name',120,true),('nationalServiceCode',6,true),('nbsCode',9,true),
    ('operationIndicatorCode',6,false),('serviceDescription',2000,true),('issTreatment',20,true),
    ('technicalResponsibilityDocument',40,false),('referenceDocument',255,false),('complementaryInfo',2000,false),
    ('orderReference',60,false)) field(key,max_length,required) LOOP
    IF jsonb_typeof(p_definition->v_field.key) IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'Texto obrigatório ou inválido no modelo NFS-e.' USING ERRCODE='22023'; END IF;
    v_text:=btrim(p_definition->>v_field.key);
    IF length(v_text)>v_field.max_length OR (v_field.required AND v_text='') THEN
      RAISE EXCEPTION 'Comprimento de campo do modelo NFS-e inválido.' USING ERRCODE='22023'; END IF;
    v_definition:=v_definition||jsonb_build_object(v_field.key,v_text);
  END LOOP;
  IF v_definition->>'nationalServiceCode' !~ '^[0-9]{6}$' OR v_definition->>'nbsCode' !~ '^[0-9]{9}$'
    OR v_definition->>'operationIndicatorCode' !~ '^([0-9]{6})?$'
    OR v_definition->>'issTreatment' NOT IN ('TRIBUTAVEL','IMUNIDADE','EXPORTACAO','NAO_INCIDENCIA')
    OR jsonb_typeof(p_definition->'active') IS DISTINCT FROM 'boolean' OR NOT(p_definition ? 'immunityType')
    OR (v_definition->>'issTreatment'='IMUNIDADE' AND
      (jsonb_typeof(p_definition->'immunityType') IS DISTINCT FROM 'string' OR p_definition->>'immunityType' NOT IN ('1','2','3','4','5')))
    OR (v_definition->>'issTreatment'<>'IMUNIDADE' AND p_definition->'immunityType' IS DISTINCT FROM 'null'::jsonb)
    OR p_definition#>'{peopleOptions,version}' IS DISTINCT FROM '2'::jsonb THEN
    RAISE EXCEPTION 'Classificação ou participantes do modelo inválidos.' USING ERRCODE='22023'; END IF;
  v_definition:=v_definition||jsonb_build_object('active',p_definition->'active','immunityType',p_definition->'immunityType');
  FOR v_text IN SELECT unnest(ARRAY['serviceOptions','peopleOptions','additionalOptions','valuesOptions']) LOOP
    IF jsonb_typeof(p_definition->v_text) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Revise todos os grupos de preferências do modelo.' USING ERRCODE='22023'; END IF;
    v_definition:=v_definition||jsonb_build_object(v_text,p_definition->v_text);
  END LOOP;
  v_payload:=jsonb_build_object('executionIdentity','MCP_ADMIN_USER_REQUEST','identitySemantics','ADMINISTRATIVE_REQUEST_UUID',
    'poloId',p_polo_id,'environment','PRODUCAO','definition',v_definition);
  PERFORM pg_advisory_xact_lock(hashtextextended('nfse-model-admin-request:'||p_request_id,0));
  SELECT * INTO v_previous FROM private.nfse_model_requests WHERE actor_id=p_request_id AND request_id=p_request_id;
  IF FOUND THEN
    IF v_previous.payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'Solicitação administrativa já utilizada com outros dados.' USING ERRCODE='40001'; END IF;
    RETURN v_previous.response;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('nfse-model-polo:'||p_polo_id||':PRODUCAO',0));
  IF (SELECT count(*) FROM private.nfse_models WHERE polo_id=p_polo_id AND environment='PRODUCAO')>=100
    OR EXISTS(SELECT 1 FROM private.nfse_models WHERE polo_id=p_polo_id AND environment='PRODUCAO'
      AND lower(btrim(definition->>'name'))=lower(v_definition->>'name')) THEN
    RAISE EXCEPTION 'Limite de modelos ou nome já existente.' USING ERRCODE='23505'; END IF;
  PERFORM 1 FROM public.catalogo_paises_nacionalidades WHERE codigo_iso3 IN
    (upper(btrim(p_definition#>>'{serviceOptions,countryCode}')),upper(btrim(p_definition#>>'{serviceOptions,exportResultCountryCode}')))
    ORDER BY codigo_iso3 FOR SHARE;
  PERFORM 1 FROM public.catalogo_municipios_ibge WHERE codigo_ibge::text=btrim(p_definition#>>'{serviceOptions,municipalityCode}') FOR SHARE;
  FOR v_partner IN SELECT partner_id FROM private.nfse_preset_partner_ids(p_definition) ORDER BY partner_id LOOP
    PERFORM 1 FROM public.parceiros WHERE id=v_partner AND private.nfse_model_partner_label(p_polo_id,id) IS NOT NULL FOR SHARE;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM private.nfse_service_code_catalog WHERE kind='NATIONAL' AND code=v_definition->>'nationalServiceCode')
    OR NOT EXISTS(SELECT 1 FROM private.nfse_service_code_catalog WHERE kind='NBS' AND code=v_definition->>'nbsCode')
    OR (v_definition->>'operationIndicatorCode'<>'' AND NOT EXISTS(SELECT 1 FROM private.nfse_service_code_catalog
      WHERE kind='OPERATION' AND code=v_definition->>'operationIndicatorCode')) THEN
    RAISE EXCEPTION 'Códigos inexistentes nos catálogos oficiais.' USING ERRCODE='22023'; END IF;
  v_definition:=v_definition||jsonb_build_object('serviceOptions',private.normalize_nfse_model_service_options(
    p_definition->'serviceOptions',v_definition->>'issTreatment',v_definition->>'nationalServiceCode',v_definition->>'operationIndicatorCode'));
  v_definition:=v_definition||jsonb_build_object('peopleOptions',private.normalize_nfse_model_people_options(
    p_definition->'peopleOptions',v_definition->'serviceOptions',p_polo_id));
  v_definition:=v_definition||jsonb_build_object('additionalOptions',private.normalize_nfse_model_additional_options(
    p_definition->'additionalOptions',v_definition,p_polo_id,'PRODUCAO'));
  v_definition:=v_definition||jsonb_build_object('valuesOptions',private.normalize_nfse_model_values_options(
    p_definition->'valuesOptions',v_definition,p_polo_id,'PRODUCAO'));
  INSERT INTO private.nfse_models(polo_id,environment,definition,created_by,updated_by)
    VALUES(p_polo_id,'PRODUCAO',v_definition,p_request_id,p_request_id) RETURNING * INTO v_model;
  v_response:=jsonb_build_object('id',v_model.id,'version',v_model.version,'executionIdentity','MCP_ADMIN_USER_REQUEST');
  INSERT INTO private.nfse_model_requests(actor_id,request_id,context_id,polo_id,environment,payload,response)
    VALUES(p_request_id,p_request_id,p_request_id,p_polo_id,'PRODUCAO',v_payload,v_response);
  RETURN v_response;
END;
$function$;
REVOKE ALL ON FUNCTION private.create_nfse_model_administrative(uuid,uuid,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON FUNCTION private.create_nfse_model_administrative(uuid,uuid,jsonb) IS
  'Administrative model creation from explicitly requested fiscal evidence; request UUID is not a portal user. No fiscal dispatch.';
COMMIT;
