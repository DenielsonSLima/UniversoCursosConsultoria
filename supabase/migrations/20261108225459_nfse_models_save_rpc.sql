BEGIN;

CREATE FUNCTION public.save_nfse_model_secure(
  p_context_key uuid, p_polo_id uuid, p_environment text, p_month text,
  p_request_id uuid, p_id uuid, p_expected_version integer, p_definition jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
SET statement_timeout = '8s' AS $function$
DECLARE
  v_actor uuid;
  v_definition jsonb := '{}'::jsonb;
  v_payload jsonb;
  v_previous private.nfse_model_requests%ROWTYPE;
  v_model private.nfse_models%ROWTYPE;
  v_field record;
  v_text text;
  v_response jsonb;
BEGIN
  -- Scope is re-authorized before even looking up an idempotent replay.
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  v_actor := auth.uid();
  IF p_request_id IS NULL OR (p_id IS NULL) <> (p_expected_version IS NULL)
    OR (p_expected_version IS NOT NULL AND p_expected_version < 1)
    OR p_definition IS NULL OR jsonb_typeof(p_definition) <> 'object'
    OR octet_length(p_definition::text) > 32000 THEN
    RAISE EXCEPTION 'Dados do modelo NFS-e inválidos.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_definition) field(key) WHERE key NOT IN (
    'name','active','nationalServiceCode','nbsCode','operationIndicatorCode','serviceDescription',
    'issTreatment','immunityType','technicalResponsibilityDocument','referenceDocument','complementaryInfo','orderReference')) THEN
    RAISE EXCEPTION 'Campo desconhecido no modelo NFS-e.' USING ERRCODE = '22023';
  END IF;
  FOR v_field IN SELECT * FROM (VALUES
    ('name',120,true), ('nationalServiceCode',6,true), ('nbsCode',9,true),
    ('operationIndicatorCode',6,false), ('serviceDescription',1000,true), ('issTreatment',20,true),
    ('technicalResponsibilityDocument',40,false), ('referenceDocument',255,false),
    ('complementaryInfo',2000,false), ('orderReference',60,false)
  ) field(key,max_length,required) LOOP
    IF jsonb_typeof(p_definition->v_field.key) IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'Texto obrigatório ou inválido no modelo NFS-e.' USING ERRCODE = '22023';
    END IF;
    v_text := btrim(p_definition->>v_field.key);
    IF length(v_text) > v_field.max_length OR (v_field.required AND v_text = '') THEN
      RAISE EXCEPTION 'Comprimento de campo do modelo NFS-e inválido.' USING ERRCODE = '22023';
    END IF;
    v_definition := v_definition || jsonb_build_object(v_field.key,v_text);
  END LOOP;
  IF v_definition->>'nationalServiceCode' !~ '^[0-9]{6}$'
    OR v_definition->>'nbsCode' !~ '^[0-9]{9}$'
    OR v_definition->>'operationIndicatorCode' !~ '^([0-9]{6})?$'
    OR v_definition->>'issTreatment' NOT IN ('TRIBUTAVEL','IMUNIDADE','EXPORTACAO','NAO_INCIDENCIA')
    OR jsonb_typeof(p_definition->'active') IS DISTINCT FROM 'boolean'
    OR NOT (p_definition ? 'immunityType') THEN
    RAISE EXCEPTION 'Classificação do serviço NFS-e inválida.' USING ERRCODE = '22023';
  END IF;
  IF v_definition->>'issTreatment' = 'IMUNIDADE' THEN
    IF jsonb_typeof(p_definition->'immunityType') IS DISTINCT FROM 'string'
      OR p_definition->>'immunityType' NOT IN ('1','2','3','4','5') THEN
      RAISE EXCEPTION 'Informe o tipo de imunidade.' USING ERRCODE = '22023';
    END IF;
  ELSIF p_definition->'immunityType' IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION 'Tipo de imunidade permitido somente para imunidade.' USING ERRCODE = '22023';
  END IF;
  v_definition := v_definition || jsonb_build_object('active',p_definition->'active',
    'immunityType',p_definition->'immunityType');
  v_payload := jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,
    'environment',p_environment,'month',p_month,'id',p_id,
    'expectedVersion',p_expected_version,'definition',v_definition);

  PERFORM pg_advisory_xact_lock(hashtextextended('nfse-model-request:' || v_actor::text || ':' || p_request_id::text,0));
  SELECT * INTO v_previous FROM private.nfse_model_requests
  WHERE actor_id = v_actor AND request_id = p_request_id;
  IF FOUND THEN
    IF v_previous.payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'Solicitação já utilizada com outros dados.' USING ERRCODE = '22023';
    END IF;
    RETURN v_previous.response;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('nfse-model-polo:' || p_polo_id::text || ':' || p_environment,0));
  IF p_id IS NULL THEN
    IF (SELECT count(*) FROM private.nfse_models WHERE polo_id = p_polo_id AND environment = p_environment) >= 100 THEN
      RAISE EXCEPTION 'Limite de 100 modelos por estabelecimento e ambiente atingido.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO private.nfse_models(polo_id,environment,definition,created_by,updated_by)
    VALUES(p_polo_id,p_environment,v_definition,v_actor,v_actor) RETURNING * INTO v_model;
  ELSE
    UPDATE private.nfse_models SET definition = v_definition, version = version + 1,
      updated_by = v_actor, updated_at = now()
    WHERE id = p_id AND polo_id = p_polo_id AND environment = p_environment
      AND version = p_expected_version RETURNING * INTO v_model;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'O modelo mudou ou não pertence ao estabelecimento. Atualize a lista.' USING ERRCODE = '40001';
    END IF;
  END IF;
  v_response := jsonb_build_object('version',1,
    'scope',jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,
      'environment',p_environment,'month',p_month),
    'data',jsonb_build_object('id',v_model.id,'version',v_model.version,'message','Modelo salvo.'));
  INSERT INTO private.nfse_model_requests(actor_id,request_id,context_id,polo_id,environment,payload,response)
  VALUES(v_actor,p_request_id,p_context_key,p_polo_id,p_environment,v_payload,v_response);
  RETURN v_response;
END;
$function$;
REVOKE ALL ON FUNCTION public.save_nfse_model_secure(uuid,uuid,text,text,uuid,uuid,integer,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_nfse_model_secure(uuid,uuid,text,text,uuid,uuid,integer,jsonb) TO authenticated;
COMMENT ON FUNCTION public.save_nfse_model_secure(uuid,uuid,text,text,uuid,uuid,integer,jsonb) IS
  'Pilot-only model metadata with authorization before replay, immutable audit snapshots and optimistic revision checks. Does not prepare or issue NFS-e.';

NOTIFY pgrst, 'reload schema';
COMMIT;
