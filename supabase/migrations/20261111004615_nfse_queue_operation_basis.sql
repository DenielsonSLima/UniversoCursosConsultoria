BEGIN;
CREATE TABLE private.nfse_queue_operation_links (
  source_kind text NOT NULL CHECK(source_kind IN ('PARTNER_SERVICE','ACADEMIC_QUEUE')),
  source_id uuid NOT NULL, operation_id uuid NOT NULL UNIQUE REFERENCES private.nfse_individual_operations(id),
  basis jsonb NOT NULL, basis_fingerprint text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(source_kind,source_id)
);
ALTER TABLE private.nfse_queue_operation_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.nfse_queue_operation_links FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER nfse_queue_operation_link_immutable BEFORE UPDATE OR DELETE ON private.nfse_queue_operation_links
  FOR EACH ROW EXECUTE FUNCTION private.reject_nfse_preparation_change();

CREATE FUNCTION private.nfse_queue_operation_basis(p_kind text,p_id uuid,p_polo uuid,p_environment text,p_month text)
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
    v_description:=private.render_nfse_model_description(v_model.definition->>'serviceDescription',left(v_competence,7));
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

-- A fiscal attempt never releases academic receipts, even after rejection or cancellation.
CREATE FUNCTION private.guard_nfse_queue_fiscal_removal() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $function$
BEGIN
  IF EXISTS(SELECT 1 FROM private.nfse_queue_operation_links link JOIN private.nfse_individual_operations op ON op.id=link.operation_id
    WHERE link.source_kind='ACADEMIC_QUEUE' AND link.source_id=NEW.document_id AND op.state<>'PREVIEWED') THEN
    RAISE EXCEPTION 'Uma tentativa fiscal mantém os recebimentos reservados. Consulte o resultado.' USING ERRCODE='55000'; END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.guard_nfse_queue_fiscal_removal() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER nfse_queue_fiscal_removal_guard BEFORE INSERT ON private.nfse_queue_removals
  FOR EACH ROW EXECUTE FUNCTION private.guard_nfse_queue_fiscal_removal();
NOTIFY pgrst,'reload schema';
COMMIT;
