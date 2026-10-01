-- Native-class non-regression. Run once before DDL to capture the fingerprint,
-- then set test.expected_t46_state_fingerprint and run again after DDL.
begin transaction read only;
set local statement_timeout = '30s';
set local lock_timeout = '3s';

do $acceptance$
declare
  v_total integer;
  v_next_c1 integer;
  v_next_c2 integer;
  v_fingerprint text;
  v_expected_fingerprint text := nullif(
    current_setting('test.expected_t46_state_fingerprint', true), ''
  );
  v_expected_total integer := nullif(
    current_setting('test.expected_t46_enrollments', true), ''
  )::integer;
  v_expected_next_c1 integer := nullif(
    current_setting('test.expected_t46_next_c1', true), ''
  )::integer;
  v_expected_next_c2 integer := nullif(
    current_setting('test.expected_t46_next_c2', true), ''
  )::integer;
  v_bad integer;
begin
  with native_state as materialized (
    select enrollment.id, enrollment.status,
      internal_academic.technical_manual_cycle_state(enrollment.id) as state
    from public.matriculas enrollment
    join public.turmas class on class.id = enrollment.turma_id
    where class.codigo = '2026.2-ENF-INT-JAP'
  )
  select count(*),
    count(*) filter (
      where state ->> 'estado' = 'ELEGIVEL'
        and (state ->> 'proximoCicloNumero')::integer = 1
    ),
    count(*) filter (
      where state ->> 'estado' = 'ELEGIVEL'
        and (state ->> 'proximoCicloNumero')::integer = 2
    ),
    encode(extensions.digest(pg_catalog.convert_to(coalesce(
      jsonb_agg(jsonb_build_object(
        'enrollmentId', id,
        'academicStatus', status,
        'manualCycleState', state
      ) order by id)::text,
      '[]'
    ), 'UTF8'), 'sha256'), 'hex')
  into v_total, v_next_c1, v_next_c2, v_fingerprint
  from native_state;

  if v_expected_total is not null and v_total <> v_expected_total then
    raise exception 'T46 population drift: expected %, found %.',
      v_expected_total, v_total;
  end if;
  if v_expected_next_c1 is not null and v_next_c1 <> v_expected_next_c1 then
    raise exception 'T46 C1 eligibility drift: expected %, found %.',
      v_expected_next_c1, v_next_c1;
  end if;
  if v_expected_next_c2 is not null and v_next_c2 <> v_expected_next_c2 then
    raise exception 'T46 C2 eligibility drift: expected %, found %.',
      v_expected_next_c2, v_next_c2;
  end if;
  if v_expected_fingerprint is not null
    and v_fingerprint is distinct from v_expected_fingerprint
  then
    raise exception 'T46 native state changed across imported-cycle DDL.';
  end if;

  if to_regclass('internal_academic.technical_imported_cycle_facts')
      is not null
  then
    execute $query$
      select count(*)
      from public.matriculas enrollment
      join public.turmas class on class.id = enrollment.turma_id
      where class.codigo = '2026.2-ENF-INT-JAP'
        and (
          internal_academic.technical_imported_cycle_identity_context(
            enrollment.id
          ) is not null
          or exists (
            select 1
            from internal_academic.technical_imported_cycle_facts fact
            where fact.matricula_id = enrollment.id
          )
          or exists (
            select 1
            from internal_academic.technical_imported_cycle_fact_conflicts conflict
            where conflict.matricula_id = enrollment.id
          )
        )
    $query$ into v_bad;
    if v_bad <> 0 then
      raise exception
        'Imported-cycle backfill contaminated % native T46 enrollment(s).', v_bad;
    end if;
  end if;
end;
$acceptance$;

with native_state as materialized (
  select enrollment.id, enrollment.status,
    internal_academic.technical_manual_cycle_state(enrollment.id) as state
  from public.matriculas enrollment
  join public.turmas class on class.id = enrollment.turma_id
  where class.codigo = '2026.2-ENF-INT-JAP'
)
select jsonb_build_object(
  'total', count(*),
  'eligibleC1', count(*) filter (
    where state ->> 'estado' = 'ELEGIVEL'
      and (state ->> 'proximoCicloNumero')::integer = 1
  ),
  'eligibleC2', count(*) filter (
    where state ->> 'estado' = 'ELEGIVEL'
      and (state ->> 'proximoCicloNumero')::integer = 2
  ),
  'stateFingerprint', encode(extensions.digest(pg_catalog.convert_to(coalesce(
    jsonb_agg(jsonb_build_object(
      'enrollmentId', id,
      'academicStatus', status,
      'manualCycleState', state
    ) order by id)::text,
    '[]'
  ), 'UTF8'), 'sha256'), 'hex')
) as sanitized_t46_native_baseline
from native_state;

rollback;
