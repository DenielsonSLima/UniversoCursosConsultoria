BEGIN;

-- New contexts are rendered from frozen receipt facts, never from dCompet.
-- Historical preparations retain their prior rendering and ledger snapshots.
CREATE OR REPLACE FUNCTION private.nfse_queue_operation_basis(p_kind text,p_id uuid,p_polo uuid,p_environment text,p_month text)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $function$
DECLARE v_service private.nfse_partner_services%ROWTYPE; v_queue private.nfse_queue_documents%ROWTYPE;
  v_review private.nfse_fiscal_review_revisions%ROWTYPE; v_model private.nfse_models%ROWTYPE;
  v_cfg private.nfse_configurations%ROWTYPE; v_partner public.parceiros%ROWTYPE;
  v_recipient jsonb; v_source jsonb; v_issuer jsonb; v_facts jsonb; v_model_id uuid; v_partner_id uuid;
  v_title jsonb; v_model_version integer; v_amount numeric(30,2); v_service_date text; v_competence text; v_description text; v_basis jsonb;
BEGIN
  IF p_environment IS DISTINCT FROM 'PRODUCAO' OR p_kind IS NULL OR p_kind NOT IN ('PARTNER_SERVICE','ACADEMIC_QUEUE') THEN
    RAISE EXCEPTION 'Origem fiscal inválida.' USING ERRCODE='22023'; END IF;
  IF p_kind='PARTNER_SERVICE' THEN
    SELECT * INTO v_service FROM private.nfse_partner_services WHERE id=p_id AND polo_id=p_polo AND environment=p_environment
      AND left(service_date::text,7)=p_month AND status='PREPARADO';
    IF NOT FOUND THEN RAISE EXCEPTION 'Serviço fora do contexto autorizado.' USING ERRCODE='42501'; END IF;
    v_model_id:=v_service.model_id; v_model_version:=(v_service.model_snapshot->>'version')::integer;
    v_partner_id:=v_service.partner_id; v_amount:=v_service.amount; v_service_date:=v_service.service_date::text;
    v_description:=v_service.service_description;
    v_source:=jsonb_build_object('kind',p_kind,'id',p_id,'sourceAmount',v_amount::text,'serviceDescription',v_description,
      'preparation',to_jsonb(v_service));
    IF v_service.receivable_id IS NOT NULL THEN
      SELECT jsonb_build_object('id',id,'poloId',polo_id,'partnerId',cliente_id,'amount',valor::numeric(30,2)::text) INTO v_title
        FROM public.contas_receber WHERE id=v_service.receivable_id AND polo_id=p_polo AND cliente_id=v_partner_id AND valor=v_amount;
      IF v_title IS NULL THEN RAISE EXCEPTION 'O vínculo financeiro do serviço mudou.' USING ERRCODE='40001'; END IF;
      v_source:=v_source||jsonb_build_object('receivable',v_title);
    END IF;
  ELSE
    SELECT * INTO v_queue FROM private.nfse_queue_documents WHERE id=p_id AND polo_id=p_polo AND environment=p_environment
      AND queue_month=p_month AND status='PREPARADO';
    IF NOT FOUND OR EXISTS(SELECT 1 FROM private.nfse_queue_removals WHERE document_id=p_id) THEN
      RAISE EXCEPTION 'Preparação acadêmica indisponível.' USING ERRCODE='42501'; END IF;
    IF v_queue.snapshot#>'{academic,descriptionContext,version}' IS DISTINCT FROM '1'::jsonb THEN
      RAISE EXCEPTION 'Preparação acadêmica anterior sem descrição estruturada. Retire da fila e prepare novamente pelos recebimentos, se ainda não houve transmissão.' USING ERRCODE='22023'; END IF;
    SELECT * INTO v_review FROM private.nfse_fiscal_review_revisions WHERE document_id=p_id ORDER BY revision DESC LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'Confirme a revisão fiscal da preparação.' USING ERRCODE='22023'; END IF;
    v_facts:=private.nfse_fiscal_review_basis(p_id,v_review.model_id);
    IF v_facts->'issues' IS DISTINCT FROM '[]'::jsonb OR v_review.basis_fingerprint IS DISTINCT FROM v_facts->>'token' THEN
      RAISE EXCEPTION 'A revisão ou os recebimentos mudaram. Revise antes de emitir.' USING ERRCODE='40001'; END IF;
    v_model_id:=v_review.model_id; v_model_version:=v_review.model_version; v_partner_id:=v_queue.student_id;
    v_amount:=v_queue.amount; v_service_date:=v_review.definition->>'serviceDate'; v_competence:=v_review.definition->>'competenceDate';
    v_source:=jsonb_build_object('kind',p_kind,'id',p_id,'sourceAmount',v_amount::text,'preparation',to_jsonb(v_queue),
      'reviewId',v_review.id,'reviewRevision',v_review.revision,'reviewBasis',v_facts);
  END IF;
  SELECT * INTO v_model FROM private.nfse_models WHERE id=v_model_id AND polo_id=p_polo AND environment=p_environment;
  IF NOT FOUND OR v_model.version IS DISTINCT FROM v_model_version OR v_model.definition->'active' IS DISTINCT FROM 'true'::jsonb
    OR (p_kind='PARTNER_SERVICE' AND (v_service.model_snapshot-'id'-'version') IS DISTINCT FROM v_model.definition) THEN
    RAISE EXCEPTION 'O modelo da preparação mudou. Confira novamente a origem.' USING ERRCODE='40001'; END IF;
  IF p_kind='ACADEMIC_QUEUE' THEN
    v_description:=CASE WHEN v_queue.snapshot#>'{academic,descriptionContext,version}'='1'::jsonb
      THEN private.nfse_queue_description(v_queue.snapshot,v_model.definition->>'serviceDescription',v_queue.payment_month)
      ELSE private.render_nfse_model_description(v_model.definition->>'serviceDescription',left(v_competence,7)) END;
    v_source:=v_source||jsonb_build_object('serviceDescription',v_description);
  END IF;
  SELECT * INTO v_partner FROM public.parceiros p WHERE p.id=v_partner_id AND public.is_active_status(p.status)
    AND (p.polo_id=p_polo OR p_polo=ANY(coalesce(p.polo_ids,ARRAY[]::uuid[]))
      OR(p.polo_id IS NULL AND upper(btrim(p.tipo))<>'ALUNO'));
  IF NOT FOUND OR NOT private.nfse_review_valid_document(v_partner.cpf_cnpj)
    OR length(btrim(coalesce(v_partner.nome,''))) NOT BETWEEN 1 AND 150 THEN
    RAISE EXCEPTION 'Tomador ativo com documento válido obrigatório.' USING ERRCODE='22023'; END IF;
  v_recipient:=jsonb_build_object('partnerId',v_partner.id,'name',btrim(v_partner.nome),
    'document',regexp_replace(v_partner.cpf_cnpj,'[^0-9]','','g'),'address',jsonb_build_object(
      'street',v_partner.endereco,'number',v_partner.numero,'complement',v_partner.complemento,'district',v_partner.bairro,
      'city',v_partner.cidade,'state',v_partner.uf,'postalCode',v_partner.cep));
  SELECT * INTO v_cfg FROM private.nfse_configurations WHERE polo_id=p_polo AND environment=p_environment;
  v_issuer:=private.nfse_issuer_preparation_snapshot(p_polo);
  v_basis:=jsonb_build_object('issuer',v_issuer,'configuration',v_cfg.definition,'configurationVersion',v_cfg.version,
    'recipient',v_recipient,'model',jsonb_build_object('id',v_model.id,'version',v_model.version,'definition',v_model.definition),
    'source',v_source,'serviceDate',v_service_date,'competenceDate',v_competence,'serviceDescription',v_description);
  RETURN jsonb_build_object('snapshot',v_basis,'fingerprint',encode(sha256(convert_to(v_basis::text,'UTF8')),'hex'));
END;
$function$;
REVOKE ALL ON FUNCTION private.nfse_queue_operation_basis(text,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_nfse_fiscal_review_secure(
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
  -- This RPC reports the fiscal review, not the executor's dispatch capability.
  -- PREVIEW_QUEUE revalidates the source and obtains the live issue capability.
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
        private.nfse_queue_description(v_q.snapshot,v_basis#>>'{model,definition,serviceDescription}',v_q.payment_month) ELSE NULL END,
      'issTreatment',v_basis#>>'{model,definition,issTreatment}',
      'competenceDate',v_review.definition->>'competenceDate','serviceDate',v_review.definition->>'serviceDate'),
    'checks',v_checks,'savedAt',v_review.created_at,'savedBy',v_review.actor_id));
END;
$function$;
REVOKE ALL ON FUNCTION public.get_nfse_fiscal_review_secure(uuid,uuid,text,text,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_nfse_fiscal_review_secure(uuid,uuid,text,text,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.nfse_fiscal_review_basis(p_document_id uuid,p_model_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $function$
DECLARE v_q private.nfse_queue_documents%ROWTYPE; v_model private.nfse_models%ROWTYPE;
  v_config private.nfse_configurations%ROWTYPE; v_issuer jsonb; v_recipient jsonb; v_receipts jsonb;
  v_reservations jsonb; v_source_count integer; v_source_amount numeric(30,2); v_reserved_amount numeric(30,2); v_financing boolean;
  v_basis jsonb; v_issues text[]:='{}';
BEGIN
  SELECT * INTO STRICT v_q FROM private.nfse_queue_documents WHERE id=p_document_id;
  SELECT * INTO v_model FROM private.nfse_models WHERE id=p_model_id
    AND polo_id=v_q.polo_id AND environment=v_q.environment;
  SELECT * INTO v_config FROM private.nfse_configurations WHERE polo_id=v_q.polo_id AND environment=v_q.environment;
  v_issuer:=private.nfse_issuer_preparation_snapshot(v_q.polo_id);
  v_issuer:=jsonb_build_object('name',coalesce(v_issuer->>'legalName',v_issuer->>'name'),
    'cnpj',regexp_replace(coalesce(v_issuer->>'cnpj',''),'[^0-9]','','g'),
    'municipalityCode',v_config.definition->>'municipalityCode',
    'municipalRegistration',nullif(v_config.definition->>'municipalRegistration',''),
    'opSimpNac',v_config.definition->>'opSimpNac','regEspTrib',v_config.definition->>'regEspTrib',
    'regApTribSN',v_config.definition->'regApTribSN','configurationVersion',v_config.version);
  SELECT jsonb_build_object('mode','STUDENT','studentId',p.id,'name',nullif(btrim(p.nome),''),
    'document',nullif(regexp_replace(coalesce(p.cpf_cnpj,''),'[^0-9]','','g'),''),
    'address',jsonb_build_object('street',p.endereco,'number',p.numero,'complement',p.complemento,
      'district',p.bairro,'city',p.cidade,'state',p.uf,'postalCode',p.cep)) INTO v_recipient
  FROM public.parceiros p WHERE p.id=v_q.student_id AND upper(btrim(p.tipo))='ALUNO';
  v_recipient:=coalesce(v_recipient,jsonb_build_object('mode','STUDENT','studentId',v_q.student_id,
    'name',NULL,'document',NULL,'address',jsonb_build_object('street',NULL,'number',NULL,'complement',NULL,
      'district',NULL,'city',NULL,'state',NULL,'postalCode',NULL)));
  SELECT coalesce(jsonb_agg(r.receipt_snapshot ORDER BY r.receipt_id),'[]'),count(*)::integer,
    coalesce(sum(r.received_amount),0),coalesce(bool_or(r.source_is_financing),false)
    INTO v_receipts,v_source_count,v_source_amount,v_financing
  FROM private.nfse_academic_receipts(v_q.polo_id,v_q.payment_month,ARRAY[v_q.candidate_id]) r
  JOIN private.nfse_receipt_reservations claim ON claim.document_id=v_q.id AND claim.environment=v_q.environment
    AND claim.receipt_id=r.receipt_id AND claim.source_receivable_id=r.source_receivable_id
    AND claim.payment_event_id IS NOT DISTINCT FROM r.payment_event_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object('receiptId',receipt_id,'sourceReceivableId',source_receivable_id,
    'paymentEventId',payment_event_id,'amount',amount::numeric(30,2)::text) ORDER BY receipt_id),'[]'),
    coalesce(sum(amount),0) INTO v_reservations,v_reserved_amount
  FROM private.nfse_receipt_reservations WHERE document_id=v_q.id AND environment=v_q.environment;
  IF v_q.snapshot#>'{academic,descriptionContext,version}' IS DISTINCT FROM '1'::jsonb THEN
    v_issues:=array_append(v_issues,'ACADEMIC_DESCRIPTION_CONTEXT_REQUIRED'); END IF;
  IF v_q.snapshot#>'{academic,descriptionContext,version}'='1'::jsonb AND (
    NOT EXISTS(SELECT 1 FROM public.turmas t JOIN public.cursos c ON c.id=t.curso_id
      WHERE t.id=v_q.class_id AND t.polo_id=v_q.polo_id
        AND c.id::text=v_q.snapshot#>>'{academic,descriptionContext,courseId}'
        AND btrim(c.nome)=v_q.snapshot#>>'{academic,descriptionContext,courseName}'
        AND upper(btrim(c.modalidade))=v_q.snapshot#>>'{academic,descriptionContext,courseType}')
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_q.snapshot#>'{academic,descriptionContext,entries}') entry
      LEFT JOIN public.matriculas m ON m.id=(entry->>'enrollmentId')::uuid
      LEFT JOIN public.contas_receber source ON source.id=(entry->>'sourceReceivableId')::uuid
      WHERE m.id IS NULL OR m.aluno_id IS DISTINCT FROM v_q.student_id OR m.turma_id IS DISTINCT FROM v_q.class_id
        OR m.data_matricula IS DISTINCT FROM (entry->>'enrollmentDate')::timestamptz
        OR source.matricula_id IS DISTINCT FROM m.id OR source.polo_id IS DISTINCT FROM v_q.polo_id
        OR (source.turma_id IS NOT NULL AND source.turma_id IS DISTINCT FROM v_q.class_id)
        OR source.parcela_numero IS DISTINCT FROM (entry->>'installmentNumber')::integer
        OR source.tipo_lancamento IS DISTINCT FROM entry->>'installmentType')) THEN
    v_issues:=array_append(v_issues,'SOURCE_CHANGED'); END IF;
  IF EXISTS(SELECT 1 FROM private.nfse_queue_removals WHERE document_id=v_q.id) OR v_q.status<>'PREPARADO' THEN
    v_issues:=array_append(v_issues,'PREPARATION_REMOVED'); END IF;
  IF v_model.id IS NULL OR v_model.definition->'active' IS DISTINCT FROM 'true'::jsonb THEN
    v_issues:=array_append(v_issues,'MODEL_UNAVAILABLE'); END IF;
  IF v_model.definition->>'nationalServiceCode' IS DISTINCT FROM '080201' THEN
    v_issues:=array_append(v_issues,'MODEL_SERVICE_NOT_APPROVED'); END IF;
  IF v_config.version IS NULL THEN v_issues:=array_append(v_issues,'FISCAL_CONFIGURATION_REQUIRED'); END IF;
  IF NOT private.nfse_review_valid_document(v_issuer->>'cnpj') THEN
    v_issues:=array_append(v_issues,'ISSUER_DOCUMENT_INVALID'); END IF;
  IF NOT private.nfse_review_valid_document(v_recipient->>'document') THEN
    v_issues:=array_append(v_issues,'RECIPIENT_DOCUMENT_INVALID'); END IF;
  IF coalesce(v_recipient->>'name','')='' THEN v_issues:=array_append(v_issues,'RECIPIENT_NAME_REQUIRED'); END IF;
  IF v_source_count<>v_q.receipt_count OR v_source_amount<>v_q.amount OR v_reserved_amount<>v_q.amount OR v_financing
    OR jsonb_array_length(v_reservations)<>v_q.receipt_count
    OR v_receipts IS DISTINCT FROM coalesce(v_q.snapshot#>'{financial,receipts}','[]'::jsonb) THEN
    v_issues:=array_append(v_issues,'SOURCE_CHANGED'); END IF;
  v_basis:=jsonb_build_object('documentId',v_q.id,'preparationSnapshot',v_q.snapshot,
    'issuer',v_issuer,'recipient',v_recipient,'configuration',v_config.definition,
    'model',jsonb_build_object('id',p_model_id,'version',v_model.version,'definition',v_model.definition),
    'financial',jsonb_build_object('original',v_q.snapshot->'financial','currentReceipts',v_receipts,
      'reservations',v_reservations),'issues',to_jsonb(v_issues));
  RETURN jsonb_build_object('basis',v_basis,'token',encode(sha256(convert_to(v_basis::text,'UTF8')),'hex'),
    'issues',to_jsonb(v_issues));
END;
$function$;
REVOKE ALL ON FUNCTION private.nfse_fiscal_review_basis(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.nfse_fiscal_review_check(p_code text,p_status text DEFAULT 'BLOCKED')
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $function$
  SELECT jsonb_build_object('code',p_code,'status',p_status,'message',CASE p_code
    WHEN 'ACADEMIC_DESCRIPTION_CONTEXT_REQUIRED' THEN 'Preparação anterior sem descrição acadêmica estruturada. Se ainda não houve transmissão, retire da fila e prepare novamente pelos recebimentos; o histórico será preservado.'
    WHEN 'PREPARATION_REMOVED' THEN 'A preparação foi retirada da fila.'
    WHEN 'MODEL_UNAVAILABLE' THEN 'Selecione um modelo ativo desta unidade e ambiente.'
    WHEN 'MODEL_SERVICE_NOT_APPROVED' THEN 'Selecione o modelo confirmado de treinamento, código 080201.'
    WHEN 'FISCAL_CONFIGURATION_REQUIRED' THEN 'Salve os parâmetros fiscais desta unidade e ambiente.'
    WHEN 'ISSUER_DOCUMENT_INVALID' THEN 'Revise o CNPJ do estabelecimento no cadastro de Polos e Filiais.'
    WHEN 'RECIPIENT_DOCUMENT_INVALID' THEN 'O CPF ou CNPJ do aluno exige correção no cadastro.'
    WHEN 'RECIPIENT_NAME_REQUIRED' THEN 'O nome do aluno exige correção no cadastro.'
    WHEN 'RECIPIENT_CONFIRMATION_REQUIRED' THEN 'Confirme o aluno como tomador do serviço.'
    WHEN 'COMPETENCE_REQUIRED' THEN 'Informe expressamente a data de competência fiscal.'
    WHEN 'SERVICE_DATE_REQUIRED' THEN 'Informe expressamente a data da prestação do serviço.'
    WHEN 'CONFIGURATION_CHANGED' THEN 'Os parâmetros ou o estabelecimento mudaram após a revisão.'
    WHEN 'MODEL_CHANGED' THEN 'O modelo selecionado mudou após a revisão.'
    WHEN 'RECIPIENT_CHANGED' THEN 'O cadastro do aluno mudou após a revisão.'
    WHEN 'SOURCE_CHANGED' THEN 'A origem, o valor ou os dados dos recebimentos reservados mudaram.'
    WHEN 'REVIEW_STALE' THEN 'Confira novamente os dados atuais e salve uma nova revisão.'
    WHEN 'REVIEW_CONFIRMED' THEN 'Revisão fiscal salva. A prontidão e os recebimentos serão verificados na prévia antes da emissão.'
    ELSE 'Confira os dados fiscais antes de continuar.' END);
$function$;
REVOKE ALL ON FUNCTION private.nfse_fiscal_review_check(text,text) FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
