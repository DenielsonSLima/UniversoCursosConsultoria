-- Durable, enrollment-scoped cycle facts for imported technical histories.
-- Monitoring observations remain mutable; a previously confirmed passage does not.
begin;

do $prerequisites$
begin
  if to_regclass('internal_proesc.cycle_evidence_requests') is null
    or to_regclass('internal_proesc.enrollment_cycle_evidence') is null
    or to_regclass('internal_academic.technical_manual_cycle_policies') is null
    or to_regprocedure('internal_proesc.enrollment_cycle_manifest_hash(uuid)') is null
  then
    raise exception 'Imported-cycle prerequisites are missing; rebase required.';
  end if;
end;
$prerequisites$;

create table internal_academic.technical_imported_cycle_facts (
  matricula_id uuid not null references public.matriculas(id),
  turma_id uuid not null references public.turmas(id),
  cycle_number smallint not null check (cycle_number in (1, 2)),
  administration_origin text not null check (
    administration_origin in ('EXTERNAL_PROESC', 'IMPORTED_BANESE')
  ),
  source_system text not null check (source_system in ('PROESC', 'BANESE')),
  proof_kind text not null check (proof_kind in (
    'PROESC_API_SCHEDULE', 'PROESC_CONTRACT',
    'PROESC_CYCLE_REFERENCE', 'PROESC_EXTERNAL_COVERAGE',
    'BANESE_PROTECTED_RUN'
  )),
  source_scope_id uuid references internal_proesc.class_scopes(id),
  proof_reference_id uuid,
  proof_hash text not null check (proof_hash ~ '^[0-9a-f]{64}$'),
  audit_hash text not null check (audit_hash ~ '^[0-9a-f]{64}$'),
  identity_hash text not null check (identity_hash ~ '^[0-9a-f]{64}$'),
  proof_manifest_hash text check (
    proof_manifest_hash is null or proof_manifest_hash ~ '^[0-9a-f]{64}$'
  ),
  evidence_revision integer check (
    evidence_revision is null or evidence_revision > 0
  ),
  source_observed_at timestamptz not null,
  confirmed_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (matricula_id, cycle_number),
  check ((administration_origin = 'EXTERNAL_PROESC' and source_system = 'PROESC'
      and proof_kind like 'PROESC_%')
    or (administration_origin = 'IMPORTED_BANESE' and source_system = 'BANESE'
      and proof_kind = 'BANESE_PROTECTED_RUN'))
);

create table internal_academic.technical_imported_cycle_fact_conflicts (
  id bigint generated always as identity primary key,
  matricula_id uuid not null references public.matriculas(id),
  cycle_number smallint not null check (cycle_number in (1, 2)),
  observed_origin text not null check (
    observed_origin in ('EXTERNAL_PROESC', 'IMPORTED_BANESE')
  ),
  observed_proof_kind text not null,
  observed_proof_hash text not null check (
    observed_proof_hash ~ '^[0-9a-f]{64}$'
  ),
  observed_identity_hash text not null check (
    observed_identity_hash ~ '^[0-9a-f]{64}$'
  ),
  observed_at timestamptz not null default now(),
  unique (matricula_id, cycle_number, observed_proof_hash)
);

alter table internal_academic.technical_imported_cycle_facts enable row level security;
alter table internal_academic.technical_imported_cycle_fact_conflicts
  enable row level security;
revoke all on internal_academic.technical_imported_cycle_facts
  from public, anon, authenticated, service_role;
revoke all on internal_academic.technical_imported_cycle_fact_conflicts
  from public, anon, authenticated, service_role;
revoke all on sequence
  internal_academic.technical_imported_cycle_fact_conflicts_id_seq
  from public, anon, authenticated, service_role;

create index technical_imported_cycle_facts_turma_idx
  on internal_academic.technical_imported_cycle_facts(turma_id, cycle_number);
create index technical_imported_cycle_facts_scope_idx
  on internal_academic.technical_imported_cycle_facts(source_scope_id)
  where source_scope_id is not null;

-- Producers take this lock before starting their INSERT statement. This gives
-- a waiting producer a fresh READ COMMITTED snapshot and lets the conflict
-- trigger audit a concurrent Proesc/Banese observation instead of merely
-- losing it to ON CONFLICT DO NOTHING.
create function internal_academic.lock_technical_imported_cycle_fact(
  p_matricula_id uuid,
  p_cycle_number integer
)
returns void
language sql
volatile
security definer
set search_path = ''
as $function$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'technical-imported-cycle-fact:' || p_matricula_id::text || ':'
      || p_cycle_number::text,
    0
  ));
$function$;

create function internal_academic.technical_imported_cycle_identity_context(
  p_matricula_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'matriculaId', enrollment.id,
    'turmaId', enrollment.turma_id,
    'poloId', coalesce(scope.polo_id, class.polo_id),
    'scopeId', scope.id,
    'unitId', scope.source_unit_id,
    'classId', scope.source_class_id,
    'personHash', internal_proesc.person_document_hash(enrollment.aluno_id),
    'manifestHash', internal_proesc.enrollment_cycle_manifest_hash(enrollment.id),
    'identityHash', encode(extensions.digest(jsonb_build_object(
      'matriculaId', enrollment.id,
      'turmaId', enrollment.turma_id,
      'poloId', coalesce(scope.polo_id, class.polo_id),
      'unitId', scope.source_unit_id,
      'classId', scope.source_class_id,
      'personHash', internal_proesc.person_document_hash(enrollment.aluno_id)
    )::text, 'sha256'), 'hex')
  )
  from public.matriculas enrollment
  join public.turmas class on class.id = enrollment.turma_id
  join internal_academic.technical_manual_cycle_policies policy
    on policy.turma_id = enrollment.turma_id
    and policy.active
    and policy.generation_mode = 'MANUAL'
    and policy.initial_state = 'IMPORTADA_CICLO_1'
    and policy.baseline_cycle = 1
    and policy.max_cycle = 2
    and policy.eligibility_rule in (
      'HISTORICO_EXTERNO', 'HISTORICO_IMPORTADO_CONSULTA'
    )
  left join internal_proesc.class_scopes scope
    on scope.turma_id = enrollment.turma_id and scope.phase = 'CONFIRMED'
  where enrollment.id = p_matricula_id
    and (select count(*)
      from internal_proesc.class_scopes confirmed_scope
      where confirmed_scope.turma_id = enrollment.turma_id
        and confirmed_scope.phase = 'CONFIRMED') <= 1;
$function$;

-- Pure validator. It consumes the private audit envelope, never a live cache.
create function internal_academic.technical_imported_cycle_fact_candidates(
  p_after jsonb,
  p_context jsonb,
  p_audit_hash text,
  p_request_id uuid,
  p_matricula_id uuid
)
returns table(cycle_number smallint, proof_kind text)
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_classification text := p_after ->> 'classification';
  v_kind text := p_after ->> 'evidence_kind';
  v_source jsonb := p_after -> 'source_evidence';
  v_first integer;
  v_second integer;
  v_monthly integer;
  v_obligations integer;
begin
  if jsonb_typeof(p_after) is distinct from 'object'
    or jsonb_typeof(p_context) is distinct from 'object'
    or jsonb_typeof(v_source) is distinct from 'object'
    or p_after ->> 'matricula_id' is distinct from p_matricula_id::text
    or p_after ->> 'request_id' is distinct from p_request_id::text
    or p_after ->> 'scope_id' is distinct from p_context ->> 'scopeId'
    or p_after ->> 'verification' is distinct from 'CONFIRMED'
    or coalesce(p_after ->> 'confirmed_at', '') = ''
    or not coalesce(p_after ->> 'revision' ~ '^[1-9][0-9]*$', false)
    or not coalesce(p_after ->> 'evidence_hash' ~ '^[0-9a-f]{64}$', false)
    or not coalesce(p_audit_hash ~ '^[0-9a-f]{64}$', false)
    or not coalesce(p_context ->> 'scopeId'
      ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F-]{27}$', false)
    or not coalesce(p_context ->> 'unitId' ~ '^[0-9]+$', false)
    or not coalesce(p_context ->> 'classId' ~ '^[0-9]+$', false)
    or not coalesce(p_context ->> 'personHash' ~ '^[0-9a-f]{64}$', false)
    or not coalesce(p_context ->> 'identityHash' ~ '^[0-9a-f]{64}$', false)
    or not coalesce(p_context ->> 'manifestHash' ~ '^[0-9a-f]{64}$', false)
    or not coalesce(p_after ->> 'obligation_manifest_hash'
      ~ '^[0-9a-f]{64}$', false)
    or p_after ->> 'obligation_manifest_hash'
      is distinct from p_context ->> 'manifestHash'
    or v_source ->> 'unitId' is distinct from p_context ->> 'unitId'
    or v_source ->> 'classId' is distinct from p_context ->> 'classId'
    or v_source ->> 'personHash' is distinct from p_context ->> 'personHash'
    or v_classification not in ('C1', 'FULL')
    or (v_classification = 'C1'
      and p_after -> 'has_external_cycle2' is distinct from 'false'::jsonb)
    or (v_classification = 'FULL'
      and p_after -> 'has_external_cycle2' is distinct from 'true'::jsonb)
  then
    return;
  end if;

  if v_kind = 'API_SCHEDULE_REVIEW' then
    if v_source -> 'completeApiWindow' is distinct from 'true'::jsonb
      or v_source -> 'derived' is distinct from 'true'::jsonb
      or v_source ->> 'classification' is distinct from v_classification
      or not coalesce(v_source ->> 'sourceHash' ~ '^[0-9a-f]{64}$', false)
      or not coalesce(v_source ->> 'cacheId'
        ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F-]{27}$', false)
      or not coalesce(v_source ->> 'monthlyCount' ~ '^[0-9]+$', false)
      or not coalesce(v_source ->> 'obligationCount' ~ '^[0-9]+$', false)
    then
      return;
    end if;
    v_monthly := (v_source ->> 'monthlyCount')::integer;
    v_obligations := (v_source ->> 'obligationCount')::integer;
    if (v_classification = 'C1'
        and (v_monthly <> 12 or v_obligations not between 12 and 13))
      or (v_classification = 'FULL'
        and (v_monthly < 24 or v_obligations <= v_monthly))
    then
      return;
    end if;
    cycle_number := 1;
    proof_kind := 'PROESC_API_SCHEDULE';
    return next;
    if v_classification = 'FULL' then
      cycle_number := 2;
      return next;
    end if;
    return;
  end if;

  if v_kind = 'SOURCE_CYCLE_REFERENCE' then
    if v_classification <> 'FULL'
      or v_source ->> 'scope' is distinct from 'SEGUNDO_CICLO'
      or v_source -> 'completeSecondCycle' is distinct from 'true'::jsonb
      or v_source -> 'completeContract' is not distinct from 'true'::jsonb
      or v_source ->> 'firstInstallmentCount' is distinct from '0'
      or v_source ->> 'secondInstallmentCount' is distinct from '12'
      or jsonb_typeof(v_source -> 'obligations') is distinct from 'array'
      or jsonb_array_length(v_source -> 'obligations') <> 13
      or jsonb_typeof(v_source -> 'firstCycleReceipt') is distinct from 'object'
      or not coalesce(v_source ->> 'artifactHash' ~ '^[0-9a-f]{64}$', false)
      or not coalesce(v_source ->> 'sourceHash' ~ '^[0-9a-f]{64}$', false)
    then
      return;
    end if;
    return query select 2::smallint, 'PROESC_CYCLE_REFERENCE'::text;
    return;
  end if;

  if v_kind not in ('SOURCE_CONTRACT', 'USER_CONFIRMED_CONTRACT')
    or v_source -> 'completeContract' is distinct from 'true'::jsonb
    or jsonb_typeof(v_source -> 'obligations') is distinct from 'array'
    or jsonb_array_length(v_source -> 'obligations') not between 1 and 500
    or not coalesce(v_source ->> 'artifactHash' ~ '^[0-9a-f]{64}$', false)
    or not coalesce(v_source ->> 'firstInstallmentCount' ~ '^[1-9][0-9]?$', false)
    or not coalesce(v_source ->> 'secondInstallmentCount' ~ '^[0-9]{1,2}$', false)
  then
    return;
  end if;
  v_first := (v_source ->> 'firstInstallmentCount')::integer;
  v_second := (v_source ->> 'secondInstallmentCount')::integer;
  if v_first > 60 or v_second > 60
    or (v_classification = 'C1' and v_second <> 0)
    or (v_classification = 'FULL' and v_second = 0)
    or (select count(*) from jsonb_array_elements(v_source -> 'obligations') item
      where item ->> 'kind' = 'TUITION' and item ->> 'cycle' = 'FIRST') <> v_first
    or (select count(*) from jsonb_array_elements(v_source -> 'obligations') item
      where item ->> 'kind' = 'TUITION' and item ->> 'cycle' = 'SECOND') <> v_second
  then
    return;
  end if;
  cycle_number := 1;
  proof_kind := 'PROESC_CONTRACT';
  return next;
  if v_classification = 'FULL' then
    cycle_number := 2;
    return next;
  end if;
end;
$function$;

create function internal_academic.guard_technical_imported_cycle_fact_immutable()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception 'Confirmed imported cycle facts are immutable.'
    using errcode = '55000';
end;
$function$;

create function internal_academic.capture_technical_imported_cycle_fact_conflict()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_existing internal_academic.technical_imported_cycle_facts%rowtype;
begin
  perform internal_academic.lock_technical_imported_cycle_fact(
    new.matricula_id, new.cycle_number
  );
  select * into v_existing
  from internal_academic.technical_imported_cycle_facts fact
  where fact.matricula_id = new.matricula_id
    and fact.cycle_number = new.cycle_number;
  if not found then
    return new;
  end if;
  if v_existing.administration_origin is distinct from new.administration_origin
    or v_existing.identity_hash is distinct from new.identity_hash
  then
    insert into internal_academic.technical_imported_cycle_fact_conflicts(
      matricula_id, cycle_number, observed_origin, observed_proof_kind,
      observed_proof_hash, observed_identity_hash, observed_at
    ) values (
      new.matricula_id, new.cycle_number, new.administration_origin,
      new.proof_kind, new.proof_hash, new.identity_hash, new.confirmed_at
    ) on conflict (matricula_id, cycle_number, observed_proof_hash) do nothing;
  end if;
  return null;
end;
$function$;

create trigger capture_technical_imported_cycle_fact_conflict
before insert on internal_academic.technical_imported_cycle_facts
for each row execute function
  internal_academic.capture_technical_imported_cycle_fact_conflict();

create trigger guard_technical_imported_cycle_fact_immutable
before update or delete on internal_academic.technical_imported_cycle_facts
for each row execute function
  internal_academic.guard_technical_imported_cycle_fact_immutable();

create trigger guard_technical_imported_cycle_fact_conflict_immutable
before update or delete
on internal_academic.technical_imported_cycle_fact_conflicts
for each row execute function
  internal_academic.guard_technical_imported_cycle_fact_immutable();

create function internal_academic.capture_imported_cycle_fact_from_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_context jsonb;
  v_candidate record;
begin
  v_context := internal_academic.technical_imported_cycle_identity_context(
    new.matricula_id
  );
  if v_context is null then
    return new;
  end if;
  for v_candidate in
    select * from internal_academic.technical_imported_cycle_fact_candidates(
      new.after_state, v_context, new.payload_hash, new.request_id,
      new.matricula_id
  )
  loop
    perform internal_academic.lock_technical_imported_cycle_fact(
      new.matricula_id, v_candidate.cycle_number
    );
    insert into internal_academic.technical_imported_cycle_facts(
      matricula_id, turma_id, cycle_number, administration_origin,
      source_system, proof_kind, source_scope_id, proof_reference_id,
      proof_hash, audit_hash, identity_hash, proof_manifest_hash,
      evidence_revision, source_observed_at, confirmed_at
    ) values (
      new.matricula_id, (v_context ->> 'turmaId')::uuid,
      v_candidate.cycle_number, 'EXTERNAL_PROESC', 'PROESC',
      v_candidate.proof_kind, (v_context ->> 'scopeId')::uuid,
      new.request_id, new.after_state ->> 'evidence_hash', new.payload_hash,
      v_context ->> 'identityHash', v_context ->> 'manifestHash',
      (new.after_state ->> 'revision')::integer,
      (new.after_state ->> 'source_observed_at')::timestamptz,
      (new.after_state ->> 'confirmed_at')::timestamptz
    ) on conflict (matricula_id, cycle_number) do nothing;
  end loop;
  return new;
end;
$function$;

create trigger capture_imported_cycle_fact_from_audit
after insert on internal_proesc.cycle_evidence_requests
for each row execute function
  internal_academic.capture_imported_cycle_fact_from_audit();

-- Backfill every audited positive observation, including an older confirmed C1
-- later replaced by an inconclusive observation. UNKNOWN itself never creates a fact.
with enrollment_ids as materialized (
  select distinct request.matricula_id
  from internal_proesc.cycle_evidence_requests request
), contexts as materialized (
  select enrollment.matricula_id,
    internal_academic.technical_imported_cycle_identity_context(
      enrollment.matricula_id
    ) as value
  from enrollment_ids enrollment
), candidates as (
  select request.matricula_id, request.request_id, request.payload_hash,
    request.after_state, request.created_at, context.value as identity_context,
    candidate.cycle_number, candidate.proof_kind,
    row_number() over (
      partition by request.matricula_id, candidate.cycle_number
      order by request.created_at desc, request.request_id desc
  ) as preference
  from internal_proesc.cycle_evidence_requests request
  join contexts context on context.matricula_id = request.matricula_id
  cross join lateral internal_academic.technical_imported_cycle_fact_candidates(
    request.after_state, context.value, request.payload_hash,
    request.request_id, request.matricula_id
  ) candidate
  where context.value is not null
)
insert into internal_academic.technical_imported_cycle_facts(
  matricula_id, turma_id, cycle_number, administration_origin,
  source_system, proof_kind, source_scope_id, proof_reference_id,
  proof_hash, audit_hash, identity_hash, proof_manifest_hash,
  evidence_revision, source_observed_at, confirmed_at
)
select matricula_id, (identity_context ->> 'turmaId')::uuid, cycle_number,
  'EXTERNAL_PROESC', 'PROESC', proof_kind,
  (identity_context ->> 'scopeId')::uuid, request_id,
  after_state ->> 'evidence_hash', payload_hash,
  identity_context ->> 'identityHash', identity_context ->> 'manifestHash',
  (after_state ->> 'revision')::integer,
  (after_state ->> 'source_observed_at')::timestamptz,
  (after_state ->> 'confirmed_at')::timestamptz
from candidates where preference = 1
on conflict (matricula_id, cycle_number) do nothing;

revoke all on function
  internal_academic.lock_technical_imported_cycle_fact(uuid, integer),
  internal_academic.technical_imported_cycle_identity_context(uuid),
  internal_academic.technical_imported_cycle_fact_candidates(
    jsonb, jsonb, text, uuid, uuid
  ),
  internal_academic.guard_technical_imported_cycle_fact_immutable(),
  internal_academic.capture_technical_imported_cycle_fact_conflict(),
  internal_academic.capture_imported_cycle_fact_from_audit()
  from public, anon, authenticated, service_role;

comment on table internal_academic.technical_imported_cycle_facts is
  'Immutable per-enrollment/per-cycle passage facts. Monitoring TTL, token rotation and inconclusive refreshes never erase a confirmed fact.';

commit;
