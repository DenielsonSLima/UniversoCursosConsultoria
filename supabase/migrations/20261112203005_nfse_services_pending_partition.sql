BEGIN;

-- Keep authorized notes exclusively in issued history; preserve pending/uncertain operations.
-- This read projection changes no service, operation, XML, event or removal mark.

CREATE OR REPLACE FUNCTION public.get_nfse_partner_services_v2_secure(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,p_page integer DEFAULT 1,p_page_size integer DEFAULT 50,
  p_search text DEFAULT NULL,p_date_from text DEFAULT NULL,p_date_to text DEFAULT NULL,p_partner_type text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET statement_timeout='8s' AS $function$
DECLARE v_data jsonb;v_from date;v_to date;v_search text:=lower(btrim(coalesce(p_search,'')));
  v_digits text:=regexp_replace(coalesce(p_search,''),'[^0-9]','','g');
BEGIN
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000 OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100
    OR length(coalesce(p_search,''))>100 OR coalesce(p_partner_type,'') NOT IN('','PJ','PF','ALUNO') THEN
    RAISE EXCEPTION 'Filtros de serviços inválidos.' USING ERRCODE='22023'; END IF;
  IF (nullif(p_date_from,'') IS NOT NULL AND p_date_from !~ '^(19|20|21)[0-9]{2}-[0-9]{2}-[0-9]{2}$')
    OR (nullif(p_date_to,'') IS NOT NULL AND p_date_to !~ '^(19|20|21)[0-9]{2}-[0-9]{2}-[0-9]{2}$') THEN
    RAISE EXCEPTION 'Data inválida.' USING ERRCODE='22023'; END IF;
  BEGIN
    v_from:=coalesce(nullif(p_date_from,'')::date,(p_month||'-01')::date);
    v_to:=coalesce(nullif(p_date_to,'')::date,((p_month||'-01')::date+interval '1 month - 1 day')::date);
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'Data inválida.' USING ERRCODE='22023'; END;
  IF v_from>v_to THEN RAISE EXCEPTION 'A data inicial deve ser anterior ou igual à final.' USING ERRCODE='22023'; END IF;
  WITH filtered AS MATERIALIZED (
    SELECT s.*,upper(btrim(coalesce(s.partner_snapshot->>'type',''))) partner_type,
      private.nfse_operation_fields('PARTNER_SERVICE',s.id) operation
    FROM private.nfse_partner_services s
    WHERE s.polo_id=p_polo_id AND s.environment=p_environment AND s.service_date BETWEEN v_from AND v_to
      AND NOT EXISTS(SELECT 1 FROM private.nfse_external_imports external_document WHERE external_document.service_id=s.id)
      AND NOT EXISTS(SELECT 1 FROM private.nfse_queue_operation_links issued_link
        JOIN private.nfse_individual_operations issued_operation ON issued_operation.id=issued_link.operation_id
        WHERE issued_link.source_kind='PARTNER_SERVICE' AND issued_link.source_id=s.id
          AND issued_operation.state='AUTHORIZED')
      AND NOT EXISTS(SELECT 1 FROM private.nfse_partner_service_removals r WHERE r.service_id=s.id)
      AND NOT EXISTS(SELECT 1 FROM private.nfse_queue_operation_links l
        JOIN private.nfse_confirmed_cancellations c ON c.operation_id=l.operation_id
        WHERE l.source_kind='PARTNER_SERVICE' AND l.source_id=s.id)
      AND (coalesce(p_partner_type,'')='' OR upper(btrim(s.partner_snapshot->>'type'))=p_partner_type)
      AND (v_search='' OR position(v_search IN lower(concat_ws(' ',s.partner_snapshot->>'name',
        s.partner_snapshot->>'tradeName',s.partner_snapshot->>'document',s.model_snapshot->>'name',s.service_description)))>0
        OR (length(v_digits)>=2 AND position(v_digits IN regexp_replace(coalesce(s.partner_snapshot->>'document',''),'[^0-9]','','g'))>0)
        OR EXISTS(SELECT 1 FROM private.nfse_operation_source_projection v
          WHERE v.source_kind='PARTNER_SERVICE' AND v.source_id=s.id AND position(v_search IN coalesce(v.number,''))>0))
  ), paged AS(SELECT * FROM filtered ORDER BY service_date DESC,id LIMIT p_page_size OFFSET(p_page-1)*p_page_size)
  SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',s.id,'partnerId',s.partner_id,'partnerName',s.partner_snapshot->>'name','partnerType',s.partner_type,
    'modelId',s.model_id,'modelName',s.model_snapshot->>'name','serviceDate',s.service_date,
    'serviceDescription',s.service_description,'amount',s.amount::text,'receivableId',s.receivable_id,
    'receivableAction',s.receivable_action,'status',s.status,'createdAt',s.created_at,
    'canRemove',private.nfse_partner_service_removable(s.id))||s.operation ORDER BY s.service_date DESC,s.id) FROM paged s),'[]'),
    'page',p_page,'pageSize',p_page_size,'totalItems',(SELECT count(*)::integer FROM filtered),
    'totalAmount',(SELECT coalesce(sum(amount),0)::numeric(30,2)::text FROM filtered)) INTO v_data;
  RETURN jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,
    'poloId',p_polo_id,'environment',p_environment,'month',p_month),'data',v_data);
END;
$function$;
REVOKE ALL ON FUNCTION public.get_nfse_partner_services_v2_secure(uuid,uuid,text,text,integer,integer,text,text,text,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_nfse_partner_services_v2_secure(uuid,uuid,text,text,integer,integer,text,text,text,text) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
