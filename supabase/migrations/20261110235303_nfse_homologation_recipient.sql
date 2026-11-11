BEGIN;

-- No credential material is read. Only the authenticated executor can resolve
-- a participant for this isolated, matrix-only homologation operation.
CREATE FUNCTION public.get_nfse_homologation_recipient_internal(
  p_actor_id uuid,p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,p_partner_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_claims text:=current_setting('request.jwt.claims',true);
  v_sub text:=current_setting('request.jwt.claim.sub',true); v_matrix uuid;
  v_name text; v_document text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'Canal interno obrigatório.' USING ERRCODE='42501'; END IF;
  IF p_environment IS DISTINCT FROM 'HOMOLOGACAO' OR p_partner_id IS NULL THEN
    RAISE EXCEPTION 'Tomador do teste de homologação obrigatório.' USING ERRCODE='22023'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p_actor_id,'role','authenticated')::text,true);
  PERFORM set_config('request.jwt.claim.sub',p_actor_id::text,true);
  v_matrix:=private.authorize_nfse_configuration_scope(p_context_key,p_polo_id,p_environment,p_month);
  PERFORM set_config('request.jwt.claims',coalesce(v_claims,''),true);
  PERFORM set_config('request.jwt.claim.sub',coalesce(v_sub,''),true);
  IF p_polo_id IS DISTINCT FROM v_matrix THEN
    RAISE EXCEPTION 'Piloto disponível somente na matriz.' USING ERRCODE='42501'; END IF;
  SELECT nullif(btrim(p.nome),''),regexp_replace(coalesce(p.cpf_cnpj,''),'[^0-9]','','g')
    INTO v_name,v_document FROM public.parceiros p WHERE p.id=p_partner_id
      AND public.is_active_status(p.status)
      AND (p.polo_id=p_polo_id OR p_polo_id=ANY(coalesce(p.polo_ids,ARRAY[]::uuid[]))
        OR (p.polo_id IS NULL AND upper(btrim(p.tipo))<>'ALUNO'));
  IF v_name IS NULL OR length(v_name)>150 OR NOT private.nfse_review_valid_document(v_document) THEN
    RAISE EXCEPTION 'Tomador autorizado com nome e CPF/CNPJ válidos é obrigatório.' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('partnerId',p_partner_id,'name',v_name,'document',v_document);
END;
$function$;
REVOKE ALL ON FUNCTION public.get_nfse_homologation_recipient_internal(uuid,uuid,uuid,text,text,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_nfse_homologation_recipient_internal(uuid,uuid,uuid,text,text,uuid) TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
