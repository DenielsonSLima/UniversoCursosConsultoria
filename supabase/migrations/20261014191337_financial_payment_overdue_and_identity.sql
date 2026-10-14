BEGIN;

-- Open ledger balances retain their overdue classification, including reversals.
CREATE FUNCTION internal_financial_payments.balance_status(p_remaining bigint,p_due_date date)
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT CASE WHEN p_remaining=0 THEN 'PAGO' WHEN p_due_date<current_date THEN 'VENCIDO' ELSE 'PENDENTE' END;
$$;
REVOKE ALL ON FUNCTION internal_financial_payments.balance_status(bigint,date)
 FROM PUBLIC,anon,authenticated,service_role;

DO $patch$
DECLARE item record; definition text; expected integer;
BEGIN
 FOR item IN SELECT * FROM (VALUES
  ('internal_financial_payments.preview_for_actor(uuid,text,uuid,jsonb)',
   $old$'status',CASE WHEN remaining=principal+discount THEN 'PAGO' ELSE 'PENDENTE' END,$old$,
   $new$'status',internal_financial_payments.balance_status(remaining-principal-discount,(r->>'data_vencimento')::date),$new$,1),
  ('internal_financial_payments.preview_for_actor(uuid,text,uuid,jsonb)',
   $old$  summary:=internal_financial_payments.summary(p_source_kind,p_source_id,r);$old$,
   $new$  IF p_source_kind='EXPENSE' AND (EXISTS(SELECT 1 FROM public.convenios_financeiros_despesas
    WHERE despesa_lancamento_id=p_source_id AND status='ATIVO') OR r->>'emprestimo_parcela_id' IS NOT NULL) THEN
    RAISE EXCEPTION 'PAYMENT_SPECIALIZED_FLOW_REQUIRED';
  END IF;
  IF p_source_kind='PAYABLE' AND (r->>'emprestimo_parcela_id' IS NOT NULL OR r->>'emprestimo_id' IS NOT NULL
    OR r->>'despesa_lancamento_id' IS NOT NULL OR upper(coalesce(r->>'origem','')) LIKE '%EMPRESTIMO%') THEN
    RAISE EXCEPTION 'PAYMENT_SPECIALIZED_FLOW_REQUIRED';
  END IF;
  summary:=internal_financial_payments.summary(p_source_kind,p_source_id,r);$new$,1),
  ('internal_financial_payments.summary(text,uuid,jsonb)',
   $old$'status',p_source->>'status','hasEvents',events>0$old$,
   $new$'status',CASE WHEN events>0 THEN internal_financial_payments.balance_status(
    greatest(original-reduced,0),(p_source->>'data_vencimento')::date) ELSE p_source->>'status' END,'hasEvents',events>0$new$,1),
  ('internal_financial_payments.refresh_source(text,uuid)',
   $old$SET status=next_status,valor_pago$old$,
   $new$SET status=internal_financial_payments.balance_status(nominal-reduced,data_vencimento),valor_pago$new$,3),
  ('internal_financial_payments.protect_source()',
   $old$ARRAY['valor','valor_base'$old$,
   $new$ARRAY['id','valor','valor_base'$new$,1),
  ('internal_financial_payments.protect_source()',
   $old$NEW.status IS DISTINCT FROM (CASE WHEN reduced=nominal THEN 'PAGO' ELSE 'PENDENTE' END)$old$,
   $new$(CASE WHEN reduced=nominal THEN NEW.status='PAGO' ELSE NEW.status IN ('PENDENTE','VENCIDO') END) IS NOT TRUE$new$,1),
  ('internal_financial_payments.protect_source()',
   $old$  NEW.payment_summary:=internal_financial_payments.summary(kind,NEW.id,to_jsonb(NEW));$old$,
   $new$  -- Canonicalize open status on every update, including metadata updates after midnight.
  NEW.status:=internal_financial_payments.balance_status(nominal-reduced,NEW.data_vencimento);
  NEW.payment_summary:=internal_financial_payments.summary(kind,NEW.id,to_jsonb(NEW));$new$,1),
  ('internal_financial_payments.cash_receivables()',
   $old$'status','PENDENTE','valor',balance.remaining$old$,
   $new$'status',internal_financial_payments.balance_status(round(balance.remaining*100)::bigint,c.data_vencimento),'valor',balance.remaining$new$,1),
  ('internal_financial_payments.cash_expenses()',
   $old$'status','PENDENTE','valor',balance.remaining$old$,
   $new$'status',internal_financial_payments.balance_status(round(balance.remaining*100)::bigint,c.data_vencimento),'valor',balance.remaining$new$,1),
  ('internal_financial_payments.cash_payables()',
   $old$'status','PENDENTE','valor',balance.remaining$old$,
   $new$'status',internal_financial_payments.balance_status(round(balance.remaining*100)::bigint,c.data_vencimento),'valor',balance.remaining$new$,1),
  ('internal_financial_payments.cash_expense_allocations()',
   $old$'status','PENDENTE','valor_base',allocation.amount$old$,
   $new$'status',internal_financial_payments.balance_status(allocation.amount,d.data_vencimento),'valor_base',allocation.amount$new$,1)
 ) AS changes(signature,old_text,new_text,occurrences) LOOP
  definition:=pg_get_functiondef(item.signature::regprocedure);
  expected:=length(item.old_text)*item.occurrences;
  IF length(definition)-length(replace(definition,item.old_text,''))<>expected THEN
   RAISE EXCEPTION 'PAYMENT_REVIEW_DEFINITION_DRIFT: %',item.signature;
  END IF;
  EXECUTE replace(definition,item.old_text,item.new_text);
 END LOOP;
END $patch$;
NOTIFY pgrst,'reload schema';
COMMIT;
