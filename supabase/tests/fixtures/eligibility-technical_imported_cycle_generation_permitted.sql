CREATE OR REPLACE FUNCTION internal_academic.technical_imported_cycle_generation_permitted(p_matricula_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select internal_academic.technical_imported_cycle_has_confirmed(
      enrollment.id, 1
    )
    and not internal_academic.technical_imported_cycle_exists(enrollment.id, 2)
    and not internal_academic.technical_imported_cycle_has_conflict(enrollment.id)
    and upper(enrollment.status) in ('ATIVO', 'PENDENTE')
    and not internal_academic.technical_cycle_history_outside_enrollment(
      enrollment.id
    )
    and exists (
      select 1 from public.matriculas_tecnicas_financeiro_config config
      where config.matricula_id = enrollment.id
    )
    and not exists (
      select 1 from internal_proesc.enrollment_cycle_evidence evidence
      where evidence.matricula_id = enrollment.id
        and evidence.classification = 'FULL'
        and evidence.verification = 'CONFIRMED'
        and evidence.has_external_cycle2 is true
    )
    and not exists (
      select 1 from internal_academic.technical_external_cycle_coverage coverage
      where coverage.matricula_id = enrollment.id
    )
    and not exists (
      select 1
      from internal_proesc.obligation_links link
      join internal_proesc.obligation_imports imported
        on imported.link_id = link.id
      where link.matricula_id = enrollment.id
        and imported.source_cycle in ('SECOND', 'FULL_CONTRACT')
    )
    and (
      (
        not exists (
          select 1 from internal_academic.technical_imported_cycle_facts fact
          where fact.matricula_id = enrollment.id
            and fact.cycle_number = 1
            and fact.administration_origin = 'IMPORTED_BANESE'
        )
        and (
          not exists (
            select 1 from internal_academic.technical_manual_cycle_runs run
            where run.matricula_id = enrollment.id
          )
          or ((select count(*)
              from internal_academic.technical_manual_cycle_runs run
              where run.matricula_id = enrollment.id) = 1
            and exists (
              select 1 from internal_academic.technical_manual_cycle_runs run
              where run.matricula_id = enrollment.id
                and run.cycle_number = 2 and run.state = 'GENERATING'
                and run.request_id is not null and run.completed_at is null
                and run.xmin = pg_catalog.pg_current_xact_id_if_assigned()::xid
                and coalesce(cardinality(run.receivable_ids), 0) = 0
            ))
        )
      )
      or (
        internal_academic.technical_imported_banese_cycle_is_durable(
          enrollment.id, 1
        )
        and (select count(*)
          from internal_academic.technical_manual_cycle_runs run
          where run.matricula_id = enrollment.id) in (1, 2)
        and not exists (
          select 1 from internal_academic.technical_manual_cycle_runs run
          where run.matricula_id = enrollment.id
            and not (
              (run.cycle_number = 1 and run.state = 'PROTECTED_EXISTING')
              or (run.cycle_number = 2 and run.state = 'GENERATING'
                and run.request_id is not null and run.completed_at is null
                and run.xmin = pg_catalog.pg_current_xact_id_if_assigned()::xid
                and coalesce(cardinality(run.receivable_ids), 0) = 0)
            )
        )
      )
    )
  from public.matriculas enrollment
  where enrollment.id = p_matricula_id;
$function$
;

