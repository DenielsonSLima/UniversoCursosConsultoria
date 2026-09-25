-- Integration regression for the actual invoker triggers and PostgreSQL roles.
-- Synthetic course, class, student, enrollment, receivables and ledger only.
-- Existing actor/polo/account identities are read, never changed. No Edge/bank I/O.
-- Run as a migration-capable role, via MCP, in this single rollback transaction.
-- SET ROLE is mandatory: changing JWT claims alone would conceal this regression.
begin;
set local statement_timeout = '90s';
set local lock_timeout = '3s';
set local plpgsql.check_asserts = 'on';

create function pg_temp.invoker_test_cpf()
returns text language plpgsql as $function$
declare
  v_digits text := lpad(floor(random() * 999999999)::bigint::text, 9, '0');
  v_sum integer; v_check integer; v_length integer; v_i integer;
begin
  for v_length in 9..10 loop
    v_sum := 0;
    for v_i in 1..v_length loop
      v_sum := v_sum + substring(v_digits, v_i, 1)::integer * (v_length + 2 - v_i);
    end loop;
    v_check := (v_sum * 10) % 11;
    v_digits := v_digits || case when v_check = 10 then 0 else v_check end::text;
  end loop;
  return v_digits;
end;
$function$;

do $test$
declare
  v_candidate record; v_scope record;
  v_actor uuid; v_actor_system uuid; v_polo uuid; v_account uuid;
  v_course uuid := gen_random_uuid(); v_student uuid := gen_random_uuid();
  v_class uuid; v_enrollment uuid; v_request uuid := gen_random_uuid();
  v_due date := timezone('America/Maceio', now())::date + 40;
  v_payload jsonb; v_rule jsonb; v_preview jsonb; v_review jsonb; v_result jsonb;
  v_local public.contas_receber%rowtype; v_bank public.contas_receber%rowtype;
  v_noncycle public.contas_receber%rowtype;
  v_settlement uuid; v_lease uuid := gen_random_uuid(); v_snapshot jsonb;
  v_token uuid := gen_random_uuid(); v_auth_request uuid := gen_random_uuid(); v_count integer; v_message text;
begin
  assert not exists (
    select 1 from pg_proc where oid in (
      'public.protect_paid_financial_history()'::regprocedure,
      'public.protect_receivable_manual_settlement_fields()'::regprocedure
    ) and prosecdef
  ), 'Financial guards must remain SECURITY INVOKER';
  assert not exists (
    select 1 from unnest(array['anon', 'authenticated', 'service_role']) role_name
    where has_function_privilege(role_name,
      'internal_academic.local_manual_reversal_authorized(public.contas_receber,public.contas_receber)',
      'EXECUTE')
  ), 'The private reversal helper must remain private';

  -- Select a pre-existing authorized scope by identifiers, without changing it.
  for v_candidate in
    select id, auth_user_id from public.usuarios_sistema
    where auth_user_id is not null and public.is_active_status(status)
      and lower(btrim(perfil)) in ('gestor', 'financeiro')
    order by id
  loop
    perform set_config('request.jwt.claims', jsonb_build_object(
      'role', 'authenticated', 'sub', v_candidate.auth_user_id)::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    perform set_config('request.jwt.claim.sub', v_candidate.auth_user_id::text, true);
    if public.gestor_has_tab('gestao', 'financeiro')
      and public.gestor_has_module('financeiro')
      and public.gestor_has_financeiro_tab('receber') then
      for v_scope in
        select p.id as polo_id, a.id as account_id
        from public.polos p join public.contas_bancarias a
          on a.ativo and (a.polo_id = p.id or a.polo_id is null)
        order by p.id, a.polo_id nulls last, a.id
      loop
        if public.is_gestor_for_polo(v_scope.polo_id) then
          v_actor := v_candidate.auth_user_id; v_actor_system := v_candidate.id;
          v_polo := v_scope.polo_id; v_account := v_scope.account_id;
          exit;
        end if;
      end loop;
    end if;
    exit when v_actor is not null;
  end loop;
  if v_actor is null then
    raise exception 'An authorized financial/academic test scope is required.';
  end if;
  perform set_config('request.jwt.claims', jsonb_build_object(
    'role', 'service_role', 'sub', v_actor)::text, true);
  perform set_config('request.jwt.claim.role', 'service_role', true);

  insert into public.cursos(id, nome, modalidade, carga_horaria)
    values(v_course, 'CURSO SINTETICO REGRESSAO INVOKER', 'TECNICO', 1200);
  v_payload := jsonb_build_object(
    'codigo', 'TESTE-INVOKER-' || gen_random_uuid()::text,
    'nome', 'TURMA SINTETICA REGRESSAO INVOKER', 'curso_id', v_course, 'polo_id', v_polo,
    'data_inicio', v_due - 10, 'data_previsao_termino', v_due + 730,
    'status', 'PLANEJADA', 'turno', 'NOTURNO', 'vagas_totais', 40,
    'publicar_no_site', false, 'permitir_inscricoes_online', false,
    'origem_financeira', 'NORMAL', 'financeiro_herdado', false,
    'cobrar_matricula', true, 'valor_matricula', 125.50,
    'cobrar_rematricula', true, 'valor_rematricula', 125.50,
    'qtd_parcelas', 12, 'valor_parcela', 270.00,
    'desconto_pontualidade', 0, 'juros_atraso', 0, 'multa_atraso_percentual', 0,
    'dia_vencimento_padrao', extract(day from v_due)::integer,
    'aplicar_desconto_matricula', false, 'aplicar_multa_juros_matricula', false,
    'aplicar_desconto_mensalidade', false, 'aplicar_multa_juros_mensalidade', false,
    'aplicar_desconto_rematricula', false, 'aplicar_multa_juros_rematricula', false,
    'primeiro_vencimento_padrao', v_due, 'instrucao_boleto_carne', 'TESTE SEM EMISSAO',
    'ciclo_financeiro_tecnico', jsonb_build_object('modo', 'MANUAL',
      'baselineCycle', 0, 'maxCycle', 2, 'estadoInicial', 'NOVA', 'eligibilityRule', 'QUITACAO_TOTAL')
  );
  v_result := public.criar_turma_tecnica_com_codigo_condicao_secure(
    gen_random_uuid(), v_payload, 'Teste123456');
  v_class := (v_result #>> '{turma,id}')::uuid;
  insert into public.parceiros(id, cpf_cnpj, tipo, nome)
    values(v_student, pg_temp.invoker_test_cpf(), 'Aluno', 'ALUNO SINTETICO REGRESSAO INVOKER');
  v_rule := internal_academic.technical_financial_rule(v_class);
  perform public.pre_vincular_aluno_tecnico_secure(v_class, v_student, gen_random_uuid(),
    v_due, (v_rule #>> '{identidade,turmaRevisao}')::integer,
    v_rule #>> '{identidade,turmaFingerprint}');
  select id into strict v_enrollment from public.matriculas
    where turma_id = v_class and aluno_id = v_student;

  v_preview := public.preview_ciclo_financeiro_tecnico_manual_secure(v_enrollment, 1, v_due, null)->'preview';
  select jsonb_build_object('modoMatricula', 'REGISTRO_SEM_BOLETO', 'emitirMatricula', false,
    'itens', jsonb_agg(jsonb_build_object('chave', i->>'chave', 'valor', i->>'valor',
      'vencimento', i->>'vencimento', 'descontoPontualidade', '0.00',
      'jurosAtrasoPercentual', '0.00', 'multaAtrasoPercentual', '0.00') order by n))
    into v_review from jsonb_array_elements(v_preview->'itens') with ordinality a(i,n);
  v_preview := public.preview_ciclo_financeiro_tecnico_manual_secure(v_enrollment, 1, v_due, v_review)->'preview';
  perform set_config('request.jwt.claims', jsonb_build_object(
    'role', 'authenticated', 'sub', v_actor)::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  assert current_user = 'authenticated', 'Preparation must use the actual authenticated database role';
  v_result := public.preparar_emissao_ciclo_financeiro_tecnico_manual_secure(
    v_enrollment, 1, v_due, v_request, v_preview->>'regraEfetivaFingerprint',
    v_preview->>'politicaFingerprint', v_preview->>'cronogramaFingerprint', v_review);
  execute 'reset role';
  select * into strict v_local from public.contas_receber
    where matricula_id = v_enrollment and tipo_lancamento = 'MATRICULA';
  select * into strict v_bank from public.contas_receber
    where matricula_id = v_enrollment and tipo_lancamento = 'PARCELA' order by parcela_numero limit 1;
  assert (select count(*) = 13 from public.contas_receber where matricula_id = v_enrollment),
    'Synthetic setup must create one local fee and twelve bank installments';
  v_result := internal_academic.receivable_cycle_presentation(v_bank);
  assert v_result->>'emissao_gerenciada_turma' = 'true'
    and v_result->>'emissao_ciclo_status' = 'PENDENTE',
    'Unissued native installments must direct bank issuance to the class';
  v_result := internal_academic.receivable_cycle_presentation(v_local);
  assert v_result->>'emissao_gerenciada_turma' = 'true'
    and v_result->>'emissao_ciclo_status' = 'NAO_APLICAVEL',
    'Local enrollment fees must never offer bank issuance';
  v_noncycle := jsonb_populate_record(null::public.contas_receber,
    jsonb_build_object('id', gen_random_uuid(), 'status', 'PENDENTE',
      'origem_pagamento', 'SISTEMA_ANTERIOR', 'gateway_boleto_nosso_numero', 'SYNTHETIC'));
  v_result := internal_academic.receivable_cycle_presentation(v_noncycle);
  assert v_result->>'emissao_gerenciada_turma' = 'false'
    and v_result->>'emissao_ciclo_status' is null,
    'External/imported history outside a native cycle must keep its existing bank flow';

  -- A real UPDATE still runs BEFORE triggers even when the value is unchanged.
  -- Before the fix, this fails while preparing the helper expression (42501).
  execute 'set local role authenticated';
  assert current_user = 'authenticated', 'Ordinary update must not run as postgres';
  v_result := public.get_receivables_modality_page_v4_secure(
    'TECNICO', v_polo, v_class, null, null, null, 'pending', 'none', null, 1, 25);
  assert jsonb_array_length(v_result->'rows') = 13
    and not exists(select 1 from jsonb_array_elements(v_result->'rows') item
      where item->>'emissao_gerenciada_turma' is distinct from 'true'),
    'The authenticated financial page must expose native cycle ownership';
  assert exists(select 1 from jsonb_array_elements(v_result->'rows') item
    where item->>'id' = v_local.id::text and item->>'emissao_ciclo_status' = 'NAO_APLICAVEL'),
    'The authenticated financial page must identify the local fee';
  v_result := public.get_receivables_modality_groups_page_v3_secure(
    'TECNICO', v_polo, v_class, null, null, null, 'pending', 'student', 1, 10);
  assert jsonb_array_length(v_result->'groups') = 1
    and v_result#>>'{groups,0,first_row,emissao_gerenciada_turma}' = 'true',
    'The grouped financial page must expose the same native cycle ownership';
  update public.contas_receber set updated_at = updated_at where id = v_bank.id;
  get diagnostics v_count = row_count;
  assert v_count = 1, 'RLS must allow exactly the scoped synthetic receivable';
  v_result := public.authorize_technical_manual_receivable_issuance_secure(v_bank.id, v_auth_request);
  assert v_result->>'authorized' = 'true', 'The bank installment must be explicitly authorized';
  execute 'reset role';

  perform set_config('request.jwt.claims', jsonb_build_object(
    'role', 'service_role', 'sub', v_actor)::text, true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  execute 'set local role service_role';
  assert current_user = 'service_role', 'Bank claim must use the actual service_role database role';
  begin
    perform public.mark_technical_manual_cycle_banese_failure(
      v_bank.id, v_auth_request, v_token, false, false, 'TEST_BEFORE_CLAIM', 'Synthetic failure');
    raise exception 'Failure marking without a claim must be refused';
  exception when others then
    assert sqlstate = 'PT409', 'A permanent conflict must return PT409, never retryable 40001';
  end;
  update public.contas_receber set gateway_creation_token = v_token,
    gateway_provider = 'banese_card', gateway_environment = 'production',
    gateway_payment_method = 'BOLETO', forma_pagamento = 'BOLETO',
    gateway_issuer_polo_id = v_polo, gateway_installments = 1,
    gateway_status = 'CREATING', gateway_last_error = null, updated_at = clock_timestamp()
    where id = v_bank.id and gateway_creation_token is null;
  get diagnostics v_count = row_count;
  assert v_count = 1, 'The synthetic first bank claim must pass both invoker guards';
  execute 'reset role';
  assert (select claim_count = 1 and first_claimed_at is not null
    from internal_academic.technical_manual_receivable_issuance_authorizations
    where receivable_id = v_bank.id), 'The claim authorization must be consumed exactly once';
  assert not exists(select 1 from public.payment_gateway_transactions
    where receivable_id = v_bank.id), 'A local claim must not create an external bank transaction';

  execute 'set local role service_role';
  begin
    perform public.mark_technical_manual_cycle_banese_failure(
      v_bank.id, v_auth_request, gen_random_uuid(), false, false, 'TEST_WRONG_OWNER', 'Synthetic failure');
    raise exception 'Failure marking by a different attempt must be refused';
  exception when others then
    assert sqlstate = 'PT409', 'Stale ownership must return one conflict without changing the title';
  end;
  v_result := public.mark_technical_manual_cycle_banese_failure(
    v_bank.id, v_auth_request, v_token, false, false, 'TEST_OWNED_FAILURE', 'Synthetic failure');
  assert v_result->>'state' = 'PENDENTE_RETOMADA', 'Owned pre-bank failure must remain recoverable';
  execute 'reset role';
  assert (select gateway_creation_token is null and gateway_status is null
    from public.contas_receber where id=v_bank.id), 'Owned pre-bank failure must release only its claim';

  -- Create only a synthetic local settlement and finish it through the real RPC.
  v_snapshot := jsonb_build_object('status', v_local.status, 'valor_cents', 12550,
    'polo_id', v_polo, 'gateway_provider', null, 'gateway_environment', null,
    'gateway_payment_method', null, 'gateway_payment_id', null, 'gateway_payment_link_id', null,
    'gateway_boleto_nosso_numero', null, 'gateway_status', null, 'asaas_payment_id', null,
    'asaas_payment_link_id', null, 'asaas_status', null, 'manual_settlement_context', 'STANDARD');
  insert into public.receivable_manual_settlements(idempotency_key, request_fingerprint,
    receivable_id, actor_id, polo_id, account_id, payment_date, payment_method,
    principal_cents, interest_cents, penalty_cents, discount_cents, received_cents,
    receivable_snapshot, state, lease_token, lease_expires_at)
  values(gen_random_uuid(), repeat('a',64), v_local.id, v_actor_system, v_polo, v_account,
    current_date, 'DINHEIRO', 12550, 0, 0, 0, 12550, v_snapshot,
    'REMOTE_CANCELED_LOCAL_PENDING', v_lease, clock_timestamp() + interval '3 minutes')
  returning id into v_settlement;
  execute 'set local role service_role';
  v_result := public.finalize_receivable_manual_settlement(v_settlement, v_lease);
  assert v_result->>'success' = 'true', 'Synthetic cash settlement must succeed';
  begin
    update public.contas_receber set status = 'PENDENTE', conta_bancaria_id = null,
      valor_pago = null, data_pagamento = null, forma_pagamento = null,
      origem_pagamento = 'LOCAL', manual_settlement_reversed_at = clock_timestamp()
      where id = v_local.id;
    raise exception 'Service role reopened a local fee without the audited RPC';
  exception when insufficient_privilege then
    get stacked diagnostics v_message = message_text;
    assert v_message like '%exige a operação auditada%',
      'Reversal must fail at the private audit guard, not at missing EXECUTE';
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', jsonb_build_object(
    'role', 'authenticated', 'sub', v_actor)::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  begin
    update public.contas_receber set status = 'PENDENTE', conta_bancaria_id = null,
      valor_pago = null, data_pagamento = null, forma_pagamento = null,
      origem_pagamento = 'LOCAL', manual_settlement_reversed_at = clock_timestamp()
      where id = v_local.id;
    raise exception 'Authenticated role reopened a local fee without the audited RPC';
  exception when insufficient_privilege then
    get stacked diagnostics v_message = message_text;
    assert v_message like '%exige a operação auditada%',
      'Authenticated reversal must retain the audited transition guard';
  end;
  v_result := public.estornar_matricula_local_sem_boleto_secure(
    v_local.id, v_settlement, 'Regressão sintética de papéis PostgreSQL');
  assert v_result->>'success' = 'true' and v_result->>'replayed' = 'false'
    and v_result->>'gatewayRecreated' = 'false', 'Authenticated audited local reversal must succeed';
  v_result := public.estornar_matricula_local_sem_boleto_secure(
    v_local.id, v_settlement, 'Regressão sintética de papéis PostgreSQL');
  assert v_result->>'replayed' = 'true', 'Audited reversal replay must remain idempotent';
  execute 'reset role';

  select * into strict v_local from public.contas_receber where id = v_local.id;
  assert v_local.status = 'PENDENTE'
    and internal_academic.manual_cycle_local_receivable_complete(v_local)
    and not internal_academic.manual_cycle_has_bank_fields(v_local),
    'Reversal must preserve local intent and complete audit evidence';
  assert (select count(*) = 1 from public.receivable_manual_settlement_events
    where settlement_id = v_settlement and event_type = 'LOCAL_SETTLEMENT_REVERSED'),
    'Reversal and replay must produce exactly one event';
  assert not exists(select 1 from public.payment_gateway_transactions t
    join public.contas_receber r on r.id = t.receivable_id where r.matricula_id = v_enrollment),
    'This regression test must not issue any bank title';
  raise notice 'PASS: actual authenticated UPDATE, service_role bank claim, denied direct reversals, audited reversal/replay';
end;
$test$;

rollback;
