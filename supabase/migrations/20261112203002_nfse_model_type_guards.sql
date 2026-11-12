BEGIN;

CREATE OR REPLACE FUNCTION public.prepare_nfse_batch_secure(p_context_key uuid, p_polo_id uuid, p_environment text, p_month text, p_request_id uuid, p_candidate_ids text[], p_model_id uuid, p_model_version integer, p_payment_month text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '30s'
 SET lock_timeout TO '5s'
AS $function$
DECLARE
  v_actor uuid := auth.uid(); v_ids text[]; v_sources uuid[]; v_locked_sources uuid[];
  v_payload jsonb; v_previous private.nfse_preparation_batches%ROWTYPE;
  v_model private.nfse_models%ROWTYPE; v_receipts jsonb; v_selection jsonb; v_documents jsonb := '[]';
  v_issuer jsonb; v_recipient jsonb; v_context jsonb; v_snapshot jsonb; v_document jsonb; v_receipt jsonb;
  v_candidate record; v_source uuid; v_amount numeric(30,2); v_total numeric(30,2) := 0;
  v_batch_id uuid := gen_random_uuid(); v_document_id uuid; v_document_ids uuid[] := '{}';
  v_response jsonb; v_count integer; v_receipt_count integer := 0; v_reasons text[];
  v_uuid constant text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
BEGIN
  -- Authorization always precedes payload inspection and idempotency lookup.
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'A preparação exige uma transação READ COMMITTED.' USING ERRCODE = '25001';
  END IF;
  IF p_request_id IS NULL OR p_model_id IS NULL OR p_model_version IS NULL OR p_model_version < 1
    OR p_payment_month IS NULL OR p_payment_month !~ '^(19|20|21)[0-9]{2}-(0[1-9]|1[0-2])$'
    OR p_candidate_ids IS NULL OR cardinality(p_candidate_ids) NOT BETWEEN 1 AND 1000
    OR EXISTS (SELECT 1 FROM unnest(p_candidate_ids) candidate(id)
      WHERE id IS NULL OR id !~* ('^' || v_uuid || ':' || v_uuid || '$')) THEN
    RAISE EXCEPTION 'Seleção, modelo e mês dos recebimentos são obrigatórios.' USING ERRCODE = '22023';
  END IF;
  v_ids := ARRAY(SELECT DISTINCT lower(id) FROM unnest(p_candidate_ids) candidate(id) ORDER BY 1);
  IF cardinality(v_ids) <> cardinality(p_candidate_ids) THEN
    RAISE EXCEPTION 'A seleção contém alunos repetidos.' USING ERRCODE = '22023';
  END IF;
  v_payload := jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,'environment',p_environment,
    'month',p_month,'paymentMonth',p_payment_month,'candidateIds',to_jsonb(v_ids),
    'modelId',p_model_id,'modelVersion',p_model_version);
  PERFORM pg_advisory_xact_lock(hashtextextended('nfse-academic-request:' || v_actor::text || ':' || p_request_id::text,0));
  SELECT * INTO v_previous FROM private.nfse_preparation_batches WHERE actor_id = v_actor AND request_id = p_request_id;
  IF FOUND THEN
    IF v_previous.payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'Esta tentativa já pertence a outra preparação.' USING ERRCODE = '22023';
    END IF;
    RETURN v_previous.response;
  END IF;
  -- All preparations for one establishment/environment share this lock. The
  -- unique claim remains the final integrity barrier, independent of RPC use.
  PERFORM pg_advisory_xact_lock(hashtextextended('nfse-academic-scope:' || p_polo_id::text || ':' || p_environment,0));
  SELECT * INTO v_model FROM private.nfse_models WHERE id = p_model_id AND private.nfse_model_visible_to_polo(polo_id,p_polo_id,definition)
    AND environment = p_environment AND version = p_model_version AND (definition->>'active')::boolean FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'O modelo foi alterado ou está indisponível. Atualize a seleção.' USING ERRCODE = '40001';
  END IF;
  IF coalesce(v_model.definition->>'modelType','') NOT IN ('ALUNO','AMBOS') THEN
    RAISE EXCEPTION 'Selecione um modelo do tipo Alunos para os recebimentos acadêmicos.' USING ERRCODE='22023'; END IF;
  IF v_model.definition->>'nationalServiceCode' IS DISTINCT FROM '080201'
    OR position('{{periodo}}' IN v_model.definition->>'serviceDescription')>0 THEN
    RAISE EXCEPTION 'Na emissão de alunos use código 080201 e texto sem período manual. Em Ambos, use texto comum aos dois fluxos.' USING ERRCODE='22023'; END IF;
  SELECT array_agg(DISTINCT source_receivable_id ORDER BY source_receivable_id) INTO v_sources
    FROM private.nfse_academic_receipts(p_polo_id,p_payment_month,v_ids);
  IF v_sources IS NULL THEN
    RAISE EXCEPTION 'Não há recebimentos disponíveis nesta seleção.' USING ERRCODE = '40001';
  END IF;
  -- Canonical payment/reversal writers lock the physical source before the event.
  -- SHARE blocks financial changes without changing any title/payment itself.
  FOREACH v_source IN ARRAY v_sources LOOP
    PERFORM 1 FROM public.contas_receber WHERE id = v_source AND polo_id = p_polo_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Recebimento alterado. Atualize a seleção.' USING ERRCODE = '40001'; END IF;
  END LOOP;
  PERFORM 1 FROM public.financial_payment_events WHERE source_kind = 'RECEIVABLE'
    AND source_id = ANY(v_sources) ORDER BY id FOR SHARE;
  -- This is a new statement snapshot after the source locks, so it sees any
  -- committed payment/reversal we waited for. Newly discovered sources fail.
  SELECT jsonb_agg(to_jsonb(receipt) ORDER BY receipt.receipt_id),
    array_agg(DISTINCT source_receivable_id ORDER BY source_receivable_id)
    INTO v_receipts,v_locked_sources FROM private.nfse_academic_receipts(p_polo_id,p_payment_month,v_ids) receipt;
  IF v_locked_sources IS DISTINCT FROM v_sources OR v_receipts IS NULL THEN
    RAISE EXCEPTION 'Os recebimentos mudaram durante a preparação. Atualize a seleção.' USING ERRCODE = '40001';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_receipts) receipt
    WHERE (receipt->>'received_amount')::numeric <> round((receipt->>'received_amount')::numeric,2)
      OR (receipt->>'source_is_financing')::boolean)
    OR (SELECT count(DISTINCT value->>'candidate_id') FROM jsonb_array_elements(v_receipts)) <> cardinality(v_ids)
    OR (SELECT count(DISTINCT value->>'receipt_id') FROM jsonb_array_elements(v_receipts)) <> jsonb_array_length(v_receipts) THEN
    RAISE EXCEPTION 'Seleção desatualizada ou recebimento incompatível. Atualize os alunos.' USING ERRCODE = '40001';
  END IF;
  -- Compare with the same canonical selector shown in the UI. An orphaned or
  -- inconsistent effective source must not silently reduce a student's amount.
  -- The reader also reauthorizes the actor/context/polo before reading payments.
  v_selection := public.get_nfse_receipt_students_secure(p_context_key,p_polo_id,
    (p_payment_month || '-01')::date,NULL,NULL,NULL,1,1,v_ids,false);
  IF NOT coalesce((v_selection #>> '{selection,valid}')::boolean,false) OR EXISTS (
    WITH expected AS (
      SELECT student->>'id' candidate_id,(student->>'receivedAmount')::numeric amount,
        (student->>'receiptCount')::integer receipt_count
      FROM jsonb_array_elements(v_selection #> '{selection,groups}') class_group
      CROSS JOIN LATERAL jsonb_array_elements(class_group->'students') student
    ), actual AS (
      SELECT receipt->>'candidate_id' candidate_id,sum((receipt->>'received_amount')::numeric) amount,
        count(*)::integer receipt_count FROM jsonb_array_elements(v_receipts) receipt GROUP BY 1
    ) SELECT 1 FROM expected FULL JOIN actual USING(candidate_id)
      WHERE expected.amount IS DISTINCT FROM actual.amount OR expected.receipt_count IS DISTINCT FROM actual.receipt_count
  ) THEN
    RAISE EXCEPTION 'A origem ou o total dos recebimentos mudou. Atualize a seleção.' USING ERRCODE = '40001';
  END IF;
  -- Never prepare a silent subset: today's student selector includes all of the
  -- candidate's receipts. Any overlap rejects the entire batch and its amount.
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_receipts) receipt
    JOIN private.nfse_receipt_reservations reservation ON reservation.environment = p_environment
      AND (reservation.receipt_id = (receipt->>'receipt_id')::uuid
        OR (reservation.source_receivable_id = (receipt->>'source_receivable_id')::uuid
          AND (reservation.payment_event_id IS NULL OR receipt->>'payment_event_id' IS NULL)))
    WHERE private.nfse_academic_receipt_claim_active(reservation.document_id)) THEN
    RAISE EXCEPTION 'Há recebimentos já reservados nesta seleção e ambiente. Nenhum aluno foi preparado.' USING ERRCODE = '23505';
  END IF;
  v_issuer := private.nfse_issuer_preparation_snapshot(p_polo_id);
  FOR v_candidate IN SELECT candidate_id,class_id,student_id,count(*)::integer receipt_count,
      sum(received_amount) amount,jsonb_agg(receipt_snapshot ORDER BY receipt_id) receipts
    FROM jsonb_to_recordset(v_receipts) AS r(candidate_id text,class_id uuid,student_id uuid,
      receipt_id uuid,received_amount numeric,receipt_snapshot jsonb)
    GROUP BY candidate_id,class_id,student_id ORDER BY candidate_id LOOP
    v_document_id := gen_random_uuid();
    v_amount := v_candidate.amount;
    SELECT jsonb_build_object('candidateStudentId',student.id,'name',student.nome,'document',student.cpf_cnpj,
      'email',student.email,'confirmed',false,'address',jsonb_build_object('street',student.endereco,
      'number',student.numero,'complement',student.complemento,'district',student.bairro,
      'city',student.cidade,'state',student.uf,'postalCode',student.cep)) INTO v_recipient
      FROM public.parceiros student WHERE student.id = v_candidate.student_id;
    v_reasons := ARRAY['FISCAL_CONFIGURATION_NOT_VALIDATED','RECIPIENT_CONFIRMATION_REQUIRED',
      'COMPETENCE_REQUIRED','SERVICE_DATE_REQUIRED','PROVIDER_NOT_ENABLED','SOURCE_REVALIDATION_REQUIRED'];
    IF nullif(btrim(v_issuer->>'cnpj'),'') IS NULL THEN v_reasons := array_append(v_reasons,'ISSUER_DOCUMENT_REQUIRED'); END IF;
    IF nullif(btrim(v_recipient->>'document'),'') IS NULL THEN v_reasons := array_append(v_reasons,'RECIPIENT_DOCUMENT_REQUIRED'); END IF;
    v_context:=private.nfse_academic_description_context(p_polo_id,v_candidate.class_id,v_candidate.student_id,v_candidate.receipts);
    SELECT jsonb_build_object('version',2,'issuer',v_issuer,'recipient',v_recipient,
      'academic',jsonb_build_object('candidateId',v_candidate.candidate_id,'classId',class.id,
        'classLabel',concat_ws(' · ',class.codigo,class.nome),'courseId',course.id,'courseName',course.nome,
        'courseType',v_context->>'courseType','descriptionContext',v_context),
      'model',v_model.definition || jsonb_build_object('id',v_model.id,'version',v_model.version),
      'service',v_model.definition || jsonb_build_object('description',
        private.render_nfse_academic_description(v_model.definition->>'serviceDescription',v_context),
        'competence',NULL,'serviceDate',NULL),
      'financial',jsonb_build_object('basis','PAYMENT_DATE','paymentMonth',p_payment_month,
        'totalAmount',v_amount::text,'receipts',v_candidate.receipts),
      'fiscalReadiness',jsonb_build_object('ready',false,'blockingReasons',to_jsonb(v_reasons))) INTO v_snapshot
      FROM public.turmas class JOIN public.cursos course ON course.id = class.curso_id
      WHERE class.id = v_candidate.class_id AND class.polo_id = p_polo_id;
    IF v_snapshot IS NULL OR v_recipient IS NULL THEN
      RAISE EXCEPTION 'Cadastro acadêmico alterado. Atualize a seleção.' USING ERRCODE = '40001';
    END IF;
    v_documents := v_documents || jsonb_build_array(jsonb_build_object('id',v_document_id,
      'candidateId',v_candidate.candidate_id,'classId',v_candidate.class_id,'studentId',v_candidate.student_id,
      'amount',v_amount::text,'receiptCount',v_candidate.receipt_count,'snapshot',v_snapshot));
    v_document_ids := array_append(v_document_ids,v_document_id);
    v_total := v_total + v_amount; v_receipt_count := v_receipt_count + v_candidate.receipt_count;
  END LOOP;
  v_count := jsonb_array_length(v_documents);
  v_response := jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,
    'poloId',p_polo_id,'environment',p_environment,'month',p_month),'data',jsonb_build_object(
    'id',v_batch_id,'version',1,'documentCount',v_count,'receiptCount',v_receipt_count,
    'totalAmount',v_total::text,'documentIds',to_jsonb(v_document_ids),
    'message','Preparação salva na fila. Confira a revisão fiscal e a prévia antes de emitir.'));
  INSERT INTO private.nfse_preparation_batches(id,actor_id,request_id,polo_id,environment,queue_month,
    payment_month,payload,response) VALUES(v_batch_id,v_actor,p_request_id,p_polo_id,p_environment,
    p_month,p_payment_month,v_payload,v_response);
  FOR v_document IN SELECT value FROM jsonb_array_elements(v_documents) LOOP
    INSERT INTO private.nfse_queue_documents(id,batch_id,polo_id,environment,queue_month,payment_month,
      candidate_id,student_id,class_id,model_id,model_version,amount,receipt_count,snapshot,created_by)
    VALUES((v_document->>'id')::uuid,v_batch_id,p_polo_id,p_environment,p_month,p_payment_month,
      v_document->>'candidateId',(v_document->>'studentId')::uuid,(v_document->>'classId')::uuid,
      p_model_id,p_model_version,(v_document->>'amount')::numeric,(v_document->>'receiptCount')::integer,
      v_document->'snapshot',v_actor);
    FOR v_receipt IN SELECT value FROM jsonb_array_elements(v_receipts)
      WHERE value->>'candidate_id' = v_document->>'candidateId' LOOP
      INSERT INTO private.nfse_receipt_reservations(environment,receipt_id,source_receivable_id,
        payment_event_id,document_id,amount) VALUES(p_environment,(v_receipt->>'receipt_id')::uuid,
        (v_receipt->>'source_receivable_id')::uuid,(v_receipt->>'payment_event_id')::uuid,
        (v_document->>'id')::uuid,(v_receipt->>'received_amount')::numeric);
    END LOOP;
  END LOOP;
  RETURN v_response;
END;
$function$;
CREATE OR REPLACE FUNCTION private.nfse_fiscal_review_basis(p_document_id uuid, p_model_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE v_q private.nfse_queue_documents%ROWTYPE; v_model private.nfse_models%ROWTYPE;
  v_config private.nfse_configurations%ROWTYPE; v_issuer jsonb; v_recipient jsonb; v_receipts jsonb;
  v_reservations jsonb; v_source_count integer; v_source_amount numeric(30,2); v_reserved_amount numeric(30,2); v_financing boolean;
  v_basis jsonb; v_issues text[]:='{}';
BEGIN
  SELECT * INTO STRICT v_q FROM private.nfse_queue_documents WHERE id=p_document_id;
  SELECT * INTO v_model FROM private.nfse_models WHERE id=p_model_id
    AND private.nfse_model_visible_to_polo(polo_id,v_q.polo_id,definition) AND environment=v_q.environment;
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
  IF coalesce(v_model.definition->>'modelType','') NOT IN ('ALUNO','AMBOS')
    OR v_model.definition->>'nationalServiceCode' IS DISTINCT FROM '080201'
    OR position('{{periodo}}' IN v_model.definition->>'serviceDescription')>0 THEN
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
CREATE OR REPLACE FUNCTION private.nfse_queue_operation_basis(p_kind text, p_id uuid, p_polo uuid, p_environment text, p_month text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE v_service private.nfse_partner_services%ROWTYPE; v_queue private.nfse_queue_documents%ROWTYPE;
  v_review private.nfse_fiscal_review_revisions%ROWTYPE; v_model private.nfse_models%ROWTYPE;
  v_cfg private.nfse_configurations%ROWTYPE; v_partner public.parceiros%ROWTYPE;
  v_recipient jsonb; v_source jsonb; v_issuer jsonb; v_facts jsonb; v_model_id uuid; v_partner_id uuid;
  v_title jsonb; v_model_version integer; v_amount numeric(30,2); v_service_date text; v_competence text; v_description text; v_basis jsonb; v_payment_date text;
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
    -- Checked again by CLAIM before dispatch, including an existing preview.
    v_payment_date:=private.nfse_academic_payment_reference(v_facts->'basis',v_queue.payment_month);
    IF v_review.definition->>'competenceDate' IS DISTINCT FROM v_payment_date
      OR v_review.definition->>'serviceDate' IS DISTINCT FROM v_payment_date THEN
      RAISE EXCEPTION 'Confirme uma nova revisão com a data do último pagamento do mês antes de emitir.' USING ERRCODE='40001'; END IF;
    v_model_id:=v_review.model_id; v_model_version:=v_review.model_version; v_partner_id:=v_queue.student_id;
    v_amount:=v_queue.amount; v_service_date:=v_review.definition->>'serviceDate'; v_competence:=v_review.definition->>'competenceDate';
    v_source:=jsonb_build_object('kind',p_kind,'id',p_id,'sourceAmount',v_amount::text,'preparation',to_jsonb(v_queue),
      'reviewId',v_review.id,'reviewRevision',v_review.revision,'reviewBasis',v_facts);
  END IF;
  SELECT * INTO v_model FROM private.nfse_models WHERE id=v_model_id AND private.nfse_model_visible_to_polo(polo_id,p_polo,definition) AND environment=p_environment;
  IF NOT FOUND OR v_model.version IS DISTINCT FROM v_model_version OR v_model.definition->'active' IS DISTINCT FROM 'true'::jsonb
    OR (p_kind='PARTNER_SERVICE' AND (v_service.model_snapshot-'id'-'version') IS DISTINCT FROM v_model.definition) THEN
    RAISE EXCEPTION 'O modelo da preparação mudou. Confira novamente a origem.' USING ERRCODE='40001'; END IF;
  IF (p_kind='ACADEMIC_QUEUE' AND coalesce(v_model.definition->>'modelType','') NOT IN ('ALUNO','AMBOS'))
    OR (p_kind='PARTNER_SERVICE' AND coalesce(v_model.definition->>'modelType','') NOT IN ('SERVICO','AMBOS')) THEN
    RAISE EXCEPTION 'O tipo do modelo não corresponde à origem. Escolha Alunos, Serviços ou Ambos conforme a origem e prepare novamente.' USING ERRCODE='22023'; END IF;
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


-- Explicit ACLs preserve least privilege even on a fresh database.
REVOKE ALL ON FUNCTION public.prepare_nfse_batch_secure(uuid,uuid,text,text,uuid,text[],uuid,integer,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.prepare_nfse_batch_secure(uuid,uuid,text,text,uuid,text[],uuid,integer,text) TO authenticated;
REVOKE ALL ON FUNCTION private.nfse_fiscal_review_basis(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.nfse_queue_operation_basis(text,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
