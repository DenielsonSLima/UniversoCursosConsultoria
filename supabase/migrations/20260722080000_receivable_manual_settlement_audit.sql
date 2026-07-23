begin;

create table if not exists public.receivable_manual_settlements (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  request_fingerprint text not null,
  receivable_id uuid not null references public.contas_receber(id) on delete restrict,
  actor_id uuid not null references public.usuarios_sistema(id) on delete restrict,
  polo_id uuid references public.polos(id) on delete restrict,
  account_id uuid not null references public.contas_bancarias(id) on delete restrict,
  payment_date date not null,
  payment_method text not null,
  principal_cents bigint not null,
  interest_cents bigint not null default 0,
  penalty_cents bigint not null default 0,
  addition_cents bigint not null default 0,
  discount_cents bigint not null default 0,
  received_cents bigint not null,
  provider_code text references public.payment_gateway_providers(code)
    on update restrict on delete restrict,
  environment text,
  remote_payment_id text,
  remote_payment_link_id text,
  requires_remote_cancellation boolean not null default false,
  remote_canceled_at timestamptz,
  receivable_snapshot jsonb not null default '{}'::jsonb,
  state text not null default 'STARTED',
  lease_token uuid,
  lease_expires_at timestamptz,
  review_required_at timestamptz,
  completed_at timestamptz,
  reversed_at timestamptz,
  last_error text,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint receivable_manual_settlements_fingerprint_check
    check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint receivable_manual_settlements_method_check
    check (payment_method in ('BOLETO', 'PIX', 'CARTAO', 'DINHEIRO')),
  constraint receivable_manual_settlements_environment_check
    check (environment is null or environment in ('sandbox', 'production')),
  constraint receivable_manual_settlements_state_check
    check (state in (
      'STARTED',
      'REMOTE_CANCELED_LOCAL_PENDING',
      'REVIEW_REQUIRED',
      'COMPLETED',
      'REVERSED'
    )),
  constraint receivable_manual_settlements_amounts_nonnegative_check
    check (
      principal_cents > 0
      and interest_cents >= 0
      and penalty_cents >= 0
      and addition_cents >= 0
      and discount_cents >= 0
      and received_cents > 0
      and principal_cents <= 9000000000000000
      and interest_cents <= 9000000000000000
      and penalty_cents <= 9000000000000000
      and addition_cents <= 9000000000000000
      and discount_cents <= 9000000000000000
      and received_cents <= 9000000000000000
    ),
  constraint receivable_manual_settlements_amount_equation_check
    check (
      received_cents = principal_cents + interest_cents + penalty_cents
        + addition_cents - discount_cents
      and discount_cents < principal_cents + interest_cents + penalty_cents
        + addition_cents
    ),
  constraint receivable_manual_settlements_snapshot_object_check
    check (jsonb_typeof(receivable_snapshot) = 'object'),
  constraint receivable_manual_settlements_result_object_check
    check (jsonb_typeof(result) = 'object')
);

create unique index if not exists receivable_manual_settlements_active_receivable_uidx
  on public.receivable_manual_settlements (receivable_id)
  where state in ('STARTED', 'REMOTE_CANCELED_LOCAL_PENDING', 'REVIEW_REQUIRED');

create index if not exists receivable_manual_settlements_receivable_created_idx
  on public.receivable_manual_settlements (receivable_id, created_at desc);

create index if not exists receivable_manual_settlements_actor_created_idx
  on public.receivable_manual_settlements (actor_id, created_at desc);

create table if not exists public.receivable_manual_settlement_events (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null
    references public.receivable_manual_settlements(id) on delete restrict,
  actor_id uuid not null references public.usuarios_sistema(id) on delete restrict,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint receivable_manual_settlement_events_type_check
    check (event_type in (
      'STARTED',
      'REMOTE_CANCELED',
      'REMOTE_CANCELLATION_FAILED',
      'LOCAL_SETTLEMENT_FAILED',
      'LOCAL_SETTLEMENT_COMPLETED',
      'LOCAL_SETTLEMENT_REPLAYED',
      'LOCAL_SETTLEMENT_REVERSED'
    )),
  constraint receivable_manual_settlement_events_details_object_check
    check (jsonb_typeof(details) = 'object')
);

create index if not exists receivable_manual_settlement_events_settlement_idx
  on public.receivable_manual_settlement_events (settlement_id, created_at asc);

alter table public.contas_receber
  add column if not exists manual_settlement_id uuid,
  add column if not exists manual_settlement_principal_cents bigint,
  add column if not exists manual_settlement_interest_cents bigint,
  add column if not exists manual_settlement_penalty_cents bigint,
  add column if not exists manual_settlement_addition_cents bigint,
  add column if not exists manual_settlement_discount_cents bigint,
  add column if not exists manual_settlement_received_cents bigint,
  add column if not exists manual_settlement_reversed_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'contas_receber_manual_settlement_fkey'
      and conrelid = 'public.contas_receber'::regclass
  ) then
    alter table public.contas_receber
      add constraint contas_receber_manual_settlement_fkey
      foreign key (manual_settlement_id)
      references public.receivable_manual_settlements(id)
      on delete restrict;
  end if;
end;
$$;

alter table public.contas_receber
  drop constraint if exists contas_receber_manual_settlement_amounts_check;
alter table public.contas_receber
  add constraint contas_receber_manual_settlement_amounts_check
  check (
    manual_settlement_id is null
    or (
      manual_settlement_principal_cents > 0
      and manual_settlement_interest_cents >= 0
      and manual_settlement_penalty_cents >= 0
      and manual_settlement_addition_cents >= 0
      and manual_settlement_discount_cents >= 0
      and manual_settlement_received_cents > 0
      and manual_settlement_principal_cents <= 9000000000000000
      and manual_settlement_interest_cents <= 9000000000000000
      and manual_settlement_penalty_cents <= 9000000000000000
      and manual_settlement_addition_cents <= 9000000000000000
      and manual_settlement_discount_cents <= 9000000000000000
      and manual_settlement_received_cents <= 9000000000000000
      and manual_settlement_received_cents = manual_settlement_principal_cents
        + manual_settlement_interest_cents + manual_settlement_penalty_cents
        + manual_settlement_addition_cents - manual_settlement_discount_cents
    )
  ) not valid;

alter table public.contas_receber
  validate constraint contas_receber_manual_settlement_amounts_check;

create or replace function public.touch_receivable_manual_settlement_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_receivable_manual_settlement_updated_at
  on public.receivable_manual_settlements;
create trigger touch_receivable_manual_settlement_updated_at
before update on public.receivable_manual_settlements
for each row execute function public.touch_receivable_manual_settlement_updated_at();

create or replace function public.prevent_receivable_manual_settlement_event_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'Eventos de baixa manual são imutáveis.';
end;
$$;

drop trigger if exists prevent_receivable_manual_settlement_event_mutation
  on public.receivable_manual_settlement_events;
create trigger prevent_receivable_manual_settlement_event_mutation
before update or delete on public.receivable_manual_settlement_events
for each row execute function public.prevent_receivable_manual_settlement_event_mutation();

create or replace function public.protect_receivable_manual_settlement_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_trusted_writer boolean :=
    coalesce(auth.role(), '') = 'service_role';
begin
  if v_trusted_writer then
    return new;
  end if;

  if row(
    new.manual_settlement_id,
    new.manual_settlement_principal_cents,
    new.manual_settlement_interest_cents,
    new.manual_settlement_penalty_cents,
    new.manual_settlement_addition_cents,
    new.manual_settlement_discount_cents,
    new.manual_settlement_received_cents,
    new.manual_settlement_reversed_at
  ) is distinct from row(
    old.manual_settlement_id,
    old.manual_settlement_principal_cents,
    old.manual_settlement_interest_cents,
    old.manual_settlement_penalty_cents,
    old.manual_settlement_addition_cents,
    old.manual_settlement_discount_cents,
    old.manual_settlement_received_cents,
    old.manual_settlement_reversed_at
  ) then
    raise exception using
      errcode = '42501',
      message = 'Campos de baixa manual somente podem ser alterados pelo servidor.';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_receivable_manual_settlement_fields
  on public.contas_receber;
create trigger protect_receivable_manual_settlement_fields
before update on public.contas_receber
for each row execute function public.protect_receivable_manual_settlement_fields();

create or replace function public.finalize_receivable_manual_settlement(
  p_settlement_id uuid,
  p_lease_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
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
    raise exception using errcode = '40001', message = 'Cobrança mudou de status antes da baixa manual.';
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

  if v_current_snapshot is distinct from v_settlement.receivable_snapshot then
    raise exception using errcode = '40001', message = 'Identidade ou status da cobrança mudou durante a baixa manual.';
  end if;

  if v_settlement.polo_id is distinct from v_receivable.polo_id then
    raise exception using errcode = '40001', message = 'O polo da cobrança mudou durante a baixa manual.';
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

alter table public.receivable_manual_settlements enable row level security;
alter table public.receivable_manual_settlement_events enable row level security;

revoke all on table public.receivable_manual_settlements
  from public, anon, authenticated;
revoke all on table public.receivable_manual_settlement_events
  from public, anon, authenticated;
grant select, insert, update on table public.receivable_manual_settlements
  to service_role;
grant select, insert on table public.receivable_manual_settlement_events
  to service_role;

revoke all on function public.finalize_receivable_manual_settlement(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.finalize_receivable_manual_settlement(uuid, uuid)
  to service_role;

revoke all on function public.touch_receivable_manual_settlement_updated_at()
  from public, anon, authenticated;
grant execute on function public.touch_receivable_manual_settlement_updated_at()
  to service_role;

revoke all on function public.prevent_receivable_manual_settlement_event_mutation()
  from public, anon, authenticated;
grant execute on function public.prevent_receivable_manual_settlement_event_mutation()
  to service_role;

revoke all on function public.protect_receivable_manual_settlement_fields()
  from public, anon, authenticated;
grant execute on function public.protect_receivable_manual_settlement_fields()
  to service_role;

comment on table public.receivable_manual_settlements is
  'Estado idempotente e composição em centavos de cada baixa manual de contas a receber.';
comment on table public.receivable_manual_settlement_events is
  'Trilha imutável de auditoria das baixas manuais e cancelamentos remotos.';
comment on function public.finalize_receivable_manual_settlement(uuid, uuid) is
  'Consolida a baixa local e sua auditoria em uma única transação após confirmação do cancelamento remoto.';

commit;
