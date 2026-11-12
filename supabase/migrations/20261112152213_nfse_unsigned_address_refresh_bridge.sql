BEGIN;
CREATE OR REPLACE FUNCTION public.nfse_individual_operation_internal(
  p_actor_id uuid,p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,
  p_request_id uuid,p_action text,p_preview_id uuid DEFAULT NULL,p_input jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET statement_timeout='15s' AS $function$
DECLARE v_link private.nfse_queue_operation_links%ROWTYPE; v_op private.nfse_individual_operations%ROWTYPE;
  v_facts jsonb; v_result jsonb; v_source uuid;
BEGIN
  PERFORM private.authorize_nfse_individual_internal(p_actor_id,p_context_key,p_polo_id,p_environment,p_month);
  IF p_action='PREVIEW' THEN RAISE EXCEPTION 'Emita a partir da preparação de Alunos ou Serviços.' USING ERRCODE='22023'; END IF;
  IF p_action='PREVIEW_QUEUE' THEN
    IF p_preview_id IS NOT NULL THEN RAISE EXCEPTION 'Prévia inválida.' USING ERRCODE='22023'; END IF;
    RETURN private.nfse_queue_prepare_operation(p_actor_id,p_context_key,p_polo_id,p_environment,p_month,p_request_id,p_input);
  END IF;
  IF p_action='PREPARE' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('nfse-individual:'||p_actor_id||':'||p_request_id,0));
    SELECT * INTO v_op FROM private.nfse_individual_operations WHERE id=p_preview_id FOR UPDATE;
    IF v_op.id IS NULL OR v_op.actor_id IS DISTINCT FROM p_actor_id OR v_op.context_id IS DISTINCT FROM p_context_key
      OR v_op.polo_id IS DISTINCT FROM p_polo_id OR v_op.environment IS DISTINCT FROM p_environment
      OR v_op.month IS DISTINCT FROM p_month OR v_op.request_id IS DISTINCT FROM p_request_id THEN
      RAISE EXCEPTION 'Operação fora do contexto autorizado.' USING ERRCODE='42501'; END IF;
    IF v_op.snapshot#>>'{model,definition,peopleOptions,recipientAddressSource}'='FROM_PARTNER' AND (
      coalesce(p_input#>>'{fiscalInput,recipient,address,number}','') IS DISTINCT FROM btrim(coalesce(v_op.snapshot#>>'{recipient,address,number}',''))
      OR coalesce(p_input#>>'{fiscalInput,recipient,address,street}','') IS DISTINCT FROM btrim(coalesce(v_op.snapshot#>>'{recipient,address,street}',''))
      OR coalesce(p_input#>>'{fiscalInput,recipient,address,district}','') IS DISTINCT FROM btrim(coalesce(v_op.snapshot#>>'{recipient,address,district}',''))
      OR coalesce(p_input#>>'{fiscalInput,recipient,address,complement}','') IS DISTINCT FROM btrim(coalesce(v_op.snapshot#>>'{recipient,address,complement}',''))
      OR coalesce(p_input#>>'{fiscalInput,recipient,address,postalCode}','') IS DISTINCT FROM regexp_replace(coalesce(v_op.snapshot#>>'{recipient,address,postalCode}',''),'[^0-9]','','g')) THEN
      RAISE EXCEPTION 'O endereço mudou. Atualize a prévia antes de preparar a DPS.' USING ERRCODE='40001'; END IF;
  END IF;
  IF p_action='CLAIM' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('nfse-individual:'||p_actor_id||':'||p_request_id,0));
    SELECT * INTO v_op FROM private.nfse_individual_operations WHERE id=p_preview_id FOR UPDATE;
    IF v_op.id IS NULL OR v_op.actor_id IS DISTINCT FROM p_actor_id OR v_op.context_id IS DISTINCT FROM p_context_key
      OR v_op.polo_id IS DISTINCT FROM p_polo_id OR v_op.environment IS DISTINCT FROM p_environment
      OR v_op.month IS DISTINCT FROM p_month OR v_op.request_id IS DISTINCT FROM p_request_id THEN
      RAISE EXCEPTION 'Operação fora do contexto autorizado.' USING ERRCODE='42501'; END IF;
    SELECT * INTO v_link FROM private.nfse_queue_operation_links WHERE operation_id=v_op.id;
    IF NOT FOUND AND v_op.state='PREVIEWED' THEN
      RAISE EXCEPTION 'A emissão exige uma origem normal preparada.' USING ERRCODE='42501'; END IF;
    IF v_link.operation_id IS NOT NULL AND v_op.state='PREVIEWED' THEN
      IF v_link.source_kind='ACADEMIC_QUEUE' THEN
        -- This is the same lock used by preparation/removal/review. No removal can release receipts after CLAIM.
        PERFORM pg_advisory_xact_lock(hashtextextended('nfse-academic-scope:'||p_polo_id||':'||p_environment,0));
        PERFORM 1 FROM private.nfse_queue_documents WHERE id=v_link.source_id FOR SHARE;
        FOR v_source IN SELECT DISTINCT source_receivable_id FROM private.nfse_receipt_reservations
          WHERE document_id=v_link.source_id ORDER BY source_receivable_id LOOP
          PERFORM 1 FROM public.contas_receber WHERE id=v_source FOR SHARE;
        END LOOP;
        PERFORM 1 FROM public.financial_payment_events WHERE source_kind='RECEIVABLE'
          AND source_id IN (SELECT source_receivable_id FROM private.nfse_receipt_reservations WHERE document_id=v_link.source_id)
          ORDER BY id FOR SHARE;
      ELSE
        PERFORM 1 FROM private.nfse_partner_services WHERE id=v_link.source_id FOR SHARE;
        PERFORM 1 FROM public.contas_receber WHERE id=(SELECT receivable_id FROM private.nfse_partner_services WHERE id=v_link.source_id) FOR SHARE;
      END IF;
      -- Fresh canonical source after row locks, before the one dispatch lease.
      v_facts:=private.nfse_queue_operation_basis(v_link.source_kind,v_link.source_id,p_polo_id,p_environment,p_month);
      IF private.nfse_operation_effective_basis(v_op.id)->>'fingerprint' IS DISTINCT FROM v_facts->>'fingerprint' THEN
        RAISE EXCEPTION 'A origem mudou após a prévia. Confira novamente a preparação.' USING ERRCODE='40001'; END IF;
    END IF;
  END IF;
  v_result:=public.nfse_individual_operation_core_internal(p_actor_id,p_context_key,p_polo_id,p_environment,p_month,
    p_request_id,p_action,p_preview_id,p_input);
  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.nfse_individual_operation_internal(uuid,uuid,uuid,text,text,uuid,text,uuid,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.nfse_individual_operation_internal(uuid,uuid,uuid,text,text,uuid,text,uuid,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.nfse_individual_operation_core_internal(uuid,uuid,uuid,text,text,uuid,text,uuid,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
