BEGIN;

CREATE FUNCTION private.nfse_preset_partner_ids(p_definition jsonb)
RETURNS TABLE(partner_id uuid) LANGUAGE sql IMMUTABLE SET search_path='' AS $function$
  SELECT DISTINCT ref::uuid FROM (
    SELECT p_definition#>>'{peopleOptions,destinationPartnerId}' ref
    UNION ALL SELECT p_definition#>>'{peopleOptions,intermediaryPartnerId}'
    UNION ALL SELECT p_definition#>>'{additionalOptions,people,providerPartner,value}'
      WHERE p_definition#>>'{additionalOptions,people,providerPartner,source}'='FIXED'
    UNION ALL SELECT r->>'supplierPartnerId' FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(p_definition#>'{valuesOptions,deduction,documents}')='array'
        THEN p_definition#>'{valuesOptions,deduction,documents}' ELSE '[]'::jsonb END) r
      WHERE r->>'supplierSource'='FIXED_PARTNER'
    UNION ALL SELECT r->>'supplierPartnerId' FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(p_definition#>'{valuesOptions,ibscbs,reimbursementDocuments}')='array'
        THEN p_definition#>'{valuesOptions,ibscbs,reimbursementDocuments}' ELSE '[]'::jsonb END) r
      WHERE r->>'supplierSource'='FIXED_PARTNER'
  ) refs WHERE ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
$function$;

-- Resolve all labels in each list with one scoped join, not one RPC per row.
CREATE FUNCTION private.nfse_preset_document_labels(p_rules jsonb,p_polo_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $function$
  SELECT coalesce(jsonb_agg(r.value||jsonb_build_object('supplierPartnerLabel',
    CASE WHEN r.value->>'supplierSource'='FIXED_PARTNER' THEN left(nullif(btrim(p.nome),''),300) ELSE NULL END)
    ORDER BY r.ordinality),'[]'::jsonb)
  FROM jsonb_array_elements(p_rules) WITH ORDINALITY r(value,ordinality)
  LEFT JOIN public.parceiros p ON p.id=(r.value->>'supplierPartnerId')::uuid
    AND public.is_active_status(p.status)
    AND (p.polo_id=p_polo_id OR p_polo_id=ANY(coalesce(p.polo_ids,ARRAY[]::uuid[]))
      OR (p.polo_id IS NULL AND upper(btrim(p.tipo))<>'ALUNO'));
$function$;

CREATE FUNCTION private.nfse_model_extended_option_labels(p_definition jsonb,p_polo_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $function$
DECLARE v_result jsonb:=p_definition; v_label text;
BEGIN
  IF jsonb_typeof(p_definition->'additionalOptions')='object' THEN
    IF p_definition#>>'{additionalOptions,people,providerPartner,source}'='FIXED' THEN
      v_label:=left(private.nfse_model_partner_label(p_polo_id,
        (p_definition#>>'{additionalOptions,people,providerPartner,value}')::uuid),300);
    END IF;
    v_result:=jsonb_set(v_result,'{additionalOptions,people}',(p_definition#>'{additionalOptions,people}')
      ||jsonb_build_object('providerPartnerLabel',v_label));
  END IF;
  IF jsonb_typeof(p_definition->'valuesOptions')='object' THEN
    v_result:=jsonb_set(v_result,'{valuesOptions,deduction,documents}',private.nfse_preset_document_labels(
      p_definition#>'{valuesOptions,deduction,documents}',p_polo_id));
    IF jsonb_typeof(p_definition#>'{valuesOptions,ibscbs}')='object' THEN
      v_result:=jsonb_set(v_result,'{valuesOptions,ibscbs,reimbursementDocuments}',private.nfse_preset_document_labels(
        p_definition#>'{valuesOptions,ibscbs,reimbursementDocuments}',p_polo_id));
    END IF;
  END IF;
  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION private.nfse_preset_partner_ids(jsonb),private.nfse_preset_document_labels(jsonb,uuid),
  private.nfse_model_extended_option_labels(jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_nfse_models_secure(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
SET statement_timeout='8s' AS $function$
DECLARE v_rows jsonb;
BEGIN
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  SELECT coalesce(jsonb_agg(private.nfse_model_extended_option_labels(private.nfse_model_people_option_labels(
    private.nfse_model_service_option_labels(model.definition),p_polo_id),p_polo_id)
    ||jsonb_build_object('id',model.id,'version',model.version)
    ORDER BY lower(model.definition->>'name'),model.id),'[]'::jsonb) INTO v_rows
  FROM private.nfse_models model WHERE model.polo_id=p_polo_id AND model.environment=p_environment;
  RETURN jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,
    'environment',p_environment,'month',p_month),'data',jsonb_build_object('rows',v_rows,'page',1,'pageSize',100,
    'totalItems',jsonb_array_length(v_rows)));
END;
$function$;
REVOKE ALL ON FUNCTION public.get_nfse_models_secure(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_nfse_models_secure(uuid,uuid,text,text) TO authenticated;

-- The save replacement below retains the historical request envelope. Presence
-- of new option objects participates in intent; current catalogs run after replay.
CREATE OR REPLACE FUNCTION public.save_nfse_model_secure(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,
  p_request_id uuid,p_id uuid,p_expected_version integer,p_definition jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
SET statement_timeout='8s' AS $function$
DECLARE v_actor uuid; v_definition jsonb:='{}'; v_payload jsonb; v_response jsonb;
  v_previous private.nfse_model_requests%ROWTYPE; v_model private.nfse_models%ROWTYPE;
  v_field record; v_text text; v_partner uuid;
BEGIN
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  v_actor:=auth.uid();
  IF p_request_id IS NULL OR (p_id IS NULL)<>(p_expected_version IS NULL)
    OR (p_expected_version IS NOT NULL AND p_expected_version<1)
    OR p_definition IS NULL OR jsonb_typeof(p_definition)<>'object' OR octet_length(p_definition::text)>1048576 THEN
    RAISE EXCEPTION 'Dados do modelo NFS-e inválidos.' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_definition) f(key) WHERE key NOT IN
    ('name','active','nationalServiceCode','nbsCode','operationIndicatorCode','serviceDescription','issTreatment',
     'immunityType','technicalResponsibilityDocument','referenceDocument','complementaryInfo','orderReference',
     'serviceOptions','peopleOptions','additionalOptions','valuesOptions')) THEN
    RAISE EXCEPTION 'Campo desconhecido no modelo NFS-e.' USING ERRCODE='22023'; END IF;
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
    OR jsonb_typeof(p_definition->'active') IS DISTINCT FROM 'boolean' OR NOT(p_definition ? 'immunityType') THEN
    RAISE EXCEPTION 'Classificação do serviço NFS-e inválida.' USING ERRCODE='22023'; END IF;
  IF v_definition->>'issTreatment'='IMUNIDADE' THEN
    IF jsonb_typeof(p_definition->'immunityType') IS DISTINCT FROM 'string'
      OR p_definition->>'immunityType' NOT IN ('1','2','3','4','5') THEN
      RAISE EXCEPTION 'Informe o tipo de imunidade.' USING ERRCODE='22023'; END IF;
  ELSIF p_definition->'immunityType' IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION 'Tipo de imunidade permitido somente para imunidade.' USING ERRCODE='22023'; END IF;
  v_definition:=v_definition||jsonb_build_object('active',p_definition->'active','immunityType',p_definition->'immunityType');
  IF p_definition ? 'serviceOptions' THEN v_definition:=v_definition||jsonb_build_object('serviceOptions',p_definition->'serviceOptions'); END IF;
  IF p_definition ? 'peopleOptions' THEN v_definition:=v_definition||jsonb_build_object('peopleOptions',p_definition->'peopleOptions'); END IF;
  IF p_definition ? 'additionalOptions' THEN v_definition:=v_definition||jsonb_build_object('additionalOptions',p_definition->'additionalOptions'); END IF;
  IF p_definition ? 'valuesOptions' THEN v_definition:=v_definition||jsonb_build_object('valuesOptions',p_definition->'valuesOptions'); END IF;
  -- Keep the historical request shape. New option objects are immutable intent;
  -- catalog/partner availability is checked only for a new write, never on replay.
  v_payload:=jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,'environment',p_environment,'month',p_month,
    'id',p_id,'expectedVersion',p_expected_version,'definition',v_definition);
  PERFORM pg_advisory_xact_lock(hashtextextended('nfse-model-request:'||v_actor::text||':'||p_request_id::text,0));
  SELECT * INTO v_previous FROM private.nfse_model_requests WHERE actor_id=v_actor AND request_id=p_request_id;
  IF FOUND THEN
    IF v_previous.payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'Solicitação já utilizada com outros dados.' USING ERRCODE='22023'; END IF;
    RETURN v_previous.response;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('nfse-model-polo:'||p_polo_id::text||':'||p_environment,0));
  IF p_id IS NOT NULL THEN
    SELECT * INTO v_model FROM private.nfse_models WHERE id=p_id AND polo_id=p_polo_id
      AND environment=p_environment AND version=p_expected_version FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'O modelo mudou. Atualize os modelos.' USING ERRCODE='40001'; END IF;
    IF (jsonb_typeof(v_model.definition->'serviceOptions')='object' AND jsonb_typeof(p_definition->'serviceOptions') IS DISTINCT FROM 'object')
      OR (jsonb_typeof(v_model.definition->'peopleOptions')='object' AND jsonb_typeof(p_definition->'peopleOptions') IS DISTINCT FROM 'object')
      OR (jsonb_typeof(v_model.definition->'additionalOptions')='object' AND jsonb_typeof(p_definition->'additionalOptions') IS DISTINCT FROM 'object')
      OR (jsonb_typeof(v_model.definition->'valuesOptions')='object' AND jsonb_typeof(p_definition->'valuesOptions') IS DISTINCT FROM 'object') THEN
      RAISE EXCEPTION 'Atualize o formulário para preservar as preferências já cadastradas.' USING ERRCODE='40001'; END IF;
  ELSIF (SELECT count(*) FROM private.nfse_models WHERE polo_id=p_polo_id AND environment=p_environment)>=100 THEN
    RAISE EXCEPTION 'Limite de 100 modelos por estabelecimento e ambiente atingido.' USING ERRCODE='22023';
  END IF;
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
    RAISE EXCEPTION 'Selecione serviço, NBS e indicador existentes nos catálogos oficiais.' USING ERRCODE='22023'; END IF;
  IF p_definition ? 'serviceOptions' THEN
    v_definition:=v_definition||jsonb_build_object('serviceOptions',private.normalize_nfse_model_service_options(
      p_definition->'serviceOptions',v_definition->>'issTreatment',v_definition->>'nationalServiceCode',v_definition->>'operationIndicatorCode'));
  END IF;
  IF p_definition ? 'peopleOptions' THEN
    v_definition:=v_definition||jsonb_build_object('peopleOptions',private.normalize_nfse_model_people_options(
      p_definition->'peopleOptions',v_definition->'serviceOptions',p_polo_id));
  END IF;
  IF p_definition ? 'additionalOptions' THEN
    v_definition:=v_definition||jsonb_build_object('additionalOptions',private.normalize_nfse_model_additional_options(
      p_definition->'additionalOptions',v_definition,p_polo_id,p_environment));
  END IF;
  IF p_definition ? 'valuesOptions' THEN
    v_definition:=v_definition||jsonb_build_object('valuesOptions',private.normalize_nfse_model_values_options(
      p_definition->'valuesOptions',v_definition,p_polo_id,p_environment));
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO private.nfse_models(polo_id,environment,definition,created_by,updated_by)
      VALUES(p_polo_id,p_environment,v_definition,v_actor,v_actor) RETURNING * INTO v_model;
  ELSE
    UPDATE private.nfse_models SET definition=v_definition,version=version+1,updated_by=v_actor,updated_at=now()
      WHERE id=p_id RETURNING * INTO v_model;
  END IF;
  v_response:=jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,
    'environment',p_environment,'month',p_month),'data',jsonb_build_object('id',v_model.id,'version',v_model.version,'message','Modelo salvo.'));
  INSERT INTO private.nfse_model_requests(actor_id,request_id,context_id,polo_id,environment,payload,response)
    VALUES(v_actor,p_request_id,p_context_key,p_polo_id,p_environment,v_payload,v_response);
  RETURN v_response;
END;
$function$;
REVOKE ALL ON FUNCTION public.save_nfse_model_secure(uuid,uuid,text,text,uuid,uuid,integer,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.save_nfse_model_secure(uuid,uuid,text,text,uuid,uuid,integer,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
