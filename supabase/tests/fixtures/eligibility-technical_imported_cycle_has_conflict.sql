CREATE OR REPLACE FUNCTION internal_academic.technical_imported_cycle_has_conflict(p_matricula_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(
    (internal_academic.technical_imported_cycle_fact_state(p_matricula_id)
      ->> 'identityConflict')::boolean, false
  ) or coalesce(
    (internal_academic.technical_imported_cycle_fact_state(p_matricula_id)
      ->> 'recordedConflict')::boolean, false
  );
$function$
;

