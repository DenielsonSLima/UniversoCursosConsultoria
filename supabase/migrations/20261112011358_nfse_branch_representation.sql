BEGIN;
-- Derived from live pg_get_functiondef, 2026-11-12; applied sources remain unchanged.
-- Authorization MD5: 5a0ee92ef5247336984bd82b2f68690c; material MD5: 57ecbe61b076d77b4d259a99f2c15258.
-- https://www.gov.br/nfse/pt-br/noticias/nova-funcionalidade-possibilita-representacao-e-alternancia-de-perfis-na-nfs-e
-- Internal resolution only; this does not assert a fiscal authorization by SEFIN.
-- Same-company/same-root representation follows Guia Web 1.3 §11 (31/10/2026).
CREATE FUNCTION private.resolve_nfse_production_certificate(
  p_polo_id uuid,p_environment text,p_expected_issuer_cnpj text DEFAULT NULL
) RETURNS private.nfse_certificates
LANGUAGE plpgsql SET search_path='' AS $function$
DECLARE v_target public.polos%ROWTYPE; v_matrix public.polos%ROWTYPE;
  v_config private.nfse_configurations%ROWTYPE; v_cert private.nfse_certificates%ROWTYPE;
  v_target_cnpj text; v_matrix_cnpj text;
BEGIN
  IF p_environment IS DISTINCT FROM 'PRODUCAO' THEN
    RAISE EXCEPTION 'Credencial exclusiva de produção.' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_target FROM public.polos WHERE id=p_polo_id FOR SHARE;
  IF v_target.id IS NULL OR v_target.company_id IS NULL OR public.is_active_status(v_target.status) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Estabelecimento emissor ativo obrigatório.' USING ERRCODE='22023'; END IF;
  IF (SELECT count(*) FROM public.polos WHERE company_id=v_target.company_id AND is_matriz
      AND public.is_active_status(status))<>1 THEN
    RAISE EXCEPTION 'Matriz institucional não identificada de forma única.' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_matrix FROM public.polos WHERE company_id=v_target.company_id AND is_matriz
    AND public.is_active_status(status) FOR SHARE;
  v_target_cnpj:=regexp_replace(coalesce(v_target.cnpj,''),'[^0-9]','','g');
  v_matrix_cnpj:=regexp_replace(coalesce(v_matrix.cnpj,''),'[^0-9]','','g');
  IF length(v_target_cnpj)<>14 OR length(v_matrix_cnpj)<>14
    OR NOT private.nfse_review_valid_document(v_target_cnpj) OR NOT private.nfse_review_valid_document(v_matrix_cnpj)
    OR left(v_target_cnpj,8) IS DISTINCT FROM left(v_matrix_cnpj,8)
    OR(p_expected_issuer_cnpj IS NOT NULL AND p_expected_issuer_cnpj IS DISTINCT FROM v_target_cnpj) THEN
    RAISE EXCEPTION 'Confira o CNPJ próprio do emitente e a representação da matriz.' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_config FROM private.nfse_configurations
    WHERE polo_id=p_polo_id AND environment=p_environment FOR SHARE;
  IF v_config.version IS NULL OR v_config.credential_polo_id IS DISTINCT FROM v_matrix.id
    OR v_config.definition->>'portalAccess' IS DISTINCT FROM 'CERTIFICATE' THEN
    RAISE EXCEPTION 'Configure o A1 da matriz para este estabelecimento e ambiente.' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_cert FROM private.nfse_certificates
    WHERE polo_id=v_matrix.id AND environment=p_environment FOR SHARE;
  IF v_cert.fingerprint IS NULL OR v_cert.cnpj IS DISTINCT FROM v_matrix_cnpj
    OR v_cert.not_before>now() OR v_cert.expires_at<=now() THEN
    RAISE EXCEPTION 'Certificado válido da matriz indisponível neste ambiente.' USING ERRCODE='22023'; END IF;
  RETURN v_cert;
END;
$function$;
REVOKE ALL ON FUNCTION private.resolve_nfse_production_certificate(uuid,text,text)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.authorize_nfse_individual_internal(p_actor_id uuid, p_context_key uuid, p_polo_id uuid, p_environment text, p_month text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_claims text:=current_setting('request.jwt.claims',true); v_sub text:=current_setting('request.jwt.claim.sub',true); v_matrix uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR p_actor_id IS NULL OR p_environment IS DISTINCT FROM 'PRODUCAO' THEN
    RAISE EXCEPTION 'Executor individual de produção obrigatório.' USING ERRCODE='42501'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p_actor_id,'role','authenticated')::text,true);
  PERFORM set_config('request.jwt.claim.sub',p_actor_id::text,true);
  v_matrix:=private.authorize_nfse_configuration_scope(p_context_key,p_polo_id,p_environment,p_month);
  PERFORM set_config('request.jwt.claims',coalesce(v_claims,''),true);
  PERFORM set_config('request.jwt.claim.sub',coalesce(v_sub,''),true);

END;
$function$;
REVOKE ALL ON FUNCTION private.authorize_nfse_individual_internal(uuid,uuid,uuid,text,text)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_nfse_production_material_internal(p_actor_id uuid, p_context_key uuid, p_polo_id uuid, p_environment text, p_month text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '8s'
AS $function$
DECLARE
  v_claims text:=current_setting('request.jwt.claims',true);
  v_sub text:=current_setting('request.jwt.claim.sub',true);
  v_matrix uuid; v_config private.nfse_configurations%ROWTYPE;
  v_certificate private.nfse_certificates%ROWTYPE; v_cnpj text; v_material jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'Canal interno obrigatório.' USING ERRCODE='42501';
  END IF;
  IF p_environment IS DISTINCT FROM 'PRODUCAO' THEN
    RAISE EXCEPTION 'O executor está restrito à produção.' USING ERRCODE='42501';
  END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p_actor_id,'role','authenticated')::text,true);
  PERFORM set_config('request.jwt.claim.sub',p_actor_id::text,true);
  v_matrix:=private.authorize_nfse_configuration_scope(p_context_key,p_polo_id,p_environment,p_month);
  PERFORM set_config('request.jwt.claims',coalesce(v_claims,''),true);
  PERFORM set_config('request.jwt.claim.sub',coalesce(v_sub,''),true);

  -- A consistent row lock prevents replacement of configuration/certificate
  -- while this read resolves the referenced material.
  SELECT * INTO v_config FROM private.nfse_configurations
    WHERE polo_id=p_polo_id AND environment=p_environment FOR SHARE;
  IF NOT FOUND OR v_config.credential_polo_id IS DISTINCT FROM v_matrix
    OR v_config.definition->>'portalAccess' IS DISTINCT FROM 'CERTIFICATE' THEN
    RAISE EXCEPTION 'Revise os parâmetros fiscais do estabelecimento.' USING ERRCODE='22023';
  END IF;
  SELECT regexp_replace(coalesce(cnpj,''),'[^0-9]','','g') INTO v_cnpj
    FROM public.polos WHERE id=p_polo_id AND public.is_active_status(status);
  SELECT * INTO v_certificate FROM private.resolve_nfse_production_certificate(p_polo_id,p_environment,v_cnpj);
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
REVOKE ALL ON FUNCTION public.get_nfse_production_material_internal(uuid,uuid,uuid,text,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_nfse_production_material_internal(uuid,uuid,uuid,text,text) TO service_role;
COMMENT ON FUNCTION public.get_nfse_production_material_internal(uuid,uuid,uuid,text,text) IS
  'Authorized server-only A1 read: emitter identity stays scoped; signer is the same-environment same-root institutional matrix.';
NOTIFY pgrst,'reload schema';
COMMIT;

