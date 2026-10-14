BEGIN;
-- Keep existing filters, RLS/invoker semantics and group authorization intact.
-- Only the amount expressions change: a partial event has both paid and open value.
DO $patch$
DECLARE item record; definition text; old_text text; new_text text;
BEGIN
 FOR item IN SELECT * FROM (VALUES
  ('public.get_despesas_summary(text,uuid,uuid,text,date,date,text,uuid)','c22b5fdd6446d1a3756421e40675aaf0'),
  ('public.get_despesas_group_summary_secure(text,uuid,uuid,text,date,date,text,uuid)','1aa2cc0dfc363ddd286199ad42c170ce'),
  ('public.get_despesas_summary(text,uuid,uuid,text,date,date,text)','5085a0925350ad18dab50265987fc7ca')
 ) AS targets(signature,definition_hash) LOOP
  definition:=pg_get_functiondef(item.signature::regprocedure);
  IF md5(definition)<>item.definition_hash THEN
   RAISE EXCEPTION 'PAYMENT_EXPENSE_SUMMARY_DEFINITION_DRIFT: %',item.signature;
  END IF;
  IF item.signature='public.get_despesas_summary(text,uuid,uuid,text,date,date,text)' THEN
   old_text:=$old$CASE WHEN d.status = 'PAGO' THEN COALESCE(d.valor_pago, d.valor) ELSE 0.00 END$old$;
   new_text:=$new$CASE WHEN d.payment_summary IS NOT NULL THEN (d.payment_summary->>'previouslyPaid')::numeric
      WHEN d.status = 'PAGO' THEN COALESCE(d.valor_pago, d.valor) ELSE 0.00 END$new$;
   definition:=replace(definition,old_text,new_text);
   definition:=replace(definition,
    $old$THEN d.valor ELSE 0.00 END$old$,
    $new$THEN COALESCE((d.payment_summary->>'remainingBefore')::numeric,d.valor) ELSE 0.00 END$new$);
  ELSE
   old_text:=$old$coalesce(sum(coalesce(despesa.valor_pago, despesa.valor)) FILTER (
      WHERE despesa.status = 'PAGO'
    ), 0)$old$;
   new_text:=$new$coalesce(sum(CASE WHEN despesa.payment_summary IS NOT NULL
      THEN (despesa.payment_summary->>'previouslyPaid')::numeric
      WHEN despesa.status='PAGO' THEN coalesce(despesa.valor_pago,despesa.valor) ELSE 0 END),0)$new$;
   definition:=replace(definition,old_text,new_text);
   definition:=replace(definition,
    $old$sum(despesa.valor) FILTER (
      WHERE despesa.status IN ('PENDENTE', 'VENCIDO')$old$,
    $new$sum(coalesce((despesa.payment_summary->>'remainingBefore')::numeric,despesa.valor)) FILTER (
      WHERE despesa.status IN ('PENDENTE', 'VENCIDO')$new$);
  END IF;
  EXECUTE definition;
 END LOOP;
END $patch$;
NOTIFY pgrst,'reload schema';
COMMIT;
