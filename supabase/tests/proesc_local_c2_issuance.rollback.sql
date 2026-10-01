-- Synthetic proof for EXTERNAL_PROESC C1 -> reviewed LOCAL_CREATED C2 issuance.
-- Run only after 20261001091400. It never calls an Edge Function or a bank.
begin;
set local statement_timeout = '60s';
set local lock_timeout = '5s';
set local plpgsql.check_asserts = 'on';
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);
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
create function pg_temp.authorization_sqlstate(p_receivable_id uuid)
returns text
language plpgsql
as $function$
begin
  perform public.authorize_technical_manual_receivable_issuance_secure(
    p_receivable_id, gen_random_uuid()
  );
  return null;
exception when others then
  return sqlstate;
end;
$function$;
create function pg_temp.first_claim_sqlstate(p_receivable_id uuid)
returns text
language plpgsql
as $function$
begin
  update public.contas_receber
  set gateway_creation_token = gen_random_uuid(),
      gateway_submission_channel = 'API',
      gateway_submission_status = 'API_AMBIGUOUS'
  where id = p_receivable_id;
  return null;
exception when others then
  return sqlstate;
end;
$function$;
do $test$
declare
  v_candidate record;
  v_actor uuid;
  v_auth_actor uuid;
  v_polo uuid;
  v_other_polo uuid;
  v_course uuid := gen_random_uuid();
  v_class uuid;
  v_scope uuid := gen_random_uuid();
  v_class_request uuid := gen_random_uuid();
  v_main_student uuid := gen_random_uuid();
  v_native_student uuid := gen_random_uuid();
  v_enrollment uuid;
  v_native_enrollment uuid;
  v_c2_request uuid := gen_random_uuid();
  v_authorization_request uuid := gen_random_uuid();
  v_outside uuid := gen_random_uuid();
  v_c1_history uuid := gen_random_uuid();
  v_foreign uuid := gen_random_uuid();
  v_target uuid;
  v_other_member uuid;
  v_attempt uuid := gen_random_uuid();
  v_context jsonb;
  v_rule jsonb;
  v_payload jsonb;
  v_result jsonb;
  v_preview jsonb;
  v_service jsonb;
  v_authorization jsonb;
  v_run internal_academic.technical_manual_cycle_runs%rowtype;
  v_source_unit text;
  v_source_class text;
  v_alt_source_class text;
  v_first_due date := (pg_catalog.timezone('America/Maceio', now()))::date + 40;
  v_today date := (pg_catalog.timezone('America/Maceio', now()))::date;
  v_local_blocked boolean := false;
  v_sqlstate text;
begin
  -- Reuse only an active financial actor identity/scope; all business rows are new.
  for v_candidate in
    select distinct user_row.id as actor_id, user_row.auth_user_id,
      receivable.polo_id
    from internal_academic.technical_manual_receivable_issuance_authorizations authz
    join public.usuarios_sistema user_row
      on user_row.auth_user_id = authz.authorized_by
    join public.contas_receber receivable
      on receivable.id = authz.receivable_id
    where user_row.auth_user_id is not null
      and public.is_active_status(user_row.status)
    order by user_row.id, receivable.polo_id
  loop
    perform set_config('request.jwt.claims', jsonb_build_object(
      'role', 'authenticated', 'sub', v_candidate.auth_user_id
    )::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    if public.gestor_has_financeiro_tab('receber')
      and public.is_gestor_for_polo(v_candidate.polo_id)
    then
      v_actor := v_candidate.actor_id;
      v_auth_actor := v_candidate.auth_user_id;
      v_polo := v_candidate.polo_id;
      exit;
    end if;
  end loop;
  assert v_auth_actor is not null,
    'Fixture requires an active financial actor with a known polo scope';
  select id into strict v_other_polo from public.polos
  where id <> v_polo order by id limit 1;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  loop
    v_source_unit := floor(100000000 + random() * 899999999)::bigint::text;
    v_source_class := floor(100000000 + random() * 899999999)::bigint::text;
    v_alt_source_class := floor(100000000 + random() * 899999999)::bigint::text;
    exit when v_source_class <> v_alt_source_class
      and not exists (
        select 1 from internal_proesc.class_scopes scope
        where (scope.source_unit_id, scope.source_class_id) in (
          (v_source_unit, v_source_class),
          (v_source_unit, v_alt_source_class)
        )
      );
  end loop;

  insert into public.cursos(id, nome, modalidade, carga_horaria)
  values (v_course, 'CURSO SINTETICO PROESC C1 C2 LOCAL', 'TECNICO', 1200);
  v_payload := jsonb_build_object(
    'codigo', 'TESTE-PROESC-C1-C2-' || gen_random_uuid()::text,
    'nome', 'TURMA SINTETICA PROESC C1 C2 LOCAL',
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
    'primeiro_vencimento_padrao', v_first_due::text,
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
    id, cpf_cnpj, tipo, nome, nome_mae, nome_pai, endereco, cep, bairro,
    cidade, uf, situacao_ensino_medio, escola_ensino_medio,
    ano_conclusao_ensino_medio
  ) values
    (v_main_student, pg_temp.synthetic_cpf(), 'Aluno',
      'ALUNO SINTETICO PROESC C1', 'MAE SINTETICA', 'PAI SINTETICO',
      'RUA DE TESTE', '49000000', 'CENTRO', 'ARACAJU', 'SE',
      'CONCLUIDO', 'ESCOLA SINTETICA', 2025),
    (v_native_student, pg_temp.synthetic_cpf(), 'Aluno',
      'ALUNO SINTETICO NATIVO', 'MAE SINTETICA', 'PAI SINTETICO',
      'RUA DE TESTE', '49000000', 'CENTRO', 'ARACAJU', 'SE',
      'CONCLUIDO', 'ESCOLA SINTETICA', 2025);
  v_rule := internal_academic.technical_financial_rule(v_class);
  perform public.pre_vincular_aluno_tecnico_secure(
    v_class, v_main_student, gen_random_uuid(), v_first_due,
    (v_rule -> 'identidade' ->> 'turmaRevisao')::integer,
    v_rule -> 'identidade' ->> 'turmaFingerprint'
  );
  perform public.pre_vincular_aluno_tecnico_secure(
    v_class, v_native_student, gen_random_uuid(), v_first_due,
    (v_rule -> 'identidade' ->> 'turmaRevisao')::integer,
    v_rule -> 'identidade' ->> 'turmaFingerprint'
  );
  select id into strict v_enrollment from public.matriculas
  where turma_id = v_class and aluno_id = v_main_student;
  select id into strict v_native_enrollment from public.matriculas
  where turma_id = v_class and aluno_id = v_native_student;
  assert internal_academic.technical_local_cycle_eligible(v_native_enrollment)
    and not internal_academic.technical_imported_cycle_has_confirmed(
      v_native_enrollment, 1
    ) and not internal_academic.technical_external_proesc_local_c2_is_valid(
      v_native_enrollment
    ), 'A native/local enrollment without proof acquired imported-C1 rights';
  v_context := internal_academic.technical_imported_cycle_identity_context(
    v_enrollment
  );
  assert v_context is not null and not internal_academic
    .technical_imported_cycle_has_confirmed(v_enrollment, 1),
    'Missing proof did not fail closed';
  perform internal_academic.lock_technical_imported_cycle_fact(v_enrollment, 1);
  insert into internal_academic.technical_imported_cycle_facts(
    matricula_id, turma_id, cycle_number, administration_origin,
    source_system, proof_kind, source_scope_id, proof_reference_id,
    proof_hash, audit_hash, identity_hash, proof_manifest_hash,
    evidence_revision, source_observed_at, confirmed_at
  ) values (
    v_enrollment, v_class, 1, 'EXTERNAL_PROESC', 'PROESC',
    'PROESC_API_SCHEDULE', v_scope, gen_random_uuid(), repeat('1', 64),
    repeat('2', 64), v_context ->> 'identityHash',
    v_context ->> 'manifestHash', 1, now(), now()
  );
  assert internal_academic.technical_imported_cycle_has_confirmed(
      v_enrollment, 1
    ) and internal_academic.technical_imported_cycle_generation_permitted(
      v_enrollment
    ), 'Durable external Proesc C1 did not open exactly the local C2 lane';

  v_preview := public.preview_ciclo_financeiro_tecnico_manual_secure(
    v_enrollment, 2, v_first_due, null
  ) -> 'preview';
  assert v_preview ->> 'quantidadeItens' = '13'
    and v_preview ->> 'quantidadeBancaria' = '13'
    and v_preview ->> 'quantidadeLocal' = '0'
    and (select count(*) from jsonb_array_elements(v_preview -> 'itens') item
      where item ->> 'tipo' = 'REMATRICULA') = 1
    and (select count(*) from jsonb_array_elements(v_preview -> 'itens') item
      where item ->> 'tipo' = 'PARCELA') = 12,
    'C2 preview is not one reenrollment plus twelve bank installments';
  -- These rows are controls only. Their null type bypasses the technical
  -- creation lane. The canonical constructor keeps the policy trigger enabled.
  perform set_config('app.technical_manual_cycle_request_id', '', true);
  insert into public.contas_receber(
    id, polo_id, descricao, valor, data_vencimento, status, cliente_id,
    matricula_id, turma_id, forma_pagamento, categoria, tipo_lancamento,
    parcela_numero, origem_cronograma_id, origem_pagamento,
    regra_financeira_tecnica_snapshot
  ) values
    (v_outside, v_polo, 'CONTROLE FORA DO ARRAY C2', 1, v_first_due,
      'PENDENTE', v_main_student, v_enrollment, v_class, 'BOLETO',
      'MENSALIDADE', null, null, 'fixture-outside-c2', 'BANESE',
      internal_academic.build_technical_receivable_policy_snapshot(
        v_enrollment, null, 'CONTROLE FORA DO ARRAY C2', 1, false)),
    (v_c1_history, v_polo, 'CONTROLE HISTORICO C1', 1, v_first_due,
      'PENDENTE', v_main_student, v_enrollment, v_class, 'BOLETO',
      'MENSALIDADE', null, null, 'fixture-history-c1', 'SISTEMA_ANTERIOR',
      internal_academic.build_technical_receivable_policy_snapshot(
        v_enrollment, null, 'CONTROLE HISTORICO C1', 1, false)),
    (v_foreign, v_other_polo, 'CONTROLE POLO DIVERGENTE', 1,
      v_first_due, 'PENDENTE', v_main_student, v_enrollment,
      v_class, 'BOLETO', 'MENSALIDADE', null, null,
      'fixture-foreign-c2', 'BANESE',
      internal_academic.build_technical_receivable_policy_snapshot(
        v_enrollment, null, 'CONTROLE POLO DIVERGENTE', 1, false));
  v_preview := public.preview_ciclo_financeiro_tecnico_manual_secure(
    v_enrollment, 2, v_first_due, null) -> 'preview';
  v_result := public.preparar_emissao_ciclo_financeiro_tecnico_manual_secure(
    v_enrollment, 2, v_first_due, v_c2_request,
    v_preview ->> 'regraEfetivaFingerprint',
    v_preview ->> 'politicaFingerprint',
    v_preview ->> 'cronogramaFingerprint', null
  );
  select * into strict v_run
  from internal_academic.technical_manual_cycle_runs
  where matricula_id = v_enrollment and cycle_number = 2;
  select receivable.id into strict v_target
  from unnest(v_run.receivable_ids) member(id)
  join public.contas_receber receivable on receivable.id = member.id
  where receivable.tipo_lancamento = 'PARCELA'
  order by receivable.parcela_numero limit 1;
  select receivable.id into strict v_other_member
  from unnest(v_run.receivable_ids) member(id)
  join public.contas_receber receivable on receivable.id = member.id
  where receivable.id <> v_target order by receivable.id limit 1;
  assert v_run.state = 'LOCAL_CREATED' and v_run.item_count = 13
    and cardinality(v_run.receivable_ids) = 13
    and jsonb_array_length(v_run.reviewed_items) = 13
    and internal_academic.technical_external_proesc_local_c2_is_valid(
      v_enrollment
    ) and internal_academic.technical_imported_c1_receivable_is_local_c2(
      v_target, v_enrollment
    ) and not internal_academic.technical_imported_c1_receivable_is_local_c2(
      v_outside, v_enrollment
    ), 'Committed reviewed C2 membership was not fenced exactly';
  assert internal_academic.is_technical_manual_cycle_protected(v_enrollment)
    and not internal_academic.technical_imported_cycle_generation_permitted(
      v_enrollment
    ), 'Issuance exception reopened generation or global protection';
  v_service := public.obter_emissao_ciclo_financeiro_tecnico_manual_service(
    v_enrollment, 2
  );
  assert v_service #>> '{ciclo,quantidadeItens}' = '13'
    and v_service #>> '{ciclo,quantidadeBancaria}' = '13'
    and v_service #>> '{ciclo,quantidadeLocal}' = '0'
    and v_service #>> '{ciclo,emitidosBanese}' = '0'
    and v_service #>> '{ciclo,pendentesEmissao}' = '13',
    'Service projection changed the 13/0 pre-issuance contract';
  perform set_config('request.jwt.claims', jsonb_build_object(
    'role', 'authenticated', 'sub', v_auth_actor
  )::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  assert pg_temp.authorization_sqlstate(v_outside) = '42501'
    and pg_temp.authorization_sqlstate(v_c1_history) = '42501',
    'A C1/receivable outside the reviewed C2 array reached authorization';
  -- A matching imported C2 fact closes both authorization and first claim.
  begin
    perform internal_academic.lock_technical_imported_cycle_fact(v_enrollment, 2);
    insert into internal_academic.technical_imported_cycle_facts(
      matricula_id, turma_id, cycle_number, administration_origin,
      source_system, proof_kind, source_scope_id, proof_reference_id,
      proof_hash, audit_hash, identity_hash, proof_manifest_hash,
      evidence_revision, source_observed_at, confirmed_at
    ) values (
      v_enrollment, v_class, 2, 'EXTERNAL_PROESC', 'PROESC',
      'PROESC_API_SCHEDULE', v_scope, gen_random_uuid(), repeat('3', 64),
      repeat('4', 64), v_context ->> 'identityHash',
      v_context ->> 'manifestHash', 1, now(), now()
    );
    assert not internal_academic.technical_external_proesc_local_c2_is_valid(
      v_enrollment
    ) and pg_temp.authorization_sqlstate(v_target) = '42501'
      and pg_temp.first_claim_sqlstate(v_target) = '42501',
      'Imported Proesc C2 did not close the local bank lane';
    raise exception 'rollback imported C2 negative' using errcode = 'ZX001';
  exception when sqlstate 'ZX001' then null;
  end;
  assert not internal_academic.technical_imported_cycle_exists(v_enrollment, 2),
    'Imported C2 negative escaped its subtransaction';
  -- A second local C1 lineage also closes the narrow imported-C1 exception.
  begin
    insert into internal_academic.technical_manual_cycle_runs(
      matricula_id, turma_id, cycle_number, state, request_id,
      first_due_date, item_count, expected_installment_count, total_amount,
      receivable_ids, completed_at
    ) values (
      v_enrollment, v_class, 1, 'PROTECTED_EXISTING', null,
      v_first_due, 1, 1, 1, array[v_c1_history], now()
    );
    assert not internal_academic.technical_external_proesc_local_c2_is_valid(
      v_enrollment
    ) and pg_temp.authorization_sqlstate(v_target) = '42501',
      'Hybrid local C1 history reused the external-C1 issuance exception';
    raise exception 'rollback local C1 negative' using errcode = 'ZX001';
  exception when sqlstate 'ZX001' then null;
  end;
  -- Paid state is checked after the narrow protected-enrollment exception.
  begin
    update public.contas_receber set status = 'PAGO' where id = v_target;
    v_sqlstate := pg_temp.authorization_sqlstate(v_target);
    assert v_sqlstate in ('P0001', 'PT422'),
      'Paid C2 receivable became eligible for a new bank authorization';
    raise exception 'rollback paid negative' using errcode = 'ZX001';
  exception when sqlstate 'ZX001' then null;
  end;
  -- A destination mutation must fail before it can become a local bank title.
  begin
    update public.contas_receber
    set regra_financeira_tecnica_snapshot = jsonb_set(
      regra_financeira_tecnica_snapshot,
      '{destinoCobranca}', '"LOCAL"'::jsonb, true
    ) where id = v_other_member;
  exception when check_violation or insufficient_privilege then
    v_local_blocked := true;
  end;
  assert v_local_blocked,
    'A reviewed banking item accepted a LOCAL destination mutation';
  -- Scope identity and every member's person/polo identity are fail-closed.
  begin
    update internal_proesc.class_scopes
    set source_class_id = v_alt_source_class where id = v_scope;
    assert not internal_academic.technical_external_proesc_local_c2_is_valid(
      v_enrollment
    ) and pg_temp.authorization_sqlstate(v_target) = '42501',
      'Changed Proesc scope kept the issuance exception';
    raise exception 'rollback scope negative' using errcode = 'ZX001';
  exception when sqlstate 'ZX001' then null;
  end;
  begin
    update internal_academic.technical_manual_cycle_runs run
    set receivable_ids = (
      select array_agg(
        case when member.id = v_other_member then v_foreign else member.id end
        order by member.ordinality
      )
      from unnest(run.receivable_ids) with ordinality member(id, ordinality)
    )
    where run.matricula_id = v_enrollment and run.cycle_number = 2;
    assert not internal_academic.technical_external_proesc_local_c2_is_valid(
      v_enrollment
    ) and pg_temp.authorization_sqlstate(v_target) = '42501',
      'A foreign polo member kept the issuance exception';
    raise exception 'rollback identity negative' using errcode = 'ZX001';
  exception when sqlstate 'ZX001' then null;
  end;
  begin
    update public.contas_receber set polo_id = v_polo,
      cliente_id = v_native_student where id = v_foreign;
    update internal_academic.technical_manual_cycle_runs run
    set receivable_ids = array_replace(
      run.receivable_ids, v_other_member, v_foreign
    ) where run.matricula_id = v_enrollment and run.cycle_number = 2;
    assert not internal_academic.technical_external_proesc_local_c2_is_valid(
      v_enrollment
    ) and pg_temp.authorization_sqlstate(v_target) = '42501',
      'A foreign person member kept the issuance exception';
    raise exception 'rollback person negative' using errcode = 'ZX001';
  exception when sqlstate 'ZX001' then null;
  end;
  -- Global duplicate protection remains untouched after LOCAL_CREATED.
  begin
    insert into public.contas_receber(
      id, polo_id, descricao, valor, data_vencimento, status, cliente_id,
      matricula_id, turma_id, forma_pagamento, categoria, tipo_lancamento,
      parcela_numero, origem_cronograma_id, origem_pagamento
    ) values (
      gen_random_uuid(), v_polo, 'DUPLICIDADE TECNICA PROIBIDA', 1,
      v_first_due, 'PENDENTE', v_main_student, v_enrollment, v_class,
      'BOLETO', 'MENSALIDADE', 'PARCELA', 13,
      'ciclo-2-parc-13', 'BANESE'
    );
    raise exception 'Completed C2 accepted a duplicate technical title'
      using errcode = 'ZX002';
  exception when sqlstate 'P0001' or insufficient_privilege then null;
  end;
  v_authorization := public.authorize_technical_manual_receivable_issuance_secure(
    v_target, v_authorization_request
  );
  assert v_authorization -> 'required' = 'true'::jsonb
    and v_authorization -> 'authorized' = 'true'::jsonb
    and v_authorization -> 'replayed' = 'false'::jsonb,
    'Exact local C2 did not traverse the real authorization RPC';
  v_authorization := public.authorize_technical_manual_receivable_issuance_secure(
    v_target, v_authorization_request
  );
  assert v_authorization -> 'replayed' = 'true'::jsonb,
    'Authorization requestId did not replay idempotently';
  update public.contas_receber
  set gateway_creation_token = v_attempt,
      gateway_submission_channel = 'API',
      gateway_submission_status = 'API_AMBIGUOUS'
  where id = v_target;
  assert exists (
    select 1
    from public.contas_receber receivable
    join internal_academic.technical_manual_receivable_issuance_authorizations authz
      on authz.receivable_id = receivable.id
    where receivable.id = v_target
      and receivable.gateway_creation_token = v_attempt
      and receivable.gateway_submission_channel = 'API'
      and receivable.gateway_submission_status = 'API_AMBIGUOUS'
      and authz.request_id = v_authorization_request
      and authz.claim_count = 1
      and authz.first_claimed_at is not null
  ), 'Authorized item did not cross the real first-claim and POST guards';
  assert internal_academic.technical_external_proesc_local_c2_is_valid(
      v_enrollment
    ) and internal_academic.technical_imported_c1_receivable_is_local_c2(
      v_target, v_enrollment
    ) and not internal_academic.technical_imported_c1_receivable_is_local_c2(
      v_outside, v_enrollment
    ) and not internal_academic.technical_imported_c1_receivable_is_local_c2(
      v_c1_history, v_enrollment
    ) and not internal_academic.technical_imported_c1_receivable_is_local_c2(
      v_foreign, v_enrollment
    ), 'First claim widened the exception beyond the exact C2 membership';
end;
$test$;
select 'proesc_local_c2_issuance_rollback_passed' as result;
rollback;
