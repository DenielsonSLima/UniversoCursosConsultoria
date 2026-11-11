BEGIN;
-- Isolate future uploads without reading, changing or deleting existing Vault values.
CREATE OR REPLACE FUNCTION public.store_nfse_certificate_internal(
  p_actor_id uuid,p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,
  p_request_id uuid,p_configuration_version integer,p_metadata jsonb,p_material jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_claims text:=current_setting('request.jwt.claims',true); v_sub text:=current_setting('request.jwt.claim.sub',true);
  v_scope jsonb; v_payload jsonb; v_previous private.nfse_certificate_requests%ROWTYPE;
  v_secret uuid; v_response jsonb; v_not_before timestamptz; v_expires_at timestamptz;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'Canal interno obrigatório.' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('nfse-config:'||p_polo_id::text||':'||p_environment,0));
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p_actor_id,'role','authenticated')::text,true);
  PERFORM set_config('request.jwt.claim.sub',p_actor_id::text,true);
  v_scope:=public.authorize_nfse_certificate_upload_secure(p_context_key,p_polo_id,p_environment,p_month);
  PERFORM set_config('request.jwt.claims',coalesce(v_claims,''),true);
  PERFORM set_config('request.jwt.claim.sub',coalesce(v_sub,''),true);
  IF p_request_id IS NULL OR p_configuration_version IS DISTINCT FROM (v_scope->>'configurationVersion')::integer
    OR p_metadata IS NULL OR jsonb_typeof(p_metadata)<>'object'
    OR p_material IS NULL OR jsonb_typeof(p_material)<>'object' OR octet_length(p_material::text)>180000
    OR p_metadata->>'cnpj' IS DISTINCT FROM v_scope->>'cnpj'
    OR coalesce(p_metadata->>'fingerprint','') !~ '^[0-9a-f]{64}$'
    OR p_metadata->'chainVerified' IS DISTINCT FROM 'true'::jsonb
    OR p_metadata->>'revocationStatus' IS DISTINCT FROM 'UNKNOWN'
    OR p_metadata->'representationVerified' IS DISTINCT FROM 'false'::jsonb THEN
    RAISE EXCEPTION 'Inspeção do certificado ou contexto inválido.' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_material) f(key) WHERE key NOT IN ('privateKeyPem','certificatePem','chainPem'))
    OR coalesce(p_material->>'privateKeyPem','') NOT LIKE '%-----BEGIN RSA PRIVATE KEY-----%'
    OR coalesce(p_material->>'certificatePem','') NOT LIKE '%-----BEGIN CERTIFICATE-----%'
    OR jsonb_typeof(p_material->'chainPem') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'Material do certificado inválido.' USING ERRCODE='22023';
  END IF;
  v_not_before:=(p_metadata->>'notBefore')::timestamptz; v_expires_at:=(p_metadata->>'expiresAt')::timestamptz;
  IF v_not_before IS NULL OR v_expires_at IS NULL OR v_not_before>now() OR v_expires_at<=now() THEN
    RAISE EXCEPTION 'Certificado fora da validade.' USING ERRCODE='22023';
  END IF;
  v_payload:=jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,'environment',p_environment,
    'month',p_month,'configurationVersion',p_configuration_version,'credentialPoloId',v_scope->'credentialPoloId',
    'fingerprint',p_metadata->>'fingerprint');
  PERFORM pg_advisory_xact_lock(hashtextextended('nfse-cert-request:'||p_actor_id::text||':'||p_request_id::text,0));
  SELECT * INTO v_previous FROM private.nfse_certificate_requests WHERE actor_id=p_actor_id AND request_id=p_request_id;
  IF FOUND THEN
    IF v_previous.payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'Solicitação já usada com outro certificado.' USING ERRCODE='22023';
    END IF;
    RETURN v_previous.response;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('nfse-cert:'||(v_scope->>'credentialPoloId')||':'||p_environment,0));
  -- Never update an existing secret: another environment or an immutable operation
  -- may still reference it. A new upload rotates only this owner/environment row.
  SELECT vault.create_secret(p_material::text,
    'nfse-a1-'||(v_scope->>'credentialPoloId')||'-'||p_environment||'-'||gen_random_uuid()::text,
    'NFS-e A1 material; server-only immutable upload version') INTO v_secret;
  INSERT INTO private.nfse_certificates(polo_id,environment,vault_secret_id,fingerprint,cnpj,not_before,expires_at,updated_by)
  VALUES((v_scope->>'credentialPoloId')::uuid,p_environment,v_secret,p_metadata->>'fingerprint',
    p_metadata->>'cnpj',v_not_before,v_expires_at,p_actor_id)
  ON CONFLICT(polo_id,environment) DO UPDATE SET vault_secret_id=excluded.vault_secret_id,
    fingerprint=excluded.fingerprint,cnpj=excluded.cnpj,not_before=excluded.not_before,
    expires_at=excluded.expires_at,updated_by=excluded.updated_by,updated_at=now();
  v_response:=jsonb_build_object('configured',true,'expiresAt',v_expires_at,'chainVerified',true,
    'revocationStatus','UNKNOWN','representationVerified',false,'readiness','BLOCKED');
  INSERT INTO private.nfse_certificate_requests(actor_id,request_id,payload,response)
  VALUES(p_actor_id,p_request_id,v_payload,v_response);
  RETURN v_response;
END;
$function$;
REVOKE ALL ON FUNCTION public.store_nfse_certificate_internal(uuid,uuid,uuid,text,text,uuid,integer,jsonb,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.store_nfse_certificate_internal(uuid,uuid,uuid,text,text,uuid,integer,jsonb,jsonb) TO service_role;
COMMIT;
