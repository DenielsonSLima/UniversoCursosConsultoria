-- MCP-only transactional fixture after migrations 010100..010250.
-- It creates synthetic academic/financial rows and always rolls everything back.
-- No Edge Function, bank endpoint or existing row is used. The C2 authorization
-- row below is synthetic and is rolled back with the rest of the fixture.
begin;
set local statement_timeout = '60s';
set local lock_timeout = '5s';
set local plpgsql.check_asserts = 'on';
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);

create function pg_temp.synthetic_cpf()
returns text
language plpgsql
as $function$
declare
  v_digits text := lpad(floor(random() * 999999999)::bigint::text, 9, '0');
  v_sum integer;
  v_check integer;
  v_length integer;
  v_i integer;
begin
  for v_length in 9..10 loop
    v_sum := 0;
    for v_i in 1..v_length loop
      v_sum := v_sum
        + substring(v_digits, v_i, 1)::integer * (v_length + 2 - v_i);
    end loop;
    v_check := (v_sum * 10) % 11;
    v_digits := v_digits
      || case when v_check = 10 then 0 else v_check end::text;
  end loop;
  return v_digits;
end;
$function$;

do $test$
declare
  v_polo uuid;
  v_actor uuid;
  v_auth_actor uuid;
  v_course uuid := gen_random_uuid();
  v_class uuid;
  v_student uuid := gen_random_uuid();
  v_enrollment uuid;
  v_scope uuid := gen_random_uuid();
  v_class_request uuid := gen_random_uuid();
  v_c1_request uuid := gen_random_uuid();
  v_c2_request uuid := gen_random_uuid();
  v_c1_receivable uuid := gen_random_uuid();
  v_c2_receivable uuid := gen_random_uuid();
  v_context jsonb;
  v_rule jsonb;
  v_result jsonb;
  v_state jsonb;
  v_payload jsonb;
  v_source_unit text;
  v_source_class text;
  v_today date := (pg_catalog.timezone('America/Maceio', now()))::date;
  v_blocked boolean := false;
  v_sqlstate text;
begin
  select id into strict v_polo from public.polos order by id limit 1;
  select id, auth_user_id into strict v_actor, v_auth_actor
  from public.usuarios_sistema
  where auth_user_id is not null
  order by id limit 1;

  loop
    v_source_unit := floor(100000000 + random() * 899999999)::bigint::text;
    v_source_class := floor(100000000 + random() * 899999999)::bigint::text;
    exit when not exists (
      select 1 from internal_proesc.class_scopes scope
      where (scope.source_unit_id, scope.source_class_id) =
        (v_source_unit, v_source_class)
    );
  end loop;

  insert into public.cursos(id, nome, modalidade, carga_horaria)
  values (
    v_course, 'CURSO SINTETICO C1 BANESE CONTINUACAO', 'TECNICO', 1200
  );

  v_payload := jsonb_build_object(
    'codigo', 'TESTE-BANESE-C1-' || gen_random_uuid()::text,
    'nome', 'TURMA SINTETICA C1 BANESE CONTINUACAO',
    'curso_id', v_course, 'polo_id', v_polo,
    'data_inicio', v_today - 180,
    'data_previsao_termino', v_today + 550,
    'status', 'EM_ANDAMENTO', 'turno', 'NOTURNO',
    'vagas_totais', 10, 'publicar_no_site', false,
    'permitir_inscricoes_online', false,
    'origem_financeira', 'LEGADO', 'financeiro_herdado', true,
    'cobrar_matricula', false, 'valor_matricula', 0,
    'cobrar_rematricula', true, 'valor_rematricula', 100,
    'qtd_parcelas', 12, 'valor_parcela', 279.90,
    'desconto_pontualidade', 0, 'juros_atraso', 1,
    'multa_atraso_percentual', 2, 'dia_vencimento_padrao', 10,
    'aplicar_desconto_matricula', false,
    'aplicar_multa_juros_matricula', false,
    'aplicar_desconto_mensalidade', true,
    'aplicar_multa_juros_mensalidade', true,
    'aplicar_desconto_rematricula', false,
    'aplicar_multa_juros_rematricula', false,
    'primeiro_vencimento_padrao', (v_today + 40)::text,
    'instrucao_boleto_carne', 'FIXTURE ROLLBACK SEM EMISSAO',
    'ciclo_financeiro_tecnico', jsonb_build_object(
      'modo', 'MANUAL', 'baselineCycle', 1, 'maxCycle', 2,
      'estadoInicial', 'IMPORTADA_CICLO_1',
      'eligibilityRule', 'HISTORICO_EXTERNO'
    )
  );
  v_result := public.criar_turma_tecnica_com_codigo_condicao_secure(
    v_class_request, v_payload, 'Teste123456'
  );
  v_class := (v_result -> 'turma' ->> 'id')::uuid;

  insert into internal_proesc.class_scopes(
    id, batch_id, source_unit_id, source_class_id, turma_id, polo_id,
    class_code, financial_mode, phase, class_spec, source_academic,
    confirmed_by, confirmed_at
  ) values (
    v_scope, null, v_source_unit, v_source_class, v_class, v_polo,
    'FIXTURE-' || gen_random_uuid()::text, 'CICLO1_PROESC', 'CONFIRMED',
    '{}'::jsonb, '{}'::jsonb, v_actor, now()
  );

  insert into public.parceiros(
    id, cpf_cnpj, tipo, nome, nome_mae, nome_pai,
    endereco, cep, bairro, cidade, uf,
    situacao_ensino_medio, escola_ensino_medio, ano_conclusao_ensino_medio
  ) values (
    v_student, pg_temp.synthetic_cpf(), 'Aluno',
    'ALUNO SINTETICO C1 BANESE CONTINUACAO', 'MAE SINTETICA',
    'PAI SINTETICO', 'RUA DE TESTE', '49000000', 'CENTRO',
    'ARACAJU', 'SE', 'CONCLUIDO', 'ESCOLA SINTETICA', 2025
  );
  v_rule := internal_academic.technical_financial_rule(v_class);
  perform public.pre_vincular_aluno_tecnico_secure(
    v_class, v_student, gen_random_uuid(), v_today + 40,
    (v_rule -> 'identidade' ->> 'turmaRevisao')::integer,
    v_rule -> 'identidade' ->> 'turmaFingerprint'
  );
  select id into strict v_enrollment
  from public.matriculas
  where turma_id = v_class and aluno_id = v_student;
  assert internal_academic.technical_local_cycle_eligible(v_enrollment),
    'Synthetic imported-class newcomer must start as a local C1';

  insert into internal_academic.technical_manual_cycle_runs(
    matricula_id, turma_id, cycle_number, state, request_id,
    rule_fingerprint, policy_fingerprint, schedule_fingerprint,
    first_due_date, item_count, expected_installment_count,
    total_amount, receivable_ids
  ) values (
    v_enrollment, v_class, 1, 'GENERATING', v_c1_request,
    repeat('1', 64), repeat('2', 64), repeat('3', 64),
    v_today + 40, 1, 1, 279.90, '{}'::uuid[]
  );
  perform set_config(
    'app.technical_manual_cycle_request_id', v_c1_request::text, true
  );
  insert into public.contas_receber(
    id, polo_id, descricao, valor, data_vencimento, status,
    cliente_id, matricula_id, turma_id, forma_pagamento, categoria,
    tipo_lancamento, parcela_numero, origem_cronograma_id,
    origem_pagamento, regra_financeira_tecnica_snapshot
  ) values (
    v_c1_receivable, v_polo, 'FIXTURE C1 IMPORTADO BANESE', 279.90,
    v_today + 40, 'PENDENTE', v_student, v_enrollment, v_class,
    'BOLETO', 'MENSALIDADE', 'PARCELA', 1, 'ciclo-1-parc-1',
    'BANESE', jsonb_build_object('cicloManual', jsonb_build_object(
      'requestId', v_c1_request, 'cicloNumero', 1,
      'regraFingerprint', repeat('1', 64),
      'politicaFingerprint', repeat('2', 64),
      'cronogramaFingerprint', repeat('3', 64)
    ))
  );
  update internal_academic.technical_manual_cycle_runs
  set state = 'PROTECTED_EXISTING', receivable_ids = array[v_c1_receivable],
    completed_at = now()
  where matricula_id = v_enrollment and cycle_number = 1;

  v_context := internal_academic.technical_imported_cycle_identity_context(
    v_enrollment
  );
  insert into internal_academic.technical_imported_cycle_facts(
    matricula_id, turma_id, cycle_number, administration_origin,
    source_system, proof_kind, source_scope_id, proof_reference_id,
    proof_hash, audit_hash, identity_hash, proof_manifest_hash,
    source_observed_at, confirmed_at
  ) values (
    v_enrollment, v_class, 1, 'IMPORTED_BANESE', 'BANESE',
    'BANESE_PROTECTED_RUN', v_scope, v_c1_request, repeat('4', 64),
    repeat('5', 64), v_context ->> 'identityHash', null, now(), now()
  );

  assert internal_academic.technical_imported_banese_cycle_is_durable(
    v_enrollment, 1
  ), 'Synthetic imported Banese C1 fact is not durable';
  assert internal_academic.technical_imported_cycle_generation_permitted(
    v_enrollment
  ), 'Durable imported Banese C1 did not authorize C2';
  v_state := internal_academic.technical_manual_cycle_state(v_enrollment);
  assert v_state ->> 'estado' = 'ELEGIVEL'
    and (v_state ->> 'podeGerar')::boolean
    and (v_state ->> 'proximoCicloNumero')::integer = 2,
    'Imported Banese C1 remained protected instead of exposing C2';
  assert internal_academic.is_technical_manual_cycle_protected(v_enrollment),
    'Imported Banese C1 must remain protected at enrollment level';

  begin
    update public.contas_receber
    set gateway_creation_token = gen_random_uuid()
    where id = v_c1_receivable;
  exception when others then
    v_blocked := true;
    v_sqlstate := sqlstate;
  end;
  assert v_blocked and v_sqlstate in ('42501', 'P0001'),
    'Protected imported C1 unexpectedly accepted a first bank claim';
  v_blocked := false;
  v_sqlstate := null;

  insert into internal_academic.technical_manual_cycle_runs(
    matricula_id, turma_id, cycle_number, state, request_id,
    rule_fingerprint, policy_fingerprint, schedule_fingerprint,
    first_due_date, item_count, expected_installment_count,
    total_amount, receivable_ids
  ) values (
    v_enrollment, v_class, 2, 'GENERATING', v_c2_request,
    repeat('6', 64), repeat('7', 64), repeat('8', 64),
    v_today + 70, 1, 1, 100, '{}'::uuid[]
  );
  assert internal_academic.technical_imported_cycle_generation_permitted(
    v_enrollment
  ), 'Current-transaction C2 claim was not accepted';
  perform set_config(
    'app.technical_manual_cycle_request_id', v_c2_request::text, true
  );
  insert into public.contas_receber(
    id, polo_id, descricao, valor, data_vencimento, status,
    cliente_id, matricula_id, turma_id, forma_pagamento, categoria,
    tipo_lancamento, parcela_numero, origem_cronograma_id,
    origem_pagamento, regra_financeira_tecnica_snapshot
  ) values (
    v_c2_receivable, v_polo, 'FIXTURE C2 LOCAL APOS C1 BANESE', 100,
    v_today + 70, 'PENDENTE', v_student, v_enrollment, v_class,
    'BOLETO', 'MENSALIDADE', 'PARCELA', 1,
    'ciclo-2-parc-1', 'BANESE',
    jsonb_build_object('cicloManual', jsonb_build_object(
      'requestId', v_c2_request, 'cicloNumero', 2,
      'regraFingerprint', repeat('6', 64),
      'politicaFingerprint', repeat('7', 64),
      'cronogramaFingerprint', repeat('8', 64)
    ))
  );
  assert exists (
    select 1 from public.contas_receber where id = v_c2_receivable
  ), 'Real INSERT path rejected the exact current-transaction C2';

  update internal_academic.technical_manual_cycle_runs
  set state = 'LOCAL_CREATED', receivable_ids = array[v_c2_receivable],
    completed_at = now()
  where matricula_id = v_enrollment and cycle_number = 2;
  assert internal_academic.technical_imported_banese_local_c2_is_valid(
    v_enrollment
  ), 'Created C2 was not recognized as the exact local continuation';
  assert not internal_academic.technical_imported_cycle_generation_permitted(
    v_enrollment
  ), 'Completed local C2 incorrectly left generation open';
  assert internal_academic.is_technical_manual_cycle_protected(v_enrollment),
    'C1 enrollment protection must remain after the local C2 is complete';

  begin
    update public.contas_receber
    set gateway_creation_token = gen_random_uuid()
    where id = v_c2_receivable;
  exception when others then
    v_blocked := true;
    v_sqlstate := sqlstate;
  end;
  assert v_blocked and v_sqlstate in ('42501', 'P0001'),
    'Local C2 accepted a first bank claim without per-receivable authorization';
  v_blocked := false;
  v_sqlstate := null;

  insert into
    internal_academic.technical_manual_receivable_issuance_authorizations(
      receivable_id, matricula_id, turma_id, cycle_number, request_id,
      receivable_fingerprint, authorized_by
    )
  select v_c2_receivable, v_enrollment, v_class, 2, gen_random_uuid(),
    internal_academic.technical_manual_receivable_issuance_fingerprint(
      receivable
    ), v_auth_actor
  from public.contas_receber receivable
  where receivable.id = v_c2_receivable;
  update public.contas_receber
  set gateway_creation_token = gen_random_uuid()
  where id = v_c2_receivable;
  assert exists (
    select 1
    from public.contas_receber receivable
    join internal_academic.technical_manual_receivable_issuance_authorizations
      issuance_auth on issuance_auth.receivable_id = receivable.id
    where receivable.id = v_c2_receivable
      and receivable.gateway_creation_token is not null
      and issuance_auth.claim_count = 1
      and issuance_auth.first_claimed_at is not null
  ), 'Authorized local C2 did not traverse the real first-claim guards';

  begin
    insert into public.contas_receber(
      id, polo_id, descricao, valor, data_vencimento, status,
      cliente_id, matricula_id, turma_id, forma_pagamento, categoria,
      tipo_lancamento, parcela_numero, origem_cronograma_id, origem_pagamento
    ) values (
      gen_random_uuid(), v_polo, 'FIXTURE DUPLICIDADE PROIBIDA', 100,
      v_today + 100, 'PENDENTE', v_student, v_enrollment, v_class,
      'BOLETO', 'MENSALIDADE', 'REMATRICULA', null,
      'ciclo-1-rematricula', 'BANESE'
    );
  exception when others then
    v_blocked := true;
    v_sqlstate := sqlstate;
  end;
  assert v_blocked and v_sqlstate in ('42501', 'P0001', '23514'),
    'A second/unclaimed C2 INSERT was not blocked';
end;
$test$;

select 'imported_banese_c1_continuation_rollback_passed' as result;
rollback;
