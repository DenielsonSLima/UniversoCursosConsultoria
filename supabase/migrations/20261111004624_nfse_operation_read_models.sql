BEGIN;
CREATE VIEW private.nfse_operation_source_projection AS
SELECT o.id operation_id,o.request_id,o.polo_id,o.environment,o.month,l.source_kind,l.source_id,c.id cancel_preview_id,
  CASE WHEN c.state='PROCESSING' THEN 'CANCELLATION_PENDING'
    WHEN c.state IN ('CANCELLED','CANCELLATION_PENDING','CANCELLATION_REJECTED','AWAITING_ANALYSIS') THEN c.state ELSE o.state END state,
  o.state issue_state,o.result->>'number' number,o.result->>'accessKey' access_key,
  CASE WHEN c.state IN ('CANCELLED','CANCELLATION_PENDING','CANCELLATION_REJECTED','AWAITING_ANALYSIS')
    THEN c.result->>'message' ELSE o.result->>'message' END message,
  o.snapshot,o.command,o.result,o.created_at
FROM private.nfse_queue_operation_links l JOIN private.nfse_individual_operations o ON o.id=l.operation_id
LEFT JOIN private.nfse_individual_cancellations c ON c.operation_id=o.id;
REVOKE ALL ON private.nfse_operation_source_projection FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.nfse_operation_fields(p_kind text,p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $function$
  SELECT coalesce((SELECT jsonb_build_object('operationId',operation_id,'requestId',request_id,'cancelPreviewId',cancel_preview_id,
    'sourceKind',source_kind,'sourceId',source_id,'state',state,'number',number,'accessKey',access_key,'message',message)
    FROM private.nfse_operation_source_projection WHERE source_kind=p_kind AND source_id=p_id),
    jsonb_build_object('operationId',NULL,'requestId',NULL,'cancelPreviewId',NULL,'sourceKind',p_kind,'sourceId',p_id,
      'state',NULL,'number',NULL,'accessKey',NULL,'message',NULL))
$function$;
REVOKE ALL ON FUNCTION private.nfse_operation_fields(text,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_nfse_partner_services_secure(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,p_page integer DEFAULT 1,p_page_size integer DEFAULT 50
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET statement_timeout='8s' AS $function$
DECLARE v_rows jsonb;v_total integer;v_amount numeric(30,2);v_start date;
BEGIN
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000 OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Paginação inválida.' USING ERRCODE='22023'; END IF;
  v_start:=(p_month||'-01')::date;
  SELECT count(*)::integer,coalesce(sum(s.amount),0) INTO v_total,v_amount FROM private.nfse_partner_services s
    WHERE polo_id=p_polo_id AND environment=p_environment AND service_date>=v_start AND service_date<v_start+interval '1 month';
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'partnerId',s.partner_id,'partnerName',s.partner_snapshot->>'name',
    'modelId',s.model_id,'modelName',s.model_snapshot->>'name','serviceDate',s.service_date,'serviceDescription',s.service_description,
    'amount',s.amount::text,'receivableId',s.receivable_id,'receivableAction',s.receivable_action,'status',s.status,'createdAt',s.created_at)
    ||private.nfse_operation_fields('PARTNER_SERVICE',s.id) ORDER BY s.service_date DESC,s.id),'[]') INTO v_rows
    FROM(SELECT * FROM private.nfse_partner_services WHERE polo_id=p_polo_id AND environment=p_environment
      AND service_date>=v_start AND service_date<v_start+interval '1 month' ORDER BY service_date DESC,id
      LIMIT p_page_size OFFSET(p_page-1)*p_page_size)s;
  RETURN jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,
    'environment',p_environment,'month',p_month),'data',jsonb_build_object('rows',v_rows,'page',p_page,'pageSize',p_page_size,
    'totalItems',v_total,'totalAmount',v_amount::text));
END;
$function$;
REVOKE ALL ON FUNCTION public.get_nfse_partner_services_secure(uuid,uuid,text,text,integer,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_nfse_partner_services_secure(uuid,uuid,text,text,integer,integer) TO authenticated;

CREATE FUNCTION public.get_nfse_documents_secure(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,p_status text,p_search text DEFAULT NULL,
  p_page integer DEFAULT 1,p_page_size integer DEFAULT 25
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET statement_timeout='8s' AS $function$
DECLARE v_rows jsonb;v_count integer;
BEGIN
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  IF p_status IS NULL OR p_status NOT IN('PENDENTE','EMITIDA','ERRO') OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000
    OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100 OR length(coalesce(p_search,''))>100 THEN
    RAISE EXCEPTION 'Filtro de documentos inválido.' USING ERRCODE='22023'; END IF;
  WITH rows AS(SELECT v.* FROM private.nfse_operation_source_projection v WHERE polo_id=p_polo_id AND environment=p_environment AND month=p_month
    AND CASE p_status WHEN 'EMITIDA' THEN issue_state='AUTHORIZED' WHEN 'ERRO' THEN issue_state IN('REJECTED','BLOCKED')
      ELSE issue_state IN('PREVIEWED','PROCESSING','AWAITING_CONFIRMATION') END
    AND(coalesce(btrim(p_search),'')='' OR position(lower(btrim(p_search)) IN lower(coalesce(snapshot#>>'{recipient,name}','')||' '||coalesce(number,'')))>0))
  SELECT count(*)::integer INTO v_count FROM rows;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',v.operation_id,'studentName',v.snapshot#>>'{recipient,name}',
    'classLabel',CASE WHEN source_kind='PARTNER_SERVICE' THEN 'Serviço' ELSE coalesce(v.snapshot#>>'{source,preparation,snapshot,academic,classLabel}','Aluno') END,
    'amount',v.command->>'amount','modelLabel',v.snapshot#>>'{model,definition,name}',
    'status',CASE WHEN v.issue_state='AUTHORIZED' THEN 'EMITIDA' WHEN v.issue_state IN('REJECTED','BLOCKED') THEN 'ERRO'
      WHEN v.issue_state='PROCESSING' THEN 'EM_PROCESSAMENTO' WHEN v.issue_state='AWAITING_CONFIRMATION' THEN 'AGUARDANDO_CONFIRMACAO' ELSE 'PENDENTE' END,
    'number',v.number,'accessKey',v.access_key,'errorCode',coalesce(v.result#>>'{codes,0}',v.result->>'code'),
    'errorMessage',v.message,'retryable',false)||private.nfse_operation_fields(v.source_kind,v.source_id)
    ORDER BY v.created_at DESC,v.operation_id),'[]') INTO v_rows
  FROM(SELECT * FROM private.nfse_operation_source_projection WHERE polo_id=p_polo_id AND environment=p_environment AND month=p_month
    AND CASE p_status WHEN 'EMITIDA' THEN issue_state='AUTHORIZED' WHEN 'ERRO' THEN issue_state IN('REJECTED','BLOCKED')
      ELSE issue_state IN('PREVIEWED','PROCESSING','AWAITING_CONFIRMATION') END
    AND(coalesce(btrim(p_search),'')='' OR position(lower(btrim(p_search)) IN lower(coalesce(snapshot#>>'{recipient,name}','')||' '||coalesce(number,'')))>0)
    ORDER BY created_at DESC,operation_id LIMIT p_page_size OFFSET(p_page::bigint-1)*p_page_size)v;
  RETURN jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,
    'environment',p_environment,'month',p_month),'data',jsonb_build_object('rows',v_rows,'page',p_page,'pageSize',p_page_size,'totalItems',v_count));
END;
$function$;
REVOKE ALL ON FUNCTION public.get_nfse_documents_secure(uuid,uuid,text,text,text,text,integer,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_nfse_documents_secure(uuid,uuid,text,text,text,text,integer,integer) TO authenticated;

-- Document identity is the explicitly linked operation ID; no second XML copy or unrelated invoice lookup.
CREATE FUNCTION public.get_nfse_authorized_xml_secure(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,p_document_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET statement_timeout='8s' AS $function$
DECLARE v_op private.nfse_individual_operations%ROWTYPE;
BEGIN
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  SELECT * INTO v_op FROM private.nfse_individual_operations o WHERE id=p_document_id AND polo_id=p_polo_id
    AND environment=p_environment AND month=p_month AND state='AUTHORIZED'
    AND EXISTS(SELECT 1 FROM private.nfse_queue_operation_links WHERE operation_id=o.id);
  IF NOT FOUND OR v_op.authorized_xml IS NULL THEN RAISE EXCEPTION 'XML autorizado indisponível neste contexto.' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,
    'environment',p_environment,'month',p_month),'data',jsonb_build_object('documentId',v_op.id,'status','EMITIDA',
    'accessKey',v_op.result->>'accessKey','number',v_op.result->>'number','xml',v_op.authorized_xml,
    'sha256',encode(sha256(convert_to(v_op.authorized_xml,'UTF8')),'hex')));
END;
$function$;
REVOKE ALL ON FUNCTION public.get_nfse_authorized_xml_secure(uuid,uuid,text,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_nfse_authorized_xml_secure(uuid,uuid,text,text,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
