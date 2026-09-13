-- Run only after the three historical structure migrations, through MCP SQL.
-- The caller supplies an explicitly reviewed EMPTY imported class in
-- app.historical_grade_test_turma. This test always rolls back all created rows.
-- No student/teacher identifiers or document contents are stored in this file.
begin;

do $historical_structure_test$
declare
  v_turma uuid := nullif(current_setting('app.historical_grade_test_turma', true), '')::uuid;
  v_request uuid := gen_random_uuid();
  v_source text := encode(extensions.digest(gen_random_uuid()::text, 'sha256'), 'hex');
  v_curriculum jsonb;
  v_hash text;
  v_course uuid;
  v_module uuid;
  v_discipline uuid;
  v_period uuid;
  v_before_class jsonb;
  v_before_financial bigint;
  v_result jsonb;
  v_replay jsonb;
begin
  assert v_turma is not null, 'Explicit reviewed test class UUID is required';
  select t.curso_id, to_jsonb(t) into strict v_course, v_before_class
    from public.turmas t where t.id = v_turma for update;
  assert not exists (select 1 from public.periodos_letivos where turma_id = v_turma),
    'Use a class without existing periods; the test never deletes an existing structure';
  assert not exists (select 1 from public.turmas_disciplinas where turma_id = v_turma),
    'Use a class without existing discipline bindings';
  select count(*) into v_before_financial from public.contas_receber where turma_id = v_turma;
  v_curriculum := internal_academic.technical_curriculum_snapshot(v_course);
  v_hash := encode(extensions.digest(v_curriculum::text, 'sha256'), 'hex');
  v_module := (v_curriculum->0->>'id')::uuid;
  v_discipline := (v_curriculum->0->'disciplinas'->0->>'id')::uuid;
  assert not has_function_privilege('anon',
    'public.regularizar_grade_tecnica_historica_secure(uuid,uuid,text,text,jsonb)', 'execute'),
    'Anonymous execution must be denied';
  assert not has_function_privilege('authenticated',
    'public.regularizar_grade_tecnica_historica_secure(uuid,uuid,text,text,jsonb)', 'execute'),
    'Authenticated client execution must be denied';
  assert has_function_privilege('service_role',
    'public.regularizar_grade_tecnica_historica_secure(uuid,uuid,text,text,jsonb)', 'execute'),
    'Service execution grant is required';
  assert not has_table_privilege('service_role',
    'internal_academic.historical_structure_requests', 'INSERT,UPDATE,DELETE'),
    'The caller must not write its own request ledger';
  assert not has_function_privilege('service_role',
    'internal_academic.consume_historical_period_claim(text,jsonb)', 'execute'),
    'The caller must not invoke a private trigger capability';
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  -- A service caller cannot bypass ordinary guards with a direct write.
  begin
    insert into public.periodos_letivos (turma_id, modulo_id, nome, ordem, status)
      values (v_turma, v_module, 'Synthetic forbidden period', 1, 'PLANEJADO');
    raise exception using errcode = 'ZX001', message = 'Direct historical period insert was allowed';
  exception when raise_exception then null; end;
  begin
    perform public.regularizar_grade_tecnica_historica_secure(v_request, v_turma, v_source, repeat('0',64));
    raise exception using errcode = 'ZX001', message = 'Wrong curriculum fingerprint was accepted';
  exception when serialization_failure then null; end;
  begin
    perform public.regularizar_grade_tecnica_historica_secure(v_request, v_turma, v_source, v_hash,
      '[{"dataInicio":"2000-01-01","dataFim":"2000-12-31"}]'::jsonb);
    raise exception using errcode = 'ZX001', message = 'Unproven calendar was accepted';
  exception when invalid_parameter_value then null; end;
  assert not exists (select 1 from internal_academic.historical_structure_requests where request_id = v_request),
    'Failed preflight must not leave a ledger row';

  v_result := public.regularizar_grade_tecnica_historica_secure(v_request, v_turma, v_source, v_hash);
  assert v_result->>'calendarState' = 'REVIEW', 'Calendar must remain under review';
  assert (select count(*) = jsonb_array_length(v_curriculum)
    from public.periodos_letivos where turma_id = v_turma), 'Canonical module count differs';
  assert (select count(*) = (select count(*) from public.disciplinas d
    join public.modulos m on m.id = d.modulo_id where m.curso_id = v_course)
    from public.turmas_disciplinas where turma_id = v_turma), 'Canonical discipline count differs';
  assert not exists (select 1 from public.periodos_letivos where turma_id = v_turma
    and (status <> 'PLANEJADO' or data_inicio is not null or data_fim is not null
      or fechado_em is not null or reaberto_em is not null)), 'Historical bounds or status were invented';
  assert not exists (select 1 from public.turmas_disciplinas where turma_id = v_turma
    and (concluida or professor_id is not null or professor_nome is not null)),
    'Structure import must not invent completion or professor assignment';
  assert (select to_jsonb(t) = v_before_class from public.turmas t where t.id = v_turma),
    'Class fields, status and end date must remain byte-equivalent';
  assert (select count(*) = v_before_financial from public.contas_receber where turma_id = v_turma),
    'Structure recovery must not issue receivables';
  assert not exists (select 1 from internal_academic.transition_authorizations a
    where a.transaction_id = pg_current_xact_id()::text and a.backend_pid = pg_backend_pid()
      and (a.entity in ('HISTORICAL_PERIOD_STRUCTURE','HISTORICAL_PERIOD_DATES')
        or a.entity = 'HISTORICAL_BINDING:' || v_turma::text)), 'A reusable capability was left behind';
  v_replay := public.regularizar_grade_tecnica_historica_secure(v_request, v_turma, v_source, v_hash);
  assert v_replay->>'replayed' = 'true' and v_replay - 'replayed' = v_result - 'replayed',
    'An identical request must replay the same IDs without duplicates';
  begin
    perform public.regularizar_grade_tecnica_historica_secure(v_request, v_turma, repeat('f',64), v_hash);
    raise exception using errcode = 'ZX001', message = 'Changed manifest reused an idempotency key';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.regularizar_grade_tecnica_historica_secure(gen_random_uuid(), v_turma, v_source, v_hash);
    raise exception using errcode = 'ZX001', message = 'Existing structure was regularized again';
  exception when object_not_in_prerequisite_state then null; end;
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  begin
    perform public.regularizar_grade_tecnica_historica_secure(v_request, v_turma, v_source, v_hash);
    raise exception using errcode = 'ZX001', message = 'Replay bypassed the service role check';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  select id into v_period from public.periodos_letivos where turma_id = v_turma order by ordem limit 1;
  begin
    update public.periodos_letivos set data_inicio = date '2000-01-01', data_fim = date '2000-12-31'
      where id = v_period;
    raise exception using errcode = 'ZX001', message = 'Historical structure dates were mutable';
  exception when raise_exception then null; end;
  -- Even the ordinary status authorization cannot turn REVIEW into an open diary.
  begin
    perform internal_academic.authorize_transition('PERIODO_STATUS', v_period, 'ABERTO');
    update public.periodos_letivos set status = 'ABERTO' where id = v_period;
    raise exception using errcode = 'ZX001', message = 'A REVIEW calendar was opened';
  exception when raise_exception then null; end;
  begin
    delete from public.turmas_disciplinas where turma_id = v_turma and disciplina_id = v_discipline;
    raise exception using errcode = 'ZX001', message = 'Ordinary binding deletion guard was bypassed';
  exception when raise_exception then null; end;
  begin
    delete from public.periodos_letivos where id = v_period;
    raise exception using errcode = 'ZX001', message = 'Ordinary period deletion guard was bypassed';
  exception when raise_exception then null; end;
  set constraints all immediate;
end;
$historical_structure_test$;

rollback;
