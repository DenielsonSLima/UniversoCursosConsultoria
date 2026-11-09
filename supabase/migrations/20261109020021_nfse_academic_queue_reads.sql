BEGIN;

CREATE FUNCTION public.get_nfse_queue_secure(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,p_status text DEFAULT 'PREPARADO',
  p_page integer DEFAULT 1,p_page_size integer DEFAULT 25
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
SET statement_timeout = '8s' AS $function$
DECLARE v_rows jsonb; v_count integer; v_total numeric(30,2);
BEGIN
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  IF p_status IS NULL OR p_status NOT IN ('PREPARADO','TODOS') OR p_page IS NULL
    OR p_page NOT BETWEEN 1 AND 100000 OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Filtros da fila NFS-e inválidos.' USING ERRCODE = '22023';
  END IF;
  SELECT count(*)::integer,coalesce(sum(amount),0) INTO v_count,v_total
    FROM private.nfse_queue_documents WHERE polo_id = p_polo_id AND environment = p_environment AND queue_month = p_month;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',q.id,'batchId',q.batch_id,'studentId',q.student_id,
    'studentName',q.snapshot #>> '{recipient,name}','classId',q.class_id,
    'classLabel',q.snapshot #>> '{academic,classLabel}','amount',q.amount::text,
    'modelLabel',q.snapshot #>> '{model,name}','status',q.status,'receiptCount',q.receipt_count,
    'paymentMonth',q.payment_month,'createdAt',q.created_at,
    'blockingReasons',q.snapshot #> '{fiscalReadiness,blockingReasons}') ORDER BY q.created_at DESC,q.id),'[]') INTO v_rows
  FROM (SELECT * FROM private.nfse_queue_documents WHERE polo_id = p_polo_id AND environment = p_environment
    AND queue_month = p_month ORDER BY created_at DESC,id LIMIT p_page_size OFFSET (p_page::bigint - 1) * p_page_size) q;
  RETURN jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,
    'poloId',p_polo_id,'environment',p_environment,'month',p_month),'data',jsonb_build_object(
    'rows',v_rows,'page',p_page,'pageSize',p_page_size,'totalItems',v_count,'totalAmount',v_total::text,
    'summary',jsonb_build_object('preparedCount',v_count,'preparedAmount',v_total::text),'providerEnabled',false));
END;
$function$;
REVOKE ALL ON FUNCTION public.get_nfse_queue_secure(uuid,uuid,text,text,text,integer,integer)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_nfse_queue_secure(uuid,uuid,text,text,text,integer,integer) TO authenticated;
COMMENT ON FUNCTION public.get_nfse_queue_secure(uuid,uuid,text,text,text,integer,integer) IS
  'Pilot-scoped immutable preparation listing, backend totals and fiscal blocking reasons. No raw fiscal snapshot, document number, access key or provider capability is exposed.';
NOTIFY pgrst,'reload schema';
COMMIT;
