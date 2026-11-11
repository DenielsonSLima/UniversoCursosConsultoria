BEGIN;

-- Reusable justification drafts only. Selecting or saving a model does not
-- cancel a note, establish municipal eligibility or create a fiscal event.
-- Reasons 1/2/9 follow production v1.01 TSCodJustCanc (tiposSimples_v1.01.xsd).
-- Categories are application organization; municipal deadlines are not inferred.
CREATE TABLE private.nfse_cancellation_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),polo_id uuid NOT NULL REFERENCES public.polos(id),
  environment text NOT NULL CHECK(environment IN('HOMOLOGACAO','PRODUCAO')),
  definition jsonb NOT NULL CHECK(jsonb_typeof(definition)='object'),version integer NOT NULL DEFAULT 1 CHECK(version>0),
  created_by uuid NOT NULL,updated_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX nfse_cancellation_models_scope ON private.nfse_cancellation_models(polo_id,environment);
CREATE TABLE private.nfse_cancellation_model_requests (
  actor_id uuid NOT NULL,request_id uuid NOT NULL,context_id uuid NOT NULL,polo_id uuid NOT NULL REFERENCES public.polos(id),
  environment text NOT NULL,payload jsonb NOT NULL,response jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(actor_id,request_id)
);
ALTER TABLE private.nfse_cancellation_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.nfse_cancellation_model_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.nfse_cancellation_models,private.nfse_cancellation_model_requests FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.normalize_nfse_cancellation_model(p_definition jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $function$
DECLARE v_name text; v_template text; v_remaining text;
BEGIN
  IF p_definition IS NULL OR jsonb_typeof(p_definition)<>'object' OR octet_length(p_definition::text)>4000
    OR NOT(p_definition ?& ARRAY['category','name','active','eventCode','reasonCode','textTemplate'])
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_definition) k WHERE k NOT IN
      ('category','name','active','eventCode','reasonCode','textTemplate'))
    OR jsonb_typeof(p_definition->'name') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_definition->'textTemplate') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_definition->'active') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_definition->'category') IS DISTINCT FROM 'string'
    OR p_definition->>'category' NOT IN('VALOR','SERVICO','TRIBUTACAO','TOMADOR','DUPLICIDADE','OUTROS')
    OR p_definition->'eventCode' IS DISTINCT FROM '"101101"'::jsonb
    OR jsonb_typeof(p_definition->'reasonCode') IS DISTINCT FROM 'string'
    OR p_definition->>'reasonCode' NOT IN('1','2','9') THEN
    RAISE EXCEPTION 'Revise os campos e o motivo oficial do modelo de cancelamento.' USING ERRCODE='22023'; END IF;
  v_name:=btrim(p_definition->>'name');v_template:=btrim(p_definition->>'textTemplate');
  v_remaining:=replace(v_template,'{{detalhe}}','');
  IF length(v_name) NOT BETWEEN 1 AND 120 OR length(v_template) NOT BETWEEN 15 AND 255
    OR v_name ~ '[[:cntrl:]]' OR v_template ~ '[[:cntrl:]]'
    OR strpos(v_remaining,'{{')>0 OR strpos(v_remaining,'}}')>0 THEN
    RAISE EXCEPTION 'Nome de 1 a 120 caracteres e texto de 15 a 255; a variável permitida é {{detalhe}}.' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('category',p_definition->>'category','name',v_name,'active',p_definition->'active',
    'eventCode','101101','reasonCode',p_definition->>'reasonCode','textTemplate',v_template);
END;
$function$;
REVOKE ALL ON FUNCTION private.normalize_nfse_cancellation_model(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.validate_nfse_cancellation_model() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $function$
BEGIN NEW.definition:=private.normalize_nfse_cancellation_model(NEW.definition);RETURN NEW;END;
$function$;
REVOKE ALL ON FUNCTION private.validate_nfse_cancellation_model() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER nfse_cancellation_model_definition BEFORE INSERT OR UPDATE OF definition ON private.nfse_cancellation_models
  FOR EACH ROW EXECUTE FUNCTION private.validate_nfse_cancellation_model();
CREATE FUNCTION private.reject_nfse_cancellation_model_request_change() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $function$
BEGIN RAISE EXCEPTION 'O histórico do modelo de cancelamento é imutável.' USING ERRCODE='55000';END;
$function$;
REVOKE ALL ON FUNCTION private.reject_nfse_cancellation_model_request_change() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER nfse_cancellation_model_request_immutable BEFORE UPDATE OR DELETE ON private.nfse_cancellation_model_requests
  FOR EACH ROW EXECUTE FUNCTION private.reject_nfse_cancellation_model_request_change();

CREATE FUNCTION private.nfse_system_cancellation_models() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $function$
  SELECT jsonb_agg(jsonb_build_object('id','SYSTEM:'||key,'version',1,'source','SYSTEM','category',category,
    'name',name,'active',true,'eventCode','101101','reasonCode',reason,'textTemplate',template,'requiresDetail',true) ORDER BY key)
  FROM(VALUES
    ('ERROR_AMOUNT','VALOR','Erro no valor do serviço','1',
      'Solicito o cancelamento da NFS-e por incorreção no valor informado. Descrição do erro e do valor correto: {{detalhe}}.'),
    ('ERROR_SERVICE','SERVICO','Erro na descrição do serviço','1',
      'Solicito o cancelamento da NFS-e por erro na descrição do serviço prestado. Informação incorreta e descrição correta: {{detalhe}}.'),
    ('ERROR_TAXATION','TRIBUTACAO','Erro nos dados de tributação','1',
      'Solicito o cancelamento da NFS-e por incorreção nos dados de tributação informados. Identificação do erro e da correção confirmada: {{detalhe}}.'),
    ('ERROR_RECIPIENT','TOMADOR','Erro na identificação do tomador','1',
      'Solicito o cancelamento da NFS-e por erro na identificação do tomador. Descrição da informação incorreta e da correção necessária: {{detalhe}}.'),
    ('DUPLICATE_ISSUE','DUPLICIDADE','Emissão em duplicidade','1',
      'Solicito o cancelamento da NFS-e emitida em duplicidade. Identificação das notas e dos fatos que comprovam a duplicidade: {{detalhe}}.'),
    ('SERVICE_NOT_PROVIDED','SERVICO','Serviço não prestado','2',
      'Solicito o cancelamento da NFS-e porque o serviço nela descrito não foi prestado. Descrição dos fatos e da operação não realizada: {{detalhe}}.'),
    ('OTHER_REASON','OUTROS','Outros motivos fundamentados','9',
      'Solicito o cancelamento da NFS-e pelo motivo a seguir. Descrição objetiva dos fatos e da justificativa para o pedido: {{detalhe}}.')
  ) seeds(key,category,name,reason,template);
$function$;
REVOKE ALL ON FUNCTION private.nfse_system_cancellation_models() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.nfse_cancellation_model_projection(p_row private.nfse_cancellation_models)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $function$
  SELECT p_row.definition||jsonb_build_object('id',p_row.id,'version',p_row.version,'source','CUSTOM',
    'requiresDetail',strpos(p_row.definition->>'textTemplate','{{detalhe}}')>0);
$function$;
REVOKE ALL ON FUNCTION private.nfse_cancellation_model_projection(private.nfse_cancellation_models)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.get_nfse_cancellation_models_secure(p_context_key uuid,p_polo_id uuid,p_environment text,p_month text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET statement_timeout='8s' AS $function$
DECLARE v_rows jsonb;
BEGIN
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  SELECT jsonb_agg(model ORDER BY model->>'category',lower(model->>'name'),model->>'id') INTO v_rows FROM(
    SELECT value model FROM jsonb_array_elements(private.nfse_system_cancellation_models())
    UNION ALL SELECT private.nfse_cancellation_model_projection(m) FROM private.nfse_cancellation_models m
      WHERE m.polo_id=p_polo_id AND m.environment=p_environment) rows;
  RETURN jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,
    'environment',p_environment,'month',p_month),'data',jsonb_build_object('rows',v_rows,'page',1,'pageSize',500,
      'totalItems',jsonb_array_length(v_rows)));
END;
$function$;
REVOKE ALL ON FUNCTION public.get_nfse_cancellation_models_secure(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_nfse_cancellation_models_secure(uuid,uuid,text,text) TO authenticated;

CREATE FUNCTION public.save_nfse_cancellation_model_secure(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,p_request_id uuid,p_model_id uuid,
  p_expected_version integer,p_definition jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET statement_timeout='8s' SET lock_timeout='5s' AS $function$
DECLARE v_actor uuid;v_definition jsonb;v_payload jsonb;v_previous private.nfse_cancellation_model_requests%ROWTYPE;
  v_model private.nfse_cancellation_models%ROWTYPE;v_response jsonb;
BEGIN
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  v_actor:=auth.uid();
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Identidade autenticada obrigatória.' USING ERRCODE='42501'; END IF;
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Salvar o modelo exige READ COMMITTED.' USING ERRCODE='25001'; END IF;
  IF p_request_id IS NULL OR (p_model_id IS NULL)<>(p_expected_version IS NULL)
    OR (p_expected_version IS NOT NULL AND p_expected_version<1) THEN
    RAISE EXCEPTION 'Identificação e versão do modelo inválidas.' USING ERRCODE='22023'; END IF;
  v_definition:=private.normalize_nfse_cancellation_model(p_definition);
  v_payload:=jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,'environment',p_environment,'month',p_month,
    'modelId',p_model_id,'expectedVersion',p_expected_version,'definition',v_definition);
  PERFORM pg_advisory_xact_lock(hashtextextended('nfse-cancellation-model-request:'||v_actor::text||':'||p_request_id::text,0));
  SELECT * INTO v_previous FROM private.nfse_cancellation_model_requests WHERE actor_id=v_actor AND request_id=p_request_id;
  IF FOUND THEN
    IF v_previous.payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'Solicitação já utilizada com outros dados.' USING ERRCODE='22023'; END IF;
    RETURN v_previous.response;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('nfse-cancellation-model-scope:'||p_polo_id::text||':'||p_environment,0));
  IF p_model_id IS NULL THEN
    IF (SELECT count(*) FROM private.nfse_cancellation_models WHERE polo_id=p_polo_id AND environment=p_environment)>=493 THEN
      RAISE EXCEPTION 'Limite de 493 modelos personalizados por unidade e ambiente atingido.' USING ERRCODE='22023'; END IF;
    INSERT INTO private.nfse_cancellation_models(polo_id,environment,definition,created_by,updated_by)
      VALUES(p_polo_id,p_environment,v_definition,v_actor,v_actor) RETURNING * INTO v_model;
  ELSE
    UPDATE private.nfse_cancellation_models SET definition=v_definition,version=version+1,updated_by=v_actor,updated_at=now()
      WHERE id=p_model_id AND polo_id=p_polo_id AND environment=p_environment AND version=p_expected_version RETURNING * INTO v_model;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'O modelo mudou ou está fora da unidade e ambiente. Atualize a lista.' USING ERRCODE='40001'; END IF;
  END IF;
  v_response:=jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,
    'environment',p_environment,'month',p_month),'data',jsonb_build_object('model',private.nfse_cancellation_model_projection(v_model)));
  INSERT INTO private.nfse_cancellation_model_requests(actor_id,request_id,context_id,polo_id,environment,payload,response)
    VALUES(v_actor,p_request_id,p_context_key,p_polo_id,p_environment,v_payload,v_response);
  RETURN v_response;
END;
$function$;
REVOKE ALL ON FUNCTION public.save_nfse_cancellation_model_secure(uuid,uuid,text,text,uuid,uuid,integer,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.save_nfse_cancellation_model_secure(uuid,uuid,text,text,uuid,uuid,integer,jsonb) TO authenticated;
COMMENT ON FUNCTION public.save_nfse_cancellation_model_secure(uuid,uuid,text,text,uuid,uuid,integer,jsonb) IS
  'Scoped, versioned justification models with immutable replay/audit. Official cancellation reason codes 1/2/9; no fiscal dispatch or municipal deadline is inferred.';
NOTIFY pgrst,'reload schema';
COMMIT;
