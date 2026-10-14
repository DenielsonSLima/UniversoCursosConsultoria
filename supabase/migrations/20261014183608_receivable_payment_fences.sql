BEGIN;
CREATE FUNCTION internal_receivable_payments.guard_active_attempt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rid uuid; before_value jsonb; after_value jsonb;
BEGIN
 IF TG_TABLE_NAME='contas_receber' THEN rid:=coalesce(NEW.id,OLD.id);
 ELSIF TG_OP='DELETE' THEN rid:=OLD.receivable_id; ELSE rid:=NEW.receivable_id; END IF;
 PERFORM 1 FROM public.contas_receber WHERE id=rid FOR UPDATE;
 IF TG_TABLE_NAME IN ('receivable_manual_settlements','items','banese_cancellation_outbox')
   AND EXISTS(SELECT 1 FROM public.financial_payment_events WHERE source_kind='RECEIVABLE' AND source_id=rid) THEN
   RAISE EXCEPTION 'Esta cobrança tem pagamentos no histórico. Use o fluxo de pagamentos do Financeiro.' USING ERRCODE='PT409';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM internal_receivable_payments.attempts WHERE receivable_id=rid AND state<>'COMPLETE') THEN
   RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='contas_receber' THEN
   before_value:=to_jsonb(OLD)-ARRAY['updated_at','gateway_synced_at','asaas_synced_at','gateway_last_error','asaas_last_error'];
   after_value:=to_jsonb(NEW)-ARRAY['updated_at','gateway_synced_at','asaas_synced_at','gateway_last_error','asaas_last_error'];
   IF before_value IS NOT DISTINCT FROM after_value THEN RETURN NEW; END IF;
 ELSIF TG_TABLE_NAME='payment_gateway_transactions' AND TG_OP='UPDATE' THEN
   before_value:=to_jsonb(OLD)-ARRAY['updated_at','synced_at','last_error','raw_payload'];
   after_value:=to_jsonb(NEW)-ARRAY['updated_at','synced_at','last_error','raw_payload'];
   IF before_value IS NOT DISTINCT FROM after_value THEN RETURN NEW; END IF;
 ELSIF TG_TABLE_NAME='banese_reconciliation_queue' THEN
   IF NEW.state<>'LEASED' AND NEW.lease_run_id IS NULL AND NEW.lease_until IS NULL THEN RETURN NEW; END IF;
 END IF;
 RAISE EXCEPTION 'Recebimento em andamento. Retome a mesma solicitação no Financeiro antes de alterar esta cobrança.' USING ERRCODE='PT409';
END $$;
CREATE TRIGGER receipt_attempt_source_fence BEFORE UPDATE ON public.contas_receber
 FOR EACH ROW EXECUTE FUNCTION internal_receivable_payments.guard_active_attempt();
CREATE TRIGGER receipt_attempt_transaction_fence BEFORE INSERT OR UPDATE ON public.payment_gateway_transactions
 FOR EACH ROW EXECUTE FUNCTION internal_receivable_payments.guard_active_attempt();
CREATE TRIGGER receipt_attempt_legacy_fence BEFORE INSERT OR UPDATE ON public.receivable_manual_settlements
 FOR EACH ROW EXECUTE FUNCTION internal_receivable_payments.guard_active_attempt();
CREATE TRIGGER receipt_attempt_cancellation_fence BEFORE INSERT OR UPDATE ON internal_other_credit_cancellation.items
 FOR EACH ROW EXECUTE FUNCTION internal_receivable_payments.guard_active_attempt();
CREATE TRIGGER receipt_attempt_outbox_fence BEFORE INSERT OR UPDATE ON public.banese_cancellation_outbox
 FOR EACH ROW EXECUTE FUNCTION internal_receivable_payments.guard_active_attempt();
CREATE TRIGGER receipt_attempt_queue_fence BEFORE INSERT OR UPDATE ON public.banese_reconciliation_queue
 FOR EACH ROW EXECUTE FUNCTION internal_receivable_payments.guard_active_attempt();
REVOKE ALL ON FUNCTION internal_receivable_payments.guard_active_attempt() FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION internal_receivable_payments.protect_ledger_bank_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rid uuid; old_value jsonb; new_value jsonb; key text; completing boolean;
BEGIN
 IF TG_TABLE_NAME='contas_receber' THEN rid:=NEW.id;
 ELSIF TG_OP='DELETE' THEN rid:=OLD.receivable_id; ELSE rid:=NEW.receivable_id; END IF;
 PERFORM 1 FROM public.contas_receber WHERE id=rid FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.financial_payment_events WHERE source_kind='RECEIVABLE' AND source_id=rid) THEN
   IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'PAYMENT_BANK_HISTORY_REQUIRES_REVIEW'; END IF;
 old_value:=to_jsonb(OLD); new_value:=to_jsonb(NEW);
 completing:=EXISTS(SELECT 1 FROM internal_receivable_payments.attempts WHERE receivable_id=rid
   AND state='COMPLETE' AND completed_at IS NULL);
 IF TG_TABLE_NAME='contas_receber' THEN
   FOREACH key IN ARRAY ARRAY['gateway_provider','gateway_environment','gateway_payment_method',
     'gateway_payment_id','gateway_payment_link_id','gateway_boleto_nosso_numero','gateway_boleto_convenio',
     'gateway_boleto_agencia','gateway_boleto_linha_digitavel','gateway_boleto_codigo_barras','gateway_issuer_polo_id',
     'gateway_submission_channel','gateway_submission_status','gateway_cnab_file_id','gateway_creation_token',
     'gateway_financial_terms','gateway_financial_terms_confirmed_at','gateway_settlement_evidence',
     'gateway_settlement_recorded_at','gateway_settlement_source','gateway_settlement_channel',
     'gateway_transaction_receipt_url','asaas_payment_id','asaas_payment_link_id','asaas_status',
     'nosso_numero_asaas','origem_pagamento','data_vencimento','cliente_id'] LOOP
     IF old_value->key IS DISTINCT FROM new_value->key THEN
       RAISE EXCEPTION 'PAYMENT_BANK_HISTORY_REQUIRES_REVIEW';
     END IF;
   END LOOP;
   IF NEW.gateway_status IS DISTINCT FROM OLD.gateway_status
     AND NOT(completing AND NEW.gateway_status='CANCELED' AND OLD.gateway_status IN ('PENDING','OVERDUE')) THEN
     RAISE EXCEPTION 'PAYMENT_BANK_STATUS_REQUIRES_REVIEW';
   END IF;
 ELSE
   IF (old_value-ARRAY['remote_status','last_error','synced_at','updated_at','raw_payload'])
     IS DISTINCT FROM (new_value-ARRAY['remote_status','last_error','synced_at','updated_at','raw_payload'])
     OR (NEW.remote_status IS DISTINCT FROM OLD.remote_status
       AND NOT(completing AND NEW.remote_status='CANCELED' AND OLD.remote_status IN ('PENDING','OVERDUE'))) THEN
     RAISE EXCEPTION 'PAYMENT_BANK_TRANSACTION_REQUIRES_REVIEW';
   END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER receipt_ledger_bank_identity BEFORE UPDATE ON public.contas_receber
 FOR EACH ROW EXECUTE FUNCTION internal_receivable_payments.protect_ledger_bank_identity();
CREATE TRIGGER receipt_ledger_bank_identity BEFORE UPDATE OR DELETE ON public.payment_gateway_transactions
 FOR EACH ROW EXECUTE FUNCTION internal_receivable_payments.protect_ledger_bank_identity();
REVOKE ALL ON FUNCTION internal_receivable_payments.protect_ledger_bank_identity() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
