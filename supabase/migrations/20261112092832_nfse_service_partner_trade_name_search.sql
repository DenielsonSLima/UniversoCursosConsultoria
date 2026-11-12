BEGIN;
CREATE OR REPLACE FUNCTION public.search_nfse_service_partners_secure(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,p_search text,p_partner_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET statement_timeout='8s' AS $function$
DECLARE v_rows jsonb;
BEGIN
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  IF length(coalesce(p_search,''))>100 OR(p_partner_id IS NULL AND length(btrim(coalesce(p_search,'')))<2) THEN
    RAISE EXCEPTION 'Informe ao menos dois caracteres para buscar.' USING ERRCODE='22023'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.nome,'tradeName',p.nome_fantasia,'document',p.cpf_cnpj,'type',p.tipo)
    ORDER BY p.nome,p.id),'[]') INTO v_rows FROM(SELECT p.id,p.nome,p.nome_fantasia,p.cpf_cnpj,p.tipo FROM public.parceiros p
    WHERE public.is_active_status(p.status) AND upper(btrim(p.tipo)) IN('PF','PJ','ALUNO')
      AND(p.polo_id=p_polo_id OR p_polo_id=ANY(coalesce(p.polo_ids,ARRAY[]::uuid[]))
        OR(p.polo_id IS NULL AND upper(btrim(p.tipo))<>'ALUNO' AND cardinality(coalesce(p.polo_ids,ARRAY[]::uuid[]))=0))
      AND private.nfse_review_valid_document(p.cpf_cnpj)
      AND((p_partner_id IS NOT NULL AND p.id=p_partner_id) OR(p_partner_id IS NULL
        AND(position(lower(extensions.unaccent(btrim(p_search))) IN lower(extensions.unaccent(p.nome)))>0
          OR position(lower(extensions.unaccent(btrim(p_search))) IN lower(extensions.unaccent(coalesce(p.nome_fantasia,''))))>0
          OR position(regexp_replace(p_search,'[^0-9]','','g') IN regexp_replace(p.cpf_cnpj,'[^0-9]','','g'))>0
            AND length(regexp_replace(p_search,'[^0-9]','','g'))>=2)))
    ORDER BY p.nome,p.id LIMIT 20)p;
  RETURN jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,
    'environment',p_environment,'month',p_month),'data',jsonb_build_object('rows',v_rows,'page',1,'pageSize',20,'totalItems',jsonb_array_length(v_rows)));
END;
$function$;
REVOKE ALL ON FUNCTION public.search_nfse_service_partners_secure(uuid,uuid,text,text,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.search_nfse_service_partners_secure(uuid,uuid,text,text,text,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
