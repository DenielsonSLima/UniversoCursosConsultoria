-- Fixture transacional: nenhuma chamada HTTP/worker e rollback obrigatório.
begin;
set local statement_timeout = '60s';
set local lock_timeout = '3s';
set local plpgsql.check_asserts = 'on';
select set_config('request.jwt.claim.role', 'service_role', true);

do $test$
declare
  v_matricula uuid;
  v_turma uuid;
  v_cutoff date := (timezone('America/Maceio', now()))::date;
  v_canonical uuid := gen_random_uuid();
  v_unattempted uuid := gen_random_uuid();
  v_partial uuid := gen_random_uuid();
  v_local uuid := gen_random_uuid();
  v_review uuid := gen_random_uuid();
  v_proesc uuid := gen_random_uuid();
  v_proesc_local uuid := gen_random_uuid();
  v_through_cutoff uuid := gen_random_uuid();
  v_canceled uuid := gen_random_uuid();
  v_actor uuid;
  v_movement uuid;
  v_job uuid;
  v_lease uuid;
  v_nn text := lpad(floor(random() * 1000000000)::bigint::text, 9, '0');
  v_nn_partial text := lpad(((v_nn::bigint + 1) % 1000000000)::text, 9, '0');
  v_nn_proesc text := lpad(((v_nn::bigint + 2) % 1000000000)::text, 9, '0');
  v_nn_review text := lpad(((v_nn::bigint + 3) % 1000000000)::text, 9, '0');
  v_nn_unattempted text := lpad(((v_nn::bigint + 4) % 1000000000)::text, 9, '0');
  v_source text := txid_current()::text
    || floor(random() * 1000000000)::bigint::text;
  v_source_local text := v_source || '1';
  v_baseline jsonb;
  v_projection jsonb;
begin
  select m.id, m.turma_id into strict v_matricula, v_turma
  from public.matriculas m
  join public.turmas t on t.id = m.turma_id
  join public.cursos c on c.id = t.curso_id
  where m.status = 'ATIVO'
    and upper(c.modalidade) in ('TECNICO', 'TÉCNICO')
    and m.data_matricula::date <= v_cutoff
    and not exists (select 1 from internal_proesc.class_scopes scope
      where scope.turma_id = m.turma_id)
    and not exists (
      select 1 from internal_academic.technical_manual_cycle_policies policy
      where policy.turma_id = m.turma_id and policy.active
    )
  order by m.id
  limit 1;

  select id into strict v_actor
  from public.usuarios_sistema order by id limit 1;

  select public.preview_trancamento_financeiro(v_matricula, v_cutoff)
    into v_baseline;

  insert into public.contas_receber (
    id, descricao, valor, data_vencimento, valor_pago, status,
    matricula_id, turma_id, forma_pagamento, gateway_provider,
    gateway_environment, gateway_payment_method, gateway_payment_id,
    gateway_status, gateway_boleto_nosso_numero,
    gateway_boleto_convenio, gateway_submission_channel,
    gateway_submission_status
  ) values
    (v_canonical, 'rollback canonical', 100, v_cutoff + 30, 0,
      'PENDENTE', v_matricula, v_turma, 'BOLETO', 'banese_card',
      'production', 'BOLETO', v_nn, 'PENDING', v_nn, '123456',
      'API', 'API_REGISTERED'),
    (v_unattempted, 'rollback unattempted', 100, v_cutoff + 30, 0,
      'PENDENTE', v_matricula, v_turma, 'BOLETO', 'banese_card',
      'production', 'BOLETO', v_nn_unattempted, 'PENDING',
      v_nn_unattempted, '123456', 'API', 'API_REGISTERED'),
    (v_partial, 'rollback partial', 100, v_cutoff + 30, 10,
      'PENDENTE', v_matricula, v_turma, 'BOLETO', 'banese_card',
      'production', 'BOLETO', v_nn_partial, 'CANCELED',
      v_nn_partial, '123456', 'API', 'API_REGISTERED'),
    (v_local, 'rollback local', 100, v_cutoff + 30, 0,
      'PENDENTE', v_matricula, v_turma, 'BOLETO', null,
      null, null, null, null, null, null, null, null),
    (v_review, 'rollback review', 100, v_cutoff + 30, 0,
      'PENDENTE', v_matricula, v_turma, 'BOLETO', 'banese_card',
      'production', 'BOLETO', v_nn_review, 'PENDING', v_nn_review,
      '123456', 'API', 'API_REGISTERED'),
    (v_proesc, 'rollback proesc', 100, v_cutoff + 30, 0,
      'PENDENTE', v_matricula, v_turma, 'BOLETO', 'banese_card',
      'production', 'BOLETO', v_nn_proesc, 'PENDING', v_nn_proesc,
      '123456', 'API', 'API_REGISTERED'),
    (v_proesc_local, 'rollback proesc local-shaped', 100, v_cutoff + 30, 0,
      'SUSPENSO', v_matricula, v_turma, 'BOLETO', null,
      null, null, null, null, null, null, null, null),
    (v_through_cutoff, 'rollback cutoff', 100, v_cutoff, 0,
      'PENDENTE', v_matricula, v_turma, 'BOLETO', null,
      null, null, null, null, null, null, null, null),
    (v_canceled, 'rollback canceled', 100, v_cutoff + 30, 0,
      'CANCELADO', v_matricula, v_turma, 'BOLETO', 'banese_card',
      'production', 'BOLETO', 'canceled-fixture', 'CANCELED',
      '333333333', '123456', 'API', 'API_REGISTERED');

  insert into public.payment_gateway_transactions (
    receivable_id, provider_code, environment, payment_method,
    remote_payment_id, remote_status, amount, bank_slip_our_number
  ) values
    (v_canonical, 'banese_card', 'production', 'BOLETO',
      v_nn, 'PENDING', 100, v_nn),
    (v_unattempted, 'banese_card', 'production', 'BOLETO',
      v_nn_unattempted, 'PENDING', 100, v_nn_unattempted),
    (v_partial, 'banese_card', 'production', 'BOLETO',
      v_nn_partial, 'CANCELED', 100, v_nn_partial),
    (v_proesc, 'banese_card', 'production', 'BOLETO',
      v_nn_proesc, 'PENDING', 100, v_nn_proesc);

  insert into internal_proesc.obligation_links (
    matricula_id, turma_id, receivable_id, source_unit_id,
    source_class_id, source_key, kind, confirmed_by
  ) values
    (v_matricula, v_turma, v_proesc, v_source,
      v_source, v_source, 'ORIGINAL', v_actor),
    (v_matricula, v_turma, v_proesc_local, v_source_local,
      v_source_local, v_source_local, 'ORIGINAL', v_actor);

  select public.preview_trancamento_financeiro(v_matricula, v_cutoff)
    into v_projection;
  assert (v_projection->>'paidPreserved')::integer
      = (v_baseline->>'paidPreserved')::integer + 1,
    'One synthetic partial payment must be preserved';
  assert (v_projection->>'throughCutoffPreserved')::integer
      = (v_baseline->>'throughCutoffPreserved')::integer + 1,
    'One synthetic cutoff title must be preserved';
  assert (v_projection->>'futureProescPreserved')::integer
      = (v_baseline->>'futureProescPreserved')::integer + 2,
    'Proesc future history must be projected as preserved';
  assert (v_projection->>'futureLocalSuspended')::integer
      = (v_baseline->>'futureLocalSuspended')::integer + 1,
    'Proesc history must not be classified as local';
  assert (v_projection->>'futureBaneseToCancel')::integer
      = (v_baseline->>'futureBaneseToCancel')::integer + 2,
    'Only synthetic non-Proesc canonical titles may enter cancellation';
  assert (v_projection->>'futureBaneseReview')::integer
      = (v_baseline->>'futureBaneseReview')::integer + 1,
    'One synthetic incomplete Banese identity must require review';

  begin
    perform internal_academic.p1_movimentar_matricula_academica_20260719(
      v_matricula, 'TRANCAMENTO', 'rollback trancamento', null,
      v_cutoff, null, null
    );
    select mm.id into strict v_movement
    from public.matricula_movimentacoes mm
    where mm.matricula_id = v_matricula
      and mm.tipo = 'TRANCAMENTO'
      and mm.motivo = 'rollback trancamento';

    assert (select status = 'PENDENTE' from public.contas_receber
      where id = v_canonical),
      'Banese title must stay open until remote confirmation';
    assert exists(select 1 from public.banese_cancellation_outbox j
      where j.receivable_id = v_canonical
        and j.reason = 'TRANCAMENTO_FUTURO'
        and j.movement_id = v_movement
        and j.state = 'PENDING'), 'Canonical title must enter durable outbox';
    assert exists(select 1 from public.banese_cancellation_outbox j
      where j.receivable_id = v_unattempted
        and j.reason = 'TRANCAMENTO_FUTURO'
        and j.movement_id = v_movement
        and j.state = 'PENDING'),
      'Second canonical title must remain available for replay';
    assert (select status = 'PENDENTE' from public.contas_receber
      where id = v_partial), 'Partial payment must be preserved';
    assert (select status = 'SUSPENSO' from public.contas_receber
      where id = v_local), 'Future local title must suspend';
    assert (select status = 'PENDENTE' from public.contas_receber
      where id = v_proesc), 'Proesc-linked history must remain untouched';
    assert (select status = 'SUSPENSO' from public.contas_receber
      where id = v_proesc_local),
      'Local-shaped Proesc history must remain untouched';
    assert not exists(select 1 from public.banese_cancellation_outbox j
      where j.receivable_id in (v_proesc, v_proesc_local)),
      'Proesc-linked history must not enter the Banese outbox';
    update public.banese_cancellation_outbox
      set next_attempt_at = '2000-01-01 00:00:00+00'::timestamptz
      where receivable_id = v_canonical;
    select job_id, lease_token into strict v_job, v_lease
    from public.claim_banese_cancellation_batch(1)
    where receivable_id = v_canonical;
    perform public.start_banese_cancellation_remote_attempt(v_job, v_lease);
    perform public.complete_banese_cancellation_job(
      v_job, v_lease, 'CANCELED', false
    );
    assert (select status = 'CANCELADO' from public.contas_receber
      where id = v_canonical),
      'Remote-confirmed title must complete locally';
    assert (select remote_status = 'CANCELED'
      from public.payment_gateway_transactions
      where receivable_id = v_canonical),
      'Canonical transaction must complete as canceled';
    assert exists(select 1 from public.banese_cancellation_outbox j
      where j.id = v_job and j.state = 'DONE'
        and j.remote_status = 'CANCELED'),
      'Claim-start-complete must terminate the durable job';
    assert (select status = 'PENDENTE' from public.contas_receber
      where id = v_through_cutoff), 'Cutoff title must be preserved';
    select internal_academic.receivable_trancamento_cancellation(c)
      into v_projection from public.contas_receber c where c.id = v_review;
    assert v_projection->>'state' = 'REVIEW_REQUIRED',
      'Non-canonical Banese title must stay visibly under review';

    raise exception 'ROLLBACK_COMPLETION' using errcode = 'ZX001';
  exception when sqlstate 'ZX001' then null;
  end;

  begin
    -- `created_at` da auditoria técnica é imutável e `now()` é estável na
    -- transação. Semeia-se um evento histórico novo; o RPC real registra a
    -- reativação posterior sem reescrever qualquer evento de auditoria.
    perform internal_academic.authorize_enrollment_status(
      v_matricula, 'TRANCADO'
    );
    update public.matriculas set status = 'TRANCADO' where id = v_matricula;
    insert into public.matricula_movimentacoes (
      matricula_id, aluno_id, tipo, status_anterior, status_novo,
      turma_origem_id, motivo, data_movimentacao, responsavel_id, created_at
    )
    select id, aluno_id, 'TRANCAMENTO', 'ATIVO', 'TRANCADO', turma_id,
      'rollback reativacao base', v_cutoff, v_actor,
      clock_timestamp() - interval '1 day'
    from public.matriculas where id = v_matricula
    returning id into v_movement;
    update public.banese_cancellation_outbox
      set next_attempt_at = '2000-01-01 00:00:00+00'::timestamptz
      where receivable_id = v_canonical;
    select job_id, lease_token into strict v_job, v_lease
    from public.claim_banese_cancellation_batch(1)
    where receivable_id = v_canonical;
    perform public.start_banese_cancellation_remote_attempt(v_job, v_lease);
    perform public.complete_banese_cancellation_job(
      v_job, v_lease, 'CANCELED', false
    );
    perform internal_academic.p1_movimentar_matricula_academica_20260719(
      v_matricula, 'REATIVACAO', 'rollback reativacao', null,
      v_cutoff, null, null
    );
    assert (select status = 'PENDENTE' from public.contas_receber
      where id = v_unattempted), 'Unattempted title must remain pending';
    assert exists(select 1 from public.banese_cancellation_outbox j
      where j.receivable_id = v_unattempted and j.state = 'DONE'
        and j.remote_status = 'SKIPPED_REACTIVATED'),
      'Reactivation must close the unattempted job without bank mutation';
    assert (select status = 'CANCELADO' from public.contas_receber
      where id = v_canceled), 'Reactivation must never revive canceled title';
    assert (select status = 'CANCELADO' from public.contas_receber
      where id = v_canonical),
      'Reactivation must not revive the remotely confirmed title';
    assert (select status = 'SUSPENSO' from public.contas_receber
      where id = v_proesc_local),
      'Reactivation must not mutate linked Proesc history';
    raise exception 'ROLLBACK_REACTIVATION' using errcode = 'ZX002';
  exception when sqlstate 'ZX002' then null;
  end;

  begin
    perform internal_academic.authorize_enrollment_status(
      v_matricula, 'TRANCADO'
    );
    update public.matriculas set status = 'TRANCADO' where id = v_matricula;
    insert into public.matricula_movimentacoes (
      matricula_id, aluno_id, tipo, status_anterior, status_novo,
      turma_origem_id, motivo, data_movimentacao, responsavel_id, created_at
    )
    select id, aluno_id, 'TRANCAMENTO', 'ATIVO', 'TRANCADO', turma_id,
      'rollback terminal base', v_cutoff, v_actor,
      clock_timestamp() - interval '1 day'
    from public.matriculas where id = v_matricula
    returning id into v_movement;
    perform internal_academic.p1_movimentar_matricula_academica_20260719(
      v_matricula, 'CANCELAMENTO', 'rollback terminal posterior', null,
      v_cutoff, null, null
    );
    assert (select status = 'CANCELADO' from public.matriculas
      where id = v_matricula), 'Terminal movement must not be blocked';
    assert exists(select 1 from public.banese_cancellation_outbox j
      where j.receivable_id = v_canonical
        and j.reason = 'TRANCAMENTO_FUTURO'
        and j.movement_id = v_movement),
      'Terminal movement must preserve original trancamento cutoff';
    assert not exists(select 1 from public.banese_cancellation_outbox j
      where j.receivable_id = v_partial),
      'Terminal movement must not bypass partial-payment preservation';
    assert (select status = 'PENDENTE' from public.contas_receber
      where id = v_partial), 'Partial title must remain open for review';
    assert (select status = 'SUSPENSO' from public.contas_receber
      where id = v_proesc_local),
      'Terminal movement must preserve local-shaped Proesc history';
    assert (select status = 'PENDENTE' from public.contas_receber
      where id = v_proesc),
      'Terminal movement must preserve linked Banese history';
    assert not exists(select 1 from public.banese_cancellation_outbox j
      where j.receivable_id in (v_proesc, v_proesc_local)),
      'Terminal movement must not enqueue Proesc-linked history';
    select internal_academic.receivable_trancamento_cancellation(c)
      into v_projection from public.contas_receber c where c.id = v_review;
    assert v_projection->>'state' = 'REVIEW_REQUIRED',
      'Review projection must survive a direct terminal movement';
    raise exception 'ROLLBACK_TERMINAL' using errcode = 'ZX003';
  exception when sqlstate 'ZX003' then null;
  end;
end;
$test$;

rollback;
