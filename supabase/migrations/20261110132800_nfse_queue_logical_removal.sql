BEGIN;

-- Removing a preparation is an append-only event, never a fiscal cancellation.
-- Original documents, batches, reservations and financial records stay immutable.
CREATE TABLE private.nfse_queue_removal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  request_id uuid NOT NULL,
  polo_id uuid NOT NULL REFERENCES public.polos(id),
  environment text NOT NULL CHECK (environment IN ('HOMOLOGACAO','PRODUCAO')),
  queue_month text NOT NULL,
  payload jsonb NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(actor_id,request_id)
);
CREATE TABLE private.nfse_queue_removals (
  document_id uuid PRIMARY KEY REFERENCES private.nfse_queue_documents(id),
  removal_id uuid NOT NULL REFERENCES private.nfse_queue_removal_requests(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX nfse_queue_removals_request ON private.nfse_queue_removals(removal_id);
ALTER TABLE private.nfse_queue_removal_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.nfse_queue_removals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.nfse_queue_removal_requests,private.nfse_queue_removals
  FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER nfse_removal_request_immutable BEFORE UPDATE OR DELETE ON private.nfse_queue_removal_requests
  FOR EACH ROW EXECUTE FUNCTION private.reject_nfse_preparation_change();
CREATE TRIGGER nfse_removal_immutable BEFORE UPDATE OR DELETE ON private.nfse_queue_removals
  FOR EACH ROW EXECUTE FUNCTION private.reject_nfse_preparation_change();

-- Retain every historical claim. Only non-removed documents reserve receipts.
-- The insert guard serializes with both preparation and removal for this scope.
ALTER TABLE private.nfse_receipt_reservations DROP CONSTRAINT nfse_receipt_reservations_pkey;
ALTER TABLE private.nfse_receipt_reservations ADD PRIMARY KEY(environment,receipt_id,document_id);
CREATE FUNCTION private.guard_nfse_active_receipt_claim() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $function$
DECLARE v_document private.nfse_queue_documents%ROWTYPE;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'A reserva exige READ COMMITTED.' USING ERRCODE = '25001';
  END IF;
  SELECT * INTO STRICT v_document FROM private.nfse_queue_documents WHERE id = NEW.document_id;
  PERFORM pg_advisory_xact_lock(hashtextextended('nfse-academic-scope:' || v_document.polo_id::text || ':' || NEW.environment,0));
  IF v_document.environment IS DISTINCT FROM NEW.environment OR v_document.status <> 'PREPARADO'
    OR EXISTS (SELECT 1 FROM private.nfse_queue_removals WHERE document_id = NEW.document_id)
    OR EXISTS (SELECT 1 FROM private.nfse_receipt_reservations r
      WHERE r.environment = NEW.environment
        AND (r.receipt_id = NEW.receipt_id OR (r.source_receivable_id = NEW.source_receivable_id
          AND (r.payment_event_id IS NULL OR NEW.payment_event_id IS NULL)))
        AND NOT EXISTS (SELECT 1 FROM private.nfse_queue_removals x WHERE x.document_id = r.document_id)) THEN
    RAISE EXCEPTION 'Recebimento reservado ou preparação indisponível.' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.guard_nfse_active_receipt_claim() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER nfse_active_receipt_claim BEFORE INSERT ON private.nfse_receipt_reservations
  FOR EACH ROW EXECUTE FUNCTION private.guard_nfse_active_receipt_claim();

CREATE FUNCTION public.remove_nfse_queue_documents_secure(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,p_request_id uuid,p_document_ids uuid[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
SET statement_timeout = '15s' SET lock_timeout = '5s' AS $function$
DECLARE
  v_actor uuid := auth.uid(); v_ids uuid[]; v_payload jsonb; v_previous private.nfse_queue_removal_requests%ROWTYPE;
  v_id uuid := gen_random_uuid(); v_response jsonb; v_count integer; v_payment_months jsonb;
BEGIN
  -- No request lookup, including replay, may bypass current access checks.
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'A exclusão exige READ COMMITTED.' USING ERRCODE = '25001';
  END IF;
  IF p_request_id IS NULL OR p_document_ids IS NULL OR cardinality(p_document_ids) NOT BETWEEN 1 AND 100
    OR array_position(p_document_ids,NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Selecione de 1 a 100 preparações.' USING ERRCODE = '22023';
  END IF;
  v_ids := ARRAY(SELECT DISTINCT id FROM unnest(p_document_ids) d(id) ORDER BY 1);
  IF cardinality(v_ids) <> cardinality(p_document_ids) THEN
    RAISE EXCEPTION 'Seleção repetida.' USING ERRCODE = '22023';
  END IF;
  v_payload := jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,'environment',p_environment,
    'month',p_month,'documentIds',to_jsonb(v_ids));
  PERFORM pg_advisory_xact_lock(hashtextextended('nfse-queue-remove:' || v_actor::text || ':' || p_request_id::text,0));
  SELECT * INTO v_previous FROM private.nfse_queue_removal_requests WHERE actor_id = v_actor AND request_id = p_request_id;
  IF FOUND THEN
    IF v_previous.payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'Tentativa já utilizada com outra seleção.' USING ERRCODE = '22023';
    END IF;
    RETURN v_previous.response;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('nfse-academic-scope:' || p_polo_id::text || ':' || p_environment,0));
  -- Row locks also fence future status writers. A mixed/stale batch is rejected in full.
  PERFORM 1 FROM private.nfse_queue_documents WHERE id = ANY(v_ids) AND polo_id = p_polo_id
    AND environment = p_environment AND queue_month = p_month ORDER BY id FOR UPDATE;
  SELECT count(*) INTO v_count FROM private.nfse_queue_documents q
    WHERE q.id = ANY(v_ids) AND q.polo_id = p_polo_id AND q.environment = p_environment
      AND q.queue_month = p_month AND q.status = 'PREPARADO'
      AND q.snapshot #>> '{fiscalReadiness,ready}' = 'false'
      AND NOT EXISTS (SELECT 1 FROM private.nfse_queue_removals x WHERE x.document_id = q.id);
  IF v_count <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'A seleção mudou ou não contém apenas preparações disponíveis. Nenhum documento foi excluído.' USING ERRCODE = '40001';
  END IF;
  SELECT jsonb_agg(payment_month ORDER BY payment_month) INTO v_payment_months
    FROM (SELECT DISTINCT payment_month FROM private.nfse_queue_documents WHERE id = ANY(v_ids)) months;
  v_response := jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,
    'poloId',p_polo_id,'environment',p_environment,'month',p_month),'data',jsonb_build_object(
    'id',v_id,'documentIds',to_jsonb(v_ids),'removedCount',v_count,'paymentMonths',v_payment_months,
    'message','Preparações excluídas da fila. Recebimentos preservados e disponíveis para nova preparação.'));
  INSERT INTO private.nfse_queue_removal_requests(id,actor_id,request_id,polo_id,environment,queue_month,payload,response)
    VALUES(v_id,v_actor,p_request_id,p_polo_id,p_environment,p_month,v_payload,v_response);
  INSERT INTO private.nfse_queue_removals(document_id,removal_id) SELECT unnest(v_ids),v_id;
  RETURN v_response;
END;
$function$;
REVOKE ALL ON FUNCTION public.remove_nfse_queue_documents_secure(uuid,uuid,text,text,uuid,uuid[])
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.remove_nfse_queue_documents_secure(uuid,uuid,text,text,uuid,uuid[]) TO authenticated;
COMMENT ON FUNCTION public.remove_nfse_queue_documents_secure(uuid,uuid,text,text,uuid,uuid[]) IS
  'Atomic, idempotent logical removal of unissued academic preparations only. Preserves original snapshots and payments; no fiscal cancellation or external dispatch.';


CREATE OR REPLACE FUNCTION public.prepare_nfse_batch_secure(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,p_request_id uuid,
  p_candidate_ids text[],p_model_id uuid,p_model_version integer,p_payment_month text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
SET statement_timeout = '30s' SET lock_timeout = '5s' AS $function$
DECLARE
  v_actor uuid := auth.uid(); v_ids text[]; v_sources uuid[]; v_locked_sources uuid[];
  v_payload jsonb; v_previous private.nfse_preparation_batches%ROWTYPE;
  v_model private.nfse_models%ROWTYPE; v_receipts jsonb; v_selection jsonb; v_documents jsonb := '[]';
  v_issuer jsonb; v_recipient jsonb; v_snapshot jsonb; v_document jsonb; v_receipt jsonb;
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
  SELECT * INTO v_model FROM private.nfse_models WHERE id = p_model_id AND polo_id = p_polo_id
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
    SELECT jsonb_build_object('version',1,'issuer',v_issuer,'recipient',v_recipient,
      'academic',jsonb_build_object('candidateId',v_candidate.candidate_id,'classId',class.id,
        'classLabel',concat_ws(' · ',class.codigo,class.nome),'courseId',course.id,'courseName',course.nome,
        'courseType',course.modalidade),
      'model',v_model.definition || jsonb_build_object('id',v_model.id,'version',v_model.version),
      'service',v_model.definition || jsonb_build_object('description',
        private.render_nfse_model_description(v_model.definition->>'serviceDescription',p_payment_month),
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
    'message','Preparação salva na fila. A emissão fiscal continua desabilitada.'));
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
REVOKE ALL ON FUNCTION public.prepare_nfse_batch_secure(uuid,uuid,text,text,uuid,text[],uuid,integer,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.prepare_nfse_batch_secure(uuid,uuid,text,text,uuid,text[],uuid,integer,text) TO authenticated;
COMMENT ON FUNCTION public.prepare_nfse_batch_secure(uuid,uuid,text,text,uuid,text[],uuid,integer,text) IS
  'Pilot-scoped atomic academic queue preparation. Exact replay, immutable snapshots and environment-isolated receipt claims. Never changes payments, reserves DPS numbers or transmits.';


CREATE OR REPLACE FUNCTION public.get_nfse_queue_secure(
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
    FROM private.nfse_queue_documents q WHERE polo_id = p_polo_id AND environment = p_environment AND queue_month = p_month
      AND q.status = 'PREPARADO' AND NOT EXISTS (SELECT 1 FROM private.nfse_queue_removals x WHERE x.document_id = q.id);
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',q.id,'batchId',q.batch_id,'studentId',q.student_id,
    'studentName',q.snapshot #>> '{recipient,name}','classId',q.class_id,
    'classLabel',q.snapshot #>> '{academic,classLabel}','amount',q.amount::text,
    'modelLabel',q.snapshot #>> '{model,name}','status',q.status,'receiptCount',q.receipt_count,
    'paymentMonth',q.payment_month,'createdAt',q.created_at,
    'blockingReasons',q.snapshot #> '{fiscalReadiness,blockingReasons}') ORDER BY q.created_at DESC,q.id),'[]') INTO v_rows
  FROM (SELECT * FROM private.nfse_queue_documents q WHERE polo_id = p_polo_id AND environment = p_environment
    AND queue_month = p_month AND q.status = 'PREPARADO'
    AND NOT EXISTS (SELECT 1 FROM private.nfse_queue_removals x WHERE x.document_id = q.id) ORDER BY created_at DESC,id LIMIT p_page_size OFFSET (p_page::bigint - 1) * p_page_size) q;
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
