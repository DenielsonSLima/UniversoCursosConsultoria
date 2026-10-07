CREATE OR REPLACE FUNCTION internal_proesc.has_confirmed_first_cycle_only(p_matricula_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select internal_academic.technical_imported_cycle_has_confirmed(
      p_matricula_id, 1
    )
    and not internal_academic.technical_imported_cycle_exists(
      p_matricula_id, 2
    )
    and not exists (
      select 1
      from internal_academic.technical_external_cycle_coverage coverage
      where coverage.matricula_id = p_matricula_id
    )
    and (
      not exists (
        select 1
        from internal_academic.technical_manual_cycle_runs run
        where run.matricula_id = p_matricula_id
      )
      or (
        internal_academic.technical_imported_banese_cycle_is_durable(
          p_matricula_id, 1
        )
        and (select count(*)
          from internal_academic.technical_manual_cycle_runs run
          where run.matricula_id = p_matricula_id) = 1
      )
    );
$function$
;

