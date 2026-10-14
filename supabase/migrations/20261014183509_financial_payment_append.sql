BEGIN;
CREATE FUNCTION internal_financial_payments.refresh_source(p_source_kind text,p_source_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE paid bigint; reduced bigint; nominal bigint; last_date date; account uuid; method text; next_status text;
BEGIN
  SELECT sum(payment_cents) FILTER(WHERE reversed_at IS NULL),
    sum(principal_cents+discount_cents) FILTER(WHERE reversed_at IS NULL),min(original_cents),
    max(payment_date) FILTER(WHERE reversed_at IS NULL)
  INTO paid,reduced,nominal,last_date FROM public.financial_payment_events
    WHERE source_kind=p_source_kind AND source_id=p_source_id;
  IF nominal IS NULL THEN RAISE EXCEPTION 'PAYMENT_LEDGER_NOT_FOUND'; END IF;
  paid:=coalesce(paid,0); reduced:=coalesce(reduced,0);
  next_status:=CASE WHEN reduced=nominal THEN 'PAGO' ELSE 'PENDENTE' END;
  SELECT c.account_id,c.method INTO account,method FROM public.financial_payment_events e
    JOIN public.financial_payment_components c ON c.event_id=e.id
    WHERE e.source_kind=p_source_kind AND e.source_id=p_source_id AND e.reversed_at IS NULL
    ORDER BY e.payment_date DESC,e.created_at DESC,e.id DESC,c.sequence LIMIT 1;
  IF p_source_kind='EXPENSE' THEN
    UPDATE public.despesas_lancamentos SET status=next_status,valor_pago=paid::numeric/100,
      data_pagamento=last_date,conta_bancaria_id=account,forma_pagamento=method WHERE id=p_source_id;
  ELSIF p_source_kind='PAYABLE' THEN
    UPDATE public.contas_pagar SET status=next_status,valor_pago=paid::numeric/100,
      data_pagamento=last_date,conta_bancaria_id=account,forma_pagamento=method WHERE id=p_source_id;
  ELSE
    UPDATE public.contas_receber SET status=next_status,valor_pago=paid::numeric/100,
      data_pagamento=last_date,conta_bancaria_id=account,forma_pagamento=method WHERE id=p_source_id;
  END IF;
END $$;
CREATE FUNCTION internal_financial_payments.append_payment(
  p_actor uuid,p_source_kind text,p_source_id uuid,p_input jsonb,p_allow_remote_canceled boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r jsonb; normalized jsonb; preview jsonb; prior public.financial_payment_events%ROWTYPE;
  payment_id uuid; payload_hash text; v_request_id uuid; c jsonb; position integer:=0;
BEGIN
  r:=internal_financial_payments.authorize_source(p_actor,p_source_kind,p_source_id);
  normalized:=internal_financial_payments.normalized_input(p_source_id,(r->>'polo_id')::uuid,p_input);
  v_request_id:=(normalized->>'requestId')::uuid;
  payload_hash:=md5(jsonb_build_object('kind',p_source_kind,'input',normalized,'fingerprint',p_input->'fingerprint')::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_request_id::text,0));
  SELECT * INTO prior FROM public.financial_payment_events e WHERE e.request_id=v_request_id;
  IF FOUND THEN
    IF prior.actor_id IS DISTINCT FROM p_actor OR prior.source_kind IS DISTINCT FROM p_source_kind
      OR prior.source_id IS DISTINCT FROM p_source_id OR prior.payload_hash IS DISTINCT FROM payload_hash THEN
      RAISE EXCEPTION 'PAYMENT_REQUEST_REUSED';
    END IF;
    RETURN jsonb_build_object('success',true,'paymentId',prior.id,'replayed',true,'preview',prior.preview);
  END IF;
  IF p_source_kind='RECEIVABLE' AND coalesce(r->>'gateway_provider','') NOT IN ('','local')
    AND p_allow_remote_canceled IS NOT TRUE THEN RAISE EXCEPTION 'PAYMENT_BANK_CONFIRMATION_REQUIRED'; END IF;
  IF p_source_kind='EXPENSE' AND (EXISTS(SELECT 1 FROM public.convenios_financeiros_despesas
    WHERE despesa_lancamento_id=p_source_id AND status='ATIVO') OR r->>'emprestimo_parcela_id' IS NOT NULL) THEN
    RAISE EXCEPTION 'PAYMENT_SPECIALIZED_FLOW_REQUIRED';
  END IF;
  IF p_source_kind='PAYABLE' AND (r->>'emprestimo_parcela_id' IS NOT NULL OR r->>'emprestimo_id' IS NOT NULL
    OR r->>'despesa_lancamento_id' IS NOT NULL OR upper(coalesce(r->>'origem','')) LIKE '%EMPRESTIMO%') THEN
    RAISE EXCEPTION 'PAYMENT_SPECIALIZED_FLOW_REQUIRED';
  END IF;
  preview:=internal_financial_payments.preview_for_actor(p_actor,p_source_kind,p_source_id,p_input);
  IF p_input->>'fingerprint' IS DISTINCT FROM preview->>'fingerprint' THEN RAISE EXCEPTION 'PAYMENT_PREVIEW_STALE'; END IF;
  INSERT INTO public.financial_payment_events(request_id,actor_id,source_kind,source_id,polo_id,payment_date,
    original_cents,principal_cents,interest_cents,penalty_cents,addition_cents,discount_cents,payment_cents,
    input,payload_hash,preview)
  VALUES(v_request_id,p_actor,p_source_kind,p_source_id,(r->>'polo_id')::uuid,(normalized->>'paymentDate')::date,
    internal_financial_payments.cents(preview->'originalAmount'),internal_financial_payments.cents(preview->'principalPaid'),
    internal_financial_payments.cents(preview->'interest'),internal_financial_payments.cents(preview->'penalty'),
    internal_financial_payments.cents(preview->'addition'),internal_financial_payments.cents(preview->'discount'),
    internal_financial_payments.cents(preview->'paymentAmount'),normalized,payload_hash,preview) RETURNING id INTO payment_id;
  FOR c IN SELECT value FROM jsonb_array_elements(normalized->'components') LOOP
    position:=position+1;
    INSERT INTO public.financial_payment_components(event_id,sequence,account_id,method,amount_cents)
    VALUES(payment_id,position,(c->>'accountId')::uuid,c->>'method',internal_financial_payments.cents(c->'amount'));
  END LOOP;
  PERFORM internal_financial_payments.refresh_source(p_source_kind,p_source_id);
  RETURN jsonb_build_object('success',true,'paymentId',payment_id,'replayed',false,'preview',preview);
END $$;
CREATE FUNCTION public.confirm_expense_payment_secure(p_source_kind text,p_source_id uuid,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_source_kind NOT IN ('EXPENSE','PAYABLE') OR p_source_kind IS NULL THEN RAISE EXCEPTION 'PAYMENT_INVALID_SOURCE'; END IF;
  RETURN internal_financial_payments.append_payment(auth.uid(),p_source_kind,p_source_id,p_input,false);
END $$;
CREATE FUNCTION public.reverse_expense_payment_secure(
 p_source_kind text,p_source_id uuid,p_payment_id uuid,p_request_id uuid,p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r jsonb; e public.financial_payment_events%ROWTYPE; actor uuid:=auth.uid();
BEGIN
  IF p_source_kind NOT IN ('EXPENSE','PAYABLE') OR p_source_kind IS NULL THEN RAISE EXCEPTION 'PAYMENT_INVALID_SOURCE'; END IF;
  r:=internal_financial_payments.authorize_source(actor,p_source_kind,p_source_id);
  IF p_request_id IS NULL OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION 'PAYMENT_REVERSAL_REASON_REQUIRED';
  END IF;
  SELECT * INTO e FROM public.financial_payment_events WHERE id=p_payment_id AND source_kind=p_source_kind
    AND source_id=p_source_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_EVENT_NOT_FOUND'; END IF;
  IF e.reversed_at IS NOT NULL THEN
    IF e.reversal_request_id=p_request_id AND e.reversed_by=actor AND e.reversal_reason=btrim(p_reason) THEN
      RETURN jsonb_build_object('success',true,'paymentId',e.id,'replayed',true);
    END IF;
    RAISE EXCEPTION 'PAYMENT_EVENT_ALREADY_REVERSED';
  END IF;
  UPDATE public.financial_payment_events SET reversed_at=clock_timestamp(),reversed_by=actor,
    reversal_request_id=p_request_id,reversal_reason=btrim(p_reason) WHERE id=p_payment_id;
  PERFORM internal_financial_payments.refresh_source(p_source_kind,p_source_id);
  RETURN jsonb_build_object('success',true,'paymentId',e.id,'replayed',false);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA internal_financial_payments FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.confirm_expense_payment_secure(text,uuid,jsonb),
 public.reverse_expense_payment_secure(text,uuid,uuid,uuid,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.confirm_expense_payment_secure(text,uuid,jsonb),
 public.reverse_expense_payment_secure(text,uuid,uuid,uuid,text) TO authenticated;
COMMIT;
