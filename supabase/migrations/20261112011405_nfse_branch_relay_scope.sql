BEGIN;
-- Live getter MD5 33686fc5008d0681d90ce739ccf270fc; exact deployment pins and key validation stay unchanged.
CREATE OR REPLACE FUNCTION public.get_nfse_production_relay_config_internal(p_actor_id uuid, p_context_key uuid, p_polo_id uuid, p_environment text, p_month text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '8s'
AS $function$
DECLARE
  v_claims text:=current_setting('request.jwt.claims',true);
  v_sub text:=current_setting('request.jwt.claim.sub',true);
  v_matrix uuid; v_config jsonb; v_url text;
  -- Set only to the exact Preview URL returned by the reviewed Universo deployment.
  v_approved_urls constant text[]:=ARRAY[
    'https://universo-cursos-consultoria-6w67gc985-denielson-limas-projects.vercel.app/api/nfse-production-relay',
    'https://universo-cursos-consultoria-qsnk8l1zn-denielson-limas-projects.vercel.app/api/nfse-production-relay']::text[];
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'Canal interno obrigatório.' USING ERRCODE='42501';
  END IF;
  IF p_environment IS DISTINCT FROM 'PRODUCAO' THEN
    RAISE EXCEPTION 'Executor exclusivo de produção.' USING ERRCODE='42501';
  END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p_actor_id,'role','authenticated')::text,true);
  PERFORM set_config('request.jwt.claim.sub',p_actor_id::text,true);
  v_matrix:=private.authorize_nfse_configuration_scope(p_context_key,p_polo_id,p_environment,p_month);
  PERFORM set_config('request.jwt.claims',coalesce(v_claims,''),true);
  PERFORM set_config('request.jwt.claim.sub',coalesce(v_sub,''),true);
  -- Reuse the scoped credential resolver; no relay secret is read for an unrelated issuer.
  PERFORM private.resolve_nfse_production_certificate(p_polo_id,p_environment);
  IF (SELECT count(*) FROM vault.decrypted_secrets WHERE name='nfse_production_relay_config')<>1 THEN
    RAISE EXCEPTION 'Executor de produção indisponível.' USING ERRCODE='22023';
  END IF;
  SELECT decrypted_secret::jsonb INTO v_config FROM vault.decrypted_secrets
    WHERE name='nfse_production_relay_config';
  IF v_config IS NULL OR jsonb_typeof(v_config)<>'object' OR octet_length(v_config::text)>12000
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_config) f(key)
      WHERE key NOT IN ('url','key','protectionBypass')) THEN
    RAISE EXCEPTION 'Executor de produção indisponível.' USING ERRCODE='22023';
  END IF;
  v_url:=v_config->>'url';
  IF v_url IS NULL OR NOT (v_url=ANY(v_approved_urls))
    OR v_url !~ '^https://universo-cursos-consultoria-[a-z0-9-]+\.vercel\.app/api/nfse-production-relay$'
    OR jsonb_typeof(v_config->'key') IS DISTINCT FROM 'string'
    OR coalesce(v_config->>'key','') !~ '^([0-9a-fA-F]{2}){32,64}$'
    OR (v_config ? 'protectionBypass' AND
      (jsonb_typeof(v_config->'protectionBypass') IS DISTINCT FROM 'string'
        OR length(coalesce(v_config->>'protectionBypass','')) NOT BETWEEN 1 AND 4096
        OR coalesce(v_config->>'protectionBypass','') !~ '^[A-Za-z0-9_.-]+$')) THEN
    RAISE EXCEPTION 'Executor de produção indisponível.' USING ERRCODE='22023';
  END IF;
  RETURN jsonb_build_object('url',v_url,'key',v_config->>'key')
    ||CASE WHEN v_config ? 'protectionBypass'
      THEN jsonb_build_object('protectionBypass',v_config->>'protectionBypass') ELSE '{}'::jsonb END;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_nfse_production_relay_config_internal(uuid,uuid,uuid,text,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_nfse_production_relay_config_internal(uuid,uuid,uuid,text,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;

