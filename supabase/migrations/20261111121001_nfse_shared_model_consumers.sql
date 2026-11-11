BEGIN;

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


CREATE OR REPLACE FUNCTION public.nfse_individual_operation_core_internal(p_actor_id uuid, p_context_key uuid, p_polo_id uuid, p_environment text, p_month text, p_request_id uuid, p_action text, p_preview_id uuid DEFAULT NULL::uuid, p_input jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '10s'
AS $function$
DECLARE v_row private.nfse_individual_operations%ROWTYPE; v_cfg private.nfse_configurations%ROWTYPE;
  v_cert private.nfse_certificates%ROWTYPE; v_model private.nfse_models%ROWTYPE; v_partner public.parceiros%ROWTYPE;
  v_issuer jsonb; v_recipient jsonb; v_snapshot jsonb; v_issuer_cnpj text; v_document text; v_dps text;
  v_dispatch boolean:=false; v_input jsonb; v_dates date[]; v_existing boolean;
BEGIN
  PERFORM private.authorize_nfse_individual_internal(p_actor_id,p_context_key,p_polo_id,p_environment,p_month);
  IF p_request_id IS NULL OR p_action IS NULL OR p_action NOT IN ('PREVIEW','READ_BY_REQUEST','READ','PREPARE','CLAIM','FINISH') THEN
    RAISE EXCEPTION 'Comando individual inválido.' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('nfse-individual:'||p_actor_id||':'||p_request_id,0));
  SELECT * INTO v_row FROM private.nfse_individual_operations WHERE actor_id=p_actor_id AND request_id=p_request_id FOR UPDATE;
  v_existing:=FOUND;
  IF v_existing AND (v_row.context_id IS DISTINCT FROM p_context_key OR v_row.polo_id IS DISTINCT FROM p_polo_id
    OR v_row.environment IS DISTINCT FROM p_environment OR v_row.month IS DISTINCT FROM p_month
    OR (p_preview_id IS NOT NULL AND v_row.id IS DISTINCT FROM p_preview_id)) THEN
    RAISE EXCEPTION 'Operação fora do contexto autorizado.' USING ERRCODE='42501'; END IF;
  IF p_action IN ('PREVIEW','READ_BY_REQUEST') THEN
    IF p_preview_id IS NOT NULL OR p_input IS NULL OR jsonb_typeof(p_input)<>'object' OR octet_length(p_input::text)>2500
      OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_input) key)
      IS DISTINCT FROM ARRAY['amount','competenceDate','modelId','modelVersion','partnerId','serviceDate']::text[] THEN
      RAISE EXCEPTION 'Prévia individual inválida.' USING ERRCODE='22023'; END IF;
    IF v_existing THEN
      IF v_row.command IS DISTINCT FROM p_input THEN RAISE EXCEPTION 'Requisição divergente.' USING ERRCODE='22023'; END IF;
      RETURN private.nfse_individual_projection(v_row);
    END IF;
    IF p_action='READ_BY_REQUEST' THEN RETURN NULL; END IF;
    IF jsonb_typeof(p_input->'amount') IS DISTINCT FROM 'string' OR coalesce(p_input->>'amount','') !~ '^(0|[1-9][0-9]{0,12})\.[0-9]{2}$' OR (p_input->>'amount')::numeric<=0 OR coalesce(p_input->>'modelVersion','') !~ '^[1-9][0-9]{0,8}$'
      OR coalesce(p_input->>'modelId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(p_input->>'partnerId','') !~ '^[0-9a-fA-F-]{36}$'
      OR coalesce(p_input->>'competenceDate','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
      OR coalesce(p_input->>'serviceDate','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' THEN
      RAISE EXCEPTION 'Valor ou datas da operação inválidos.' USING ERRCODE='22023'; END IF;
    v_dates:=ARRAY[(p_input->>'competenceDate')::date,(p_input->>'serviceDate')::date];
    IF v_dates[1]>(now() AT TIME ZONE 'America/Maceio')::date OR v_dates[2]>(now() AT TIME ZONE 'America/Maceio')::date THEN
      RAISE EXCEPTION 'Confirme datas já ocorridas.' USING ERRCODE='22023'; END IF;
    SELECT * INTO v_cfg FROM private.nfse_configurations WHERE polo_id=p_polo_id AND environment='PRODUCAO' FOR SHARE;
    SELECT * INTO v_cert FROM private.nfse_certificates WHERE polo_id=p_polo_id AND environment='PRODUCAO' FOR SHARE;
    v_issuer:=private.nfse_issuer_preparation_snapshot(p_polo_id);
    v_issuer_cnpj:=regexp_replace(coalesce(v_issuer->>'cnpj',''),'[^0-9]','','g');
    IF v_cfg.version IS NULL OR v_cfg.credential_polo_id IS DISTINCT FROM p_polo_id
      OR v_cfg.definition->>'portalAccess' IS DISTINCT FROM 'CERTIFICATE'
      OR v_cert.fingerprint IS NULL OR v_cert.not_before>now() OR v_cert.expires_at<=now()
      OR v_cert.cnpj IS DISTINCT FROM v_issuer_cnpj OR NOT private.nfse_review_valid_document(v_issuer_cnpj) THEN
      RAISE EXCEPTION 'Revise a configuração e o certificado de produção.' USING ERRCODE='22023'; END IF;
    SELECT * INTO v_model FROM private.nfse_models WHERE id=(p_input->>'modelId')::uuid AND private.nfse_model_visible_to_polo(polo_id,p_polo_id,definition)
      AND environment='PRODUCAO' FOR SHARE;
    IF v_model.id IS NULL OR v_model.version<>(p_input->>'modelVersion')::integer
      OR v_model.definition->'active' IS DISTINCT FROM 'true'::jsonb
      OR v_model.definition->>'nationalServiceCode' IS DISTINCT FROM '080201' THEN
      RAISE EXCEPTION 'Modelo de produção indisponível ou alterado.' USING ERRCODE='40001'; END IF;
    SELECT * INTO v_partner FROM public.parceiros p WHERE p.id=(p_input->>'partnerId')::uuid
      AND public.is_active_status(p.status) AND (p.polo_id=p_polo_id OR p_polo_id=ANY(coalesce(p.polo_ids,ARRAY[]::uuid[]))
        OR(p.polo_id IS NULL AND upper(btrim(p.tipo))<>'ALUNO')) FOR SHARE;
    v_document:=regexp_replace(coalesce(v_partner.cpf_cnpj,''),'[^0-9]','','g');
    IF v_partner.id IS NULL OR NOT private.nfse_review_valid_document(v_document)
      OR length(btrim(coalesce(v_partner.nome,''))) NOT BETWEEN 1 AND 150 THEN
      RAISE EXCEPTION 'Tomador ativo com documento válido obrigatório.' USING ERRCODE='22023'; END IF;
    v_recipient:=jsonb_build_object('partnerId',v_partner.id,'name',btrim(v_partner.nome),'document',v_document,
      'address',jsonb_build_object('street',v_partner.endereco,'number',v_partner.numero,'complement',v_partner.complemento,
        'district',v_partner.bairro,'city',v_partner.cidade,'state',v_partner.uf,'postalCode',v_partner.cep));
    v_snapshot:=jsonb_build_object('issuer',v_issuer,'configuration',v_cfg.definition,'recipient',v_recipient,
      'model',jsonb_build_object('id',v_model.id,'version',v_model.version,'definition',v_model.definition),'command',p_input);
    INSERT INTO private.nfse_individual_operations(actor_id,context_id,polo_id,environment,month,request_id,command,snapshot,
      configuration_version,certificate_fingerprint)
    VALUES(p_actor_id,p_context_key,p_polo_id,p_environment,p_month,p_request_id,p_input,v_snapshot,v_cfg.version,v_cert.fingerprint)
      RETURNING * INTO v_row;
    RETURN private.nfse_individual_projection(v_row);
  END IF;
  IF NOT v_existing OR p_preview_id IS NULL THEN RAISE EXCEPTION 'Operação não encontrada.' USING ERRCODE='42501'; END IF;
  v_issuer_cnpj:=regexp_replace(v_row.snapshot#>>'{issuer,cnpj}','[^0-9]','','g');
  v_dps:='DPS'||(v_row.snapshot#>>'{configuration,municipalityCode}')||'2'||v_issuer_cnpj||v_row.series||lpad(v_row.number::text,15,'0');
  IF p_action='READ' THEN
    IF p_input IS NOT NULL THEN RAISE EXCEPTION 'Payload não permitido.' USING ERRCODE='22023'; END IF;
  ELSIF p_action='PREPARE' THEN
    IF v_row.state<>'PREVIEWED' OR v_row.expires_at<=now() THEN
      RAISE EXCEPTION 'Prévia expirada ou já enviada.' USING ERRCODE='40001'; END IF;
    v_input:=p_input->'fiscalInput';
    IF p_input IS NULL OR jsonb_typeof(p_input)<>'object' OR octet_length(p_input::text)>4500000
      OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_input) key)
      IS DISTINCT FROM ARRAY['dpsId','fiscalInput','signedDpsXml']::text[]
      OR p_input->>'dpsId' IS DISTINCT FROM v_dps OR v_input->>'environment' IS DISTINCT FROM 'PRODUCAO'
      OR v_input->>'series' IS DISTINCT FROM v_row.series OR v_input->>'number' IS DISTINCT FROM v_row.number::text
      OR v_input->>'competence' IS DISTINCT FROM v_row.command->>'competenceDate'
      OR v_input->>'issuedAt' IS DISTINCT FROM to_char(v_row.created_at AT TIME ZONE 'America/Maceio','YYYY-MM-DD"T"HH24:MI:SS')||'-03:00'
      OR v_input#>>'{values,serviceAmount}' IS DISTINCT FROM v_row.command->>'amount'
      OR v_input#>>'{issuer,taxId,type}' IS DISTINCT FROM 'CNPJ'
      OR v_input#>>'{issuer,taxId,value}' IS DISTINCT FROM v_issuer_cnpj
      OR v_input#>>'{recipient,taxId,value}' IS DISTINCT FROM v_row.snapshot#>>'{recipient,document}'
      OR v_input#>>'{recipient,taxId,type}' IS DISTINCT FROM (CASE WHEN length(v_row.snapshot#>>'{recipient,document}')=11 THEN 'CPF' ELSE 'CNPJ' END)
      OR v_input#>>'{recipient,name}' IS DISTINCT FROM v_row.snapshot#>>'{recipient,name}'
      OR v_input#>>'{service,nationalTaxCode}' IS DISTINCT FROM v_row.snapshot#>>'{model,definition,nationalServiceCode}'
      OR v_input#>>'{service,description}' IS DISTINCT FROM (CASE WHEN v_row.snapshot ? 'source'
        THEN v_row.snapshot#>>'{source,serviceDescription}' ELSE private.render_nfse_model_description(
        v_row.snapshot#>>'{model,definition,serviceDescription}',left(v_row.command->>'competenceDate',7)) END)
      OR coalesce(v_input#>>'{service,complementaryInfo}','') IS DISTINCT FROM coalesce(v_row.snapshot#>>'{model,definition,complementaryInfo}','')
      OR v_input#>>'{service,nbs}' IS DISTINCT FROM v_row.snapshot#>>'{model,definition,nbsCode}'
      OR v_input#>>'{review,ibscbs}'='SYNTHETIC_PILOT_OMISSION'
      OR coalesce(p_input->>'signedDpsXml','') NOT LIKE '%<%DPS%' OR p_input->>'signedDpsXml' NOT LIKE '%Signature%'
      OR upper(p_input->>'signedDpsXml') LIKE '%<!DOCTYPE%' OR p_input->>'signedDpsXml' NOT LIKE '%'||v_dps||'%' THEN
      RAISE EXCEPTION 'DPS preparada divergente da revisão canônica.' USING ERRCODE='22023'; END IF;
    IF v_row.signed_dps_xml IS NOT NULL AND (v_row.signed_dps_xml IS DISTINCT FROM p_input->>'signedDpsXml'
      OR v_row.fiscal_input IS DISTINCT FROM v_input) THEN
      RAISE EXCEPTION 'DPS já preparada com outros bytes.' USING ERRCODE='40001'; END IF;
    UPDATE private.nfse_individual_operations SET dps_id=v_dps,fiscal_input=v_input,signed_dps_xml=p_input->>'signedDpsXml',updated_at=now()
      WHERE id=v_row.id RETURNING * INTO v_row;
  ELSIF p_action='CLAIM' THEN
    IF p_input IS NOT NULL THEN RAISE EXCEPTION 'Payload não permitido.' USING ERRCODE='22023'; END IF;
    IF v_row.state='PREVIEWED' THEN
      SELECT * INTO v_cfg FROM private.nfse_configurations WHERE polo_id=p_polo_id AND environment='PRODUCAO' FOR SHARE;
      SELECT * INTO v_cert FROM private.nfse_certificates WHERE polo_id=p_polo_id AND environment='PRODUCAO' FOR SHARE;
      SELECT * INTO v_model FROM private.nfse_models WHERE id=(v_row.command->>'modelId')::uuid AND environment=p_environment
        AND private.nfse_model_visible_to_polo(polo_id,p_polo_id,definition) FOR SHARE;
      IF v_model.id IS NULL OR v_row.expires_at<=now() OR v_row.signed_dps_xml IS NULL OR v_row.configuration_version IS DISTINCT FROM v_cfg.version
        OR v_row.certificate_fingerprint IS DISTINCT FROM v_cert.fingerprint OR v_cert.expires_at<=now() OR v_cert.not_before>now()
        OR v_model.version IS DISTINCT FROM (v_row.command->>'modelVersion')::integer
        OR v_model.definition IS DISTINCT FROM v_row.snapshot#>'{model,definition}' THEN
        RAISE EXCEPTION 'Revise novamente a configuração, o modelo e a prévia.' USING ERRCODE='40001'; END IF;
      UPDATE private.nfse_individual_operations SET state='PROCESSING',updated_at=now() WHERE id=v_row.id RETURNING * INTO v_row;
      v_dispatch:=true;
    END IF;
  ELSE
    IF p_input IS NULL OR jsonb_typeof(p_input)<>'object' OR octet_length(p_input::text)>4500000
      OR p_input->>'state' IS NULL OR p_input->>'state' NOT IN ('AUTHORIZED','REJECTED','AWAITING_CONFIRMATION','BLOCKED')
      OR p_input->>'dpsId' IS DISTINCT FROM v_dps OR length(coalesce(p_input->>'message','')) NOT BETWEEN 1 AND 500 THEN
      RAISE EXCEPTION 'Resultado de emissão inválido.' USING ERRCODE='22023'; END IF;
    IF v_row.state='AUTHORIZED' THEN
      IF v_row.result->>'accessKey' IS DISTINCT FROM p_input->>'accessKey' THEN
        RAISE EXCEPTION 'Autorização já preservada.' USING ERRCODE='40001'; END IF;
    ELSIF v_row.state IN ('PROCESSING','AWAITING_CONFIRMATION') THEN
      IF p_input->>'state'='AUTHORIZED' AND (coalesce(p_input->>'accessKey','') !~ '^[0-9]{50}$'
        OR coalesce(p_input->>'number','') !~ '^[0-9]+$' OR coalesce(p_input->>'authorizedXml','') NOT LIKE '%<%NFSe%'
        OR upper(p_input->>'authorizedXml') LIKE '%<!DOCTYPE%'
        OR p_input->>'authorizedXml' NOT LIKE '%'||(p_input->>'accessKey')||'%') THEN
        RAISE EXCEPTION 'Prova de autorização ausente.' USING ERRCODE='22023'; END IF;
      UPDATE private.nfse_individual_operations SET state=p_input->>'state',result=p_input-'authorizedXml'-'signedDpsXml',
        authorized_xml=CASE WHEN p_input->>'state'='AUTHORIZED' THEN p_input->>'authorizedXml' ELSE authorized_xml END,updated_at=now()
        WHERE id=v_row.id RETURNING * INTO v_row;
    ELSIF v_row.state IS DISTINCT FROM p_input->>'state' THEN
      RAISE EXCEPTION 'Transição de emissão inválida.' USING ERRCODE='40001'; END IF;
  END IF;
  RETURN private.nfse_individual_projection(v_row,v_dispatch);
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
  SELECT * INTO v_model FROM private.nfse_models WHERE id=v_model_id AND private.nfse_model_visible_to_polo(polo_id,p_polo,definition) AND environment=p_environment;
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


NOTIFY pgrst,'reload schema';
COMMIT;
