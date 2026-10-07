CREATE OR REPLACE FUNCTION internal_academic.technical_manual_cycle_due_from_last_boleto(p_last_due date)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO ''
AS $function$
  select public.data_vencimento_mensal(
    p_last_due,
    extract(day from p_last_due)::integer,
    1
  );
$function$
;

