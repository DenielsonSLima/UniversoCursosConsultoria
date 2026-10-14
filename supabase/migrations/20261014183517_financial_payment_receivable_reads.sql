BEGIN;
CREATE FUNCTION internal_financial_payments.received_in_period(p_source_id uuid,p_start date,p_end date)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(sum(payment_cents),0)::numeric/100 FROM public.financial_payment_events
 WHERE source_kind='RECEIVABLE' AND source_id=p_source_id AND reversed_at IS NULL
   AND (p_start IS NULL OR payment_date>=p_start) AND (p_end IS NULL OR payment_date<=p_end);
$$;
REVOKE ALL ON FUNCTION internal_financial_payments.received_in_period(uuid,date,date) FROM PUBLIC,anon,authenticated,service_role;
DO $summary$
DECLARE definition text; old_text text; new_text text;
BEGIN
 definition:=pg_get_functiondef('public.get_receivables_modality_summary_v3_secure(text,uuid,uuid,text,date,date)'::regprocedure);
 old_text:='SELECT cr.status, cr.valor, cr.valor_pago,';
 new_text:=$new$SELECT cr.status, cr.valor, cr.valor_pago,
      coalesce((cr.payment_summary->>'remainingBefore')::numeric,cr.valor) AS remaining_value,
      CASE WHEN cr.payment_summary IS NOT NULL THEN internal_financial_payments.received_in_period(cr.id,p_due_start,p_due_end)
        WHEN cr.status='PAGO' AND (p_due_start IS NULL OR cr.data_pagamento>=p_due_start)
          AND (p_due_end IS NULL OR cr.data_pagamento<=p_due_end) THEN coalesce(cr.valor_pago,cr.valor) ELSE 0 END AS received_amount,$new$;
 IF length(definition)-length(replace(definition,old_text,''))<>length(old_text) THEN
   RAISE EXCEPTION 'PAYMENT_RECEIVABLE_SUMMARY_DRIFT'; END IF;
 definition:=replace(definition,old_text,new_text);
 old_text:=$old$OR (cr.status = 'PAGO'$old$;
 IF length(definition)-length(replace(definition,old_text,''))<>length(old_text) THEN
   RAISE EXCEPTION 'PAYMENT_RECEIVABLE_PERIOD_DRIFT'; END IF;
 definition:=replace(definition,old_text,$new$OR (internal_financial_payments.received_in_period(cr.id,p_due_start,p_due_end)>0 OR cr.status = 'PAGO'$new$);
 old_text:=$old$COALESCE(SUM(COALESCE(valor_pago, valor)) FILTER (WHERE payment_in_period AND status = 'PAGO'), 0)$old$;
 IF length(definition)-length(replace(definition,old_text,''))<>length(old_text) THEN
   RAISE EXCEPTION 'PAYMENT_RECEIVABLE_PAID_AGGREGATE_DRIFT'; END IF;
 definition:=replace(definition,old_text,'COALESCE(SUM(received_amount),0)');
 old_text:=$old$SUM(valor) FILTER (WHERE due_in_period AND status IN ('PENDENTE', 'VENCIDO', 'SUSPENSO'))$old$;
 IF length(definition)-length(replace(definition,old_text,''))<>length(old_text) THEN
   RAISE EXCEPTION 'PAYMENT_RECEIVABLE_PENDING_DRIFT'; END IF;
 definition:=replace(definition,old_text,replace(old_text,'SUM(valor)','SUM(remaining_value)'));
 old_text:=$old$SUM(valor) FILTER (WHERE due_in_period AND status = 'VENCIDO'$old$;
 IF length(definition)-length(replace(definition,old_text,''))<>length(old_text) THEN
   RAISE EXCEPTION 'PAYMENT_RECEIVABLE_OVERDUE_DRIFT'; END IF;
 EXECUTE replace(definition,old_text,replace(old_text,'SUM(valor)','SUM(remaining_value)'));
END $summary$;
DO $other_summary$
DECLARE definition text; old_text text;
BEGIN
 definition:=pg_get_functiondef('public.get_outros_creditos_summary(uuid,text,date,date,uuid)'::regprocedure);
 old_text:='      valor_pago numeric,';
 IF length(definition)-length(replace(definition,old_text,''))<>length(old_text) THEN
   RAISE EXCEPTION 'PAYMENT_OTHER_SUMMARY_SHAPE_DRIFT'; END IF;
 definition:=replace(definition,old_text,old_text||E'\n      payment_summary jsonb,');
 old_text:=$old$coalesce(sum(coalesce(valor_pago, valor)) FILTER (WHERE status = 'PAGO'), 0)$old$;
 IF length(definition)-length(replace(definition,old_text,''))<>length(old_text) THEN
   RAISE EXCEPTION 'PAYMENT_OTHER_SUMMARY_PAID_DRIFT'; END IF;
 definition:=replace(definition,old_text,$new$coalesce(sum(CASE WHEN payment_summary IS NOT NULL THEN
      (payment_summary->>'previouslyPaid')::numeric WHEN status='PAGO' THEN coalesce(valor_pago,valor) ELSE 0 END),0)$new$);
 old_text:=$old$sum(valor) FILTER (WHERE status IN ('PENDENTE', 'VENCIDO', 'SUSPENSO'))$old$;
 IF length(definition)-length(replace(definition,old_text,''))<>length(old_text) THEN
   RAISE EXCEPTION 'PAYMENT_OTHER_SUMMARY_PENDING_DRIFT'; END IF;
 definition:=replace(definition,old_text,replace(old_text,'sum(valor)',
   $new$sum(coalesce((payment_summary->>'remainingBefore')::numeric,valor))$new$));
 old_text:=E'coalesce(sum(valor) FILTER (\n      WHERE status = ''VENCIDO''';
 IF length(definition)-length(replace(definition,old_text,''))<>length(old_text) THEN
   RAISE EXCEPTION 'PAYMENT_OTHER_SUMMARY_OVERDUE_DRIFT'; END IF;
 EXECUTE replace(definition,old_text,replace(old_text,'sum(valor)',
   $new$sum(coalesce((payment_summary->>'remainingBefore')::numeric,valor))$new$));
END $other_summary$;
DO $projections$
DECLARE definition text; old_text text;
BEGIN
 definition:=pg_get_functiondef('public.listar_outros_creditos_secure(uuid)'::regprocedure);
 old_text:=$old$'other_credit_cancellation_eligible', internal_other_credit_cancellation.eligible(credito),$old$;
 IF length(definition)-length(replace(definition,old_text,''))<>length(old_text) THEN
   RAISE EXCEPTION 'PAYMENT_OTHER_LIST_DRIFT'; END IF;
 EXECUTE replace(definition,old_text,old_text||E'\n      ''payment_summary'', credito.payment_summary,');
 definition:=pg_get_functiondef('public.get_receivables_modality_page_v4_secure(text,uuid,uuid,text,date,date,text,text,text,integer,integer)'::regprocedure);
 old_text:=$old$'manual_settlement_id', target.manual_settlement_id,$old$;
 IF length(definition)-length(replace(definition,old_text,''))<>length(old_text) THEN
   RAISE EXCEPTION 'PAYMENT_RECEIVABLE_PAGE_DRIFT'; END IF;
 EXECUTE replace(definition,old_text,old_text||E'\n      ''payment_summary'', target.payment_summary,');
END $projections$;
NOTIFY pgrst,'reload schema';
COMMIT;
