BEGIN;
-- Derived from current live queue prepare, including model-driven service competence.
-- Auth/replay/source locks/immutable snapshots remain in the same order.
CREATE OR REPLACE FUNCTION private.nfse_queue_prepare_operation(p_actor_id uuid, p_context_key uuid, p_polo_id uuid, p_environment text, p_month text, p_request_id uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_kind text; v_id uuid; v_competence text; v_facts jsonb; v_snapshot jsonb; v_command jsonb;
  v_link private.nfse_queue_operation_links%ROWTYPE; v_op private.nfse_individual_operations%ROWTYPE;
  v_created_at timestamptz:=now();
  v_config private.nfse_configurations%ROWTYPE; v_cert private.nfse_certificates%ROWTYPE; v_issuer text;
BEGIN
  PERFORM private.authorize_nfse_individual_internal(p_actor_id,p_context_key,p_polo_id,p_environment,p_month);
  IF p_request_id IS NULL OR p_input IS NULL OR jsonb_typeof(p_input)<>'object' OR octet_length(p_input::text)>2000
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_input) key WHERE key NOT IN ('source','competenceDate'))
    OR jsonb_typeof(p_input->'source') IS DISTINCT FROM 'object'
    OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_input->'source') key) IS DISTINCT FROM ARRAY['id','kind']::text[]
    OR p_input#>>'{source,kind}' IS NULL OR p_input#>>'{source,kind}' NOT IN ('PARTNER_SERVICE','ACADEMIC_QUEUE')
    OR coalesce(p_input#>>'{source,id}','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Selecione uma preparação válida para emitir.' USING ERRCODE='22023'; END IF;
  v_kind:=p_input#>>'{source,kind}'; v_id:=(p_input#>>'{source,id}')::uuid;
  IF (v_kind='ACADEMIC_QUEUE' AND p_input ? 'competenceDate') OR(v_kind='PARTNER_SERVICE' AND p_input ? 'competenceDate' AND
    (jsonb_typeof(p_input->'competenceDate') IS DISTINCT FROM 'string' OR coalesce(p_input->>'competenceDate','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$')) THEN
    RAISE EXCEPTION 'A competência deve vir da revisão ou da confirmação do serviço.' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('nfse-individual:'||p_actor_id||':'||p_request_id,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('nfse-queue-source:'||v_kind||':'||v_id,0));
  SELECT * INTO v_op FROM private.nfse_individual_operations WHERE actor_id=p_actor_id AND request_id=p_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_op.context_id IS DISTINCT FROM p_context_key OR v_op.polo_id IS DISTINCT FROM p_polo_id OR v_op.environment IS DISTINCT FROM p_environment
      OR v_op.month IS DISTINCT FROM p_month OR v_op.command->'source' IS DISTINCT FROM p_input->'source'
      OR(v_kind='PARTNER_SERVICE' AND p_input ? 'competenceDate' AND v_op.command->>'competenceDate' IS DISTINCT FROM p_input->>'competenceDate') THEN
      RAISE EXCEPTION 'Requisição de emissão divergente.' USING ERRCODE='22023'; END IF;
    IF v_op.state='PREVIEWED' AND v_op.expires_at<=now() THEN
      -- Explicit review renewal keeps the same identity, snapshot and signed bytes; never after any lease.
      IF v_kind='ACADEMIC_QUEUE' THEN
        PERFORM pg_advisory_xact_lock(hashtextextended('nfse-academic-scope:'||p_polo_id||':'||p_environment,0));
      END IF;
      SELECT * INTO v_link FROM private.nfse_queue_operation_links WHERE operation_id=v_op.id;
      v_facts:=private.nfse_queue_operation_basis(v_kind,v_id,p_polo_id,p_environment,p_month);
      SELECT * INTO v_cert FROM private.resolve_nfse_production_certificate(p_polo_id,p_environment,
        regexp_replace(v_op.snapshot#>>'{issuer,cnpj}','[^0-9]','','g'));
      IF v_link.basis_fingerprint IS DISTINCT FROM v_facts->>'fingerprint'
        OR v_cert.fingerprint IS DISTINCT FROM v_op.certificate_fingerprint OR v_cert.not_before>now() OR v_cert.expires_at<=now() THEN
        RAISE EXCEPTION 'A origem mudou. Revalide a preparação; nenhuma nova DPS foi enviada.' USING ERRCODE='40001'; END IF;
      UPDATE private.nfse_individual_operations SET expires_at=now()+interval '15 minutes',updated_at=now()
        WHERE id=v_op.id RETURNING * INTO v_op;
    END IF;
    RETURN private.nfse_individual_projection(v_op);
  END IF;
  SELECT * INTO v_link FROM private.nfse_queue_operation_links WHERE source_kind=v_kind AND source_id=v_id;
  IF FOUND THEN RAISE EXCEPTION 'A preparação já possui uma operação fiscal. Consulte a mesma operação.' USING ERRCODE='40001'; END IF;
  IF v_kind='ACADEMIC_QUEUE' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('nfse-academic-scope:'||p_polo_id||':'||p_environment,0));
    PERFORM 1 FROM private.nfse_queue_documents WHERE id=v_id FOR SHARE;
  ELSE PERFORM 1 FROM private.nfse_partner_services WHERE id=v_id FOR SHARE; END IF;
  v_facts:=private.nfse_queue_operation_basis(v_kind,v_id,p_polo_id,p_environment,p_month); v_snapshot:=v_facts->'snapshot';
  v_competence:=CASE WHEN v_kind='PARTNER_SERVICE' THEN private.resolve_nfse_service_competence(
    v_snapshot#>'{model,definition}',v_created_at,p_input->>'competenceDate') ELSE v_snapshot->>'competenceDate' END;
  IF (v_competence)::date>(now() AT TIME ZONE 'America/Sao_Paulo')::date
    OR (v_snapshot->>'serviceDate')::date>(now() AT TIME ZONE 'America/Sao_Paulo')::date
    OR (v_snapshot#>>'{source,sourceAmount}')::numeric<=0 THEN
    RAISE EXCEPTION 'Revise as datas fiscais e o valor positivo da origem.' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_config FROM private.nfse_configurations WHERE polo_id=p_polo_id AND environment=p_environment FOR SHARE;
  v_issuer:=regexp_replace(v_snapshot#>>'{issuer,cnpj}','[^0-9]','','g');
  SELECT * INTO v_cert FROM private.resolve_nfse_production_certificate(p_polo_id,p_environment,v_issuer);
  IF v_config.version IS NULL
    OR v_config.definition->>'portalAccess' IS DISTINCT FROM 'CERTIFICATE'
    OR v_cert.fingerprint IS NULL OR v_cert.expires_at<=now() OR v_cert.not_before>now() THEN
    RAISE EXCEPTION 'Revise a configuração e o certificado de produção.' USING ERRCODE='22023'; END IF;
  v_command:=jsonb_build_object('partnerId',v_snapshot#>>'{recipient,partnerId}','modelId',v_snapshot#>>'{model,id}',
    'modelVersion',v_snapshot#>'{model,version}','amount',v_snapshot#>>'{source,sourceAmount}',
    'competenceDate',v_competence,'serviceDate',v_snapshot->>'serviceDate','source',p_input->'source');
  v_snapshot:=v_snapshot||jsonb_build_object('command',v_command);
  INSERT INTO private.nfse_individual_operations(actor_id,context_id,polo_id,environment,month,request_id,command,snapshot,
    configuration_version,certificate_fingerprint,created_at)
  VALUES(p_actor_id,p_context_key,p_polo_id,p_environment,p_month,p_request_id,v_command,v_snapshot,v_config.version,v_cert.fingerprint,v_created_at)
    RETURNING * INTO v_op;
  INSERT INTO private.nfse_queue_operation_links(source_kind,source_id,operation_id,basis,basis_fingerprint)
    VALUES(v_kind,v_id,v_op.id,v_facts->'snapshot',v_facts->>'fingerprint');
  RETURN private.nfse_individual_projection(v_op);
END;
$function$;
REVOKE ALL ON FUNCTION private.nfse_queue_prepare_operation(uuid,uuid,uuid,text,text,uuid,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;

