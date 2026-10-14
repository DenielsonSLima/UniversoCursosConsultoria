BEGIN;
ALTER TABLE public.contas_receber ADD COLUMN payment_summary jsonb;
ALTER TABLE public.contas_pagar ADD COLUMN payment_summary jsonb;
ALTER TABLE public.despesas_lancamentos ADD COLUMN payment_summary jsonb;
CREATE FUNCTION internal_financial_payments.protect_source()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE kind text; paid bigint; reduced bigint; nominal bigint; last_date date; account uuid; method text;
 old_row jsonb; new_row jsonb; key text;
BEGIN
  IF TG_OP='INSERT' THEN NEW.payment_summary:=NULL; RETURN NEW; END IF;
  kind:=CASE TG_TABLE_NAME WHEN 'contas_receber' THEN 'RECEIVABLE'
    WHEN 'contas_pagar' THEN 'PAYABLE' ELSE 'EXPENSE' END;
  SELECT min(original_cents),coalesce(sum(payment_cents) FILTER(WHERE reversed_at IS NULL),0),
    coalesce(sum(principal_cents+discount_cents) FILTER(WHERE reversed_at IS NULL),0),
    max(payment_date) FILTER(WHERE reversed_at IS NULL)
  INTO nominal,paid,reduced,last_date FROM public.financial_payment_events WHERE source_kind=kind AND source_id=OLD.id;
  IF nominal IS NULL THEN
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE NEW.payment_summary:=NULL; RETURN NEW; END IF;
  END IF;
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'PAYMENT_SOURCE_HISTORY_IMMUTABLE'; END IF;
  old_row:=to_jsonb(OLD); new_row:=to_jsonb(NEW);
  FOREACH key IN ARRAY ARRAY['valor','valor_base','juros_valor','multa_valor','desconto_valor','polo_id','company_id',
    'rateio_modo','rateio_polo_ids','excluido_em','estornado_em','cancelado_em','baixa_request_id',
    'matricula_id','turma_id','origem_cronograma_id','categoria','tipo_lancamento','tipo',
    'emprestimo_id','emprestimo_parcela_id','despesa_lancamento_id','manual_settlement_id',
    'manual_settlement_received_cents','manual_settlement_reversed_at'] LOOP
    IF old_row->key IS DISTINCT FROM new_row->key THEN RAISE EXCEPTION 'PAYMENT_SOURCE_HISTORY_IMMUTABLE'; END IF;
  END LOOP;
  SELECT c.account_id,c.method INTO account,method FROM public.financial_payment_events e
    JOIN public.financial_payment_components c ON c.event_id=e.id
    WHERE e.source_kind=kind AND e.source_id=OLD.id AND e.reversed_at IS NULL
    ORDER BY e.payment_date DESC,e.created_at DESC,e.id DESC,c.sequence LIMIT 1;
  IF round(NEW.valor*100)::bigint IS DISTINCT FROM nominal OR NEW.valor_pago IS DISTINCT FROM paid::numeric/100
    OR NEW.status IS DISTINCT FROM (CASE WHEN reduced=nominal THEN 'PAGO' ELSE 'PENDENTE' END)
    OR NEW.data_pagamento IS DISTINCT FROM last_date OR NEW.conta_bancaria_id IS DISTINCT FROM account
    OR NEW.forma_pagamento IS DISTINCT FROM method THEN RAISE EXCEPTION 'PAYMENT_SOURCE_PROJECTION_MISMATCH'; END IF;
  NEW.payment_summary:=internal_financial_payments.summary(kind,NEW.id,to_jsonb(NEW));
  RETURN NEW;
END $$;
CREATE TRIGGER zzz_financial_payment_source_guard BEFORE INSERT OR UPDATE OR DELETE ON public.contas_receber
FOR EACH ROW EXECUTE FUNCTION internal_financial_payments.protect_source();
CREATE TRIGGER zzz_financial_payment_source_guard BEFORE INSERT OR UPDATE OR DELETE ON public.contas_pagar
FOR EACH ROW EXECUTE FUNCTION internal_financial_payments.protect_source();
CREATE TRIGGER zzz_financial_payment_source_guard BEFORE INSERT OR UPDATE OR DELETE ON public.despesas_lancamentos
FOR EACH ROW EXECUTE FUNCTION internal_financial_payments.protect_source();
CREATE FUNCTION internal_financial_payments.protect_expense_allocation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_source_id uuid;
BEGIN
  v_source_id:=CASE WHEN TG_OP='INSERT' THEN NEW.despesa_lancamento_id ELSE OLD.despesa_lancamento_id END;
  PERFORM 1 FROM public.despesas_lancamentos WHERE id=v_source_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.financial_payment_events WHERE source_kind='EXPENSE'
    AND financial_payment_events.source_id=v_source_id) THEN
    IF TG_OP IN ('DELETE','INSERT') OR
      (to_jsonb(OLD)-ARRAY['status','data_pagamento','updated_at','valor_total']) IS DISTINCT FROM
      (to_jsonb(NEW)-ARRAY['status','data_pagamento','updated_at','valor_total']) THEN
      RAISE EXCEPTION 'PAYMENT_ALLOCATION_HISTORY_IMMUTABLE';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER financial_payment_allocation_guard BEFORE INSERT OR UPDATE OR DELETE ON public.despesas_lancamentos_rateios
FOR EACH ROW EXECUTE FUNCTION internal_financial_payments.protect_expense_allocation();
CREATE OR REPLACE FUNCTION public.calcular_ajustes_despesa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM public.financial_payment_events
    WHERE source_kind='EXPENSE' AND source_id=OLD.id) THEN
    RETURN NEW;
  END IF;
  NEW.valor_base := round(coalesce(NEW.valor_base, NEW.valor, 0)::numeric, 2);
  NEW.juros_valor := round(coalesce(NEW.juros_valor, 0)::numeric, 2);
  NEW.multa_valor := round(coalesce(NEW.multa_valor, 0)::numeric, 2);
  NEW.desconto_valor := round(coalesce(NEW.desconto_valor, 0)::numeric, 2);

  IF NEW.valor_base <= 0 THEN
    RAISE EXCEPTION 'O valor-base da despesa deve ser maior que zero.';
  END IF;

  IF NEW.juros_valor < 0 OR NEW.multa_valor < 0 OR NEW.desconto_valor < 0 THEN
    RAISE EXCEPTION 'Juros, multa e desconto não podem ser negativos.';
  END IF;

  IF NEW.desconto_valor > NEW.valor_base + NEW.juros_valor + NEW.multa_valor THEN
    RAISE EXCEPTION 'O desconto não pode superar o valor-base acrescido de juros e multa.';
  END IF;

  NEW.valor := round(
    NEW.valor_base + NEW.juros_valor + NEW.multa_valor - NEW.desconto_valor,
    2
  );

  IF NEW.status = 'PAGO'
    AND (
      TG_OP = 'INSERT'
      OR OLD.status IS DISTINCT FROM NEW.status
      OR OLD.valor_base IS DISTINCT FROM NEW.valor_base
      OR OLD.juros_valor IS DISTINCT FROM NEW.juros_valor
      OR OLD.multa_valor IS DISTINCT FROM NEW.multa_valor
      OR OLD.desconto_valor IS DISTINCT FROM NEW.desconto_valor
    )
  THEN
    NEW.valor_pago := NEW.valor;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_paid_financial_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- The dedicated ledger guard below validates aggregate state, including reversals.
  IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM public.financial_payment_events
    WHERE source_kind=CASE TG_TABLE_NAME WHEN 'contas_receber' THEN 'RECEIVABLE' ELSE 'PAYABLE' END
      AND source_id=OLD.id) THEN RETURN NEW; END IF;
  IF auth.role() = 'service_role' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' AND OLD.status = 'PAGO' THEN
    RAISE EXCEPTION
      'Um lançamento pago não pode ser excluído. Use o fluxo auditável de estorno.';
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.status = 'PAGO'
     AND (
       NEW.status IS DISTINCT FROM OLD.status
       OR NEW.polo_id IS DISTINCT FROM OLD.polo_id
       OR NEW.valor IS DISTINCT FROM OLD.valor
       OR NEW.valor_pago IS DISTINCT FROM OLD.valor_pago
       OR NEW.conta_bancaria_id IS DISTINCT FROM OLD.conta_bancaria_id
       OR NEW.data_pagamento IS DISTINCT FROM OLD.data_pagamento
     ) THEN
    RAISE EXCEPTION
      'Dados contábeis de um lançamento pago só podem mudar pelo fluxo auditável de estorno.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.baixar_despesa_secure(uuid,uuid,uuid,date,text,numeric,numeric,numeric)
 RENAME TO baixar_despesa_before_payment_ledger;
REVOKE ALL ON FUNCTION public.baixar_despesa_before_payment_ledger(uuid,uuid,uuid,date,text,numeric,numeric,numeric)
 FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.baixar_despesa_secure(p_despesa_id uuid,p_request_id uuid,p_conta_bancaria_id uuid,
 p_data_pagamento date,p_forma_pagamento text,p_juros_valor numeric DEFAULT 0,p_multa_valor numeric DEFAULT 0,p_desconto_valor numeric DEFAULT 0)
RETURNS public.despesas_lancamentos LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM internal_financial_payments.authorize_source(auth.uid(),'EXPENSE',p_despesa_id);
  IF EXISTS(SELECT 1 FROM public.financial_payment_events WHERE source_kind='EXPENSE' AND source_id=p_despesa_id) THEN
    RAISE EXCEPTION 'PAYMENT_USE_PARTIAL_PAYMENT_FLOW';
  END IF;
  RETURN public.baixar_despesa_before_payment_ledger(p_despesa_id,p_request_id,p_conta_bancaria_id,p_data_pagamento,
    p_forma_pagamento,p_juros_valor,p_multa_valor,p_desconto_valor);
END $$;
ALTER FUNCTION public.baixar_conta_pagar_secure(uuid,uuid,uuid,date,text) RENAME TO baixar_conta_pagar_before_payment_ledger;
REVOKE ALL ON FUNCTION public.baixar_conta_pagar_before_payment_ledger(uuid,uuid,uuid,date,text)
 FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.baixar_conta_pagar_secure(p_conta_pagar_id uuid,p_request_id uuid,p_conta_bancaria_id uuid,
 p_data_pagamento date,p_forma_pagamento text)
RETURNS public.contas_pagar LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM internal_financial_payments.authorize_source(auth.uid(),'PAYABLE',p_conta_pagar_id);
  IF EXISTS(SELECT 1 FROM public.financial_payment_events WHERE source_kind='PAYABLE' AND source_id=p_conta_pagar_id) THEN
    RAISE EXCEPTION 'PAYMENT_USE_PARTIAL_PAYMENT_FLOW';
  END IF;
  RETURN public.baixar_conta_pagar_before_payment_ledger(p_conta_pagar_id,p_request_id,p_conta_bancaria_id,p_data_pagamento,p_forma_pagamento);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA internal_financial_payments FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.protect_paid_financial_history(),public.calcular_ajustes_despesa() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.baixar_despesa_secure(uuid,uuid,uuid,date,text,numeric,numeric,numeric),
 public.baixar_conta_pagar_secure(uuid,uuid,uuid,date,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.baixar_despesa_secure(uuid,uuid,uuid,date,text,numeric,numeric,numeric),
 public.baixar_conta_pagar_secure(uuid,uuid,uuid,date,text) TO authenticated;
COMMIT;
