BEGIN;
CREATE TABLE private.nfse_service_cancellation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receivable_id uuid NOT NULL UNIQUE REFERENCES public.contas_receber(id),
  service_id uuid NOT NULL REFERENCES private.nfse_partner_services(id),
  operation_id uuid NOT NULL REFERENCES private.nfse_individual_operations(id),
  cancellation_id uuid NOT NULL REFERENCES private.nfse_individual_cancellations(id),
  fiscal_actor_id uuid NOT NULL,fiscal_context_key uuid NOT NULL,bank_actor_id uuid NOT NULL,
  polo_id uuid NOT NULL,month text NOT NULL,intent jsonb NOT NULL,
  state text NOT NULL DEFAULT 'READY' CHECK(state IN ('READY','LEASED','DONE','REVIEW')),
  lease_token uuid,lease_until timestamptz,next_check_at timestamptz NOT NULL DEFAULT now(),
  attempt_count integer NOT NULL DEFAULT 0,cancel_intent_at timestamptz,cancel_attempt_token uuid,
  outcome text CHECK(outcome IN ('LOCAL_CANCELLED','CANCELLED','PAID')),evidence jsonb,diagnostic_code text,bank_identity jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX nfse_service_cancellation_due ON private.nfse_service_cancellation_jobs(next_check_at)
  WHERE state IN ('READY','LEASED');
ALTER TABLE private.nfse_service_cancellation_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.nfse_service_cancellation_jobs FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.nfse_service_cancellation_identity(c public.contas_receber,l private.nfse_service_receivables)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT jsonb_build_object('poloId',c.polo_id,'payerId',c.cliente_id,'amount',c.valor,'dueDate',c.data_vencimento,
    'category',c.categoria,'launchType',c.tipo_lancamento,'financialTerms',c.gateway_financial_terms,
    'serviceId',l.service_id,'operationId',l.operation_id,'installment',l.installment_number,
    'fiscalNumber',l.fiscal_number,'fiscalDescription',l.fiscal_description);
$$;
CREATE FUNCTION private.nfse_service_cancellation_has_payment(c public.contas_receber)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT c.status='PAGO' OR coalesce(c.valor_pago,0)<>0 OR c.data_pagamento IS NOT NULL
    OR coalesce((c.payment_summary->>'previouslyPaid')::numeric,0)>0
    OR c.manual_settlement_id IS NOT NULL OR c.gateway_settlement_recorded_at IS NOT NULL
    OR upper(coalesce(c.gateway_status,'')) IN ('PAID','RECEIVED','CONFIRMED','PAGO','LIQUIDATED','PARTIALLY_PAID')
    OR EXISTS(SELECT 1 FROM public.financial_payment_events e WHERE e.source_kind='RECEIVABLE' AND e.source_id=c.id)
    OR EXISTS(SELECT 1 FROM public.receivable_manual_settlements s WHERE s.receivable_id=c.id);
$$;

CREATE FUNCTION private.enqueue_nfse_service_cancellation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o private.nfse_individual_operations%ROWTYPE;v_proven boolean;
BEGIN
  IF TG_OP='UPDATE' AND OLD.state='CANCELLED' THEN RETURN NEW; END IF;
  SELECT * INTO o FROM private.nfse_individual_operations WHERE id=NEW.operation_id;
  IF NOT FOUND OR o.environment<>'PRODUCAO' THEN RETURN NEW; END IF;
  v_proven:=private.nfse_service_cancellation_proven(NEW.id);
  INSERT INTO private.nfse_service_cancellation_jobs(receivable_id,service_id,operation_id,cancellation_id,
    fiscal_actor_id,fiscal_context_key,bank_actor_id,polo_id,month,intent,state,diagnostic_code)
  SELECT c.id,l.service_id,o.id,NEW.id,o.actor_id,o.context_id,coalesce(p.requested_by,o.actor_id),
    c.polo_id,o.month,private.nfse_service_cancellation_identity(c,l),
    CASE WHEN v_proven THEN 'READY' ELSE 'REVIEW' END,CASE WHEN v_proven THEN NULL ELSE 'FISCAL_PROOF_INVALID' END
  FROM private.nfse_service_receivables l JOIN public.contas_receber c ON c.id=l.receivable_id
  LEFT JOIN private.nfse_service_financial_plans p ON p.service_id=l.service_id
  WHERE l.operation_id=o.id ON CONFLICT(receivable_id) DO NOTHING;
  RETURN NEW;
END$$;
-- Installed after the proof function in the next migration. No retrospective
-- cancellation: only a new confirmed fiscal cancellation enqueues obligations.

CREATE FUNCTION private.publish_nfse_service_cancellation_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  INSERT INTO public.finance_realtime_events(source_table,event_type,entity_id,polo_id,aluno_id,turma_id)
    SELECT 'contas_receber','UPDATE',c.id,c.polo_id,c.cliente_id,c.turma_id FROM public.contas_receber c
    WHERE c.id=NEW.receivable_id;
  RETURN NEW;
END$$;
CREATE TRIGGER nfse_service_cancellation_changed AFTER INSERT OR UPDATE OF state,outcome
  ON private.nfse_service_cancellation_jobs FOR EACH ROW EXECUTE FUNCTION private.publish_nfse_service_cancellation_change();
REVOKE ALL ON FUNCTION private.nfse_service_cancellation_identity(public.contas_receber,private.nfse_service_receivables),
  private.nfse_service_cancellation_has_payment(public.contas_receber),private.enqueue_nfse_service_cancellation(),
  private.publish_nfse_service_cancellation_change() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
