BEGIN;

CREATE FUNCTION public.get_nfse_partner_service_options_secure(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
SET statement_timeout = '8s' AS $function$
DECLARE
  v_partners jsonb; v_categories jsonb := '[]'; v_receivables jsonb := '[]';
  v_finance boolean := true;
BEGIN
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  BEGIN
    PERFORM internal_finance.authorize_other_credit_plan(p_polo_id,true);
  EXCEPTION WHEN insufficient_privilege THEN v_finance := false;
  END;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.nome,
    'tradeName',p.nome_fantasia,'document',p.cpf_cnpj,'type',p.tipo) ORDER BY p.nome,p.id),'[]')
  INTO v_partners FROM (
    SELECT id,nome,nome_fantasia,cpf_cnpj,tipo FROM public.parceiros p
    WHERE p.tipo IN ('PF','PJ') AND public.is_active_status(p.status)
      AND ((p.polo_id IS NULL AND cardinality(coalesce(p.polo_ids,ARRAY[]::uuid[])) = 0)
        OR p.polo_id = p_polo_id OR p_polo_id = ANY(coalesce(p.polo_ids,ARRAY[]::uuid[])))
    ORDER BY p.nome,p.id LIMIT 501
  ) p;
  IF jsonb_array_length(v_partners) > 500 THEN
    RAISE EXCEPTION 'Catálogo de parceiros excede o limite desta consulta.' USING ERRCODE = '54000';
  END IF;
  IF v_finance THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.nome) ORDER BY c.nome,c.id),'[]')
      INTO v_categories FROM public.categorias_financeiras c
      WHERE upper(c.tipo) = 'OUTRO_CREDITO' AND public.is_active_status(c.status);
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'partnerId',c.cliente_id,
      'description',c.descricao,'amount',c.valor::numeric(14,2)::text,
      'dueDate',c.data_vencimento,'categoryId',c.categoria_financeira_id,'status',c.status)
      ORDER BY c.data_vencimento,c.id),'[]') INTO v_receivables
    FROM (
      SELECT c.* FROM private.nfse_partner_linkable_receivables c
      WHERE c.polo_id = p_polo_id AND c.cliente_id IN (
        SELECT (value->>'id')::uuid FROM jsonb_array_elements(v_partners))
      ORDER BY c.data_vencimento,c.id LIMIT 501
    ) c;
    IF jsonb_array_length(v_receivables) > 500 THEN
      RAISE EXCEPTION 'Catálogo de contas a receber excede o limite desta consulta.' USING ERRCODE = '54000';
    END IF;
  END IF;
  RETURN jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,
    'poloId',p_polo_id,'environment',p_environment,'month',p_month),'data',jsonb_build_object(
    'partners',v_partners,'categories',v_categories,'existingReceivables',v_receivables,
    'capabilities',jsonb_build_object('canGenerateReceivable',v_finance)));
END;
$function$;
REVOKE ALL ON FUNCTION public.get_nfse_partner_service_options_secure(uuid,uuid,text,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_nfse_partner_service_options_secure(uuid,uuid,text,text) TO authenticated;

CREATE FUNCTION public.get_nfse_partner_services_secure(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,
  p_page integer DEFAULT 1,p_page_size integer DEFAULT 50
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
SET statement_timeout = '8s' AS $function$
DECLARE v_rows jsonb; v_total integer; v_amount numeric(20,2); v_start date;
BEGIN
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000
    OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Paginação inválida.' USING ERRCODE = '22023';
  END IF;
  v_start := (p_month || '-01')::date;
  SELECT count(*)::integer,coalesce(sum(s.amount),0) INTO v_total,v_amount
  FROM private.nfse_partner_services s
  WHERE s.polo_id = p_polo_id AND s.environment = p_environment
    AND s.service_date >= v_start AND s.service_date < v_start + INTERVAL '1 month';
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'partnerId',s.partner_id,
    'partnerName',s.partner_snapshot->>'name','modelId',s.model_id,'modelName',s.model_snapshot->>'name',
    'serviceDate',s.service_date,'serviceDescription',s.service_description,'amount',s.amount::text,
    'receivableId',s.receivable_id,'receivableAction',s.receivable_action,
    'status',s.status,'createdAt',s.created_at) ORDER BY s.service_date DESC,s.id),'[]') INTO v_rows
  FROM (
    SELECT * FROM private.nfse_partner_services s
    WHERE s.polo_id = p_polo_id AND s.environment = p_environment
      AND s.service_date >= v_start AND s.service_date < v_start + INTERVAL '1 month'
    ORDER BY s.service_date DESC,s.id LIMIT p_page_size OFFSET (p_page - 1) * p_page_size
  ) s;
  RETURN jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,
    'poloId',p_polo_id,'environment',p_environment,'month',p_month),'data',jsonb_build_object(
    'rows',v_rows,'page',p_page,'pageSize',p_page_size,'totalItems',v_total,'totalAmount',v_amount::text));
END;
$function$;
REVOKE ALL ON FUNCTION public.get_nfse_partner_services_secure(uuid,uuid,text,text,integer,integer)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_nfse_partner_services_secure(uuid,uuid,text,text,integer,integer) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
