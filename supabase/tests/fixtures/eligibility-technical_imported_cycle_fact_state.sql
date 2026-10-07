CREATE OR REPLACE FUNCTION internal_academic.technical_imported_cycle_fact_state(p_matricula_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with identity_context as (
    select internal_academic.technical_imported_cycle_identity_context(
      p_matricula_id
    ) as value
  )
  select jsonb_build_object(
    'cycle1Confirmed', exists (
      select 1
      from internal_academic.technical_imported_cycle_facts fact,
        identity_context context
      where fact.matricula_id = p_matricula_id
        and fact.cycle_number = 1
        and fact.identity_hash = context.value ->> 'identityHash'
        and not exists (
          select 1
          from internal_academic.technical_imported_cycle_fact_conflicts conflict
          where conflict.matricula_id = fact.matricula_id
            and conflict.cycle_number = fact.cycle_number
        )
    ),
    'cycle2Confirmed', exists (
      select 1 from internal_academic.technical_imported_cycle_facts fact
      where fact.matricula_id = p_matricula_id and fact.cycle_number = 2
    ),
    'identityConflict', exists (
      select 1
      from internal_academic.technical_imported_cycle_facts fact,
        identity_context context
      where fact.matricula_id = p_matricula_id
        and fact.identity_hash is distinct from context.value ->> 'identityHash'
    ),
    'recordedConflict', exists (
      select 1
      from internal_academic.technical_imported_cycle_fact_conflicts conflict
      where conflict.matricula_id = p_matricula_id
    ),
    'cycles', coalesce((
      select jsonb_object_agg(fact.cycle_number::text, jsonb_build_object(
        'administrationOrigin', fact.administration_origin,
        'sourceSystem', fact.source_system,
        'proofKind', fact.proof_kind,
        'identityConfirmed', fact.identity_hash = context.value ->> 'identityHash',
        'confirmedAt', fact.confirmed_at
      ) order by fact.cycle_number)
      from internal_academic.technical_imported_cycle_facts fact
      cross join identity_context context
      where fact.matricula_id = p_matricula_id
    ), '{}'::jsonb)
  )
  from identity_context;
$function$
;

