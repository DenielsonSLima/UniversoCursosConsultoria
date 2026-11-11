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
    WHERE NOT EXISTS (SELECT 1 FROM private.nfse_queue_removals removed WHERE removed.document_id = reservation.document_id)) THEN
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


CREATE OR REPLACE FUNCTION public.save_nfse_fiscal_review_secure(p_context_key uuid, p_polo_id uuid, p_environment text, p_month text, p_document_id uuid, p_request_id uuid, p_expected_revision integer, p_basis_token text, p_definition jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '15s'
 SET lock_timeout TO '5s'
AS $function$
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
  PERFORM 1 FROM private.nfse_models WHERE id=v_model AND private.nfse_model_visible_to_polo(polo_id,p_polo_id,definition) AND environment=p_environment FOR SHARE;
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


CREATE OR REPLACE FUNCTION public.save_nfse_partner_service_secure(p_context_key uuid, p_polo_id uuid, p_environment text, p_month text, p_request_id uuid, p_definition jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '15s'
 SET lock_timeout TO '5s'
AS $function$
DECLARE
  v_input jsonb; v_payload jsonb; v_previous private.nfse_partner_service_requests%ROWTYPE;
  v_partner public.parceiros%ROWTYPE; v_model private.nfse_models%ROWTYPE;
  v_receivable public.contas_receber%ROWTYPE; v_receivable_id uuid; v_action text := 'NONE';
  v_id uuid := gen_random_uuid(); v_response jsonb; v_generate boolean;
BEGIN
  -- Current pilot/context/polo and financial permissions precede every replay lookup.
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  v_input := private.normalize_nfse_partner_service(p_definition);
  v_generate := (v_input->>'generateReceivable')::boolean;
  IF v_generate THEN PERFORM internal_finance.authorize_other_credit_plan(p_polo_id,true); END IF;
  IF p_request_id IS NULL OR left(v_input->>'serviceDate',7) IS DISTINCT FROM p_month THEN
    RAISE EXCEPTION 'Informe a tentativa e a data dentro do mês de referência.' USING ERRCODE = '22023';
  END IF;
  v_payload := jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,
    'environment',p_environment,'month',p_month,'definition',v_input);
  PERFORM pg_advisory_xact_lock(hashtextextended('nfse-partner-request:' || auth.uid()::text || ':' || p_request_id::text,0));
  SELECT * INTO v_previous FROM private.nfse_partner_service_requests
    WHERE actor_id = auth.uid() AND request_id = p_request_id;
  IF FOUND THEN
    IF v_previous.payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'Esta tentativa pertence a outro serviço. Reabra o cadastro para alterar os dados.' USING ERRCODE = '22023';
    END IF;
    RETURN v_previous.response;
  END IF;
  -- Serialize title checks/creation for this payer, including across fiscal environments.
  PERFORM pg_advisory_xact_lock(hashtextextended('nfse-partner-payer:' || p_polo_id::text || ':' || (v_input->>'partnerId'),0));
  SELECT * INTO v_partner FROM public.parceiros p WHERE p.id = (v_input->>'partnerId')::uuid
    AND upper(btrim(p.tipo)) IN ('PF','PJ','ALUNO') AND public.is_active_status(p.status)
    AND ((p.polo_id IS NULL AND cardinality(coalesce(p.polo_ids,ARRAY[]::uuid[])) = 0 AND upper(btrim(p.tipo))<>'ALUNO')
      OR p.polo_id = p_polo_id OR p_polo_id = ANY(coalesce(p.polo_ids,ARRAY[]::uuid[]))) FOR SHARE;
  IF NOT FOUND OR NOT private.nfse_review_valid_document(v_partner.cpf_cnpj) THEN
    RAISE EXCEPTION 'Parceiro ativo com documento válido indisponível neste polo.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_model FROM private.nfse_models m WHERE m.id = (v_input->>'modelId')::uuid
    AND private.nfse_model_visible_to_polo(m.polo_id,p_polo_id,m.definition) AND m.environment = p_environment
    AND m.version = (v_input->>'modelVersion')::integer AND (m.definition->>'active')::boolean FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'O modelo foi alterado ou está indisponível. Atualize os modelos.' USING ERRCODE = '40001';
  END IF;
  IF v_generate AND v_input->>'existingReceivableId' IS NOT NULL THEN
    SELECT * INTO v_receivable FROM public.contas_receber c
      WHERE c.id = (v_input->>'existingReceivableId')::uuid AND c.polo_id = p_polo_id
        AND c.cliente_id = v_partner.id FOR UPDATE;
    IF NOT FOUND OR NOT EXISTS (
      SELECT 1 FROM private.nfse_partner_linkable_receivables c WHERE c.id = v_receivable.id
    ) OR v_receivable.valor IS DISTINCT FROM (v_input->>'amount')::numeric THEN
      RAISE EXCEPTION 'Conta indisponível, já vinculada ou com valor diferente. Atualize a seleção.' USING ERRCODE = '22023';
    END IF;
    v_receivable_id := v_receivable.id;
    v_action := 'LINKED';
  ELSIF v_generate THEN
    PERFORM internal_finance.validate_other_credit_plan_references(p_polo_id,jsonb_build_object(
      'clienteId',v_partner.id,'categoriaFinanceiraId',v_input->>'categoryId'));
    -- Never silently recreate a matching canonical title. The user must choose the existing one.
    IF EXISTS (SELECT 1 FROM public.contas_receber c WHERE c.polo_id = p_polo_id
      AND c.cliente_id = v_partner.id AND c.categoria = 'OUTROS_CREDITOS'
      AND c.status IN ('PENDENTE','VENCIDO','PAGO') AND c.valor = (v_input->>'amount')::numeric
      AND c.data_vencimento = (v_input->>'dueDate')::date
      AND btrim(c.descricao) = v_input->>'serviceDescription') THEN
      RAISE EXCEPTION 'Já existe uma conta com estes dados. Vincule a conta existente.' USING ERRCODE = '23505';
    END IF;
    v_receivable_id := gen_random_uuid();
    INSERT INTO public.contas_receber(id,polo_id,cliente_id,descricao,valor,data_vencimento,
      status,categoria,categoria_financeira_id,tipo_lancamento,origem_pagamento)
    VALUES(v_receivable_id,p_polo_id,v_partner.id,v_input->>'serviceDescription',
      (v_input->>'amount')::numeric,(v_input->>'dueDate')::date,'PENDENTE','OUTROS_CREDITOS',
      (v_input->>'categoryId')::uuid,'OUTRO_CREDITO','LOCAL');
    v_action := 'CREATED';
    -- Existing canonical audit/Realtime triggers run. No payment/gateway fields are supplied.
  END IF;
  INSERT INTO private.nfse_partner_services(id,polo_id,environment,partner_id,model_id,service_date,
    service_description,amount,partner_snapshot,model_snapshot,receivable_id,receivable_action,created_by)
  VALUES(v_id,p_polo_id,p_environment,v_partner.id,v_model.id,(v_input->>'serviceDate')::date,
    v_input->>'serviceDescription',(v_input->>'amount')::numeric,
    jsonb_build_object('name',v_partner.nome,'tradeName',v_partner.nome_fantasia,
      'document',v_partner.cpf_cnpj,'type',v_partner.tipo),
    v_model.definition || jsonb_build_object('id',v_model.id,'version',v_model.version),
    v_receivable_id,v_action,auth.uid());
  v_response := jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,
    'poloId',p_polo_id,'environment',p_environment,'month',p_month),'data',jsonb_build_object(
    'id',v_id,'receivableId',v_receivable_id,'receivableAction',v_action,'message',CASE v_action
      WHEN 'CREATED' THEN 'Serviço salvo e conta a receber criada.'
      WHEN 'LINKED' THEN 'Serviço salvo com a conta existente vinculada.' ELSE 'Serviço salvo.' END));
  INSERT INTO private.nfse_partner_service_requests(actor_id,request_id,payload,response)
    VALUES(auth.uid(),p_request_id,v_payload,v_response);
  RETURN v_response;
END;
$function$;


NOTIFY pgrst,'reload schema';
COMMIT;
