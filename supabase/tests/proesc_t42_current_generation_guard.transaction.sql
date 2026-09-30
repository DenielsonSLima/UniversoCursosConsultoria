-- Exercises the deployed T42 guard at the exact post-run/pre-receivable point.
-- All writes are transactional and rolled back.
begin;

do $t42_current_generation_guard$
declare
  v_matricula_id uuid;
  v_turma_id uuid;
  v_cache_id uuid;
  v_request_id uuid := '42000000-0000-0000-0000-000000000231';
  v_other_request_id uuid := '42000000-0000-0000-0000-000000000232';
  v_definition text;
begin
  select enrollment.id, enrollment.turma_id,
    (evidence.source_evidence ->> 'cacheId')::uuid
  into v_matricula_id, v_turma_id, v_cache_id
  from public.matriculas enrollment
  join internal_proesc.enrollment_cycle_evidence evidence
    on evidence.matricula_id = enrollment.id
  where internal_proesc.is_t42_durable_imported_c1(enrollment.id)
    and not exists (
      select 1
      from internal_academic.technical_manual_cycle_runs run
      where run.matricula_id = enrollment.id
    )
  order by enrollment.id
  limit 1;

  assert v_matricula_id is not null,
    'No durable T42 C1 enrollment without a run is available for the contract';

  insert into internal_academic.technical_manual_cycle_runs(
    matricula_id, turma_id, cycle_number, state, request_id,
    first_due_date, item_count, expected_installment_count, total_amount,
    receivable_ids, created_by, reviewed_items
  ) values (
    v_matricula_id, v_turma_id, 2, 'GENERATING', v_request_id,
    date '2026-10-15', 1, 1, 0,
    '{}'::uuid[], null, '[]'::jsonb
  );

  assert exists (
    select 1
    from internal_academic.technical_manual_cycle_runs run
    where run.matricula_id = v_matricula_id
      and run.xmin = pg_catalog.pg_current_xact_id_if_assigned()::xid
  ), 'The inserted C2 run does not belong to the current transaction';

  assert internal_proesc.is_t42_durable_imported_c1(v_matricula_id),
    'The sole current C2 GENERATING run lost the durable C1 proof';
  perform internal_proesc.assert_fresh_cycle_generation(v_matricula_id);

  insert into internal_academic.technical_manual_cycle_runs(
    matricula_id, turma_id, cycle_number, state, request_id,
    first_due_date, item_count, expected_installment_count, total_amount,
    receivable_ids, created_by, reviewed_items
  ) values (
    v_matricula_id, v_turma_id, 1, 'GENERATING', v_other_request_id,
    date '2026-09-15', 1, 1, 0,
    '{}'::uuid[], null, '[]'::jsonb
  );
  assert not internal_proesc.is_t42_durable_imported_c1(v_matricula_id),
    'More than one run bypassed the durable C1 fence';
  delete from internal_academic.technical_manual_cycle_runs
  where matricula_id = v_matricula_id and cycle_number = 1;

  update internal_proesc.cycle_review_cache
  set state = 'FETCHING', observed_at = pg_catalog.clock_timestamp()
  where id = v_cache_id;
  assert internal_proesc.is_t42_durable_imported_c1(v_matricula_id),
    'A refresh in progress erased previously verified durable C1 proof';
  perform internal_proesc.assert_fresh_cycle_generation(v_matricula_id);

  v_definition := pg_get_functiondef(
    'internal_proesc.is_t42_durable_imported_c1(uuid)'::regprocedure
  );
  assert position('pg_current_xact_id_if_assigned' in v_definition) > 0,
    'The durable C1 fence is not tied to the current transaction';
  assert position('current_setting' in v_definition) = 0
    and position('transaction_timestamp' in v_definition) = 0,
    'A request GUC or timestamp still controls the durable C1 fence';

  update internal_academic.technical_manual_cycle_runs
  set state = 'LOCAL_CREATED', completed_at = pg_catalog.clock_timestamp(),
    receivable_ids = array['42000000-0000-0000-0000-000000000233'::uuid]
  where matricula_id = v_matricula_id and cycle_number = 2;
  assert not internal_proesc.is_t42_durable_imported_c1(v_matricula_id),
    'A completed run bypassed the durable C1 fence';
end;
$t42_current_generation_guard$;

select 'T42 current C2 transaction passes; foreign, ambiguous and completed runs stay fenced.' as result;
rollback;
