BEGIN;

-- Administrative archive of an already issued document. No transmission or financial event.
CREATE TABLE private.nfse_external_imports (
  request_id uuid PRIMARY KEY,
  operation_id uuid NOT NULL UNIQUE REFERENCES private.nfse_individual_operations(id),
  service_id uuid NOT NULL UNIQUE REFERENCES private.nfse_partner_services(id),
  polo_id uuid NOT NULL REFERENCES public.polos(id),
  model_id uuid NOT NULL REFERENCES private.nfse_models(id),
  partner_id uuid NOT NULL REFERENCES public.parceiros(id),
  access_key text NOT NULL UNIQUE CHECK(access_key ~ '^[0-9]{50}$'),
  xml_bytes bytea NOT NULL CHECK(octet_length(xml_bytes) BETWEEN 100 AND 4500000),
  pdf_bytes bytea NOT NULL CHECK(octet_length(pdf_bytes) BETWEEN 8 AND 15000000),
  xml_sha256 text NOT NULL CHECK(xml_sha256 ~ '^[0-9a-f]{64}$'),
  pdf_sha256 text NOT NULL CHECK(pdf_sha256 ~ '^[0-9a-f]{64}$'),
  facts jsonb NOT NULL,
  execution_identity text NOT NULL CHECK(execution_identity='MCP_ADMIN_USER_REQUEST'),
  imported_at timestamptz NOT NULL DEFAULT now(),
  CHECK(xml_sha256=encode(sha256(xml_bytes),'hex')),
  CHECK(pdf_sha256=encode(sha256(pdf_bytes),'hex'))
);
ALTER TABLE private.nfse_external_imports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.nfse_external_imports FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER nfse_external_import_immutable BEFORE UPDATE OR DELETE ON private.nfse_external_imports
  FOR EACH ROW EXECUTE FUNCTION private.reject_nfse_preparation_change();

CREATE FUNCTION private.nfse_external_document_facts(p_xml_bytes bytea)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $function$
DECLARE v_xml text; v_document xml; v_fact record; v_count integer; v_key text;
BEGIN
  IF p_xml_bytes IS NULL OR octet_length(p_xml_bytes) NOT BETWEEN 100 AND 4500000 THEN
    RAISE EXCEPTION 'Tamanho do XML inválido.' USING ERRCODE='22023'; END IF;
  v_xml:=convert_from(p_xml_bytes,'UTF8');
  IF upper(v_xml) LIKE '%<!DOCTYPE%' OR upper(v_xml) LIKE '%<!ENTITY%' THEN
    RAISE EXCEPTION 'Declarações externas não são permitidas.' USING ERRCODE='22023'; END IF;
  v_document:=xmlparse(document v_xml);
  SELECT count(*) INTO v_count FROM XMLTABLE(
    XMLNAMESPACES('http://www.sped.fazenda.gov.br/nfse' AS n),
    '/n:NFSe/n:infNFSe' PASSING v_document COLUMNS id text PATH '@Id') document;
  IF v_count<>1 THEN RAISE EXCEPTION 'Uma única NFS-e nacional é obrigatória.' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_fact FROM XMLTABLE(
    XMLNAMESPACES('http://www.sped.fazenda.gov.br/nfse' AS n),
    '/n:NFSe/n:infNFSe' PASSING v_document COLUMNS
    id text PATH '@Id', number text PATH 'n:nNFSe', status text PATH 'n:cStat',
    processed_at text PATH 'n:dhProc', issuer_document text PATH 'n:emit/n:CNPJ',
    issuer_name text PATH 'n:emit/n:xNome', liquid_amount text PATH 'n:valores/n:vLiq',
    environment text PATH 'n:DPS/n:infDPS/n:tpAmb', dps_id text PATH 'n:DPS/n:infDPS/@Id',
    dps_issued_at text PATH 'n:DPS/n:infDPS/n:dhEmi', series text PATH 'n:DPS/n:infDPS/n:serie',
    dps_number text PATH 'n:DPS/n:infDPS/n:nDPS', competence text PATH 'n:DPS/n:infDPS/n:dCompet',
    provider_document text PATH 'n:DPS/n:infDPS/n:prest/n:CNPJ',
    recipient_document text PATH 'n:DPS/n:infDPS/n:toma/n:CNPJ',
    recipient_name text PATH 'n:DPS/n:infDPS/n:toma/n:xNome',
    amount text PATH 'n:DPS/n:infDPS/n:valores/n:vServPrest/n:vServ',
    description text PATH 'n:DPS/n:infDPS/n:serv/n:cServ/n:xDescServ',
    national_code text PATH 'n:DPS/n:infDPS/n:serv/n:cServ/n:cTribNac',
    nbs_code text PATH 'n:DPS/n:infDPS/n:serv/n:cServ/n:cNBS',
    operation_indicator text PATH 'n:DPS/n:infDPS/n:IBSCBS/n:cIndOp') document;
  v_key:=substr(v_fact.id,4);
  IF coalesce(v_fact.id,'') !~ '^NFS[0-9]{50}$' OR v_fact.status IS DISTINCT FROM '100'
    OR v_fact.environment IS DISTINCT FROM '1' OR coalesce(v_fact.number,'') !~ '^[1-9][0-9]*$'
    OR coalesce(v_fact.issuer_document,'') !~ '^[0-9]{14}$'
    OR v_fact.issuer_document IS DISTINCT FROM v_fact.provider_document
    OR substr(v_key,10,14) IS DISTINCT FROM v_fact.issuer_document
    OR coalesce(v_fact.recipient_document,'') !~ '^[0-9]{14}$'
    OR coalesce(v_fact.processed_at,'') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T.*[+-][0-9]{2}:[0-9]{2}$'
    OR coalesce(v_fact.competence,'') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    OR coalesce(v_fact.amount,'') !~ '^[0-9]{1,12}[.][0-9]{2}$'
    OR coalesce(v_fact.liquid_amount,'') !~ '^[0-9]{1,12}[.][0-9]{2}$'
    OR v_fact.amount::numeric<=0 OR v_fact.liquid_amount::numeric<0
    OR length(coalesce(v_fact.description,'')) NOT BETWEEN 1 AND 2000
    OR length(coalesce(v_fact.recipient_name,'')) NOT BETWEEN 1 AND 150
    OR coalesce(v_fact.national_code,'') !~ '^[0-9]{6}$'
    OR coalesce(v_fact.nbs_code,'') !~ '^[0-9]{9}$' THEN
    RAISE EXCEPTION 'Identidade ou dados da NFS-e incompatíveis.' USING ERRCODE='22023'; END IF;
  PERFORM v_fact.processed_at::timestamptz,v_fact.competence::date;
  RETURN to_jsonb(v_fact)||jsonb_build_object('access_key',v_key,
    'emission_month',to_char(v_fact.processed_at::timestamptz AT TIME ZONE 'America/Maceio','YYYY-MM'),
    'signature_validation','NOT_PERFORMED');
END;
$function$;
REVOKE ALL ON FUNCTION private.nfse_external_document_facts(bytea) FROM PUBLIC,anon,authenticated,service_role;

-- Invoker rights and no application grants: only the administrative database channel may call this.
-- actor_id/context_id/created_by are the administrative request UUID, never a portal user's identity.
CREATE FUNCTION private.import_nfse_external_document(
  p_request_id uuid,p_polo_id uuid,p_model_id uuid,p_partner_id uuid,p_xml_bytes bytea,p_pdf_bytes bytea
) RETURNS jsonb LANGUAGE plpgsql SET search_path='' SET statement_timeout='15s' AS $function$
DECLARE
  v_facts jsonb; v_previous private.nfse_external_imports%ROWTYPE; v_model private.nfse_models%ROWTYPE;
  v_partner public.parceiros%ROWTYPE; v_cnpj text; v_xml_hash text; v_pdf_hash text;
  v_operation uuid:=gen_random_uuid(); v_service uuid:=gen_random_uuid(); v_snapshot jsonb; v_command jsonb;
BEGIN
  IF current_user NOT IN ('postgres','supabase_admin') OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'Canal administrativo obrigatório.' USING ERRCODE='42501'; END IF;
  IF NOT private.nfse_model_management_allowed(p_polo_id) THEN
    RAISE EXCEPTION 'Importação restrita à matriz ativa.' USING ERRCODE='42501'; END IF;
  v_facts:=private.nfse_external_document_facts(p_xml_bytes);
  IF p_pdf_bytes IS NULL OR octet_length(p_pdf_bytes) NOT BETWEEN 8 AND 15000000
    OR substring(p_pdf_bytes FROM 1 FOR 5)<>convert_to('%PDF-','UTF8') THEN
    RAISE EXCEPTION 'PDF original obrigatório.' USING ERRCODE='22023'; END IF;
  SELECT regexp_replace(cnpj,'[^0-9]','','g') INTO v_cnpj FROM public.polos WHERE id=p_polo_id;
  IF v_facts->>'issuer_document' IS DISTINCT FROM v_cnpj THEN
    RAISE EXCEPTION 'Prestador do XML difere da matriz.' USING ERRCODE='22023'; END IF;
  v_xml_hash:=encode(sha256(p_xml_bytes),'hex'); v_pdf_hash:=encode(sha256(p_pdf_bytes),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended('nfse-external-request:'||p_request_id,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('nfse-external-key:'||(v_facts->>'access_key'),0));
  IF (SELECT count(*) FROM private.nfse_external_imports
    WHERE request_id=p_request_id OR access_key=v_facts->>'access_key')>1 THEN
    RAISE EXCEPTION 'Solicitação e chave pertencem a documentos diferentes.' USING ERRCODE='40001'; END IF;
  SELECT * INTO v_previous FROM private.nfse_external_imports
    WHERE request_id=p_request_id OR access_key=v_facts->>'access_key';
  IF FOUND THEN
    IF v_previous.polo_id IS DISTINCT FROM p_polo_id OR v_previous.model_id IS DISTINCT FROM p_model_id
      OR v_previous.partner_id IS DISTINCT FROM p_partner_id OR v_previous.access_key IS DISTINCT FROM v_facts->>'access_key'
      OR v_previous.xml_sha256 IS DISTINCT FROM v_xml_hash OR v_previous.pdf_sha256 IS DISTINCT FROM v_pdf_hash THEN
      RAISE EXCEPTION 'A chave ou solicitação já possui outro documento imutável.' USING ERRCODE='40001'; END IF;
    RETURN jsonb_build_object('id',v_previous.operation_id,'serviceId',v_previous.service_id,
      'xmlSha256',v_xml_hash,'pdfSha256',v_pdf_hash,'imported',false);
  END IF;
  IF EXISTS(SELECT 1 FROM private.nfse_individual_operations WHERE result->>'accessKey'=v_facts->>'access_key') THEN
    RAISE EXCEPTION 'NFS-e já existente no sistema.' USING ERRCODE='23505'; END IF;
  SELECT * INTO v_model FROM private.nfse_models WHERE id=p_model_id AND polo_id=p_polo_id
    AND environment='PRODUCAO' AND definition->'active'='true'::jsonb FOR SHARE;
  IF NOT FOUND OR v_model.definition->>'nationalServiceCode' IS DISTINCT FROM v_facts->>'national_code'
    OR v_model.definition->>'nbsCode' IS DISTINCT FROM v_facts->>'nbs_code'
    OR v_model.definition->>'operationIndicatorCode' IS DISTINCT FROM v_facts->>'operation_indicator' THEN
    RAISE EXCEPTION 'Modelo incompatível com os códigos do XML.' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_partner FROM public.parceiros WHERE id=p_partner_id AND tipo='PJ'
    AND public.is_active_status(status) AND (polo_id=p_polo_id OR p_polo_id=ANY(coalesce(polo_ids,ARRAY[]::uuid[]))
      OR(polo_id IS NULL AND cardinality(coalesce(polo_ids,ARRAY[]::uuid[]))=0)) FOR SHARE;
  IF NOT FOUND OR regexp_replace(v_partner.cpf_cnpj,'[^0-9]','','g') IS DISTINCT FROM v_facts->>'recipient_document' THEN
    RAISE EXCEPTION 'Tomador cadastrado difere do XML.' USING ERRCODE='22023'; END IF;
  v_snapshot:=jsonb_build_object(
    'issuer',jsonb_build_object('cnpj',v_cnpj,'name',v_facts->>'issuer_name'),
    'recipient',jsonb_build_object('partnerId',p_partner_id,'document',v_facts->>'recipient_document','name',v_facts->>'recipient_name'),
    'model',jsonb_build_object('id',v_model.id,'version',v_model.version,'definition',v_model.definition),
    'serviceDate',v_facts->>'competence','competenceDate',v_facts->>'competence','serviceDescription',v_facts->>'description',
    'source',jsonb_build_object('kind','PARTNER_SERVICE','id',v_service,'sourceAmount',v_facts->>'amount',
      'serviceDescription',v_facts->>'description'),
    'externalImport',jsonb_build_object('executionIdentity','MCP_ADMIN_USER_REQUEST','requestId',p_request_id,
      'identitySemantics','ADMINISTRATIVE_REQUEST_UUID','xmlSha256',v_xml_hash,'pdfSha256',v_pdf_hash,
      'originalDpsId',v_facts->>'dps_id','originalDpsSeries',v_facts->>'series','originalDpsNumber',v_facts->>'dps_number',
      'signatureValidation','NOT_PERFORMED','fiscalTransmission',false));
  v_command:=jsonb_build_object('amount',v_facts->>'amount','modelId',p_model_id,'modelVersion',v_model.version,
    'partnerId',p_partner_id,'serviceDate',v_facts->>'competence','competenceDate',v_facts->>'competence');
  INSERT INTO private.nfse_partner_services(id,polo_id,environment,partner_id,model_id,service_date,
    service_description,amount,partner_snapshot,model_snapshot,receivable_id,receivable_action,created_by)
  VALUES(v_service,p_polo_id,'PRODUCAO',p_partner_id,p_model_id,(v_facts->>'competence')::date,
    v_facts->>'description',(v_facts->>'amount')::numeric,
    jsonb_build_object('name',v_facts->>'recipient_name','document',v_facts->>'recipient_document','type','PJ'),
    v_model.definition||jsonb_build_object('id',v_model.id,'version',v_model.version),NULL,'NONE',p_request_id);
  INSERT INTO private.nfse_individual_operations(id,actor_id,context_id,polo_id,environment,month,request_id,
    command,snapshot,configuration_version,certificate_fingerprint,state,result,authorized_xml)
  VALUES(v_operation,p_request_id,p_request_id,p_polo_id,'PRODUCAO',v_facts->>'emission_month',p_request_id,
    v_command,v_snapshot,0,'EXTERNAL_IMPORT','AUTHORIZED',jsonb_build_object('state','AUTHORIZED',
      'number',v_facts->>'number','accessKey',v_facts->>'access_key',
      'message','NFS-e emitida externamente e importada com XML e PDF originais.','origin','EXTERNAL_IMPORT'),
    convert_from(p_xml_bytes,'UTF8'));
  INSERT INTO private.nfse_external_imports(request_id,operation_id,service_id,polo_id,model_id,partner_id,
    access_key,xml_bytes,pdf_bytes,xml_sha256,pdf_sha256,facts,execution_identity)
  VALUES(p_request_id,v_operation,v_service,p_polo_id,p_model_id,p_partner_id,v_facts->>'access_key',
    p_xml_bytes,p_pdf_bytes,v_xml_hash,v_pdf_hash,v_facts,'MCP_ADMIN_USER_REQUEST');
  INSERT INTO private.nfse_queue_operation_links(source_kind,source_id,operation_id,basis,basis_fingerprint)
    VALUES('PARTNER_SERVICE',v_service,v_operation,v_snapshot,v_xml_hash);
  RETURN jsonb_build_object('id',v_operation,'serviceId',v_service,
    'xmlSha256',v_xml_hash,'pdfSha256',v_pdf_hash,'imported',true);
END;
$function$;
REVOKE ALL ON FUNCTION private.import_nfse_external_document(uuid,uuid,uuid,uuid,bytea,bytea)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.guard_nfse_external_operation() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $function$
DECLARE v_id uuid;
BEGIN
  v_id:=(CASE WHEN TG_TABLE_NAME='nfse_individual_operations' THEN to_jsonb(OLD)->>'id'
    ELSE to_jsonb(NEW)->>'operation_id' END)::uuid;
  IF EXISTS(SELECT 1 FROM private.nfse_external_imports WHERE operation_id=v_id) THEN
    RAISE EXCEPTION 'Documento externo importado é somente leitura; operação fiscal indisponível.' USING ERRCODE='55000'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.guard_nfse_external_operation() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER nfse_external_operation_readonly BEFORE UPDATE OR DELETE ON private.nfse_individual_operations
  FOR EACH ROW EXECUTE FUNCTION private.guard_nfse_external_operation();
CREATE TRIGGER nfse_external_cancellation_blocked BEFORE INSERT OR UPDATE ON private.nfse_individual_cancellations
  FOR EACH ROW EXECUTE FUNCTION private.guard_nfse_external_operation();

-- Suppress transmission/cancellation actions; the immutable document ID still enables XML/DANFSe downloads.
CREATE OR REPLACE FUNCTION private.nfse_operation_fields(p_kind text,p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $function$
  SELECT coalesce((SELECT CASE WHEN EXISTS(SELECT 1 FROM private.nfse_external_imports i WHERE i.operation_id=v.operation_id)
    THEN jsonb_build_object('operationId',NULL,'requestId',NULL,'cancelPreviewId',NULL,'sourceKind',NULL,'sourceId',NULL,
      'state',v.state,'number',v.number,'accessKey',v.access_key,'message',v.message)
    ELSE jsonb_build_object('operationId',operation_id,'requestId',request_id,'cancelPreviewId',cancel_preview_id,
      'sourceKind',source_kind,'sourceId',source_id,'state',state,'number',number,'accessKey',access_key,'message',message) END
    FROM private.nfse_operation_source_projection v WHERE source_kind=p_kind AND source_id=p_id),
    jsonb_build_object('operationId',NULL,'requestId',NULL,'cancelPreviewId',NULL,'sourceKind',p_kind,'sourceId',p_id,
      'state',NULL,'number',NULL,'accessKey',NULL,'message',NULL))
$function$;
REVOKE ALL ON FUNCTION private.nfse_operation_fields(text,uuid) FROM PUBLIC,anon,authenticated,service_role;

COMMENT ON TABLE private.nfse_external_imports IS
  'Immutable administrative import evidence, original UTF-8 XML and PDF bytes; no application access or financial events.';
NOTIFY pgrst,'reload schema';
COMMIT;
