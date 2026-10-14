BEGIN;
-- Manual ledger payments settle only the selected title. Automatic legacy
-- payments keep the pre-existing cycle behavior, including its policy gates.
DO $lifecycle$
DECLARE definition text; old_text text:=E'begin\n  if new.status = ''PAGO''';
BEGIN
 definition:=pg_get_functiondef('public.gerar_ciclo_financeiro_apos_pagamento()'::regprocedure);
 IF md5(definition)<>'d34ef7c6166d490623fd288e984e4fc7'
   OR length(definition)-length(replace(definition,old_text,''))<>length(old_text) THEN
   RAISE EXCEPTION 'PAYMENT_CYCLE_TRIGGER_DRIFT';
 END IF;
 EXECUTE replace(definition,old_text,$new$begin
  if exists(select 1 from public.financial_payment_events where source_kind='RECEIVABLE' and source_id=new.id) then
    return new;
  end if;
  if new.status = 'PAGO'$new$);
END $lifecycle$;
COMMIT;
