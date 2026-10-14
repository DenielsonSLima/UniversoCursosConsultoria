BEGIN;
CREATE SCHEMA internal_receivable_payments;
REVOKE ALL ON SCHEMA internal_receivable_payments FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE internal_receivable_payments.attempts (
 id uuid PRIMARY KEY,
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 receivable_id uuid NOT NULL REFERENCES public.contas_receber(id),
 input jsonb NOT NULL,
 snapshot jsonb NOT NULL,
 state text NOT NULL DEFAULT 'READY' CHECK(state IN ('READY','LEASED','INTENT','REVIEW','COMPLETE')),
 lease_token uuid,
 lease_until timestamptz,
 intent_at timestamptz,
 evidence jsonb,
 result jsonb,
 review_reason text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 completed_at timestamptz
);
CREATE UNIQUE INDEX receivable_payment_active_idx ON internal_receivable_payments.attempts(receivable_id)
 WHERE state<>'COMPLETE';
CREATE FUNCTION internal_receivable_payments.inspect(p_id uuid,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.contas_receber%ROWTYPE; t public.payment_gateway_transactions%ROWTYPE; doc text; has_events boolean;
BEGIN
 SELECT * INTO r FROM public.contas_receber WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR r.status NOT IN ('PENDENTE','VENCIDO') OR r.polo_id IS NULL OR r.valor<=0
   OR r.valor*100<>trunc(r.valor*100) OR r.manual_settlement_id IS NOT NULL
   OR r.gateway_creation_token IS NOT NULL OR r.gateway_cnab_file_id IS NOT NULL
   OR coalesce(r.origem_pagamento,'')~*'PROESC|SISTEMA_ANTERIOR'
   OR r.gateway_settlement_evidence IS NOT NULL OR r.gateway_settlement_recorded_at IS NOT NULL
   OR r.gateway_settlement_source IS NOT NULL OR r.gateway_settlement_channel IS NOT NULL
   OR upper(coalesce(r.asaas_status,'')) IN ('PAID','PAGO','RECEIVED','CONFIRMED','RECEIVED_IN_CASH')
   OR r.manual_settlement_reversed_at IS NOT NULL
   OR coalesce(r.manual_settlement_received_cents,0)<>0 OR coalesce(r.manual_settlement_principal_cents,0)<>0
   OR coalesce(r.manual_settlement_interest_cents,0)<>0 OR coalesce(r.manual_settlement_penalty_cents,0)<>0
   OR coalesce(r.manual_settlement_addition_cents,0)<>0 OR coalesce(r.manual_settlement_discount_cents,0)<>0
   OR nullif(r.gateway_transaction_receipt_url,'') IS NOT NULL
   OR EXISTS(SELECT 1 FROM internal_proesc.obligation_links WHERE receivable_id=p_id)
   OR EXISTS(SELECT 1 FROM public.emprestimos_financeiros WHERE conta_receber_id=p_id)
   OR EXISTS(SELECT 1 FROM public.convenios_financeiros_creditos WHERE conta_receber_id=p_id)
   OR EXISTS(SELECT 1 FROM public.receivable_renegotiation_source_items WHERE receivable_id=p_id AND released_at IS NULL)
   OR EXISTS(SELECT 1 FROM public.banese_cancellation_outbox WHERE receivable_id=p_id)
   OR EXISTS(SELECT 1 FROM internal_other_credit_cancellation.items WHERE receivable_id=p_id)
   OR EXISTS(SELECT 1 FROM public.receivable_manual_settlements WHERE receivable_id=p_id
      AND state IN ('STARTED','REMOTE_CANCELED_LOCAL_PENDING','REVIEW_REQUIRED','COMPLETED')) THEN
   RAISE EXCEPTION 'PAYMENT_TITLE_REQUIRES_REVIEW';
 END IF;
 SELECT EXISTS(SELECT 1 FROM public.financial_payment_events WHERE source_kind='RECEIVABLE' AND source_id=p_id)
 INTO has_events;
 IF NOT has_events AND (coalesce(r.valor_pago,0)<>0 OR r.data_pagamento IS NOT NULL) THEN
   RAISE EXCEPTION 'PAYMENT_EXISTING_EVIDENCE';
 END IF;
 IF r.tipo_lancamento='DEPENDENCIA' AND
   (current_date>r.data_vencimento+60 OR (p_input->>'paymentDate')::date>r.data_vencimento+60) THEN
   RAISE EXCEPTION 'PAYMENT_DEPENDENCY_DEADLINE';
 END IF;
 PERFORM 1 FROM public.payment_gateway_transactions WHERE receivable_id=p_id ORDER BY id FOR UPDATE;
 IF coalesce(r.gateway_provider,'') IN ('','local') AND r.origem_pagamento IN ('LOCAL','PRESENCIAL')
   AND coalesce(r.gateway_status,'') IN ('','PENDING','OVERDUE')
   AND r.gateway_payment_id IS NULL AND r.asaas_payment_id IS NULL
   AND r.gateway_payment_link_id IS NULL AND r.asaas_payment_link_id IS NULL
   AND r.gateway_boleto_nosso_numero IS NULL AND r.nosso_numero_asaas IS NULL
   AND r.gateway_submission_channel IS NULL AND r.gateway_submission_status IS NULL
   AND r.gateway_invoice_url IS NULL AND r.gateway_bank_slip_url IS NULL
   AND r.gateway_pix_payload IS NULL AND r.asaas_invoice_url IS NULL
   AND r.asaas_bank_slip_url IS NULL AND r.gateway_boleto_issued_at IS NULL
   AND NOT EXISTS(SELECT 1 FROM public.payment_gateway_transactions WHERE receivable_id=p_id) THEN
   RETURN jsonb_build_object('mode','LOCAL','receivable',to_jsonb(r));
 END IF;
 IF r.gateway_provider IS DISTINCT FROM 'banese_card' OR r.gateway_payment_method IS DISTINCT FROM 'BOLETO'
   OR r.gateway_environment NOT IN ('production','sandbox') OR r.gateway_submission_channel IS DISTINCT FROM 'API'
   OR r.gateway_submission_status IS DISTINCT FROM 'API_REGISTERED' OR r.gateway_boleto_issued_at IS NULL
   OR r.gateway_financial_terms_confirmed_at IS NULL OR jsonb_typeof(r.gateway_financial_terms) IS DISTINCT FROM 'object'
   OR coalesce(r.gateway_status,'') NOT IN ('PENDING','OVERDUE','CANCELED')
   OR r.gateway_payment_id IS DISTINCT FROM r.gateway_boleto_nosso_numero
   OR (SELECT count(*) FROM public.payment_gateway_transactions WHERE receivable_id=p_id)<>1 THEN
   RAISE EXCEPTION 'PAYMENT_REMOTE_TITLE_UNSUPPORTED';
 END IF;
 SELECT * INTO t FROM public.payment_gateway_transactions WHERE receivable_id=p_id;
 IF t.raw_payload->>'importSource'='BANESE_API_LEGACY_DISCOVERY'
   OR t.provider_code IS DISTINCT FROM r.gateway_provider OR t.environment IS DISTINCT FROM r.gateway_environment
   OR t.payment_method IS DISTINCT FROM 'BOLETO' OR t.amount IS DISTINCT FROM r.valor
   OR t.origin_polo_id IS DISTINCT FROM r.polo_id OR r.gateway_issuer_polo_id IS NULL
   OR t.issuer_polo_id IS DISTINCT FROM r.gateway_issuer_polo_id
   OR t.remote_payment_id IS DISTINCT FROM r.gateway_payment_id
   OR t.bank_slip_our_number IS DISTINCT FROM r.gateway_boleto_nosso_numero
   OR t.bank_slip_digitable_line IS DISTINCT FROM r.gateway_boleto_linha_digitavel
   OR t.bank_slip_barcode IS DISTINCT FROM r.gateway_boleto_codigo_barras
   OR nullif(t.transaction_receipt_url,'') IS NOT NULL
   OR coalesce(t.remote_status,'') NOT IN ('PENDING','OVERDUE','CANCELED') THEN
   RAISE EXCEPTION 'PAYMENT_TRANSACTION_CHANGED';
 END IF;
 PERFORM 1 FROM public.banese_reconciliation_queue WHERE receivable_id=p_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.banese_reconciliation_queue WHERE receivable_id=p_id
   AND (state='LEASED' OR lease_run_id IS NOT NULL OR lease_until>clock_timestamp())) THEN
   RAISE EXCEPTION 'PAYMENT_RECONCILIATION_BUSY';
 END IF;
 SELECT regexp_replace(cpf_cnpj,'[^0-9]','','g') INTO doc FROM public.parceiros WHERE id=r.cliente_id;
 IF r.data_vencimento IS NULL OR coalesce(r.gateway_boleto_convenio,'') !~ '^[0-9]{1,20}$'
   OR coalesce(r.gateway_boleto_nosso_numero,'') !~ '^[0-9]{9}$'
   OR coalesce(r.gateway_boleto_agencia,'') !~ '^[0-9]{3}$' OR r.gateway_boleto_agencia='000'
   OR coalesce(doc,'') !~ '^([0-9]{11}|[0-9]{14})$'
   OR coalesce(r.gateway_boleto_linha_digitavel,'') !~ '^[0-9]{47}$'
   OR coalesce(r.gateway_boleto_codigo_barras,'') !~ '^[0-9]{44}$' THEN
   RAISE EXCEPTION 'PAYMENT_REMOTE_IDENTITY_INCOMPLETE';
 END IF;
 RETURN jsonb_build_object('mode','BANK','receivable',to_jsonb(r),'payerDocument',doc,'transactionId',t.id);
END $$;
CREATE FUNCTION internal_receivable_payments.lock_attempt(p_id uuid)
RETURNS internal_receivable_payments.attempts LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a internal_receivable_payments.attempts%ROWTYPE; rid uuid;
BEGIN
 PERFORM internal_other_credit_cancellation.service_only();
 SELECT receivable_id INTO rid FROM internal_receivable_payments.attempts WHERE id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_ATTEMPT_MISSING'; END IF;
 -- Uniform source-before-attempt lock order prevents begin/replay deadlocks.
 PERFORM 1 FROM public.contas_receber WHERE id=rid FOR UPDATE;
 SELECT * INTO a FROM internal_receivable_payments.attempts WHERE id=p_id FOR UPDATE;
 PERFORM internal_financial_payments.authorize_source(a.actor_id,'RECEIVABLE',a.receivable_id);
 RETURN a;
END $$;
CREATE FUNCTION internal_receivable_payments.preserve_attempt()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' OR
   (to_jsonb(NEW)-ARRAY['state','lease_token','lease_until','intent_at','evidence','result','review_reason','completed_at'])
   IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','lease_token','lease_until','intent_at','evidence','result','review_reason','completed_at'])
   OR (OLD.intent_at IS NOT NULL AND NEW.intent_at IS DISTINCT FROM OLD.intent_at)
   OR (OLD.evidence IS NOT NULL AND NEW.evidence IS DISTINCT FROM OLD.evidence)
   OR (OLD.result IS NOT NULL AND NEW.result IS DISTINCT FROM OLD.result)
   OR (OLD.completed_at IS NOT NULL AND NEW.completed_at IS DISTINCT FROM OLD.completed_at) THEN
   RAISE EXCEPTION 'PAYMENT_ATTEMPT_IMMUTABLE';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER preserve_receivable_attempt BEFORE UPDATE OR DELETE ON internal_receivable_payments.attempts
 FOR EACH ROW EXECUTE FUNCTION internal_receivable_payments.preserve_attempt();
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA internal_receivable_payments FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
