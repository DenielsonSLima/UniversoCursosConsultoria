BEGIN;

-- Server-only read for the authorized homologation executor. Never grant to
-- browser roles and never expose its result through an HTTP response or logs.
CREATE FUNCTION public.get_nfse_preflight_material_internal(
  p_actor_id uuid,p_context_key uuid,p_polo_id uuid,p_environment text,p_month text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
SET statement_timeout='8s' AS $function$
DECLARE
  v_claims text:=current_setting('request.jwt.claims',true);
  v_sub text:=current_setting('request.jwt.claim.sub',true);
  v_matrix uuid; v_config private.nfse_configurations%ROWTYPE;
  v_certificate private.nfse_certificates%ROWTYPE; v_cnpj text; v_material jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'Canal interno obrigatório.' USING ERRCODE='42501';
  END IF;
  IF p_environment IS DISTINCT FROM 'HOMOLOGACAO' THEN
    RAISE EXCEPTION 'O piloto está restrito à homologação.' USING ERRCODE='42501';
  END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p_actor_id,'role','authenticated')::text,true);
  PERFORM set_config('request.jwt.claim.sub',p_actor_id::text,true);
  v_matrix:=private.authorize_nfse_configuration_scope(p_context_key,p_polo_id,p_environment,p_month);
  PERFORM set_config('request.jwt.claims',coalesce(v_claims,''),true);
  PERFORM set_config('request.jwt.claim.sub',coalesce(v_sub,''),true);
  IF p_polo_id IS DISTINCT FROM v_matrix THEN
    RAISE EXCEPTION 'O piloto está restrito à matriz.' USING ERRCODE='42501';
  END IF;
  -- A consistent row lock prevents replacement of configuration/certificate
  -- while this read resolves the referenced material.
  SELECT * INTO v_config FROM private.nfse_configurations
    WHERE polo_id=p_polo_id AND environment=p_environment FOR SHARE;
  IF NOT FOUND OR v_config.credential_polo_id IS DISTINCT FROM v_matrix
    OR v_config.definition->>'portalAccess' IS DISTINCT FROM 'CERTIFICATE' THEN
    RAISE EXCEPTION 'Revise os parâmetros fiscais da matriz.' USING ERRCODE='22023';
  END IF;
  SELECT regexp_replace(coalesce(cnpj,''),'[^0-9]','','g') INTO v_cnpj
    FROM public.polos WHERE id=p_polo_id AND public.is_active_status(status);
  SELECT * INTO v_certificate FROM private.nfse_certificates
    WHERE polo_id=v_config.credential_polo_id AND environment=p_environment FOR SHARE;
  IF NOT FOUND OR v_cnpj !~ '^[0-9]{14}$' OR v_certificate.cnpj IS DISTINCT FROM v_cnpj
    OR v_certificate.not_before>now() OR v_certificate.expires_at<=now() THEN
    RAISE EXCEPTION 'Certificado válido da matriz indisponível.' USING ERRCODE='22023';
  END IF;
  SELECT decrypted_secret::jsonb INTO v_material FROM vault.decrypted_secrets
    WHERE id=v_certificate.vault_secret_id;
  IF v_material IS NULL OR jsonb_typeof(v_material)<>'object'
    OR octet_length(v_material::text)>180000
    OR coalesce(v_material->>'privateKeyPem','') NOT LIKE '%-----BEGIN RSA PRIVATE KEY-----%'
    OR coalesce(v_material->>'certificatePem','') NOT LIKE '%-----BEGIN CERTIFICATE-----%'
    OR jsonb_typeof(v_material->'chainPem') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'Material do certificado indisponível.' USING ERRCODE='22023';
  END IF;
  RETURN jsonb_build_object('actorId',p_actor_id,'contextKey',p_context_key,'poloId',p_polo_id,
    'environment',p_environment,'month',p_month,'configurationVersion',v_config.version,
    'issuer',jsonb_build_object('cnpj',v_cnpj,'municipalityCode',v_config.definition->>'municipalityCode',
      'municipalRegistration',nullif(v_config.definition->>'municipalRegistration',''),
      'opSimpNac',v_config.definition->>'opSimpNac','regEspTrib',v_config.definition->>'regEspTrib',
      'regApTribSN',v_config.definition->'regApTribSN'),
    'certificate',jsonb_build_object('notBefore',v_certificate.not_before,'expiresAt',v_certificate.expires_at,
      'fingerprint',v_certificate.fingerprint),
    'material',jsonb_build_object('certificatePem',v_material->>'certificatePem',
      'chainPem',v_material->>'chainPem','privateKeyPem',v_material->>'privateKeyPem'));
END;
$function$;
REVOKE ALL ON FUNCTION public.get_nfse_preflight_material_internal(uuid,uuid,uuid,text,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_nfse_preflight_material_internal(uuid,uuid,uuid,text,text) TO service_role;
COMMENT ON FUNCTION public.get_nfse_preflight_material_internal(uuid,uuid,uuid,text,text) IS
  'Server-only authorized A1 read, restricted to matrix homologation. Never return material to clients or logs.';
NOTIFY pgrst,'reload schema';
COMMIT;
