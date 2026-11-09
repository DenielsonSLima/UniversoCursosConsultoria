BEGIN;

CREATE FUNCTION public.get_nfse_configuration_secure(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
SET statement_timeout='8s' AS $function$
BEGIN
  PERFORM private.authorize_nfse_configuration_scope(p_context_key,p_polo_id,p_environment,p_month);
  RETURN jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,
    'poloId',p_polo_id,'environment',p_environment,'month',p_month),
    'data',private.nfse_configuration_metadata(p_polo_id,p_environment));
END;
$function$;
REVOKE ALL ON FUNCTION public.get_nfse_configuration_secure(uuid,uuid,text,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_nfse_configuration_secure(uuid,uuid,text,text) TO authenticated;

CREATE FUNCTION public.save_nfse_configuration_secure(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,
  p_request_id uuid,p_expected_version integer,p_definition jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
SET statement_timeout='8s' AS $function$
DECLARE
  v_matrix uuid; v_credential_polo uuid; v_actor uuid:=auth.uid(); v_field text;
  v_definition jsonb:='{}'::jsonb; v_payload jsonb; v_response jsonb; v_version integer;
  v_previous private.nfse_configuration_requests%ROWTYPE; v_cnpj text; v_source_cnpj text;
BEGIN
  v_matrix:=private.authorize_nfse_configuration_scope(p_context_key,p_polo_id,p_environment,p_month);
  IF p_request_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 0
    OR p_definition IS NULL OR jsonb_typeof(p_definition)<>'object'
    OR octet_length(p_definition::text)>2000 THEN
    RAISE EXCEPTION 'Parâmetros fiscais inválidos.' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_definition) f(key) WHERE key NOT IN
    ('municipalityCode','municipalRegistration','portalAccess','credentialSource','opSimpNac','regEspTrib','regApTribSN')) THEN
    RAISE EXCEPTION 'Campo não permitido na configuração fiscal.' USING ERRCODE='22023';
  END IF;
  FOREACH v_field IN ARRAY ARRAY['municipalityCode','municipalRegistration','portalAccess','credentialSource','opSimpNac','regEspTrib'] LOOP
    IF jsonb_typeof(p_definition->v_field) IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'Parâmetro fiscal obrigatório.' USING ERRCODE='22023';
    END IF;
    v_definition:=v_definition || jsonb_build_object(v_field,btrim(p_definition->>v_field));
  END LOOP;
  IF v_definition->>'municipalityCode' !~ '^(11|12|13|14|15|16|17|21|22|23|24|25|26|27|28|29|31|32|33|35|41|42|43|50|51|52|53)[0-9]{5}$'
    OR length(v_definition->>'municipalRegistration')>15
    OR v_definition->>'municipalRegistration' ~ '[[:cntrl:]]'
    OR v_definition->>'portalAccess' NOT IN ('PASSWORD','CERTIFICATE','GOVBR')
    OR v_definition->>'credentialSource' NOT IN ('MATRIZ','PROPRIO')
    OR v_definition->>'opSimpNac' NOT IN ('1','2','3')
    OR v_definition->>'regEspTrib' NOT IN ('0','1','2','3','4','5','6','9')
    OR NOT (p_definition ? 'regApTribSN') THEN
    RAISE EXCEPTION 'Município ou regime fiscal inválido.' USING ERRCODE='22023';
  END IF;
  -- XSD permits omission. Assessment values apply only to regular Simples (3).
  IF v_definition->>'opSimpNac'='3' THEN
    IF p_definition->'regApTribSN' IS DISTINCT FROM 'null'::jsonb
      AND (jsonb_typeof(p_definition->'regApTribSN') IS DISTINCT FROM 'string'
        OR p_definition->>'regApTribSN' NOT IN ('1','2','3')) THEN
      RAISE EXCEPTION 'Informe a apuração tributária do Simples Nacional.' USING ERRCODE='22023';
    END IF;
  ELSIF p_definition->'regApTribSN' IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION 'Apuração do Simples incompatível com a opção informada.' USING ERRCODE='22023';
  END IF;
  v_definition:=v_definition || jsonb_build_object('regApTribSN',p_definition->'regApTribSN');
  v_credential_polo:=CASE WHEN v_definition->>'credentialSource'='MATRIZ' THEN v_matrix ELSE p_polo_id END;
  SELECT regexp_replace(coalesce(cnpj,''),'[^0-9]','','g') INTO v_cnpj FROM public.polos WHERE id=p_polo_id;
  SELECT regexp_replace(coalesce(cnpj,''),'[^0-9]','','g') INTO v_source_cnpj FROM public.polos WHERE id=v_credential_polo;
  IF v_cnpj !~ '^[0-9]{14}$' OR v_source_cnpj !~ '^[0-9]{14}$'
    OR left(v_cnpj,8)<>left(v_source_cnpj,8) THEN
    RAISE EXCEPTION 'Referência de certificado exige CNPJs da mesma raiz.' USING ERRCODE='22023';
  END IF;
  v_payload:=jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,
    'environment',p_environment,'month',p_month,'expectedVersion',p_expected_version,
    'credentialPoloId',v_credential_polo,'definition',v_definition);
  PERFORM pg_advisory_xact_lock(hashtextextended('nfse-config-request:'||v_actor::text||':'||p_request_id::text,0));
  SELECT * INTO v_previous FROM private.nfse_configuration_requests WHERE actor_id=v_actor AND request_id=p_request_id;
  IF FOUND THEN
    IF v_previous.payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'Solicitação já utilizada com outros dados.' USING ERRCODE='22023';
    END IF;
    RETURN v_previous.response;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('nfse-config:'||p_polo_id::text||':'||p_environment,0));
  SELECT version INTO v_version FROM private.nfse_configurations WHERE polo_id=p_polo_id AND environment=p_environment;
  IF coalesce(v_version,0)<>p_expected_version THEN
    RAISE EXCEPTION 'A configuração mudou. Atualize antes de salvar.' USING ERRCODE='40001';
  END IF;
  INSERT INTO private.nfse_configurations(polo_id,environment,credential_polo_id,definition,version,updated_by)
  VALUES(p_polo_id,p_environment,v_credential_polo,v_definition,coalesce(v_version,0)+1,v_actor)
  ON CONFLICT(polo_id,environment) DO UPDATE SET credential_polo_id=excluded.credential_polo_id,
    definition=excluded.definition,version=excluded.version,updated_by=excluded.updated_by,updated_at=now();
  v_response:=jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,
    'poloId',p_polo_id,'environment',p_environment,'month',p_month),
    'data',jsonb_build_object('id',p_polo_id,'version',coalesce(v_version,0)+1,'message','Parâmetros fiscais salvos.'));
  INSERT INTO private.nfse_configuration_requests(actor_id,request_id,payload,response)
  VALUES(v_actor,p_request_id,v_payload,v_response);
  RETURN v_response;
END;
$function$;
REVOKE ALL ON FUNCTION public.save_nfse_configuration_secure(uuid,uuid,text,text,uuid,integer,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.save_nfse_configuration_secure(uuid,uuid,text,text,uuid,integer,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
