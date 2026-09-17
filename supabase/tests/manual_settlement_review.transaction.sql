-- Executar via MCP em transação, usando somente tabelas temporárias clonadas.
-- Definir app.test.manual_settlement_id e app.test.correct_account_id abaixo.
-- Antes do DO de testes, inserir:
-- 1. função finalize da migration 20260916120000 com public. -> pg_temp.;
-- 2. bloco DO do roteiro operations/cancel-manual-settlement-after-review.sql
--    como função pg_temp.cancel_manual_settlement_review() returns void,
--    language plpgsql, também com public. -> pg_temp.
-- Não existe mutação de tabelas públicas nem chamada bancária neste teste.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '20s';
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

create temporary table receivable_manual_settlements
  (like public.receivable_manual_settlements including defaults including constraints including indexes);
create temporary table receivable_manual_settlement_events
  (like public.receivable_manual_settlement_events including defaults including constraints including indexes);
create temporary table contas_receber
  (like public.contas_receber including defaults including constraints including indexes);
create temporary table payment_gateway_transactions
  (like public.payment_gateway_transactions including defaults including constraints including indexes);
create temporary table contas_bancarias
  (like public.contas_bancarias including defaults including constraints including indexes);
create temporary table manual_review_smoke_results (scenario text, passed boolean);

insert into pg_temp.receivable_manual_settlements
select * from public.receivable_manual_settlements
where id = current_setting('app.test.manual_settlement_id')::uuid;
insert into pg_temp.contas_receber
select * from public.contas_receber where id = (
  select receivable_id from pg_temp.receivable_manual_settlements
);
insert into pg_temp.receivable_manual_settlement_events
select * from public.receivable_manual_settlement_events
where settlement_id = current_setting('app.test.manual_settlement_id')::uuid;
insert into pg_temp.payment_gateway_transactions
select * from public.payment_gateway_transactions
where receivable_id = (select id from pg_temp.contas_receber);
insert into pg_temp.contas_bancarias
select * from public.contas_bancarias
where id = current_setting('app.test.correct_account_id')::uuid
   or id = (select account_id from pg_temp.receivable_manual_settlements);

-- O clone omite somente a unicidade por recebível para exercitar a guarda
-- administrativa contra transações extras; o índice público nunca é alterado.
do $$
declare v_index regclass;
begin
  for v_index in
    select i.indexrelid::regclass from pg_index i
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
    where i.indrelid = 'pg_temp.payment_gateway_transactions'::regclass
      and i.indisunique and i.indnkeyatts = 1 and a.attname = 'receivable_id'
  loop
    execute format('drop index %s', v_index);
  end loop;
end;
$$;

-- Aplicar o corpo da migration 20260916120100 neste ponto com public. -> pg_temp.
-- INSERT_REVIEW_CONSTRAINTS_AND_FUNCTIONS_HERE

do $$
declare
  v_original pg_temp.receivable_manual_settlements%rowtype;
  v_after pg_temp.receivable_manual_settlements%rowtype;
  v_receivable pg_temp.contas_receber%rowtype;
  v_tx pg_temp.payment_gateway_transactions%rowtype;
  v_id uuid := gen_random_uuid();
  v_token uuid := gen_random_uuid();
  v_result jsonb;
  v_expected timestamptz;
begin
  select * into strict v_original from pg_temp.receivable_manual_settlements;
  select * into strict v_receivable from pg_temp.contas_receber;
  select * into strict v_tx from pg_temp.payment_gateway_transactions;
  perform set_config('app.review.settlement_id', v_original.id::text, true);
  perform set_config('app.review.expected_updated_at', v_original.updated_at::text, true);
  perform set_config('app.review.expected_fingerprint', v_original.request_fingerprint, true);
  perform set_config('app.review.reviewer_id', gen_random_uuid()::text, true);
  perform set_config('app.review.reason', 'Teste transacional de revisão após conflito de snapshot.', true);

  begin
    perform set_config('app.review.expected_fingerprint', repeat('0', 64), true);
    perform pg_temp.cancel_manual_settlement_review();
    raise exception using errcode = 'ZX099', message = 'Aceitou fingerprint alterado';
  exception when raise_exception then
    if sqlerrm not like 'Tentativa mudou%' then raise; end if;
    insert into manual_review_smoke_results values ('reject_changed_fingerprint', true);
  end;

  begin
    insert into pg_temp.payment_gateway_transactions
    select (jsonb_populate_record(null::pg_temp.payment_gateway_transactions,
      to_jsonb(v_tx) || jsonb_build_object('id', gen_random_uuid(),
        'remote_payment_id', '999999999', 'bank_slip_our_number', '999999999'))).*;
    perform pg_temp.cancel_manual_settlement_review();
    raise exception using errcode = 'ZX099', message = 'Aceitou segunda transação';
  exception when raise_exception then
    if sqlerrm not like 'Revisão exige exatamente uma%' then raise; end if;
    insert into manual_review_smoke_results values ('reject_second_transaction', true);
  end;

  begin
    update pg_temp.contas_receber set valor_pago = 260;
    perform pg_temp.cancel_manual_settlement_review();
    raise exception using errcode = 'ZX099', message = 'Aceitou pagamento anterior';
  exception when raise_exception then
    if sqlerrm not like 'Cobrança possui pagamento%' then raise; end if;
    insert into manual_review_smoke_results values ('reject_existing_payment', true);
  end;

  perform pg_temp.cancel_manual_settlement_review();
  select * into strict v_after from pg_temp.receivable_manual_settlements;
  if v_after.state <> 'CANCELED_AFTER_REVIEW'
     or (to_jsonb(v_after) - array['state', 'result', 'updated_at']) is distinct from
        (to_jsonb(v_original) - array['state', 'result', 'updated_at'])
     or (select to_jsonb(c) from pg_temp.contas_receber c) is distinct from to_jsonb(v_receivable)
     or not exists (select 1 from pg_temp.receivable_manual_settlement_events
                    where event_type = 'REVIEW_CANCELED' and settlement_id = v_original.id) then
    raise exception 'Encerramento alterou payload ou não preservou trilha de auditoria';
  end if;
  insert into manual_review_smoke_results values ('review_preserves_payload_account_and_unpaid_receivable', true);

  begin
    perform pg_temp.cancel_manual_settlement_review();
    raise exception using errcode = 'ZX099', message = 'Repetiu revisão encerrada';
  exception when raise_exception then
    if sqlerrm not like 'Tentativa mudou%' then raise; end if;
    insert into manual_review_smoke_results values ('reject_repeated_review', true);
  end;

  insert into pg_temp.receivable_manual_settlements
  select (jsonb_populate_record(null::pg_temp.receivable_manual_settlements,
    to_jsonb(v_original) || jsonb_build_object(
      'id', v_id, 'idempotency_key', gen_random_uuid(),
      'request_fingerprint', repeat('a', 64),
      'account_id', current_setting('app.test.correct_account_id')::uuid,
      'state', 'REMOTE_CANCELED_LOCAL_PENDING', 'lease_token', v_token,
      'lease_expires_at', clock_timestamp() + interval '2 minutes',
      'review_required_at', null, 'last_error', null, 'result', '{}'::jsonb
    ))).*;
  v_result := pg_temp.finalize_receivable_manual_settlement(v_id, v_token);
  if v_result ->> 'success' is distinct from 'true' or not exists (
    select 1 from pg_temp.contas_receber where status = 'PAGO'
      and manual_settlement_id = v_id
      and conta_bancaria_id = current_setting('app.test.correct_account_id')::uuid
      and valor_pago = v_original.received_cents::numeric / 100
      and manual_settlement_discount_cents = v_original.discount_cents
  ) then
    raise exception 'Nova baixa com conta corrigida não conferiu';
  end if;
  insert into manual_review_smoke_results values ('new_attempt_settles_correct_account', true);
end;
$$;
select * from manual_review_smoke_results order by scenario;
rollback;
