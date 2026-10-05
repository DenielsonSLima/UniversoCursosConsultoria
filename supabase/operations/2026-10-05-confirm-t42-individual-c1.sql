-- Confirm one imported C1 from its complete, identified Proesc snapshot.
-- The general one-month classifier and every other enrollment stay unchanged.
-- The historical collection proves its own 2026-10-01 window, not a fresh
-- assertion that Proesc has no C2 on the day this migration is applied.
begin;
set local lock_timeout = '5s';

do $confirm_individual_c1$
declare
  v_matricula_id constant uuid := 'd29e3b70-da38-41e5-90f4-193227e8856e';
  v_cache_id constant uuid := '969227ed-8ca8-448d-9eed-cb8fd77eb997';
  v_actor_id constant uuid := 'c3144ce7-50c4-44c1-ab8c-6282e2d6630a';
  v_turma_id uuid;
  v_enrollment public.matriculas%rowtype;
  v_scope internal_proesc.class_scopes%rowtype;
  v_old internal_proesc.enrollment_cycle_evidence%rowtype;
  v_new internal_proesc.enrollment_cycle_evidence%rowtype;
  v_cache internal_proesc.cycle_review_cache%rowtype;
  v_prior_request internal_proesc.cycle_evidence_requests%rowtype;
  v_fact internal_academic.technical_imported_cycle_facts%rowtype;
  v_context jsonb;
  v_identity jsonb;
  v_original_result jsonb;
  v_confirmed_result jsonb;
  v_source jsonb;
  v_first_due date;
  v_last_due date;
  v_evidence_hash text;
  v_request_id uuid := gen_random_uuid();
  v_state jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'technical-manual-cycle-enrollment:' || v_matricula_id::text, 0
  ));
  select enrollment.turma_id into strict v_turma_id
  from public.matriculas enrollment where enrollment.id = v_matricula_id;
  perform 1 from public.turmas class where class.id = v_turma_id for update;
  select * into strict v_enrollment from public.matriculas enrollment
  where enrollment.id = v_matricula_id for update;
  select * into strict v_scope from internal_proesc.class_scopes scope
  where scope.turma_id = v_turma_id and scope.phase = 'CONFIRMED' for update;
  v_identity := internal_academic.technical_imported_cycle_identity_context(
    v_matricula_id
  );

  -- Replay of this exact audited correction is a no-op, including after C2.
  select * into v_fact from internal_academic.technical_imported_cycle_facts fact
  where fact.matricula_id = v_matricula_id and fact.cycle_number = 1 for share;
  if found then
    if v_fact.administration_origin is distinct from 'EXTERNAL_PROESC'
      or v_fact.proof_kind is distinct from 'PROESC_API_SCHEDULE'
      or v_fact.identity_hash is distinct from v_identity ->> 'identityHash'
      or not exists (
        select 1 from internal_proesc.cycle_evidence_requests request
        where request.request_id = v_fact.proof_reference_id
          and request.matricula_id = v_matricula_id
          and request.payload_hash = v_fact.audit_hash
          and request.after_state ->> 'evidence_hash' = v_fact.proof_hash
          and request.response ->> 'remediation' = 'T42_C1_TWO_MONTH_START'
      ) then
      raise exception 'Existing C1 fact differs from the audited correction.';
    end if;
    return;
  end if;

  if v_identity is null or v_enrollment.status <> 'ATIVO'
    or not exists (
      select 1 from public.usuarios_sistema actor
      where actor.id = v_actor_id and lower(actor.perfil) = 'gestor'
        and lower(actor.status) in ('ativo', 'active')
        and actor.auth_user_id is not null
    )
    or not exists (
      select 1 from public.turmas class
      where class.id = v_turma_id and class.codigo = 'ENF-T42-INT-MAT'
    )
    or v_scope.batch_id is not null
    or v_scope.financial_mode <> 'CICLO1_PROESC'
    or not exists (
      select 1 from public.matriculas_tecnicas_financeiro_config config
      where config.matricula_id = v_matricula_id
    )
    or internal_academic.technical_cycle_history_outside_enrollment(
      v_matricula_id
    ) then
    raise exception 'Individual T42 academic or financial scope changed.';
  end if;

  select * into strict v_old from internal_proesc.enrollment_cycle_evidence evidence
  where evidence.matricula_id = v_matricula_id for update;
  select * into strict v_cache from internal_proesc.cycle_review_cache cache
  where cache.id = v_cache_id for share;
  select * into strict v_prior_request
  from internal_proesc.cycle_evidence_requests request
  where request.request_id = v_old.request_id;
  v_context := internal_proesc.cycle_review_context(v_matricula_id);

  if v_old.revision <> 19 or v_old.scope_id <> v_scope.id
    or v_old.classification <> 'UNKNOWN' or v_old.verification <> 'REVIEW'
    or v_old.evidence_kind <> 'API_SCHEDULE_REVIEW'
    or v_old.has_external_cycle2 is true
    or v_old.obligation_manifest_hash is distinct from v_context ->> 'manifestHash'
    or v_prior_request.matricula_id <> v_matricula_id
    or v_prior_request.payload_hash <> v_old.evidence_hash
    or v_prior_request.after_state ->> 'evidence_hash' <> v_old.evidence_hash
    or v_prior_request.after_state ->> 'revision' <> v_old.revision::text
    or v_cache.state <> 'COMPLETE' or v_cache.obligations is null
    or v_cache.observed_at is distinct from v_old.source_observed_at
    or v_cache.verified_observed_at is distinct from v_old.source_observed_at
    or v_cache.token_revision is distinct from (
      select connection.revision from internal_proesc.connection where connection.id
    )
    or v_cache.source_hash is distinct from encode(extensions.digest(
      v_cache.obligations::text, 'sha256'
    ), 'hex')
    or v_cache.unit_id is distinct from v_context ->> 'unitId'
    or v_cache.class_ids is distinct from v_context -> 'classIds'
    or v_cache.first_year <> 2025 or v_cache.last_year <> 2027
    or (v_context ->> 'firstYear')::integer <> v_cache.first_year
    or (v_context ->> 'lastYear')::integer <> v_cache.last_year
    or v_context -> 'reconciledSeed' is distinct from 'true'::jsonb
    or v_context ->> 'startDate' is distinct from '2025-09-01'
    or v_context ->> 'classStartDate' is distinct from '2025-09-01'
    or v_old.source_evidence -> 'completeApiWindow' is distinct from 'true'::jsonb
    or v_old.source_evidence -> 'derived' is distinct from 'true'::jsonb
    or v_old.source_evidence ->> 'classification' is distinct from 'UNKNOWN'
    or v_old.source_evidence ->> 'cacheId' is distinct from v_cache.id::text
    or v_old.source_evidence ->> 'sourceHash' is distinct from v_cache.source_hash
    or v_old.source_evidence ->> 'unitId' is distinct from v_context ->> 'unitId'
    or v_old.source_evidence ->> 'classId' is distinct from v_context ->> 'classId'
    or v_old.source_evidence ->> 'personHash' is distinct from v_context ->> 'personHash'
    or v_old.source_evidence ->> 'academicFingerprint'
      is distinct from v_context ->> 'academicFingerprint'
    or v_old.source_evidence ->> 'classStartDate'
      is distinct from v_context ->> 'classStartDate'
    or jsonb_array_length(v_context -> 'obligations') <> 12
    or (select count(*) from public.contas_receber receivable
      where receivable.matricula_id = v_matricula_id) <> 12
  then
    raise exception 'Stored Proesc C1 snapshot or individual identity changed.';
  end if;

  if internal_academic.technical_imported_cycle_exists(v_matricula_id, 2)
    or internal_academic.technical_imported_cycle_has_conflict(v_matricula_id)
    or exists (select 1 from internal_academic.technical_manual_cycle_runs run
      where run.matricula_id = v_matricula_id)
    or exists (select 1 from internal_academic.technical_external_cycle_coverage coverage
      where coverage.matricula_id = v_matricula_id)
    or exists (
      select 1 from internal_proesc.obligation_links link
      join internal_proesc.obligation_imports imported on imported.link_id = link.id
      where link.matricula_id = v_matricula_id
        and imported.source_cycle in ('SECOND', 'FULL_CONTRACT')
    ) then
    raise exception 'Existing C2, conflict or local cycle protects this enrollment.';
  end if;

  -- The only relaxed premise is the first-due window. Every other check runs
  -- through the existing classifier against the same complete API snapshot.
  v_original_result := internal_proesc.evaluate_api_cycle_schedule(
    v_context, v_cache.obligations
  );
  v_confirmed_result := internal_proesc.evaluate_api_cycle_schedule(
    jsonb_set(v_context, '{startDate}', to_jsonb(date '2025-10-01')),
    v_cache.obligations
  );
  select min((item ->> 'dueDate')::date), max((item ->> 'dueDate')::date)
  into v_first_due, v_last_due
  from jsonb_array_elements(v_context -> 'obligations') item;
  if v_original_result ->> 'classification' is distinct from 'UNKNOWN'
    or v_original_result ->> 'reason' is distinct from
      'Datas das parcelas não comprovam os 12 meses do primeiro ciclo.'
    or v_confirmed_result ->> 'classification' is distinct from 'C1'
    or v_confirmed_result ->> 'monthlyCount' is distinct from '12'
    or v_confirmed_result ->> 'obligationCount' is distinct from '12'
    or v_first_due is distinct from date '2025-11-17'
    or v_last_due is distinct from date '2026-10-15'
  then
    raise exception 'The two-month C1 exception is not the sole classification change.';
  end if;

  v_source := v_old.source_evidence || v_confirmed_result || jsonb_build_object(
    'reason', 'C1 reclassificado pela coleta completa Proesc de 01/10/2026; primeira mensalidade dois meses após o início.',
    'decisionOrigin', 'HISTORICAL_API_SNAPSHOT_TECHNICAL_REVIEW',
    'recordingMechanism', 'MIGRATION',
    'sourceCoverageAsOf', v_cache.observed_at,
    'startWindowException', jsonb_build_object(
      'kind', 'T42_INDIVIDUAL_TWO_MONTH_START',
      'actualStartDate', v_context ->> 'startDate',
      'firstDueDate', v_first_due,
      'baselineReason', v_original_result ->> 'reason'
    )
  );
  v_evidence_hash := encode(extensions.digest(jsonb_build_object(
    'source', v_source, 'manifest', v_context ->> 'manifestHash',
    'observedAt', v_cache.observed_at
  )::text, 'sha256'), 'hex');

  update internal_proesc.enrollment_cycle_evidence evidence set
    classification = 'C1', has_external_cycle2 = false,
    verification = 'CONFIRMED', source_evidence = v_source,
    evidence_hash = v_evidence_hash, revision = v_old.revision + 1,
    request_id = v_request_id, recorded_by = v_actor_id,
    recorded_at = clock_timestamp(), confirmed_by = v_actor_id,
    confirmed_at = clock_timestamp()
  where evidence.matricula_id = v_matricula_id
    and evidence.revision = 19 and evidence.evidence_hash = v_old.evidence_hash
    and evidence.classification = 'UNKNOWN'
  returning * into v_new;
  if not found then
    raise exception 'Individual cycle evidence changed during confirmation.';
  end if;

  insert into internal_proesc.cycle_evidence_requests(
    request_id, actor_id, payload_hash, matricula_id,
    before_state, after_state, response
  ) values (
    v_request_id, v_actor_id, v_evidence_hash, v_matricula_id,
    to_jsonb(v_old), to_jsonb(v_new), jsonb_build_object(
      'classification', 'C1', 'verification', 'CONFIRMED',
      'remediation', 'T42_C1_TWO_MONTH_START',
      'decisionOrigin', 'HISTORICAL_API_SNAPSHOT_TECHNICAL_REVIEW',
      'priorRequestId', v_old.request_id,
      'sourceObservedAt', v_cache.observed_at,
      'newRevision', v_new.revision
    )
  );

  select * into strict v_fact
  from internal_academic.technical_imported_cycle_facts fact
  where fact.matricula_id = v_matricula_id and fact.cycle_number = 1;
  v_state := internal_academic.technical_manual_cycle_state(v_matricula_id);
  if v_fact.proof_reference_id is distinct from v_request_id
    or v_fact.proof_hash is distinct from v_evidence_hash
    or v_fact.identity_hash is distinct from v_identity ->> 'identityHash'
    or not internal_academic.technical_imported_cycle_generation_permitted(
      v_matricula_id
    )
    or v_state ->> 'estado' is distinct from 'ELEGIVEL'
    or v_state ->> 'proximoCicloNumero' is distinct from '2'
  then
    raise exception 'Audited C1 fact did not unlock only the next cycle.';
  end if;
end;
$confirm_individual_c1$;

commit;
