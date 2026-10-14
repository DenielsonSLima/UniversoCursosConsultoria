BEGIN;
-- Monetary slices retain their amounts while position APIs identify the source title.
DO $positions$
DECLARE definition text;
BEGIN
 definition:=pg_get_functiondef('internal_contas.caixa_receivables_position_rows(uuid,date,date)'::regprocedure);
 IF md5(definition)<>'f9395df9408c389ec4b58c6aef5942b8' THEN RAISE EXCEPTION 'Cash position reader changed; review before applying'; END IF;
 definition:=replace(definition,'select r.id,r.polo_id,r.data_vencimento',
   'select internal_financial_payments.cash_source_id(r.id),r.polo_id,r.data_vencimento');
 definition:=replace(definition,'ead_checkout_is_optional(c.id)',
   'ead_checkout_is_optional(internal_financial_payments.cash_source_id(c.id))');
 definition:=replace(definition,'ead_checkout_paid_after_cutoff(c.id,',
   'ead_checkout_paid_after_cutoff(internal_financial_payments.cash_source_id(c.id),');
 EXECUTE definition;
 definition:=pg_get_functiondef('public.get_caixa_receivables_position_secure(uuid,date)'::regprocedure);
 IF md5(definition)<>'d8339e2be49f3b70166d9c477ea49fac' THEN RAISE EXCEPTION 'Cash position summary changed; review before applying'; END IF;
 definition:=replace(definition,$fragment$'monthly' context,principal,due_date$fragment$,
   $fragment$'monthly' context,id,principal,due_date$fragment$);
 definition:=replace(definition,$fragment$'portfolio',principal,due_date$fragment$,
   $fragment$'portfolio',id,principal,due_date$fragment$);
 definition:=replace(definition,'count(*) filter(where position',
   'count(DISTINCT id) filter(where position');
 EXECUTE definition;
END $positions$;
COMMIT;
