BEGIN;
CREATE OR REPLACE FUNCTION public.get_nfse_queue_secure(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,p_status text DEFAULT 'PREPARADO',
  p_page integer DEFAULT 1,p_page_size integer DEFAULT 25
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET statement_timeout='8s' AS $function$
DECLARE v_rows jsonb;v_count integer;v_total numeric(30,2);
BEGIN
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  IF p_status IS NULL OR p_status NOT IN('PREPARADO','TODOS') OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000
    OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Filtros inválidos.' USING ERRCODE='22023'; END IF;
  SELECT count(*)::integer,coalesce(sum(q.amount),0) INTO v_count,v_total FROM private.nfse_queue_documents q
    WHERE q.polo_id=p_polo_id AND q.environment=p_environment AND q.queue_month=p_month
      AND NOT EXISTS(SELECT 1 FROM private.nfse_queue_removals WHERE document_id=q.id)
      AND(p_status='TODOS' OR NOT EXISTS(SELECT 1 FROM private.nfse_operation_source_projection
        WHERE source_kind='ACADEMIC_QUEUE' AND source_id=q.id AND issue_state IN('AUTHORIZED','REJECTED','BLOCKED')));
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',q.id,'batchId',q.batch_id,'studentId',q.student_id,
    'studentName',q.snapshot#>>'{recipient,name}','classId',q.class_id,'classLabel',q.snapshot#>>'{academic,classLabel}',
    'amount',q.amount::text,'modelLabel',q.snapshot#>>'{model,name}','status',q.status,'receiptCount',q.receipt_count,
    'paymentMonth',q.payment_month,'createdAt',q.created_at,'blockingReasons',q.snapshot#>'{fiscalReadiness,blockingReasons}')
    ||private.nfse_operation_fields('ACADEMIC_QUEUE',q.id) ORDER BY q.created_at DESC,q.id),'[]') INTO v_rows
  FROM(SELECT q.* FROM private.nfse_queue_documents q WHERE q.polo_id=p_polo_id AND q.environment=p_environment AND q.queue_month=p_month
    AND NOT EXISTS(SELECT 1 FROM private.nfse_queue_removals WHERE document_id=q.id)
    AND(p_status='TODOS' OR NOT EXISTS(SELECT 1 FROM private.nfse_operation_source_projection
      WHERE source_kind='ACADEMIC_QUEUE' AND source_id=q.id AND issue_state IN('AUTHORIZED','REJECTED','BLOCKED')))
    ORDER BY q.created_at DESC,q.id LIMIT p_page_size OFFSET(p_page::bigint-1)*p_page_size)q;
  RETURN jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,
    'environment',p_environment,'month',p_month),'data',jsonb_build_object('rows',v_rows,'page',p_page,'pageSize',p_page_size,
    'totalItems',v_count,'totalAmount',v_total::text,'summary',jsonb_build_object('preparedCount',v_count,'preparedAmount',v_total::text),
    'providerEnabled',false));
END;
$function$;
REVOKE ALL ON FUNCTION public.get_nfse_queue_secure(uuid,uuid,text,text,text,integer,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_nfse_queue_secure(uuid,uuid,text,text,text,integer,integer) TO authenticated;

CREATE FUNCTION public.get_nfse_workspace_secure(p_context_key uuid,p_polo_id uuid,p_environment text,p_month text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET statement_timeout='8s' AS $function$
DECLARE v_models jsonb;v_classes jsonb;v_pending integer;v_prepared numeric(30,2);v_issued integer;v_errors integer;v_configure boolean:=true;
BEGIN
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  BEGIN PERFORM private.authorize_nfse_configuration_scope(p_context_key,p_polo_id,p_environment,p_month);
  EXCEPTION WHEN insufficient_privilege THEN v_configure:=false; END;
  SELECT coalesce(jsonb_agg(definition||jsonb_build_object('id',id,'version',version) ORDER BY lower(definition->>'name'),id),'[]') INTO v_models
    FROM private.nfse_models WHERE polo_id=p_polo_id AND environment=p_environment;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',class_id,'label',label) ORDER BY label,class_id),'[]') INTO v_classes
    FROM(SELECT DISTINCT class_id,snapshot#>>'{academic,classLabel}' label FROM private.nfse_queue_documents
      WHERE polo_id=p_polo_id AND environment=p_environment AND queue_month=p_month)t;
  SELECT count(*)::integer,coalesce(sum(amount),0) INTO v_pending,v_prepared FROM(
    SELECT q.amount FROM private.nfse_queue_documents q WHERE q.polo_id=p_polo_id AND q.environment=p_environment AND q.queue_month=p_month
      AND NOT EXISTS(SELECT 1 FROM private.nfse_queue_removals WHERE document_id=q.id)
      AND NOT EXISTS(SELECT 1 FROM private.nfse_operation_source_projection WHERE source_kind='ACADEMIC_QUEUE' AND source_id=q.id
        AND issue_state IN('AUTHORIZED','REJECTED','BLOCKED'))
    UNION ALL SELECT s.amount FROM private.nfse_partner_services s WHERE s.polo_id=p_polo_id AND s.environment=p_environment
      AND left(s.service_date::text,7)=p_month AND NOT EXISTS(SELECT 1 FROM private.nfse_operation_source_projection
        WHERE source_kind='PARTNER_SERVICE' AND source_id=s.id AND issue_state IN('AUTHORIZED','REJECTED','BLOCKED')))t;
  SELECT count(*)FILTER(WHERE issue_state='AUTHORIZED')::integer,count(*)FILTER(WHERE issue_state IN('REJECTED','BLOCKED'))::integer
    INTO v_issued,v_errors FROM private.nfse_operation_source_projection WHERE polo_id=p_polo_id AND environment=p_environment AND month=p_month;
  RETURN jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,
    'environment',p_environment,'month',p_month),'data',jsonb_build_object('models',v_models,'classes',v_classes,
    'capabilities',jsonb_build_object('prepare',true,'manageModels',true,'issue',false,'retry',false,'configure',v_configure),
    'readiness',jsonb_build_object('status','BLOCKED','message','A elegibilidade fiscal é verificada na revisão de cada preparação.'),
    'summary',jsonb_build_object('receivedAmount',NULL,'preparedAmount',v_prepared::text,'pendingCount',v_pending,'issuedCount',v_issued,'errorCount',v_errors)));
END;
$function$;
REVOKE ALL ON FUNCTION public.get_nfse_workspace_secure(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_nfse_workspace_secure(uuid,uuid,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
