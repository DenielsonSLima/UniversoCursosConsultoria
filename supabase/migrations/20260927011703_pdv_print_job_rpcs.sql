BEGIN;
CREATE FUNCTION internal_pdv.authorized_job(p_id uuid) RETURNS internal_pdv.print_jobs
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v internal_pdv.print_jobs;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão obrigatória.' USING ERRCODE='42501'; END IF;
  SELECT * INTO v FROM internal_pdv.print_jobs WHERE id=p_id;
  IF NOT FOUND OR v.actor_id<>auth.uid() THEN
    RAISE EXCEPTION 'Trabalho de impressão não autorizado.' USING ERRCODE='42501';
  END IF;
  PERFORM internal_pdv.assert_scope(v.polo_id);
  IF v.workstation_id IS NOT NULL THEN
    PERFORM internal_pdv.assert_workstation(v.workstation_id,v.polo_id);
  END IF;
  RETURN v;
END $$;

CREATE FUNCTION public.prepare_pdv_print_job(p_receipt_id uuid,p_workstation_id uuid,
  p_printer_id uuid,p_request_id uuid,p_purpose text DEFAULT 'MANUAL',p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_receipt internal_pdv.receipts; v_paid public.contas_receber;
  v_snapshot jsonb; v_job internal_pdv.print_jobs; v_payload jsonb; v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão obrigatória.' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_receipt FROM internal_pdv.receipts WHERE id=p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Comprovante indisponível.' USING ERRCODE='PT404'; END IF;
  v_paid:=internal_pdv.paid_receivable(v_receipt.receivable_id);
  IF internal_pdv.settlement_fingerprint(v_paid)<>v_receipt.settlement_fingerprint THEN
    RAISE EXCEPTION 'Pagamento alterado. Prepare novamente o comprovante.' USING ERRCODE='PT409';
  END IF;
  v_snapshot:=internal_pdv.receipt_dto(v_receipt,p_workstation_id,p_printer_id);
  IF coalesce(p_purpose,'') NOT IN('MANUAL','AUTO','REPRINT')
    OR (p_purpose='REPRINT' AND length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 240)
    OR length(coalesce(p_reason,''))>240 THEN
    RAISE EXCEPTION 'Finalidade ou motivo de impressão inválido.' USING ERRCODE='PT422';
  END IF;
  IF p_purpose='AUTO' OR v_snapshot->>'transport'<>'BROWSER' THEN
    RAISE EXCEPTION 'Transporte automático ainda não homologado.' USING ERRCODE='PT409';
  END IF;
  v_payload:=jsonb_build_object('receiptId',p_receipt_id,'workstationId',p_workstation_id,
    'printerId',p_printer_id,'purpose',p_purpose,'reason',p_reason);
  v_result:=internal_pdv.replay(p_request_id,'PREPARE_PRINT',v_payload);
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;
  IF p_purpose='MANUAL' AND EXISTS(SELECT 1 FROM internal_pdv.print_jobs
    WHERE receipt_id=p_receipt_id AND status IN('CLAIMED','DIALOG_CLOSED','UNKNOWN')) THEN
    RAISE EXCEPTION 'Há envio anterior. Use reimpressão explícita com motivo.' USING ERRCODE='PT409';
  END IF;
  INSERT INTO internal_pdv.print_jobs(receipt_id,polo_id,actor_id,workstation_id,printer_id,
    purpose,transport,receipt_snapshot)
  VALUES(p_receipt_id,v_receipt.polo_id,auth.uid(),p_workstation_id,
    (v_snapshot->>'printerId')::uuid,p_purpose,'BROWSER',v_snapshot) RETURNING * INTO v_job;
  v_result:=jsonb_build_object('id',v_job.id,'status',v_job.status,'receipt',v_snapshot,
    'transport',v_job.transport,'automaticReady',false,'canDispatch',true);
  INSERT INTO internal_pdv.audit(actor_id,polo_id,entity_id,operation,detail)
    VALUES(auth.uid(),v_job.polo_id,v_job.id,'PREPARE_PRINT',
      jsonb_build_object('receiptId',p_receipt_id,'purpose',p_purpose,'reason',p_reason));
  RETURN internal_pdv.remember(p_request_id,'PREPARE_PRINT',v_payload,v_result);
END $$;

CREATE FUNCTION public.claim_pdv_print_job(p_job_id uuid,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v internal_pdv.print_jobs; v_receipt internal_pdv.receipts; v_paid public.contas_receber;
  v_payload jsonb:=jsonb_build_object('jobId',p_job_id); v_result jsonb;
BEGIN
  v:=internal_pdv.authorized_job(p_job_id);
  SELECT * INTO v_receipt FROM internal_pdv.receipts WHERE id=v.receipt_id FOR UPDATE;
  SELECT * INTO v FROM internal_pdv.print_jobs WHERE id=p_job_id FOR UPDATE;
  v_paid:=internal_pdv.paid_receivable(v_receipt.receivable_id);
  IF internal_pdv.settlement_fingerprint(v_paid)<>v_receipt.settlement_fingerprint THEN
    RAISE EXCEPTION 'Pagamento alterado. Impressão não autorizada.' USING ERRCODE='PT409';
  END IF;
  IF v.printer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM internal_pdv.printers
    WHERE id=v.printer_id AND active AND transport='BROWSER') THEN
    RAISE EXCEPTION 'Impressora indisponível.' USING ERRCODE='PT409';
  END IF;
  IF v.status='CLAIMED' AND v.lease_expires_at<clock_timestamp() THEN
    UPDATE internal_pdv.print_jobs SET status='UNKNOWN',updated_at=now() WHERE id=v.id RETURNING * INTO v;
    INSERT INTO internal_pdv.audit(actor_id,polo_id,entity_id,operation,detail)
      VALUES(auth.uid(),v.polo_id,v.id,'EXPIRE_PRINT',jsonb_build_object('result','UNKNOWN'));
  END IF;
  v_result:=internal_pdv.replay(p_request_id,'CLAIM_PRINT',v_payload);
  IF v_result IS NOT NULL THEN
    -- A lost response must not cause a second dispatch of the same job.
    RETURN (v_result-'token')||jsonb_build_object('canDispatch',false,'replayed',true,'status',v.status);
  END IF;
  IF v.status<>'PREPARED' THEN
    v_result:=jsonb_build_object('id',v.id,'status',v.status,'canDispatch',false);
    RETURN internal_pdv.remember(p_request_id,'CLAIM_PRINT',v_payload,v_result);
  END IF;
  IF v.purpose='MANUAL' AND EXISTS(SELECT 1 FROM internal_pdv.print_jobs
    WHERE receipt_id=v.receipt_id AND id<>v.id AND status IN('CLAIMED','DIALOG_CLOSED','UNKNOWN')) THEN
    RAISE EXCEPTION 'Já existe envio deste recibo. Use reimpressão explícita.' USING ERRCODE='PT409';
  END IF;
  UPDATE internal_pdv.print_jobs SET status='CLAIMED',lease_token=gen_random_uuid(),
    lease_expires_at=clock_timestamp()+interval '5 minutes',updated_at=now()
    WHERE id=v.id RETURNING * INTO v;
  v_result:=jsonb_build_object('id',v.id,'status',v.status,'canDispatch',true,
    'token',v.lease_token,'leaseExpiresAt',v.lease_expires_at,'receipt',v.receipt_snapshot);
  INSERT INTO internal_pdv.audit(actor_id,polo_id,entity_id,operation,detail)
    VALUES(auth.uid(),v.polo_id,v.id,'CLAIM_PRINT',jsonb_build_object('leaseExpiresAt',v.lease_expires_at));
  RETURN internal_pdv.remember(p_request_id,'CLAIM_PRINT',v_payload,v_result);
END $$;

CREATE FUNCTION public.complete_pdv_print_job(p_job_id uuid,p_token uuid,p_result text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v internal_pdv.print_jobs; v_result text;
BEGIN
  v:=internal_pdv.authorized_job(p_job_id);
  SELECT * INTO v FROM internal_pdv.print_jobs WHERE id=p_job_id FOR UPDATE;
  IF p_token IS NULL OR v.lease_token IS DISTINCT FROM p_token THEN
    RAISE EXCEPTION 'Token de impressão inválido.' USING ERRCODE='42501';
  END IF;
  IF coalesce(p_result,'') NOT IN('DIALOG_CLOSED','FAILED','UNKNOWN') THEN
    RAISE EXCEPTION 'Resultado não comprova impressão física.' USING ERRCODE='PT422';
  END IF;
  IF v.status IN('DIALOG_CLOSED','FAILED','UNKNOWN') THEN
    IF v.status<>p_result AND v.status<>'UNKNOWN' THEN
      RAISE EXCEPTION 'Resultado já registrado com outro estado.' USING ERRCODE='PT409';
    END IF;
    RETURN jsonb_build_object('id',v.id,'status',v.status,'canDispatch',false);
  END IF;
  IF v.status<>'CLAIMED' THEN RAISE EXCEPTION 'Envio não reservado.' USING ERRCODE='PT409'; END IF;
  v_result:=CASE WHEN v.lease_expires_at<clock_timestamp() THEN 'UNKNOWN' ELSE p_result END;
  UPDATE internal_pdv.print_jobs SET status=v_result,updated_at=now() WHERE id=v.id;
  INSERT INTO internal_pdv.audit(actor_id,polo_id,entity_id,operation,detail)
    VALUES(auth.uid(),v.polo_id,v.id,'COMPLETE_PRINT',jsonb_build_object('result',v_result));
  RETURN jsonb_build_object('id',v.id,'status',v_result,'canDispatch',false);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA internal_pdv FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.prepare_pdv_print_job(uuid,uuid,uuid,uuid,text,text),
  public.claim_pdv_print_job(uuid,uuid),public.complete_pdv_print_job(uuid,uuid,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.prepare_pdv_print_job(uuid,uuid,uuid,uuid,text,text),
  public.claim_pdv_print_job(uuid,uuid),public.complete_pdv_print_job(uuid,uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
