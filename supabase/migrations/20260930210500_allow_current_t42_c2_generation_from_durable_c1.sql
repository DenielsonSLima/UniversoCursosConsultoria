-- Preserve the durable T42 C1 proof only inside the exact authorized local C2
-- transaction. Completed, foreign or ambiguous runs remain fenced.
begin;

do $guard$
begin
  if md5(pg_get_functiondef(
    'internal_proesc.is_t42_durable_imported_c1(uuid)'::regprocedure
  )) <> '4a7f65bf69375c7a36fdc1deba968061' then
    raise exception 'T42 durable-C1 predicate changed; review before applying.';
  end if;
end;
$guard$;

create or replace function internal_proesc.is_t42_durable_imported_c1(
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
        and cache.verified_observed_at = evidence.source_observed_at
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
        and (
          not exists (
            select 1
            from internal_academic.technical_manual_cycle_runs run
            where run.matricula_id = enrollment.id
          )
          or (
            (
              select count(*)
              from internal_academic.technical_manual_cycle_runs run
              where run.matricula_id = enrollment.id
            ) = 1
            and exists (
              select 1
              from internal_academic.technical_manual_cycle_runs run
              where run.matricula_id = enrollment.id
                and run.cycle_number = 2
                and run.state = 'GENERATING'
                and run.request_id is not null
                and run.completed_at is null
                and run.xmin = pg_catalog.pg_current_xact_id_if_assigned()::xid
                and coalesce(cardinality(run.receivable_ids), 0) = 0
            )
          )
        )
        and not exists (
          select 1
          from internal_academic.technical_external_cycle_coverage coverage
          where coverage.matricula_id = enrollment.id
        )
    );
$function$;

revoke all on function internal_proesc.is_t42_durable_imported_c1(uuid)
  from public, anon, authenticated, service_role;

comment on function internal_proesc.is_t42_durable_imported_c1(uuid) is
  'Durable T42 C1 proof. During issuance, only the sole C2 GENERATING run created by the current database transaction is admitted; completed, foreign or ambiguous runs remain fenced.';

notify pgrst, 'reload schema';
commit;
