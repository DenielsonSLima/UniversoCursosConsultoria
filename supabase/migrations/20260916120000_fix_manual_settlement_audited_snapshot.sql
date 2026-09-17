begin;

-- Preserva o contrato idempotente e todas as guardas da RPC original.
-- Tentativas antigas sem contexto continuam válidas. Não libera revisões
-- existentes: cada tentativa retida ainda exige conciliação específica.
create or replace function public.finalize_receivable_manual_settlement(
  p_settlement_id uuid,
  p_lease_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settlement public.receivable_manual_settlements%rowtype;
  v_receivable public.contas_receber%rowtype;
  v_account public.contas_bancarias%rowtype;
  v_transaction_id uuid;
  v_transaction_remote_status text;
  v_current_snapshot jsonb;
  v_result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Operação restrita ao servidor financeiro.';
  end if;

  select * into v_settlement
  from public.receivable_manual_settlements
  where id = p_settlement_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Tentativa de baixa manual não encontrada.';
  end if;

  if v_settlement.state = 'COMPLETED' then
    return v_settlement.result || jsonb_build_object('replayed', true);
  end if;

  if v_settlement.state <> 'REMOTE_CANCELED_LOCAL_PENDING'
     or v_settlement.lease_token is distinct from p_lease_token then
    raise exception using errcode = '55000', message = 'Tentativa de baixa manual não está pronta para conclusão.';
  end if;

  if v_settlement.lease_expires_at is null
     or v_settlement.lease_expires_at <= clock_timestamp() then
    raise exception using errcode = '55000', message = 'A posse da baixa manual expirou antes da conclusão.';
  end if;

  if v_settlement.requires_remote_cancellation
     and v_settlement.remote_canceled_at is null then
    raise exception using errcode = '55000', message = 'Cancelamento remoto ainda não foi confirmado.';
  end if;

  select * into v_receivable
  from public.contas_receber
  where id = v_settlement.receivable_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Cobrança da baixa manual não encontrada.';
  end if;

  if upper(coalesce(v_receivable.status, '')) not in ('PENDENTE', 'VENCIDO') then
    raise exception using errcode = 'PT409', message = 'Cobrança mudou de status antes da baixa manual.';
  end if;

  if upper(coalesce(v_receivable.asaas_status, '')) in ('RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH')
     or upper(coalesce(v_receivable.gateway_status, '')) in ('PAID', 'PAGO', 'RECEIVED', 'CONFIRMED', 'LIQUIDATED') then
    raise exception using errcode = '55000', message = 'Título bancário já consta como pago e não pode receber baixa manual.';
  end if;

  v_current_snapshot := jsonb_build_object(
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

  -- Contexto descreve a origem da ação e permanece na auditoria. Ele não é
  -- campo mutável de contas_receber nem pode invalidar o CAS financeiro.
  -- Somente esse metadado conhecido é excluído; outras divergências falham.
  if v_settlement.receivable_snapshot ? 'manual_settlement_context'
     and (
       jsonb_typeof(v_settlement.receivable_snapshot -> 'manual_settlement_context')
         is distinct from 'string'
       or v_settlement.receivable_snapshot ->> 'manual_settlement_context'
         not in ('STANDARD', 'DASHBOARD_EXISTING_TITLE_ONLY')
     ) then
    raise exception using errcode = '22023', message = 'Contexto inválido na auditoria da baixa manual.';
  end if;

  if v_current_snapshot is distinct from
     (v_settlement.receivable_snapshot - 'manual_settlement_context') then
    raise exception using errcode = 'PT409', message = 'Identidade ou status da cobrança mudou durante a baixa manual.';
  end if;

  if v_settlement.polo_id is distinct from v_receivable.polo_id then
    raise exception using errcode = 'PT409', message = 'O polo da cobrança mudou durante a baixa manual.';
  end if;

  select * into v_account
  from public.contas_bancarias
  where id = v_settlement.account_id
  for update;

  if not found
     or v_account.ativo is distinct from true
     or (
       v_receivable.polo_id is not null
       and v_account.polo_id is not null
       and v_account.polo_id is distinct from v_receivable.polo_id
     ) then
    raise exception using
      errcode = '55000',
      message = 'Conta bancária ou caixa ficou indisponível para esta cobrança.';
  end if;

  if v_settlement.requires_remote_cancellation then
    if coalesce(v_settlement.provider_code, '') not in ('asaas', 'banese_card')
       or coalesce(v_settlement.environment, '') not in ('sandbox', 'production') then
      raise exception using
        errcode = '55000',
        message = 'Provedor ou ambiente bancário inválido para concluir a baixa manual.';
    end if;

    if v_settlement.provider_code = 'asaas'
       and v_settlement.remote_payment_id is null
       and v_settlement.remote_payment_link_id is null then
      raise exception using
        errcode = '55000',
        message = 'Identidade remota Asaas ausente na baixa manual.';
    end if;

    if v_settlement.provider_code = 'banese_card'
       and (
         v_settlement.remote_payment_id is null
         or v_settlement.remote_payment_id !~ '^[0-9]{9}$'
         or v_settlement.remote_payment_link_id is not null
       ) then
      raise exception using
        errcode = '55000',
        message = 'Nosso Número Banese inválido na baixa manual.';
    end if;

    begin
      select tx.id, tx.remote_status
      into strict v_transaction_id, v_transaction_remote_status
      from public.payment_gateway_transactions tx
      where tx.receivable_id = v_settlement.receivable_id
        and tx.provider_code = v_settlement.provider_code
        and tx.environment = v_settlement.environment
        and (
          (
            v_settlement.provider_code = 'asaas'
            and (
              v_settlement.remote_payment_id is not null
              or v_settlement.remote_payment_link_id is not null
            )
            and (
              v_settlement.remote_payment_id is null
              or tx.remote_payment_id = v_settlement.remote_payment_id
            )
            and (
              v_settlement.remote_payment_link_id is null
              or tx.remote_payment_link_id = v_settlement.remote_payment_link_id
            )
          )
          or (
            v_settlement.provider_code = 'banese_card'
            and tx.payment_method = 'BOLETO'
            and (
              tx.remote_payment_id = v_settlement.remote_payment_id
              or tx.bank_slip_our_number = v_settlement.remote_payment_id
            )
          )
        )
      for update;
    exception
      when no_data_found then
        raise exception using
          errcode = 'P0002',
          message = 'Transação bancária canônica não encontrada; a baixa local não foi registrada.';
      when too_many_rows then
        raise exception using
          errcode = '21000',
          message = 'Mais de uma transação bancária corresponde ao título; a baixa local foi bloqueada.';
    end;

    if upper(coalesce(v_transaction_remote_status, '')) in (
      'PAID',
      'PAGO',
      'RECEIVED',
      'CONFIRMED',
      'RECEIVED_IN_CASH',
      'LIQUIDATED',
      'REFUND_REQUESTED',
      'REFUNDED',
      'CHARGEBACK_REQUESTED',
      'CHARGEBACK_DISPUTE',
      'AWAITING_CHARGEBACK_REVERSAL'
    ) then
      raise exception using
        errcode = '55000',
        message = 'A transação bancária canônica já possui movimentação financeira e não pode receber baixa manual.';
    end if;

    update public.payment_gateway_transactions
    set remote_status = case
          when v_settlement.provider_code = 'asaas' then 'DELETED'
          else 'CANCELED'
        end,
        last_error = null,
        synced_at = now(),
        updated_at = now()
    where id = v_transaction_id;
  end if;

  update public.contas_receber
  set status = 'PAGO',
      conta_bancaria_id = v_settlement.account_id,
      valor_pago = v_settlement.received_cents::numeric / 100,
      data_pagamento = v_settlement.payment_date,
      forma_pagamento = v_settlement.payment_method,
      origem_pagamento = 'PRESENCIAL',
      manual_settlement_id = v_settlement.id,
      manual_settlement_principal_cents = v_settlement.principal_cents,
      manual_settlement_interest_cents = v_settlement.interest_cents,
      manual_settlement_penalty_cents = v_settlement.penalty_cents,
      manual_settlement_addition_cents = v_settlement.addition_cents,
      manual_settlement_discount_cents = v_settlement.discount_cents,
      manual_settlement_received_cents = v_settlement.received_cents,
      manual_settlement_reversed_at = null,
      asaas_status = case
        when v_settlement.provider_code = 'asaas'
             and v_settlement.requires_remote_cancellation then 'DELETED'
        else asaas_status
      end,
      asaas_payment_link_id = case
        when v_settlement.provider_code = 'asaas'
             and v_settlement.requires_remote_cancellation then null
        else asaas_payment_link_id
      end,
      asaas_invoice_url = case
        when v_settlement.provider_code = 'asaas'
             and v_settlement.requires_remote_cancellation then null
        else asaas_invoice_url
      end,
      asaas_bank_slip_url = case
        when v_settlement.provider_code = 'asaas'
             and v_settlement.requires_remote_cancellation then null
        else asaas_bank_slip_url
      end,
      asaas_transaction_receipt_url = case
        when v_settlement.provider_code = 'asaas'
             and v_settlement.requires_remote_cancellation then null
        else asaas_transaction_receipt_url
      end,
      gateway_status = case
        when v_settlement.provider_code = 'asaas'
             and v_settlement.requires_remote_cancellation then 'DELETED'
        when v_settlement.provider_code = 'banese_card'
             and v_settlement.requires_remote_cancellation then 'CANCELED'
        else gateway_status
      end,
      gateway_invoice_url = case
        when v_settlement.provider_code = 'asaas'
             and v_settlement.requires_remote_cancellation then null
        else gateway_invoice_url
      end,
      gateway_bank_slip_url = case
        when v_settlement.provider_code = 'asaas'
             and v_settlement.requires_remote_cancellation then null
        else gateway_bank_slip_url
      end,
      gateway_pix_payload = case
        when v_settlement.provider_code = 'asaas'
             and v_settlement.requires_remote_cancellation then null
        else gateway_pix_payload
      end,
      gateway_pix_encoded_image = case
        when v_settlement.provider_code = 'asaas'
             and v_settlement.requires_remote_cancellation then null
        else gateway_pix_encoded_image
      end,
      gateway_transaction_receipt_url = case
        when v_settlement.provider_code = 'asaas'
             and v_settlement.requires_remote_cancellation then null
        else gateway_transaction_receipt_url
      end,
      gateway_synced_at = case
        when v_settlement.requires_remote_cancellation then now()
        else gateway_synced_at
      end,
      gateway_last_error = case
        when v_settlement.requires_remote_cancellation then null
        else gateway_last_error
      end,
      updated_at = now()
  where id = v_settlement.receivable_id;

  v_result := jsonb_build_object(
    'success', true,
    'settlementId', v_settlement.id,
    'replayed', false,
    'asaasCanceled', v_settlement.requires_remote_cancellation
      and v_settlement.provider_code = 'asaas'
      and v_settlement.remote_payment_id is not null,
    'asaasPaymentLinkCanceled', v_settlement.requires_remote_cancellation
      and v_settlement.provider_code = 'asaas'
      and v_settlement.remote_payment_link_id is not null,
    'asaasPaymentId', case when v_settlement.provider_code = 'asaas'
      then v_settlement.remote_payment_id else null end,
    'baneseCanceled', v_settlement.provider_code = 'banese_card'
      and v_settlement.requires_remote_cancellation,
    'gatewayCanceled', v_settlement.requires_remote_cancellation,
    'gatewayProvider', v_settlement.provider_code,
    'gatewayPaymentId', coalesce(
      v_settlement.remote_payment_id,
      v_settlement.remote_payment_link_id
    ),
    'futureSyncWarning', null,
    'breakdown', jsonb_build_object(
      'currency', 'BRL',
      'principalCents', v_settlement.principal_cents,
      'interestCents', v_settlement.interest_cents,
      'penaltyCents', v_settlement.penalty_cents,
      'additionCents', v_settlement.addition_cents,
      'discountCents', v_settlement.discount_cents,
      'receivedCents', v_settlement.received_cents
    )
  );

  update public.receivable_manual_settlements
  set state = 'COMPLETED',
      completed_at = now(),
      lease_token = null,
      lease_expires_at = null,
      last_error = null,
      result = v_result
  where id = v_settlement.id;

  insert into public.receivable_manual_settlement_events (
    settlement_id,
    actor_id,
    event_type,
    details
  ) values (
    v_settlement.id,
    v_settlement.actor_id,
    'LOCAL_SETTLEMENT_COMPLETED',
    jsonb_build_object(
      'receivableId', v_settlement.receivable_id,
      'receivedCents', v_settlement.received_cents,
      'currency', 'BRL'
    )
  );

  return v_result;
end;
$$;

revoke all on function public.finalize_receivable_manual_settlement(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.finalize_receivable_manual_settlement(uuid, uuid)
  to service_role;

commit;
