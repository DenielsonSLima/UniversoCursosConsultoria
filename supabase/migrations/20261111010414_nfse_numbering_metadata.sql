BEGIN;
-- Read-only operational metadata. NFS-e numbers never determine DPS identity.
CREATE FUNCTION public.get_nfse_numbering_secure(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET statement_timeout='8s' AS $function$
DECLARE v_last jsonb;v_dps jsonb;v_allocated bigint;v_counter bigint;v_called boolean;
  v_increment bigint;v_max bigint;v_next numeric(30,0);
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão autenticada obrigatória.' USING ERRCODE='42501'; END IF;
  PERFORM private.authorize_nfse_configuration_scope(p_context_key,p_polo_id,p_environment,p_month);
  -- Most recent confirmed authorization in this establishment/environment, including its later cancellation.
  IF p_environment='PRODUCAO' THEN
    SELECT jsonb_build_object('number',o.result->>'number','authorizedAt',o.updated_at,
      'state',CASE WHEN c.state='CANCELLED' AND c.event_xml IS NOT NULL THEN 'CANCELLED' ELSE 'AUTHORIZED' END)
      INTO v_last FROM private.nfse_individual_operations o
      LEFT JOIN private.nfse_individual_cancellations c ON c.operation_id=o.id
      WHERE o.polo_id=p_polo_id AND o.environment=p_environment AND o.state='AUTHORIZED'
        AND o.authorized_xml IS NOT NULL AND coalesce(o.result->>'number','')~'^[0-9]{1,15}$'
      ORDER BY o.updated_at DESC,o.id DESC LIMIT 1;
    SELECT max(number) INTO v_allocated FROM private.nfse_individual_operations
      WHERE polo_id=p_polo_id AND environment=p_environment AND series='49998';
    -- Observe the actual allocator, including gaps from other scopes or rolled-back allocations.
    -- No nextval/setval or other sequence mutation is executed by this RPC.
    SELECT last_value,is_called INTO v_counter,v_called FROM private.nfse_individual_operations_number_seq;
    SELECT seqincrement,seqmax INTO v_increment,v_max FROM pg_catalog.pg_sequence
      WHERE seqrelid='private.nfse_individual_operations_number_seq'::regclass;
    v_next:=CASE WHEN v_called THEN v_counter::numeric+v_increment::numeric ELSE v_counter::numeric END;
    IF v_increment<=0 OR v_next<1 OR v_next>v_max OR v_next>999999999999999 THEN v_next:=NULL; END IF;
    v_dps:=jsonb_build_object('series','49998','lastAllocated',v_allocated::text,'nextNumber',v_next::text,
      'nextNumberIsEstimate',true,'allocatorScope','SHARED_DATABASE_IDENTITY');
  ELSE
    -- Historical test authorizations belong to HOMO only. Its technical pilot has a different allocator (49999).
    SELECT jsonb_build_object('number',result->>'number','authorizedAt',updated_at,'state','AUTHORIZED') INTO v_last
      FROM private.nfse_homologation_pilots WHERE polo_id=p_polo_id AND environment=p_environment
        AND state='AUTHORIZED' AND authorized_xml IS NOT NULL AND coalesce(result->>'number','')~'^[0-9]{1,15}$'
      ORDER BY updated_at DESC,id DESC LIMIT 1;
    v_dps:=NULL;
  END IF;
  RETURN jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,
    'environment',p_environment,'month',p_month),'data',jsonb_build_object('checkedAt',statement_timestamp(),
      'lastAuthorized',v_last,'dps',v_dps));
END;
$function$;
REVOKE ALL ON FUNCTION public.get_nfse_numbering_secure(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_nfse_numbering_secure(uuid,uuid,text,text) TO authenticated;
COMMENT ON FUNCTION public.get_nfse_numbering_secure(uuid,uuid,text,text) IS
  'Authenticated scoped numbering observation only. Last local authorization and all-state DPS allocation; next is a concurrent shared-identity estimate, never a reservation or external-government counter.';
NOTIFY pgrst,'reload schema';
COMMIT;
