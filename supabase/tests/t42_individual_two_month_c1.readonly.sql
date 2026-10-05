-- Run only after the individual C1 operation of 05/10/2026 and before C2 issuance, through MCP Supabase.
-- This checks the durable result without issuing debt or changing any row.
begin transaction read only;
set local statement_timeout = '30s';

do $individual_c1_contract$
declare
  v_matricula_id uuid;
  v_evidence internal_proesc.enrollment_cycle_evidence%rowtype;
  v_fact internal_academic.technical_imported_cycle_facts%rowtype;
  v_cache internal_proesc.cycle_review_cache%rowtype;
  v_request internal_proesc.cycle_evidence_requests%rowtype;
  v_context jsonb;
  v_state jsonb;
  v_template jsonb;
  v_extra jsonb;
  v_original jsonb;
  v_shifted jsonb;
  v_other_count integer;
  v_other_blocked boolean;
begin
  select request.matricula_id into strict v_matricula_id
  from internal_proesc.cycle_evidence_requests request
  where request.response ->> 'remediation' = 'T42_C1_TWO_MONTH_START';
  select * into strict v_evidence
  from internal_proesc.enrollment_cycle_evidence
  where matricula_id = v_matricula_id;
  select * into strict v_fact
  from internal_academic.technical_imported_cycle_facts
  where matricula_id = v_matricula_id and cycle_number = 1;
  select * into strict v_cache
  from internal_proesc.cycle_review_cache
  where id = (v_evidence.source_evidence ->> 'cacheId')::uuid;
  select * into strict v_request
  from internal_proesc.cycle_evidence_requests
  where request_id = v_fact.proof_reference_id;
  v_context := internal_proesc.cycle_review_context(v_matricula_id);
  v_state := internal_academic.technical_manual_cycle_state(v_matricula_id);

  if v_evidence.classification <> 'C1'
    or v_evidence.verification <> 'CONFIRMED'
    or v_evidence.has_external_cycle2 is distinct from false
    or v_evidence.source_observed_at is distinct from v_cache.verified_observed_at
    or v_evidence.source_evidence ->> 'decisionOrigin'
      is distinct from 'HISTORICAL_API_SNAPSHOT_TECHNICAL_REVIEW'
    or v_evidence.source_evidence #>> '{startWindowException,actualStartDate}'
      is distinct from '2025-09-01'
    or v_evidence.source_evidence #>> '{startWindowException,firstDueDate}'
      is distinct from '2025-11-17'
    or v_evidence.source_evidence ->> 'sourceHash' is distinct from v_cache.source_hash
    or v_cache.source_hash is distinct from encode(extensions.digest(
      v_cache.obligations::text, 'sha256'
    ), 'hex')
    or v_evidence.obligation_manifest_hash is distinct from
      internal_proesc.enrollment_cycle_manifest_hash(v_matricula_id)
    or v_fact.administration_origin <> 'EXTERNAL_PROESC'
    or v_fact.proof_kind <> 'PROESC_API_SCHEDULE'
    or v_fact.proof_hash <> v_evidence.evidence_hash
    or v_fact.identity_hash is distinct from
      internal_academic.technical_imported_cycle_identity_context(
        v_matricula_id
      ) ->> 'identityHash'
    or v_request.matricula_id <> v_matricula_id
    or v_request.after_state ->> 'evidence_hash' <> v_fact.proof_hash
    or v_request.response ->> 'remediation' <> 'T42_C1_TWO_MONTH_START'
    or v_state ->> 'estado' <> 'ELEGIVEL'
    or v_state ->> 'proximoCicloNumero' <> '2'
    or not internal_academic.technical_imported_cycle_generation_permitted(
      v_matricula_id
    )
  then
    raise exception 'Individual C1 fact, audit or C2 eligibility is inconsistent.';
  end if;

  if internal_academic.technical_imported_cycle_exists(v_matricula_id, 2)
    or internal_academic.technical_imported_cycle_has_conflict(v_matricula_id)
    or exists (select 1 from internal_academic.technical_external_cycle_coverage
      where matricula_id = v_matricula_id)
    or exists (select 1 from internal_academic.technical_manual_cycle_runs
      where matricula_id = v_matricula_id)
  then
    raise exception 'C2 coverage or an issuance run appeared unexpectedly.';
  end if;

  -- The shared classifier remains strict; only the audited individual fact
  -- accepts this historical two-month gap.
  v_original := internal_proesc.evaluate_api_cycle_schedule(
    v_context, v_cache.obligations
  );
  v_shifted := internal_proesc.evaluate_api_cycle_schedule(
    jsonb_set(v_context, '{startDate}', to_jsonb(date '2025-10-01')),
    v_cache.obligations
  );
  if v_original ->> 'classification' <> 'UNKNOWN'
    or v_original ->> 'reason' <>
      'Datas das parcelas não comprovam os 12 meses do primeiro ciclo.'
    or v_shifted ->> 'classification' <> 'C1'
    or internal_proesc.evaluate_api_cycle_schedule(
      jsonb_set(v_context, '{startDate}', to_jsonb(date '2025-08-01')),
      v_cache.obligations
    ) ->> 'classification' <> 'UNKNOWN'
  then
    raise exception 'Shared first-due classifier changed beyond the exception.';
  end if;

  select item into strict v_template
  from jsonb_array_elements(v_cache.obligations) item
  where item ->> 'classId' = v_context ->> 'classId'
    and item ->> 'personHash' = v_context ->> 'personHash'
    and item ->> 'amountCents' = '27990'
  order by item ->> 'dueDate' limit 1;
  select jsonb_agg(v_template || jsonb_build_object(
    'key', '__synthetic_c2_' || ordinal::text,
    'amountCents', case when ordinal = 13 then 10000 else 27990 end,
    'dueDate', to_char(date '2026-11-15'
      + ((ordinal - 1) || ' months')::interval, 'YYYY-MM-DD')
  ) order by ordinal) into v_extra
  from generate_series(1, 13) ordinal;
  if internal_proesc.evaluate_api_cycle_schedule(
      v_context, v_cache.obligations || v_extra
    ) ->> 'classification' <> 'FULL'
  then
    raise exception 'A second-cycle schedule did not retain FULL protection.';
  end if;

  -- Another T42 enrollment with a three-month gap stays blocked. The test
  -- locates it by dates and state, without embedding another student ID.
  with other_t42 as (
    select enrollment.id
    from public.matriculas enrollment
    join public.turmas class on class.id = enrollment.turma_id
    join internal_proesc.enrollment_cycle_evidence evidence
      on evidence.matricula_id = enrollment.id
    where class.codigo = 'ENF-T42-INT-MAT'
      and enrollment.id <> v_matricula_id
      and evidence.classification = 'UNKNOWN'
      and evidence.verification = 'REVIEW'
      and evidence.source_evidence ->> 'reason' =
        'Datas das parcelas não comprovam os 12 meses do primeiro ciclo.'
      and date_trunc('month', (select min(receivable.data_vencimento)
        from public.contas_receber receivable
        where receivable.matricula_id = enrollment.id)) =
        date_trunc('month', (
          internal_proesc.cycle_review_context(enrollment.id) ->> 'startDate'
        )::date) + interval '3 months'
  )
  select count(*), bool_and(
    not internal_academic.technical_imported_cycle_has_confirmed(id, 1)
    and internal_academic.technical_manual_cycle_state(id) ->> 'podeGerar' = 'false'
  ) into v_other_count, v_other_blocked from other_t42;
  if v_other_count <> 1 or v_other_blocked is distinct from true then
    raise exception 'The other T42 date-gap enrollment changed unexpectedly.';
  end if;
end;
$individual_c1_contract$;

rollback;
