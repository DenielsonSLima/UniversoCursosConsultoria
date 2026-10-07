CREATE OR REPLACE FUNCTION internal_academic.technical_imported_banese_cycle_is_durable(p_matricula_id uuid, p_cycle_number integer)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from internal_academic.technical_imported_cycle_facts fact
    join internal_academic.technical_manual_cycle_runs run
      on run.matricula_id = fact.matricula_id
      and run.cycle_number = fact.cycle_number
    where fact.matricula_id = p_matricula_id
      and fact.cycle_number = p_cycle_number
      and fact.administration_origin = 'IMPORTED_BANESE'
      and fact.proof_kind = 'BANESE_PROTECTED_RUN'
      and fact.identity_hash =
        internal_academic.technical_imported_cycle_identity_context(
          p_matricula_id
        ) ->> 'identityHash'
      and run.state = 'PROTECTED_EXISTING'
      and run.completed_at is not null
      and cardinality(run.receivable_ids) = run.item_count
      and not exists (
        select 1
        from internal_academic.technical_imported_cycle_fact_conflicts conflict
        where conflict.matricula_id = fact.matricula_id
          and conflict.cycle_number = fact.cycle_number
      )
  );
$function$
;

