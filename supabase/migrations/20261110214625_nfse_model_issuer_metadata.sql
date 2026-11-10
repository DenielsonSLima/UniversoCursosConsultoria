BEGIN;

-- Read-only establishment metadata for the pre-model form. No model payload,
-- financial snapshot or credential is read or changed by this RPC.
CREATE FUNCTION public.get_nfse_model_issuer_metadata_secure(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
SET statement_timeout='8s' AS $function$
DECLARE v_issuer jsonb; v_definition jsonb; v_version integer; v_phone text; v_email text;
BEGIN
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  v_issuer:=private.nfse_issuer_preparation_snapshot(p_polo_id);
  SELECT nullif(btrim(p.telefone),''),nullif(btrim(p.email),'') INTO v_phone,v_email
    FROM public.polos p WHERE p.id=p_polo_id;
  SELECT c.definition,c.version INTO v_definition,v_version
    FROM private.nfse_configurations c WHERE c.polo_id=p_polo_id AND c.environment=p_environment;
  RETURN jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,
    'poloId',p_polo_id,'environment',p_environment,'month',p_month),'data',jsonb_build_object(
    'poloId',p_polo_id,'name',nullif(btrim(v_issuer->>'name'),''),
    'legalName',nullif(btrim(v_issuer->>'legalName'),''),
    'cnpj',nullif(regexp_replace(coalesce(v_issuer->>'cnpj',''),'[^0-9]','','g'),''),
    'address',jsonb_build_object(
      'street',nullif(btrim(v_issuer#>>'{address,street}'),''),
      'number',nullif(btrim(v_issuer#>>'{address,number}'),''),
      'complement',nullif(btrim(v_issuer#>>'{address,complement}'),''),
      'district',nullif(btrim(v_issuer#>>'{address,district}'),''),
      'city',nullif(btrim(v_issuer#>>'{address,city}'),''),
      'state',nullif(btrim(v_issuer#>>'{address,state}'),''),
      'postalCode',nullif(btrim(v_issuer#>>'{address,postalCode}'),'')),
    'phone',v_phone,'email',v_email,
    'municipalityCode',nullif(btrim(v_definition->>'municipalityCode'),''),
    'municipalRegistration',nullif(btrim(v_definition->>'municipalRegistration'),''),
    'opSimpNac',nullif(btrim(v_definition->>'opSimpNac'),''),
    'regApTribSN',nullif(btrim(v_definition->>'regApTribSN'),''),
    'regEspTrib',nullif(btrim(v_definition->>'regEspTrib'),''),
    'configurationVersion',v_version));
END;
$function$;
REVOKE ALL ON FUNCTION public.get_nfse_model_issuer_metadata_secure(uuid,uuid,text,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_nfse_model_issuer_metadata_secure(uuid,uuid,text,text) TO authenticated;
COMMENT ON FUNCTION public.get_nfse_model_issuer_metadata_secure(uuid,uuid,text,text) IS
  'Scoped read-only issuer metadata. Uses the establishment own identity/address; no credentials or readiness assertion.';

NOTIFY pgrst,'reload schema';
COMMIT;
