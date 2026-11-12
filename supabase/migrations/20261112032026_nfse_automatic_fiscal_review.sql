BEGIN;
-- Canonical validation is a system fact, never a fabricated human attestation.
-- Existing manual revisions, preparation snapshots, payments and fiscal leases remain immutable.
CREATE FUNCTION private.validate_nfse_queue_fiscal_review(
  p_actor_id uuid,p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,
  p_document_id uuid,p_request_id uuid,p_model_id uuid DEFAULT NULL,p_model_version integer DEFAULT NULL,
  p_expected_revision integer DEFAULT NULL,p_basis_token text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $function$
DECLARE v_q private.nfse_queue_documents%ROWTYPE; v_previous private.nfse_fiscal_review_revisions%ROWTYPE;
  v_latest private.nfse_fiscal_review_revisions%ROWTYPE; v_model private.nfse_models%ROWTYPE;
  v_intent jsonb; v_facts jsonb; v_basis jsonb; v_definition jsonb; v_response jsonb; v_source uuid;
  v_model_id uuid; v_model_version integer; v_date text; v_revision integer; v_id uuid:=gen_random_uuid();
  v_editor boolean:=p_model_id IS NOT NULL; v_linked_preview boolean;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'A validação exige READ COMMITTED.' USING ERRCODE='25001'; END IF;
  IF p_actor_id IS NULL OR p_request_id IS NULL OR p_document_id IS NULL
    OR(p_model_id IS NULL)<>(p_model_version IS NULL)
    OR(v_editor AND(p_expected_revision IS NULL OR p_expected_revision<0 OR p_model_version<1
      OR coalesce(p_basis_token,'') !~ '^[0-9a-f]{64}$')) THEN
    RAISE EXCEPTION 'Seleção fiscal inválida.' USING ERRCODE='22023'; END IF;
  v_intent:=jsonb_build_object('source','SYSTEM_VALIDATED','contextKey',p_context_key,'poloId',p_polo_id,
    'environment',p_environment,'month',p_month,'documentId',p_document_id,'modelId',p_model_id,
    'modelVersion',p_model_version,'expectedRevision',p_expected_revision,'basisToken',p_basis_token);
  PERFORM pg_advisory_xact_lock(hashtextextended('nfse-fiscal-review-request:'||p_actor_id||':'||p_request_id,0));
  SELECT * INTO v_previous FROM private.nfse_fiscal_review_revisions
    WHERE actor_id=p_actor_id AND request_id=p_request_id;
  IF FOUND THEN
    IF v_previous.payload->'validationIntent' IS DISTINCT FROM v_intent THEN
      RAISE EXCEPTION 'Solicitação já utilizada com outros dados.' USING ERRCODE='22023'; END IF;
    RETURN v_previous.response;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('nfse-academic-scope:'||p_polo_id||':'||p_environment,0));
  SELECT * INTO v_q FROM private.nfse_queue_documents WHERE id=p_document_id
    AND polo_id=p_polo_id AND environment=p_environment AND queue_month=p_month FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Preparação fora do contexto autorizado.' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_latest FROM private.nfse_fiscal_review_revisions
    WHERE document_id=v_q.id ORDER BY revision DESC LIMIT 1;
  v_revision:=coalesce(v_latest.revision,0);
  IF v_editor AND v_revision<>p_expected_revision THEN
    RAISE EXCEPTION 'Os ajustes mudaram. Atualize antes de salvar.' USING ERRCODE='40001'; END IF;
  v_model_id:=coalesce(p_model_id,v_latest.model_id,v_q.model_id);
  v_model_version:=coalesce(p_model_version,v_latest.model_version,v_q.model_version);
  PERFORM 1 FROM private.nfse_configurations WHERE polo_id=p_polo_id AND environment=p_environment FOR SHARE;
  PERFORM 1 FROM public.polos WHERE id=p_polo_id FOR SHARE;
  PERFORM 1 FROM public.parceiros WHERE id=v_q.student_id FOR SHARE;
  SELECT * INTO v_model FROM private.nfse_models WHERE id=v_model_id AND environment=p_environment
    AND private.nfse_model_visible_to_polo(polo_id,p_polo_id,definition) FOR SHARE;
  IF v_model.id IS NULL OR v_model.version IS DISTINCT FROM v_model_version THEN
    RAISE EXCEPTION 'O modelo selecionado mudou. Atualize a preparação.' USING ERRCODE='40001'; END IF;
  FOR v_source IN SELECT DISTINCT source_receivable_id FROM private.nfse_receipt_reservations
    WHERE document_id=v_q.id AND environment=p_environment ORDER BY source_receivable_id LOOP
    PERFORM 1 FROM public.contas_receber WHERE id=v_source AND polo_id=p_polo_id FOR SHARE;
  END LOOP;
  PERFORM 1 FROM public.financial_payment_events WHERE source_kind='RECEIVABLE'
    AND source_id IN(SELECT source_receivable_id FROM private.nfse_receipt_reservations WHERE document_id=v_q.id)
    ORDER BY id FOR SHARE;
  -- Fresh canonical facts after the same source locks used by review and CLAIM.
  v_facts:=private.nfse_fiscal_review_basis(v_q.id,v_model_id); v_basis:=v_facts->'basis';
  IF v_facts->'issues' IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'Há pendências cadastrais ou de recebimentos nesta preparação.' USING ERRCODE='22023'; END IF;
  IF v_editor AND v_facts->>'token' IS DISTINCT FROM p_basis_token THEN
    RAISE EXCEPTION 'Os dados mudaram. Atualize os ajustes fiscais.' USING ERRCODE='40001'; END IF;
  -- Preserve the existing academic rule: latest actual reserved payment day.
  -- This is not the issue clock and never the first/last day inferred from a month.
  v_date:=private.nfse_academic_payment_reference(v_basis,v_q.payment_month);
  IF v_date::date>(now() AT TIME ZONE 'America/Maceio')::date THEN
    RAISE EXCEPTION 'A data fiscal deve corresponder a pagamento já ocorrido.' USING ERRCODE='22023'; END IF;
  IF NOT v_editor AND v_latest.id IS NOT NULL
    AND v_latest.basis_fingerprint IS NOT DISTINCT FROM v_facts->>'token'
    AND v_latest.definition->>'competenceDate' IS NOT DISTINCT FROM v_date
    AND v_latest.definition->>'serviceDate' IS NOT DISTINCT FROM v_date THEN
    RETURN v_latest.response;
  END IF;
  IF EXISTS(SELECT 1 FROM private.nfse_queue_operation_links l JOIN private.nfse_individual_operations o ON o.id=l.operation_id
    WHERE l.source_kind='ACADEMIC_QUEUE' AND l.source_id=v_q.id AND o.state<>'PREVIEWED') THEN
    RAISE EXCEPTION 'A operação já foi enviada. Consulte o resultado fiscal preservado.' USING ERRCODE='55000'; END IF;
  v_linked_preview:=EXISTS(SELECT 1 FROM private.nfse_queue_operation_links l JOIN private.nfse_individual_operations o ON o.id=l.operation_id
    WHERE l.source_kind='ACADEMIC_QUEUE' AND l.source_id=v_q.id AND o.state='PREVIEWED');
  v_definition:=jsonb_build_object('modelId',v_model.id,'modelVersion',v_model.version,
    'recipient',jsonb_build_object('mode','STUDENT','source','SELECTED_PREPARATION'),
    'competenceDate',v_date,'serviceDate',v_date,'validation',jsonb_build_object('version',1,
      'source','SYSTEM_VALIDATED','selectionSource',CASE WHEN v_editor THEN 'OPTIONAL_EDITOR' ELSE 'PREPARATION' END,
      'humanConfirmed',false));
  v_response:=jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,
    'environment',p_environment,'month',p_month),'data',jsonb_build_object('documentId',v_q.id,'reviewId',v_id,
    'revision',v_revision+1,'message',CASE WHEN v_linked_preview
      THEN 'Ajustes salvos. A prévia anterior foi preservada e será bloqueada para envio. Retire a preparação ainda não transmitida e prepare novamente para usar os ajustes.'
      ELSE 'Dados fiscais validados pelos cadastros e recebimentos. Nenhuma nota foi enviada.' END));
  INSERT INTO private.nfse_fiscal_review_revisions(id,document_id,revision,actor_id,context_id,request_id,
    polo_id,environment,queue_month,model_id,model_version,configuration_version,basis_fingerprint,basis,definition,payload,response)
  VALUES(v_id,v_q.id,v_revision+1,p_actor_id,p_context_key,p_request_id,p_polo_id,p_environment,p_month,v_model.id,
    v_model.version,(v_basis#>>'{issuer,configurationVersion}')::integer,v_facts->>'token',v_basis,v_definition,
    jsonb_build_object('validationIntent',v_intent,'basisToken',v_facts->>'token','definition',v_definition),v_response);
  RETURN v_response;
END;
$function$;
REVOKE ALL ON FUNCTION private.validate_nfse_queue_fiscal_review(uuid,uuid,uuid,text,text,uuid,uuid,uuid,integer,integer,text)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.validate_nfse_fiscal_review_secure(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,p_document_id uuid,p_request_id uuid,
  p_expected_revision integer,p_basis_token text,p_model_id uuid,p_model_version integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET statement_timeout='15s' SET lock_timeout='5s' AS $function$
BEGIN
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  IF p_model_id IS NULL THEN RAISE EXCEPTION 'Selecione o modelo dos ajustes.' USING ERRCODE='22023'; END IF;
  RETURN private.validate_nfse_queue_fiscal_review(auth.uid(),p_context_key,p_polo_id,p_environment,p_month,
    p_document_id,p_request_id,p_model_id,p_model_version,p_expected_revision,p_basis_token);
END;
$function$;
REVOKE ALL ON FUNCTION public.validate_nfse_fiscal_review_secure(uuid,uuid,text,text,uuid,uuid,integer,text,uuid,integer)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.validate_nfse_fiscal_review_secure(uuid,uuid,text,text,uuid,uuid,integer,text,uuid,integer) TO authenticated;

ALTER FUNCTION public.get_nfse_fiscal_review_secure(uuid,uuid,text,text,uuid,uuid) RENAME TO get_nfse_fiscal_review_core_20261112;
REVOKE ALL ON FUNCTION public.get_nfse_fiscal_review_core_20261112(uuid,uuid,text,text,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.get_nfse_fiscal_review_secure(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,p_document_id uuid,p_model_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET statement_timeout='8s' AS $function$
DECLARE v_response jsonb; v_review private.nfse_fiscal_review_revisions%ROWTYPE; v_source text;
BEGIN
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  v_response:=public.get_nfse_fiscal_review_core_20261112(p_context_key,p_polo_id,p_environment,p_month,p_document_id,p_model_id);
  SELECT * INTO v_review FROM private.nfse_fiscal_review_revisions WHERE document_id=p_document_id ORDER BY revision DESC LIMIT 1;
  v_source:=CASE WHEN v_review.id IS NULL THEN NULL
    WHEN v_review.definition#>>'{validation,source}'='SYSTEM_VALIDATED' THEN 'SYSTEM_VALIDATED' ELSE 'MANUAL' END;
  v_response:=jsonb_set(v_response,'{data}',(v_response->'data')||jsonb_build_object('validationSource',v_source));
  IF v_source='SYSTEM_VALIDATED' THEN
    v_response:=jsonb_set(v_response,'{data,recipient,confirmed}','false');
    v_response:=jsonb_set(v_response,'{data,checks}',coalesce((SELECT jsonb_agg(CASE WHEN item->>'code'='REVIEW_CONFIRMED'
      THEN item||jsonb_build_object('message','Dados validados automaticamente pelos cadastros e recebimentos; sem confirmação humana presumida.')
      ELSE item END ORDER BY n) FROM jsonb_array_elements(v_response#>'{data,checks}') WITH ORDINALITY x(item,n)),'[]'::jsonb));
  END IF;
  -- These old placeholders requested manual attestations. Missing facts and
  -- stale sources keep their real blockers; normal validation occurs at preview.
  v_response:=jsonb_set(v_response,'{data,checks}',coalesce((SELECT jsonb_agg(item ORDER BY n)
    FROM jsonb_array_elements(v_response#>'{data,checks}') WITH ORDINALITY x(item,n)
    WHERE item->>'code' NOT IN('RECIPIENT_CONFIRMATION_REQUIRED','COMPETENCE_REQUIRED','SERVICE_DATE_REQUIRED')),'[]'::jsonb));
  RETURN v_response;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_nfse_fiscal_review_secure(uuid,uuid,text,text,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_nfse_fiscal_review_secure(uuid,uuid,text,text,uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
