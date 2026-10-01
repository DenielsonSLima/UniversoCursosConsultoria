-- Post-backfill acceptance for the complete T42 population.
-- Read-only by construction: no refresh, evidence review, run or receivable write.
-- Optional baseline settings: test.expected_t42_enrollments and
-- test.expected_t42_generation_permitted (35 and 15 on 2026-09-30).
begin transaction read only;
set local statement_timeout = '45s';
set local lock_timeout = '3s';

do $acceptance$
declare
  v_total integer;
  v_expected_total integer := nullif(
    current_setting('test.expected_t42_enrollments', true), ''
  )::integer;
  v_expected_permitted integer := nullif(
    current_setting('test.expected_t42_generation_permitted', true), ''
  )::integer;
  v_c1_confirmed integer;
  v_c1_generation_permitted integer;
  v_bad integer;
  v_guard_definition text;
begin
  select count(*) into v_total
  from public.matriculas enrollment
  join public.turmas class on class.id = enrollment.turma_id
  where class.codigo = 'ENF-T42-INT-MAT';
  if v_expected_total is not null and v_total <> v_expected_total then
    raise exception 'T42 population drift: expected %, found %.',
      v_expected_total, v_total;
  end if;

  select pg_get_functiondef(
    'internal_academic.technical_imported_cycle_generation_permitted(uuid)'
      ::regprocedure
  ) into v_guard_definition;
  if v_guard_definition ~* 'cycle_review_cache|token_revision|lease_until'
  then
    raise exception 'Durable C1 passage still depends on live Proesc cache/token.';
  end if;

  select count(*) into v_bad
  from public.matriculas enrollment
  join public.turmas class on class.id = enrollment.turma_id
  cross join lateral (
    select internal_academic.technical_manual_cycle_state(enrollment.id) value
  ) state
  where class.codigo = 'ENF-T42-INT-MAT'
    and (
      internal_academic.technical_imported_cycle_exists(enrollment.id, 2)
      or internal_academic.technical_imported_cycle_has_conflict(enrollment.id)
    )
    and coalesce((state.value ->> 'podeGerar')::boolean, false);
  if v_bad <> 0 then
    raise exception
      'T42 has % C2/conflict enrollment(s) incorrectly allowed to emit.', v_bad;
  end if;

  select count(*) into v_c1_confirmed
  from public.matriculas enrollment
  join public.turmas class on class.id = enrollment.turma_id
  where class.codigo = 'ENF-T42-INT-MAT'
    and internal_academic.technical_imported_cycle_has_confirmed(
      enrollment.id, 1
    );
  if v_c1_confirmed = 0 then
    raise exception 'T42 backfill produced no confirmed durable C1 fact.';
  end if;

  select count(*) into v_c1_generation_permitted
  from public.matriculas enrollment
  join public.turmas class on class.id = enrollment.turma_id
  where class.codigo = 'ENF-T42-INT-MAT'
    and internal_academic.technical_imported_cycle_generation_permitted(
      enrollment.id
    );
  if v_expected_permitted is not null
    and v_c1_generation_permitted <> v_expected_permitted
  then
    raise exception 'T42 eligible C2 drift: expected %, found %.',
      v_expected_permitted, v_c1_generation_permitted;
  end if;

  select count(*) into v_bad
  from public.matriculas enrollment
  join public.turmas class on class.id = enrollment.turma_id
  cross join lateral (
    select internal_academic.technical_manual_cycle_state(enrollment.id) value
  ) state
  where class.codigo = 'ENF-T42-INT-MAT'
    and internal_academic.technical_imported_cycle_generation_permitted(
      enrollment.id
    )
    and not (
      state.value ->> 'estado' = 'ELEGIVEL'
      and coalesce((state.value ->> 'podeGerar')::boolean, false)
      and (state.value ->> 'proximoCicloNumero')::integer = 2
    );
  if v_bad <> 0 then
    raise exception
      'T42 has % proven C1 enrollment(s) not projected as eligible C2.', v_bad;
  end if;

  select count(*) into v_bad
  from public.matriculas enrollment
  join public.turmas class on class.id = enrollment.turma_id
  join internal_proesc.enrollment_cycle_evidence evidence
    on evidence.matricula_id = enrollment.id
  cross join lateral (
    select internal_academic.technical_manual_cycle_state(enrollment.id) value
  ) state
  where class.codigo = 'ENF-T42-INT-MAT'
    and evidence.classification = 'UNKNOWN'
    and not internal_academic.technical_imported_cycle_exists(enrollment.id, 1)
    and coalesce((state.value ->> 'podeGerar')::boolean, false);
  if v_bad <> 0 then
    raise exception
      'T42 has % UNKNOWN-without-proof enrollment(s) allowed to emit.', v_bad;
  end if;
end;
$acceptance$;

with t42 as (
  select enrollment.id, enrollment.status,
    internal_academic.technical_manual_cycle_state(enrollment.id) as state,
    internal_academic.technical_imported_cycle_has_confirmed(
      enrollment.id, 1
    ) as c1_confirmed,
    internal_academic.technical_imported_cycle_exists(
      enrollment.id, 2
    ) as c2_recorded,
    internal_academic.technical_imported_cycle_has_conflict(
      enrollment.id
    ) as has_conflict,
    internal_academic.technical_imported_cycle_generation_permitted(
      enrollment.id
    ) as generation_permitted,
    evidence.classification,
    not exists (
      select 1
      from internal_proesc.cycle_review_cache cache
      join internal_proesc.class_scopes scope
        on scope.turma_id = enrollment.turma_id
        and scope.phase = 'CONFIRMED'
        and cache.unit_id = scope.source_unit_id
      where cache.state = 'COMPLETE'
        and cache.completed_at is not null
        and coalesce(cache.verified_observed_at, cache.observed_at)
          >= now() - interval '5 minutes'
    ) as without_fresh_proesc_cache
  from public.matriculas enrollment
  join public.turmas class on class.id = enrollment.turma_id
  left join internal_proesc.enrollment_cycle_evidence evidence
    on evidence.matricula_id = enrollment.id
  where class.codigo = 'ENF-T42-INT-MAT'
)
select jsonb_build_object(
  'total', (select count(*) from t42),
  'academicStatus', (select jsonb_object_agg(status_key, status_value)
    from (select status status_key, count(*) status_value
      from t42 group by status) status_rows),
  'manualState', (select jsonb_object_agg(state_key, state_value)
    from (select state ->> 'estado' state_key, count(*) state_value
      from t42 group by state ->> 'estado') state_rows),
  'c1Confirmed', (select count(*) from t42 where c1_confirmed),
  'c2Recorded', (select count(*) from t42 where c2_recorded),
  'conflicts', (select count(*) from t42 where has_conflict),
  'c1GenerationPermitted', (select count(*)
    from t42 where generation_permitted),
  'eligibleWithoutFreshProescCache', (select count(*) from t42
    where generation_permitted and without_fresh_proesc_cache),
  'unknownWithoutFactBlocked', (select count(*) from t42
    where classification = 'UNKNOWN' and not c1_confirmed
      and not coalesce((state ->> 'podeGerar')::boolean, false))
) as sanitized_t42_acceptance;

rollback;
