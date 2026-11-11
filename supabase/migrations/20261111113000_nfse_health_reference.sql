BEGIN;

-- Read-only reference for the authenticated health probe. No allocation, lease,
-- XML, credential, operation transition, fiscal write or financial mutation.
CREATE FUNCTION public.get_nfse_health_reference_internal(
  p_actor_id uuid,p_context_key uuid,p_polo_id uuid,p_environment text,p_month text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
SET statement_timeout='8s' AS $function$
DECLARE v_reference jsonb;
BEGIN
  PERFORM private.authorize_nfse_individual_internal(
    p_actor_id,p_context_key,p_polo_id,p_environment,p_month);
  SELECT jsonb_build_object('dpsId',o.dps_id,'accessKey',o.result->>'accessKey',
    'issuerCnpj',regexp_replace(coalesce(o.snapshot#>>'{issuer,cnpj}',''),'[^0-9]','','g'))
    INTO v_reference FROM private.nfse_individual_operations o
    WHERE o.polo_id=p_polo_id AND o.environment=p_environment AND o.state='AUTHORIZED'
      AND o.authorized_xml IS NOT NULL AND o.dps_id~'^DPS[0-9]{42}$'
      AND coalesce(o.result->>'accessKey','')~'^[0-9]{50}$'
    ORDER BY o.updated_at DESC,o.id DESC LIMIT 1;
  RETURN jsonb_build_object('reference',v_reference);
END;
$function$;
REVOKE ALL ON FUNCTION public.get_nfse_health_reference_internal(uuid,uuid,uuid,text,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_nfse_health_reference_internal(uuid,uuid,uuid,text,text) TO service_role;
COMMENT ON FUNCTION public.get_nfse_health_reference_internal(uuid,uuid,uuid,text,text) IS
  'Server-only scoped existing DPS reference for GET health observation; never allocate or mutate fiscal records.';
NOTIFY pgrst,'reload schema';
COMMIT;
