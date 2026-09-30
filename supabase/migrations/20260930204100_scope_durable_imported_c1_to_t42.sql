-- Restrict the offline-continuation hotfix to the imported T42 seed class.
-- Other Proesc import batches retain their existing online-review contract.
begin;

create function internal_proesc.is_t42_durable_imported_c1(
  p_matricula_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
      select 1
      from public.matriculas enrollment
      join public.turmas class on class.id = enrollment.turma_id
      join internal_proesc.class_scopes scope
        on scope.turma_id = enrollment.turma_id
      join internal_academic.technical_manual_cycle_policies policy
        on policy.turma_id = enrollment.turma_id
      join internal_proesc.enrollment_cycle_evidence evidence
        on evidence.matricula_id = enrollment.id
        and evidence.scope_id = scope.id
      join internal_proesc.cycle_review_cache cache
        on cache.id::text = evidence.source_evidence ->> 'cacheId'
      where enrollment.id = p_matricula_id
        and class.codigo = 'ENF-T42-INT-MAT'
        and upper(enrollment.status) = 'ATIVO'
        and scope.phase = 'CONFIRMED'
        and scope.batch_id is null
        and scope.financial_mode = 'CICLO1_PROESC'
        and policy.active
        and policy.generation_mode = 'MANUAL'
        and policy.initial_state = 'IMPORTADA_CICLO_1'
        and policy.baseline_cycle = 1
        and policy.max_cycle = 2
        and policy.eligibility_rule = 'HISTORICO_IMPORTADO_CONSULTA'
        and evidence.classification = 'C1'
        and evidence.has_external_cycle2 is false
        and evidence.verification = 'CONFIRMED'
        and evidence.evidence_kind = 'API_SCHEDULE_REVIEW'
        and evidence.obligation_manifest_hash =
          internal_proesc.enrollment_cycle_manifest_hash(enrollment.id)
        and cache.state = 'COMPLETE'
        and cache.observed_at = evidence.source_observed_at
        and cache.source_hash = evidence.source_evidence ->> 'sourceHash'
        and internal_proesc.cycle_review_context(enrollment.id)
          ->> 'academicFingerprint' =
            evidence.source_evidence ->> 'academicFingerprint'
        and internal_proesc.cycle_review_context(enrollment.id)
          ->> 'classStartDate' =
            evidence.source_evidence ->> 'classStartDate'
        and not exists (
          select 1
          from internal_proesc.obligation_links link
          join internal_proesc.obligation_imports imported
            on imported.link_id = link.id
          where link.matricula_id = enrollment.id
            and imported.source_cycle in ('SECOND', 'FULL_CONTRACT')
        )
        and not exists (
          select 1
          from internal_academic.technical_manual_cycle_runs run
          where run.matricula_id = enrollment.id
        )
        and not exists (
          select 1
          from internal_academic.technical_external_cycle_coverage coverage
          where coverage.matricula_id = enrollment.id
        )
    );
$function$;

create or replace function internal_proesc.assert_fresh_cycle_generation(
  p_matricula_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if internal_academic.technical_local_cycle_eligible(p_matricula_id)
    or internal_proesc.is_t42_durable_imported_c1(p_matricula_id)
  then
    return;
  end if;

  perform internal_proesc.assert_fresh_cycle_generation_before_individual_admission(
    p_matricula_id
  );
end;
$function$;

create or replace function internal_academic.technical_manual_cycle_state(
  p_matricula_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_state jsonb;
begin
  v_state := internal_academic
    .technical_manual_cycle_state_before_durable_imported_history(
      p_matricula_id
    );

  if internal_proesc.is_t42_durable_imported_c1(p_matricula_id) then
    return v_state - 'conferenciaProesc';
  end if;

  return v_state;
end;
$function$;

revoke all on function internal_proesc.is_t42_durable_imported_c1(uuid),
  internal_proesc.assert_fresh_cycle_generation(uuid),
  internal_academic.technical_manual_cycle_state(uuid)
  from public, anon, authenticated, service_role;

comment on function internal_proesc.is_t42_durable_imported_c1(uuid) is
  'Narrow predicate for T42 imported-C1 continuation from durable local evidence; excludes other Proesc batches, existing runs and external C2 coverage.';

notify pgrst, 'reload schema';
commit;
