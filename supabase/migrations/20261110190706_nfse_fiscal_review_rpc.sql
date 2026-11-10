BEGIN;

CREATE FUNCTION public.get_nfse_fiscal_review_secure(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,p_document_id uuid,p_model_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
SET statement_timeout='8s' AS $function$
DECLARE v_q private.nfse_queue_documents%ROWTYPE; v_review private.nfse_fiscal_review_revisions%ROWTYPE;
  v_facts jsonb; v_basis jsonb; v_model uuid; v_status text; v_checks jsonb:='[]'; v_issue text;
  v_stale boolean; v_complete boolean;
BEGIN
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  SELECT * INTO v_q FROM private.nfse_queue_documents WHERE id=p_document_id
    AND polo_id=p_polo_id AND environment=p_environment AND queue_month=p_month;
  IF NOT FOUND THEN RAISE EXCEPTION 'Preparação fora do contexto autorizado.' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_review FROM private.nfse_fiscal_review_revisions WHERE document_id=v_q.id ORDER BY revision DESC LIMIT 1;
  v_model:=coalesce(p_model_id,v_review.model_id,v_q.model_id);
  v_facts:=private.nfse_fiscal_review_basis(v_q.id,v_model); v_basis:=v_facts->'basis';
  v_stale:=v_review.id IS NOT NULL AND v_review.basis_fingerprint IS DISTINCT FROM v_facts->>'token';
  v_complete:=v_review.id IS NOT NULL AND NOT v_stale AND v_facts->'issues'='[]'::jsonb;
  v_status:=CASE WHEN v_facts->'issues' @> '["PREPARATION_REMOVED"]' THEN 'BLOCKED'
    WHEN v_stale THEN 'STALE' WHEN v_complete THEN 'CONFIRMED'
    WHEN v_facts->'issues'<>'[]'::jsonb THEN 'BLOCKED' ELSE 'NOT_REVIEWED' END;
  FOR v_issue IN SELECT jsonb_array_elements_text(v_facts->'issues') LOOP
    v_checks:=v_checks||jsonb_build_array(private.nfse_fiscal_review_check(v_issue)); END LOOP;
  IF v_review.id IS NULL THEN
    FOREACH v_issue IN ARRAY ARRAY['RECIPIENT_CONFIRMATION_REQUIRED','COMPETENCE_REQUIRED','SERVICE_DATE_REQUIRED'] LOOP
      v_checks:=v_checks||jsonb_build_array(private.nfse_fiscal_review_check(v_issue)); END LOOP;
  ELSIF v_stale THEN
    IF v_review.basis->'issuer' IS DISTINCT FROM v_basis->'issuer'
      OR v_review.basis->'configuration' IS DISTINCT FROM v_basis->'configuration' THEN
      v_checks:=v_checks||jsonb_build_array(private.nfse_fiscal_review_check('CONFIGURATION_CHANGED')); END IF;
    IF v_review.basis->'model' IS DISTINCT FROM v_basis->'model' THEN
      v_checks:=v_checks||jsonb_build_array(private.nfse_fiscal_review_check('MODEL_CHANGED')); END IF;
    IF v_review.basis->'recipient' IS DISTINCT FROM v_basis->'recipient' THEN
      v_checks:=v_checks||jsonb_build_array(private.nfse_fiscal_review_check('RECIPIENT_CHANGED')); END IF;
    IF v_review.basis->'financial' IS DISTINCT FROM v_basis->'financial'
      AND NOT (v_facts->'issues' @> '["SOURCE_CHANGED"]') THEN
      v_checks:=v_checks||jsonb_build_array(private.nfse_fiscal_review_check('SOURCE_CHANGED')); END IF;
    v_checks:=v_checks||jsonb_build_array(private.nfse_fiscal_review_check('REVIEW_STALE'));
  ELSE v_checks:=v_checks||jsonb_build_array(private.nfse_fiscal_review_check('REVIEW_CONFIRMED','PASSED'));
  END IF;
  v_checks:=v_checks||jsonb_build_array(private.nfse_fiscal_review_check('EXTERNAL_HABILITATION_UNCONFIRMED','UNKNOWN'),
    private.nfse_fiscal_review_check('REAL_EMISSION_NOT_ENABLED'));
  RETURN jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,
    'environment',p_environment,'month',p_month),'data',jsonb_build_object(
    'documentId',v_q.id,'revision',coalesce(v_review.revision,0),'reviewStatus',v_status,
    'basisToken',v_facts->>'token','reviewComplete',v_complete,'canTransmit',false,
    'preparation',jsonb_build_object('studentName',v_q.snapshot#>>'{recipient,name}',
      'classLabel',v_q.snapshot#>>'{academic,classLabel}','paymentMonth',v_q.payment_month,
      'amount',v_q.amount::text,'receiptCount',v_q.receipt_count,
      'originalModel',jsonb_build_object('id',v_q.model_id,'version',v_q.model_version,
        'name',v_q.snapshot#>>'{model,name}','nationalServiceCode',v_q.snapshot#>>'{model,nationalServiceCode}')),
    'issuer',v_basis->'issuer','recipient',(v_basis->'recipient')||jsonb_build_object('confirmed',v_complete),
    'service',jsonb_build_object('modelId',v_model,'modelVersion',v_basis#>'{model,version}',
      'nationalServiceCode',v_basis#>>'{model,definition,nationalServiceCode}',
      'nbsCode',v_basis#>>'{model,definition,nbsCode}',
      'description',CASE WHEN v_basis#>>'{model,definition,serviceDescription}' IS NOT NULL THEN
        private.render_nfse_model_description(v_basis#>>'{model,definition,serviceDescription}',v_q.payment_month) ELSE NULL END,
      'issTreatment',v_basis#>>'{model,definition,issTreatment}',
      'competenceDate',v_review.definition->>'competenceDate','serviceDate',v_review.definition->>'serviceDate'),
    'checks',v_checks,'savedAt',v_review.created_at,'savedBy',v_review.actor_id));
END;
$function$;
REVOKE ALL ON FUNCTION public.get_nfse_fiscal_review_secure(uuid,uuid,text,text,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_nfse_fiscal_review_secure(uuid,uuid,text,text,uuid,uuid) TO authenticated;

CREATE FUNCTION public.save_nfse_fiscal_review_secure(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,p_document_id uuid,p_request_id uuid,
  p_expected_revision integer,p_basis_token text,p_definition jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
SET statement_timeout='15s' SET lock_timeout='5s' AS $function$
DECLARE v_actor uuid:=auth.uid(); v_q private.nfse_queue_documents%ROWTYPE;
  v_previous private.nfse_fiscal_review_revisions%ROWTYPE; v_revision integer; v_model uuid; v_source uuid;
  v_payload jsonb; v_facts jsonb; v_basis jsonb; v_response jsonb; v_id uuid:=gen_random_uuid();
BEGIN
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'A revisão exige READ COMMITTED.' USING ERRCODE='25001'; END IF;
  IF p_document_id IS NULL OR p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0
    OR coalesce(p_basis_token,'') !~ '^[0-9a-f]{64}$' OR p_definition IS NULL
    OR jsonb_typeof(p_definition)<>'object' OR octet_length(p_definition::text)>2000 THEN
    RAISE EXCEPTION 'Dados da revisão fiscal inválidos.' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_definition) f(key) WHERE key NOT IN
      ('modelId','modelVersion','recipient','competenceDate','serviceDate','classificationConfirmed','receiptsConfirmed'))
    OR jsonb_typeof(p_definition->'modelId') IS DISTINCT FROM 'string'
    OR coalesce(p_definition->>'modelId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR jsonb_typeof(p_definition->'modelVersion') IS DISTINCT FROM 'number'
    OR coalesce(p_definition->>'modelVersion','') !~ '^[1-9][0-9]{0,8}$'
    OR jsonb_typeof(p_definition->'recipient') IS DISTINCT FROM 'object'
    OR p_definition#>>'{recipient,mode}' IS DISTINCT FROM 'STUDENT'
    OR p_definition#>'{recipient,confirmed}' IS DISTINCT FROM 'true'::jsonb
    OR p_definition->'classificationConfirmed' IS DISTINCT FROM 'true'::jsonb
    OR p_definition->'receiptsConfirmed' IS DISTINCT FROM 'true'::jsonb
    OR jsonb_typeof(p_definition->'competenceDate') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_definition->'serviceDate') IS DISTINCT FROM 'string'
    OR p_definition->>'competenceDate' !~ '^(19|20|21)[0-9]{2}-[0-9]{2}-[0-9]{2}$'
    OR p_definition->>'serviceDate' !~ '^(19|20|21)[0-9]{2}-[0-9]{2}-[0-9]{2}$' THEN
    RAISE EXCEPTION 'Confirme o tomador, o modelo e as datas fiscais explicitamente.' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_definition->'recipient') f(key) WHERE key NOT IN ('mode','confirmed')) THEN
    RAISE EXCEPTION 'O tomador é resolvido pelo cadastro do aluno.' USING ERRCODE='22023'; END IF;
  BEGIN
    PERFORM (p_definition->>'competenceDate')::date,(p_definition->>'serviceDate')::date;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'Datas fiscais inválidas.' USING ERRCODE='22023';
  END;
  v_model:=(p_definition->>'modelId')::uuid;
  v_payload:=jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,'environment',p_environment,
    'month',p_month,'documentId',p_document_id,'expectedRevision',p_expected_revision,'basisToken',p_basis_token,
    'definition',p_definition);
  PERFORM pg_advisory_xact_lock(hashtextextended('nfse-fiscal-review-request:'||v_actor::text||':'||p_request_id::text,0));
  SELECT * INTO v_previous FROM private.nfse_fiscal_review_revisions WHERE actor_id=v_actor AND request_id=p_request_id;
  IF FOUND THEN
    IF v_previous.payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'Solicitação de revisão já utilizada com outros dados.' USING ERRCODE='22023'; END IF;
    RETURN v_previous.response;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('nfse-academic-scope:'||p_polo_id::text||':'||p_environment,0));
  SELECT * INTO v_q FROM private.nfse_queue_documents WHERE id=p_document_id
    AND polo_id=p_polo_id AND environment=p_environment AND queue_month=p_month FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Preparação fora do contexto autorizado.' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM private.nfse_configurations WHERE polo_id=p_polo_id AND environment=p_environment FOR SHARE;
  PERFORM 1 FROM public.polos WHERE id=p_polo_id FOR SHARE;
  PERFORM 1 FROM public.parceiros WHERE id=v_q.student_id FOR SHARE;
  PERFORM 1 FROM private.nfse_models WHERE id=v_model AND polo_id=p_polo_id AND environment=p_environment FOR SHARE;
  FOR v_source IN SELECT DISTINCT source_receivable_id FROM private.nfse_receipt_reservations
    WHERE document_id=v_q.id AND environment=p_environment ORDER BY source_receivable_id LOOP
    PERFORM 1 FROM public.contas_receber WHERE id=v_source AND polo_id=p_polo_id FOR SHARE;
  END LOOP;
  PERFORM 1 FROM public.financial_payment_events WHERE source_kind='RECEIVABLE'
    AND source_id IN (SELECT source_receivable_id FROM private.nfse_receipt_reservations WHERE document_id=v_q.id)
    ORDER BY id FOR SHARE;
  SELECT coalesce(max(revision),0) INTO v_revision FROM private.nfse_fiscal_review_revisions WHERE document_id=v_q.id;
  IF v_revision<>p_expected_revision THEN
    RAISE EXCEPTION 'A revisão mudou. Atualize antes de salvar.' USING ERRCODE='40001'; END IF;
  -- Fresh statement snapshot after the financial locks; only originally reserved
  -- effective receipts are compared. No new payment enters this old preparation.
  v_facts:=private.nfse_fiscal_review_basis(v_q.id,v_model); v_basis:=v_facts->'basis';
  IF v_facts->>'token' IS DISTINCT FROM p_basis_token
    OR v_basis#>>'{model,version}' IS DISTINCT FROM p_definition->>'modelVersion' THEN
    RAISE EXCEPTION 'Os dados mudaram. Confira novamente a revisão.' USING ERRCODE='40001'; END IF;
  IF v_facts->'issues'<>'[]'::jsonb THEN
    RAISE EXCEPTION 'Há pendências cadastrais ou de recebimentos nesta preparação.' USING ERRCODE='22023'; END IF;
  v_response:=jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,
    'environment',p_environment,'month',p_month),'data',jsonb_build_object('documentId',v_q.id,
      'reviewId',v_id,'revision',v_revision+1,'message','Revisão fiscal salva. A transmissão permanece desabilitada.'));
  INSERT INTO private.nfse_fiscal_review_revisions(id,document_id,revision,actor_id,context_id,request_id,
    polo_id,environment,queue_month,model_id,model_version,configuration_version,basis_fingerprint,basis,definition,payload,response)
  VALUES(v_id,v_q.id,v_revision+1,v_actor,p_context_key,p_request_id,p_polo_id,p_environment,p_month,v_model,
    (v_basis#>>'{model,version}')::integer,(v_basis#>>'{issuer,configurationVersion}')::integer,
    p_basis_token,v_basis,p_definition,v_payload,v_response);
  RETURN v_response;
END;
$function$;
REVOKE ALL ON FUNCTION public.save_nfse_fiscal_review_secure(uuid,uuid,text,text,uuid,uuid,integer,text,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.save_nfse_fiscal_review_secure(uuid,uuid,text,text,uuid,uuid,integer,text,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
