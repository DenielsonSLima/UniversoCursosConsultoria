BEGIN;
CREATE FUNCTION public.nfse_individual_operation_internal(
  p_actor_id uuid,p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,
  p_request_id uuid,p_action text,p_preview_id uuid DEFAULT NULL,p_input jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET statement_timeout='10s' AS $function$
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
    IF p_input->>'amount' IS DISTINCT FROM '1.00' OR coalesce(p_input->>'modelVersion','') !~ '^[1-9][0-9]{0,8}$'
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
    SELECT * INTO v_model FROM private.nfse_models WHERE id=(p_input->>'modelId')::uuid AND polo_id=p_polo_id
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
      OR v_input#>>'{service,description}' IS DISTINCT FROM private.render_nfse_model_description(
        v_row.snapshot#>>'{model,definition,serviceDescription}',left(v_row.command->>'competenceDate',7))
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
      SELECT * INTO v_model FROM private.nfse_models WHERE id=(v_row.command->>'modelId')::uuid FOR SHARE;
      IF v_row.expires_at<=now() OR v_row.signed_dps_xml IS NULL OR v_row.configuration_version IS DISTINCT FROM v_cfg.version
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
REVOKE ALL ON FUNCTION public.nfse_individual_operation_internal(uuid,uuid,uuid,text,text,uuid,text,uuid,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.nfse_individual_operation_internal(uuid,uuid,uuid,text,text,uuid,text,uuid,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
