-- Roteiro administrativo, exclusivamente via MCP Supabase após revisão explícita.
-- Não é RPC pública, não chama banco nem registra recebimento.
-- Defina os parâmetros abaixo na mesma transação e substitua o ROLLBACK final
-- por COMMIT apenas para o caso autorizado e depois de revisar o resultado.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '15s';
-- select set_config('app.review.settlement_id', '<uuid>', true);
-- select set_config('app.review.expected_updated_at', '<timestamp ISO>', true);
-- select set_config('app.review.expected_fingerprint', '<sha256>', true);
-- select set_config('app.review.reviewer_id', '<uuid do gestor revisor>', true);
-- select set_config('app.review.reason', '<motivo sem dados pessoais>', true);

do $$
declare
  v_attempt public.receivable_manual_settlements%rowtype;
  v_receivable public.contas_receber%rowtype;
  v_transaction public.payment_gateway_transactions%rowtype;
  v_snapshot jsonb;
  v_reviewer uuid := current_setting('app.review.reviewer_id')::uuid;
  v_reason text := btrim(current_setting('app.review.reason'));
  v_now timestamptz := clock_timestamp();
begin
  if length(v_reason) < 10 or length(v_reason) > 500 then
    raise exception 'Informe o motivo revisado em 10 a 500 caracteres.';
  end if;
  select * into strict v_attempt from public.receivable_manual_settlements
  where id = current_setting('app.review.settlement_id')::uuid for update;
  if v_attempt.state <> 'REVIEW_REQUIRED'
     or v_attempt.updated_at is distinct from current_setting('app.review.expected_updated_at')::timestamptz
     or v_attempt.request_fingerprint is distinct from current_setting('app.review.expected_fingerprint')
     or v_attempt.completed_at is not null or v_attempt.reversed_at is not null
     or v_attempt.lease_token is not null or v_attempt.lease_expires_at is not null
     or not v_attempt.requires_remote_cancellation or v_attempt.remote_canceled_at is null
     or v_attempt.provider_code is distinct from 'banese_card'
     or coalesce(v_attempt.environment, '') not in ('sandbox', 'production')
     or coalesce(v_attempt.remote_payment_id, '') !~ '^[0-9]{9}$' then
    raise exception 'Tentativa mudou ou não é elegível para este roteiro de revisão Banese.';
  end if;
  select * into strict v_receivable from public.contas_receber
  where id = v_attempt.receivable_id for update;
  if coalesce(v_receivable.status, '') not in ('PENDENTE', 'VENCIDO')
     or coalesce(v_receivable.valor_pago, 0) <> 0
     or v_receivable.data_pagamento is not null
     or v_receivable.manual_settlement_id is not null
     or v_receivable.gateway_status is distinct from 'CANCELED'
     or v_receivable.gateway_provider is distinct from 'banese_card'
     or v_receivable.gateway_payment_method is distinct from 'BOLETO'
     or v_attempt.polo_id is distinct from v_receivable.polo_id
     or upper(coalesce(v_receivable.asaas_status, '')) in ('RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH')
     or exists (
       select 1 from public.receivable_manual_settlements s
       where s.receivable_id = v_receivable.id and s.id <> v_attempt.id
         and s.state in ('STARTED', 'REMOTE_CANCELED_LOCAL_PENDING', 'REVIEW_REQUIRED', 'COMPLETED')
     ) then
    raise exception 'Cobrança possui pagamento, outra tentativa ativa ou identidade incompatível.';
  end if;
  if v_attempt.receivable_snapshot ? 'manual_settlement_context' and (
    jsonb_typeof(v_attempt.receivable_snapshot -> 'manual_settlement_context') is distinct from 'string'
    or v_attempt.receivable_snapshot ->> 'manual_settlement_context'
      not in ('STANDARD', 'DASHBOARD_EXISTING_TITLE_ONLY')
  ) then
    raise exception 'Contexto de auditoria inválido.';
  end if;
  v_snapshot := jsonb_build_object(
    'status', v_receivable.status,
    'valor_cents', round(v_receivable.valor * 100)::bigint,
    'polo_id', v_receivable.polo_id,
    'gateway_provider', v_receivable.gateway_provider,
    'gateway_environment', v_receivable.gateway_environment,
    'gateway_payment_method', v_receivable.gateway_payment_method,
    'gateway_payment_id', v_receivable.gateway_payment_id,
    'gateway_payment_link_id', v_receivable.gateway_payment_link_id,
    'gateway_boleto_nosso_numero', v_receivable.gateway_boleto_nosso_numero,
    'gateway_status', v_receivable.gateway_status,
    'asaas_payment_id', v_receivable.asaas_payment_id,
    'asaas_payment_link_id', v_receivable.asaas_payment_link_id,
    'asaas_status', v_receivable.asaas_status
  );
  if v_snapshot is distinct from (v_attempt.receivable_snapshot - 'manual_settlement_context') then
    raise exception 'Snapshot financeiro mudou; não encerrar revisão por este roteiro.';
  end if;
  perform 1 from public.payment_gateway_transactions
  where receivable_id = v_receivable.id for update;
  if (select count(*) from public.payment_gateway_transactions
      where receivable_id = v_receivable.id) <> 1 then
    raise exception 'Revisão exige exatamente uma transação bancária para a cobrança.';
  end if;
  select * into strict v_transaction from public.payment_gateway_transactions tx
  where tx.receivable_id = v_receivable.id and tx.provider_code = 'banese_card'
    and tx.environment = v_attempt.environment and tx.payment_method = 'BOLETO'
    and (tx.remote_payment_id = v_attempt.remote_payment_id
      or tx.bank_slip_our_number = v_attempt.remote_payment_id)
  for update;
  if v_transaction.remote_status is distinct from 'CANCELED'
     or v_attempt.remote_payment_id is distinct from v_receivable.gateway_payment_id
     or v_attempt.remote_payment_id is distinct from v_receivable.gateway_boleto_nosso_numero
     or v_attempt.environment is distinct from v_receivable.gateway_environment
     or v_attempt.remote_payment_link_id is not null
     or not exists (
       select 1 from public.receivable_manual_settlement_events e
       where e.settlement_id = v_attempt.id and e.event_type = 'REMOTE_CANCELED'
         and e.details ->> 'providerCode' = v_attempt.provider_code
         and e.details ->> 'environment' = v_attempt.environment
         and e.details ->> 'remotePaymentId' = v_attempt.remote_payment_id
     ) then
    raise exception 'Cancelamento canônico não comprovado na transação e auditoria.';
  end if;
  -- Apenas a tentativa é encerrada. Conta, fingerprint, valores e título ficam
  -- intactos; nova tentativa fará novamente a prévia bancária pelo fluxo normal.
  update public.receivable_manual_settlements
  set state = 'CANCELED_AFTER_REVIEW',
      result = result || jsonb_build_object('reviewCancellation', jsonb_build_object(
        'reviewedAt', v_now, 'reviewerId', v_reviewer, 'reason', v_reason,
        'previousError', last_error, 'remoteRecheckRequired', true
      ))
  where id = v_attempt.id;
  insert into public.receivable_manual_settlement_events
    (settlement_id, actor_id, event_type, details)
  values (v_attempt.id, v_reviewer, 'REVIEW_CANCELED', jsonb_build_object(
    'reason', v_reason, 'previousState', v_attempt.state,
    'requestFingerprint', v_attempt.request_fingerprint,
    'originalAccountId', v_attempt.account_id,
    'remoteRecheckRequired', true
  ));
end;
$$;

select state, completed_at, reversed_at, result -> 'reviewCancellation' as review
from public.receivable_manual_settlements
where id = current_setting('app.review.settlement_id')::uuid;
rollback;
