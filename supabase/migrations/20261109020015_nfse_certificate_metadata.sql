BEGIN;
CREATE FUNCTION private.nfse_certificate_metadata(p_polo_id uuid,p_environment text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_certificate private.nfse_certificates%ROWTYPE;
BEGIN
  SELECT certificate.* INTO v_certificate
  FROM private.nfse_configurations configuration
  JOIN private.nfse_certificates certificate ON certificate.polo_id=configuration.credential_polo_id
    AND certificate.environment=configuration.environment
  JOIN public.polos source ON source.id=certificate.polo_id
    AND regexp_replace(coalesce(source.cnpj,''),'[^0-9]','','g')=certificate.cnpj
  JOIN public.polos target ON target.id=configuration.polo_id
    AND source.company_id=target.company_id
    AND left(regexp_replace(coalesce(target.cnpj,''),'[^0-9]','','g'),8)=left(certificate.cnpj,8)
  WHERE configuration.polo_id=p_polo_id AND configuration.environment=p_environment;
  RETURN jsonb_build_object('configured',coalesce(v_certificate.expires_at>now() AND v_certificate.not_before<=now(),false),
    'subject',CASE WHEN v_certificate.cnpj IS NOT NULL THEN 'Certificado A1 · CNPJ '||v_certificate.cnpj ELSE null END,
    'expiresAt',v_certificate.expires_at);
END;
$function$;
REVOKE ALL ON FUNCTION private.nfse_certificate_metadata(uuid,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_nfse_configuration_secure(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
SET statement_timeout='8s' AS $function$
BEGIN
  PERFORM private.authorize_nfse_configuration_scope(p_context_key,p_polo_id,p_environment,p_month);
  RETURN jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,
    'poloId',p_polo_id,'environment',p_environment,'month',p_month),
    'data',private.nfse_configuration_metadata(p_polo_id,p_environment)
      || jsonb_build_object('certificate',private.nfse_certificate_metadata(p_polo_id,p_environment)));
END;
$function$;
REVOKE ALL ON FUNCTION public.get_nfse_configuration_secure(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_nfse_configuration_secure(uuid,uuid,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
