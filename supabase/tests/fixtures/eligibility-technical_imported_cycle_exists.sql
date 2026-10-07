CREATE OR REPLACE FUNCTION internal_academic.technical_imported_cycle_exists(p_matricula_id uuid, p_cycle_number integer)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from internal_academic.technical_imported_cycle_facts fact
    where fact.matricula_id = p_matricula_id
      and fact.cycle_number = p_cycle_number
  );
$function$
;

