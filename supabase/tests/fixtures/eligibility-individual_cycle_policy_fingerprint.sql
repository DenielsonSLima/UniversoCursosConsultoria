CREATE OR REPLACE FUNCTION internal_proesc.individual_cycle_policy_fingerprint(p_matricula_id uuid, p_base text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case
    when p_base is null or p_base !~ '^[0-9a-f]{64}$' then p_base
    when exists (
      select 1 from internal_academic.technical_imported_cycle_facts fact
      where fact.matricula_id = p_matricula_id
    ) then encode(extensions.digest(jsonb_build_object(
      'base', p_base,
      'matriculaId', p_matricula_id,
      'identity', internal_academic.technical_imported_cycle_identity_context(
        p_matricula_id
      ) ->> 'identityHash',
      'facts', (select jsonb_agg(jsonb_build_object(
        'cycle', fact.cycle_number,
        'origin', fact.administration_origin,
        'proof', fact.proof_hash,
        'identity', fact.identity_hash
      ) order by fact.cycle_number)
      from internal_academic.technical_imported_cycle_facts fact
      where fact.matricula_id = p_matricula_id),
      'conflict', internal_academic.technical_imported_cycle_has_conflict(
        p_matricula_id
      )
    )::text, 'sha256'), 'hex')
    else internal_proesc
      .individual_cycle_policy_fingerprint_before_durable_facts(
        p_matricula_id, p_base
      )
  end;
$function$
;

