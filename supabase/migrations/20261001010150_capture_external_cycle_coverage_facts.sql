-- Confirmed coverage created after cutover must materialize the same immutable
-- fact as the initial audited backfill.
begin;

create function internal_academic.technical_imported_coverage_context_is_valid(
  p_context jsonb
)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select jsonb_typeof(p_context) = 'object'
    and coalesce(p_context ->> 'scopeId'
      ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F-]{27}$', false)
    and coalesce(p_context ->> 'unitId' ~ '^[0-9]+$', false)
    and coalesce(p_context ->> 'classId' ~ '^[0-9]+$', false)
    and coalesce(p_context ->> 'personHash' ~ '^[0-9a-f]{64}$', false)
    and coalesce(p_context ->> 'identityHash' ~ '^[0-9a-f]{64}$', false)
    and coalesce(p_context ->> 'manifestHash' ~ '^[0-9a-f]{64}$', false);
$function$;

create function internal_academic.capture_external_cycle_coverage_fact(
  p_matricula_id uuid,
  p_turma_id uuid,
  p_scope text,
  p_request_id uuid,
  p_payload_hash text,
  p_confirmed_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_context jsonb;
  v_cycle integer;
begin
  if p_scope not in ('CONTRATO_COMPLETO', 'SEGUNDO_CICLO')
    or not coalesce(p_payload_hash ~ '^[0-9a-f]{64}$', false)
    or p_confirmed_at is null
  then
    return;
  end if;
  v_context := internal_academic.technical_imported_cycle_identity_context(
    p_matricula_id
  );
  if not internal_academic.technical_imported_coverage_context_is_valid(
    v_context
  ) or p_turma_id is distinct from (v_context ->> 'turmaId')::uuid then
    return;
  end if;
  for v_cycle in
    select value
    from pg_catalog.generate_series(
      case p_scope when 'CONTRATO_COMPLETO' then 1 else 2 end,
      2
    ) value
  loop
    perform internal_academic.lock_technical_imported_cycle_fact(
      p_matricula_id, v_cycle
    );
    insert into internal_academic.technical_imported_cycle_facts(
      matricula_id, turma_id, cycle_number, administration_origin,
      source_system, proof_kind, source_scope_id, proof_reference_id,
      proof_hash, audit_hash, identity_hash, proof_manifest_hash,
      source_observed_at, confirmed_at
    ) values (
      p_matricula_id, p_turma_id, v_cycle,
      'EXTERNAL_PROESC', 'PROESC', 'PROESC_EXTERNAL_COVERAGE',
      (v_context ->> 'scopeId')::uuid, p_request_id,
      p_payload_hash, p_payload_hash, v_context ->> 'identityHash',
      v_context ->> 'manifestHash', p_confirmed_at, p_confirmed_at
    ) on conflict (matricula_id, cycle_number) do nothing;
  end loop;
end;
$function$;

create function internal_academic.capture_external_cycle_coverage_fact_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.state = 'CONFIRMED' and new.confirmed_at is not null then
    perform internal_academic.capture_external_cycle_coverage_fact(
      new.matricula_id, new.turma_id, new.scope, new.request_id,
      new.payload_hash, new.confirmed_at
    );
  end if;
  return new;
end;
$function$;

create trigger capture_external_cycle_coverage_fact
after insert or update
on internal_academic.technical_external_cycle_coverage
for each row execute function
  internal_academic.capture_external_cycle_coverage_fact_trigger();

-- Existing rows are backfilled only from confirmed, fully identified coverage.
do $backfill$
declare
  v_coverage internal_academic.technical_external_cycle_coverage%rowtype;
begin
  for v_coverage in
    select * from internal_academic.technical_external_cycle_coverage coverage
    where coverage.state = 'CONFIRMED'
      and coverage.confirmed_at is not null
  loop
    perform internal_academic.capture_external_cycle_coverage_fact(
      v_coverage.matricula_id, v_coverage.turma_id, v_coverage.scope,
      v_coverage.request_id, v_coverage.payload_hash,
      v_coverage.confirmed_at
    );
  end loop;
end;
$backfill$;

revoke all on function
  internal_academic.technical_imported_coverage_context_is_valid(jsonb),
  internal_academic.capture_external_cycle_coverage_fact(
    uuid, uuid, text, uuid, text, timestamptz
  ),
  internal_academic.capture_external_cycle_coverage_fact_trigger()
  from public, anon, authenticated, service_role;

comment on function
  internal_academic.capture_external_cycle_coverage_fact(
    uuid, uuid, text, uuid, text, timestamptz
  ) is
  'Materializes future confirmed Proesc coverage into immutable enrollment-cycle facts.';

commit;
