begin;

create function internal_finance.receivable_renegotiation_worker_lease_valid(
  p_operation_id uuid,
  p_lease_token uuid
) returns boolean language sql stable security definer set search_path = '' as $function$
  select exists (
    select 1
    from public.receivable_renegotiation_activation_operations operation
    where operation.id = p_operation_id
      and operation.lease_token = p_lease_token
      and operation.lease_until > now()
      and operation.state in ('CANCELING_SOURCES', 'ISSUING_REPLACEMENTS')
  );
$function$;

create function internal_finance.assert_receivable_renegotiation_worker()
returns void language plpgsql stable security definer set search_path = '' as $function$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
    and session_user not in ('postgres', 'supabase_admin', 'service_role') then
    raise exception 'Worker de renegociação não autorizado.' using errcode = '42501';
  end if;
end;
$function$;

create function internal_finance.mark_receivable_renegotiation_payment_review(
  p_operation_id uuid,
  p_receivable_id uuid,
  p_error_code text,
  p_signal text
) returns void language plpgsql security definer set search_path = '' as $function$
declare
  v_operation public.receivable_renegotiation_activation_operations%rowtype;
  v_agreement public.receivable_renegotiation_agreements%rowtype;
  v_from_status text;
  v_now timestamptz := clock_timestamp();
  v_details jsonb;
  v_request_id uuid := gen_random_uuid();
begin
  perform internal_finance.assert_receivable_renegotiation_worker();
  if coalesce(p_error_code, '') !~ '^[A-Z0-9_]{3,80}$'
    or p_signal not in ('RECEIVABLE_SETTLED', 'BANK_TRANSACTION_PAID') then
    raise exception 'Sinal de pagamento concorrente inválido.' using errcode = '22023';
  end if;
  select operation.* into strict v_operation
  from public.receivable_renegotiation_activation_operations operation
  where operation.id = p_operation_id for update;
  if v_operation.state = 'REVIEW_REQUIRED' then return; end if;
  v_from_status := case when v_operation.state = 'ACTIVE'
    then 'ACTIVE' else 'ACTIVATING' end;
  update public.receivable_renegotiation_activation_operations
  set state = 'REVIEW_REQUIRED', last_error_code = p_error_code,
      lease_token = null, lease_until = null, updated_at = v_now,
      review_required_at = v_now
  where id = v_operation.id;
  update public.receivable_renegotiation_agreements
  set lifecycle_status = 'REVIEW_REQUIRED', version = version + 1,
      review_required_at = v_now, updated_at = v_now
  where id = v_operation.agreement_id
    and lifecycle_status in ('ACTIVATING', 'ACTIVE')
  returning * into v_agreement;
  if not found then
    raise exception 'Estado do acordo divergiu durante pagamento concorrente.'
      using errcode = '40001';
  end if;
  v_details := jsonb_build_object(
    'operationId', v_operation.id, 'receivableId', p_receivable_id,
    'errorCode', p_error_code, 'signal', p_signal
  );
  insert into public.receivable_renegotiation_events (
    agreement_id, polo_id, event_type, from_lifecycle_status,
    to_lifecycle_status, version, actor_id, request_id, payload_hash, details
  ) values (
    v_agreement.id, v_agreement.polo_id, 'ACTIVATION_REVIEW_REQUIRED',
    v_from_status, 'REVIEW_REQUIRED', v_agreement.version, null,
    v_request_id, internal_finance.receivable_renegotiation_hash(v_details),
    v_details
  );
end;
$function$;
create function internal_finance.receivable_renegotiation_source_bypass_valid(
  p_receivable_id uuid
) returns boolean language plpgsql stable security definer set search_path = '' as $function$
declare
  v_operation_id uuid;
  v_lease_token uuid;
begin
  begin
    v_operation_id := nullif(current_setting(
      'app.receivable_renegotiation_operation_id', true
    ), '')::uuid;
    v_lease_token := nullif(current_setting(
      'app.receivable_renegotiation_lease_token', true
    ), '')::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  return internal_finance.receivable_renegotiation_worker_lease_valid(
    v_operation_id, v_lease_token
  ) and exists (
    select 1 from public.receivable_renegotiation_activation_sources source
    where source.operation_id = v_operation_id
      and source.receivable_id = p_receivable_id
      and source.state in ('PENDING', 'CANCEL_INTENT')
  );
end;
$function$;

create function internal_finance.guard_receivable_renegotiation_source()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  v_source public.receivable_renegotiation_activation_sources%rowtype;
  v_payment_transition boolean;
  v_payment_fields text[] := array[
    'status', 'valor_pago', 'data_pagamento', 'forma_pagamento',
    'origem_pagamento', 'gateway_status', 'gateway_fee_value',
    'gateway_net_value', 'gateway_transaction_receipt_url',
    'gateway_synced_at', 'gateway_last_error', 'gateway_settlement_channel',
    'gateway_settlement_source', 'gateway_settlement_evidence',
    'gateway_settlement_recorded_at', 'updated_at'
  ];
begin
  select source.* into v_source
  from public.receivable_renegotiation_activation_sources source
  where source.receivable_id = old.id;
  if not found then return case when tg_op = 'DELETE' then old else new end; end if;
  if tg_op = 'DELETE' then
    raise exception 'Título original de renegociação é histórico imutável.'
      using errcode = '55000';
  end if;
  v_payment_transition := new.status = 'PAGO'
    and new.data_pagamento is not null
    and coalesce(new.valor_pago, 0) > 0
    and new.gateway_settlement_recorded_at is not null
    and upper(coalesce(new.gateway_status, '')) = 'PAID'
    and row(new.id, new.polo_id, new.cliente_id, new.matricula_id,
      new.turma_id, new.valor, new.data_vencimento)
      is not distinct from row(old.id, old.polo_id, old.cliente_id,
        old.matricula_id, old.turma_id, old.valor, old.data_vencimento)
    and to_jsonb(new) - v_payment_fields
      is not distinct from to_jsonb(old) - v_payment_fields;
  if v_payment_transition then
    perform internal_finance.mark_receivable_renegotiation_payment_review(
      v_source.operation_id, old.id, 'SOURCE_PAYMENT_DETECTED',
      'RECEIVABLE_SETTLED'
    );
    return new;
  end if;
  if not internal_finance.receivable_renegotiation_source_bypass_valid(old.id)
    or new.status is distinct from 'CANCELADO'
    or new.data_pagamento is not null
    or coalesce(new.valor_pago, 0) <> 0
    or new.manual_settlement_id is not null
    or new.gateway_settlement_recorded_at is not null
    or new.updated_at is null or new.updated_at <= old.updated_at
  then
    raise exception 'Título original cercado pela ativação da renegociação.'
      using errcode = 'PT409';
  end if;
  if v_source.kind = 'LOCAL' then
    if to_jsonb(new) - array['status', 'updated_at']
      is distinct from to_jsonb(old) - array['status', 'updated_at'] then
      raise exception 'Cancelamento local alterou campos fora do fence.'
        using errcode = 'PT409';
    end if;
  elsif new.gateway_status is distinct from 'CANCELED'
    or new.gateway_synced_at is null
    or to_jsonb(new) - array[
      'status', 'gateway_status', 'gateway_synced_at',
      'gateway_last_error', 'updated_at'
    ] is distinct from to_jsonb(old) - array[
      'status', 'gateway_status', 'gateway_synced_at',
      'gateway_last_error', 'updated_at'
    ] then
    raise exception 'Cancelamento Banese alterou campos fora do fence.'
      using errcode = 'PT409';
  end if;
  return new;
end;
$function$;

create function internal_finance.guard_receivable_renegotiation_source_transaction()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  v_receivable_id uuid := coalesce(new.receivable_id, old.receivable_id);
  v_source public.receivable_renegotiation_activation_sources%rowtype;
  v_payment_transition boolean := false;
  v_payment_fields text[] := array[
    'remote_status', 'fee_value', 'net_value', 'transaction_receipt_url',
    'raw_payload', 'last_error', 'synced_at', 'updated_at'
  ];
begin
  select source.* into v_source
  from public.receivable_renegotiation_activation_sources source
  where source.transaction_id = coalesce(new.id, old.id)
    or source.receivable_id = v_receivable_id
  order by (source.transaction_id = coalesce(new.id, old.id)) desc
  limit 1;
  if not found then return case when tg_op = 'DELETE' then old else new end; end if;
  if tg_op = 'UPDATE' and v_source.transaction_id = old.id then
    v_payment_transition := upper(coalesce(new.remote_status, '')) = 'PAID'
      and new.synced_at is not null and new.updated_at is not null
      and new.updated_at > old.updated_at
      and row(new.id, new.receivable_id, new.provider_code, new.environment,
        new.payment_method, new.remote_payment_id, new.amount,
        new.bank_slip_our_number, new.origin_polo_id, new.issuer_polo_id)
        is not distinct from row(old.id, old.receivable_id, old.provider_code,
          old.environment, old.payment_method, old.remote_payment_id, old.amount,
          old.bank_slip_our_number, old.origin_polo_id, old.issuer_polo_id)
      and to_jsonb(new) - v_payment_fields
        is not distinct from to_jsonb(old) - v_payment_fields;
  end if;
  if v_payment_transition then
    perform internal_finance.mark_receivable_renegotiation_payment_review(
      v_source.operation_id, v_source.receivable_id,
      'SOURCE_PAYMENT_DETECTED', 'BANK_TRANSACTION_PAID'
    );
    return new;
  end if;
  if tg_op <> 'UPDATE'
    or v_source.transaction_id is distinct from old.id
    or not internal_finance.receivable_renegotiation_source_bypass_valid(
      v_receivable_id
    )
    or new.remote_status is distinct from 'CANCELED'
    or new.last_error is not null
    or new.synced_at is null or new.updated_at is null
    or new.synced_at is distinct from new.updated_at
    or new.updated_at <= old.updated_at
    or to_jsonb(new) - array['remote_status', 'last_error', 'synced_at', 'updated_at']
      is distinct from to_jsonb(old)
        - array['remote_status', 'last_error', 'synced_at', 'updated_at']
  then
    raise exception 'Transação original cercada pela ativação da renegociação.'
      using errcode = 'PT409';
  end if;
  return new;
end;
$function$;
create function internal_finance.receivable_renegotiation_confirmation_valid(
  p_old public.contas_receber, p_new public.contas_receber,
  p_replacement public.receivable_renegotiation_replacements,
  p_operation public.receivable_renegotiation_activation_operations
) returns boolean language plpgsql stable security definer set search_path = '' as $function$
declare
  v_operation_id uuid; v_lease_token uuid;
begin
  begin
    v_operation_id := nullif(current_setting(
      'app.receivable_renegotiation_operation_id', true
    ), '')::uuid;
    v_lease_token := nullif(current_setting(
      'app.receivable_renegotiation_lease_token', true
    ), '')::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  return v_operation_id = p_operation.id
    and internal_finance.receivable_renegotiation_worker_lease_valid(
      v_operation_id, v_lease_token
    )
    and p_old.gateway_creation_token = p_replacement.attempt_key
    and p_new.gateway_creation_token is null
    and p_new.gateway_status = 'PENDING'
    and p_new.gateway_submission_channel = 'API'
    and p_new.gateway_submission_status = 'API_REGISTERED'
    and p_new.gateway_financial_terms_confirmed_at is not null
    and p_new.gateway_boleto_issued_at = p_new.gateway_financial_terms_confirmed_at
    and to_jsonb(p_new) - array[
      'gateway_payment_id', 'gateway_customer_id', 'gateway_payment_link_id',
      'gateway_status', 'gateway_invoice_url', 'gateway_bank_slip_url',
      'gateway_boleto_linha_digitavel', 'gateway_boleto_codigo_barras',
      'gateway_boleto_nosso_numero', 'gateway_pix_payload',
      'gateway_pix_encoded_image', 'gateway_financial_terms',
      'gateway_financial_terms_confirmed_at', 'gateway_boleto_issued_at',
      'gateway_submission_channel', 'gateway_submission_status',
      'gateway_creation_token', 'gateway_synced_at', 'gateway_last_error',
      'updated_at'
    ] is not distinct from to_jsonb(p_old) - array[
      'gateway_payment_id', 'gateway_customer_id', 'gateway_payment_link_id',
      'gateway_status', 'gateway_invoice_url', 'gateway_bank_slip_url',
      'gateway_boleto_linha_digitavel', 'gateway_boleto_codigo_barras',
      'gateway_boleto_nosso_numero', 'gateway_pix_payload',
      'gateway_pix_encoded_image', 'gateway_financial_terms',
      'gateway_financial_terms_confirmed_at', 'gateway_boleto_issued_at',
      'gateway_submission_channel', 'gateway_submission_status',
      'gateway_creation_token', 'gateway_synced_at', 'gateway_last_error',
      'updated_at'
    ]
    and exists (
      select 1 from public.payment_gateway_transactions transaction
      where transaction.id = p_replacement.gateway_transaction_id
        and transaction.receivable_id = p_new.id
        and transaction.remote_payment_id = p_new.gateway_payment_id
        and transaction.bank_slip_our_number = p_new.gateway_boleto_nosso_numero
        and transaction.bank_slip_digitable_line = p_new.gateway_boleto_linha_digitavel
        and transaction.bank_slip_barcode = p_new.gateway_boleto_codigo_barras
        and transaction.pix_payload = p_new.gateway_pix_payload
        and transaction.pix_encoded_image = p_new.gateway_pix_encoded_image
        and transaction.synced_at = p_new.gateway_synced_at
    );
end;
$function$;
create function internal_finance.guard_receivable_renegotiation_replacement()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  v_replacement public.receivable_renegotiation_replacements%rowtype;
  v_operation public.receivable_renegotiation_activation_operations%rowtype;
  v_snapshot jsonb := coalesce(
    new.regra_financeira_renegociacao_snapshot,
    old.regra_financeira_renegociacao_snapshot
  );
  v_operation_id uuid;
  v_lease_token uuid;
begin
  if v_snapshot is null then return case when tg_op = 'DELETE' then old else new end; end if;
  select replacement.* into v_replacement
  from public.receivable_renegotiation_replacements replacement
  where replacement.receivable_id = coalesce(new.id, old.id);
  if not found then
    raise exception 'Título substituto sem plano canônico de renegociação.'
      using errcode = '23514';
  end if;
  select operation.* into strict v_operation
  from public.receivable_renegotiation_activation_operations operation
  where operation.id = v_replacement.operation_id;
  if tg_op = 'DELETE' then
    raise exception 'Título substituto de renegociação é histórico imutável.'
      using errcode = '55000';
  end if;
  if tg_op = 'INSERT' then
    begin
      v_operation_id := nullif(current_setting(
        'app.receivable_renegotiation_operation_id', true
      ), '')::uuid;
      v_lease_token := nullif(current_setting(
        'app.receivable_renegotiation_lease_token', true
      ), '')::uuid;
    exception when invalid_text_representation then
      v_operation_id := null;
    end;
    if v_operation.id is distinct from v_operation_id
      or not internal_finance.receivable_renegotiation_worker_lease_valid(
        v_operation_id, v_lease_token
      )
      or v_operation.state <> 'ISSUING_REPLACEMENTS'
      or v_replacement.state <> 'PENDING'
      or new.tipo_lancamento <> 'RENEGOCIACAO'
      or new.cliente_id is distinct from v_operation.aluno_id
      or new.matricula_id is distinct from v_operation.matricula_id
      or new.turma_id is distinct from v_operation.turma_id
      or new.polo_id is distinct from v_operation.polo_id
      or new.renegotiation_agreement_id is distinct from v_operation.agreement_id
      or round(new.valor * 100)::bigint is distinct from v_replacement.amount_cents
      or new.data_vencimento is distinct from v_replacement.due_date
      or new.status is distinct from 'PENDENTE'
      or new.data_pagamento is not null or new.valor_pago is not null
      or new.categoria is distinct from 'MENSALIDADE'
      or new.forma_pagamento is distinct from 'BOLETO'
      or new.gateway_installments is distinct from 1
      or new.gateway_provider is distinct from 'banese_card'
      or new.gateway_environment is distinct from 'production'
      or new.gateway_payment_method is distinct from 'BOLETO'
      or new.gateway_issuer_polo_id is distinct from v_operation.issuer_polo_id
      or new.gateway_boleto_convenio is distinct from v_operation.gateway_convenio
      or new.gateway_boleto_agencia is distinct from v_operation.gateway_agency
      or new.gateway_status is distinct from 'CREATING'
      or new.gateway_creation_token is distinct from v_replacement.attempt_key
      or new.gateway_financial_terms is distinct from v_replacement.financial_terms
      or new.regra_financeira_renegociacao_snapshot #>> '{agreementId}'
        is distinct from v_operation.agreement_id::text
      or new.regra_financeira_renegociacao_snapshot #>> '{operationId}'
        is distinct from v_operation.id::text
      or new.regra_financeira_renegociacao_snapshot #>> '{sequence}'
        is distinct from v_replacement.sequence::text
      or new.regra_financeira_renegociacao_snapshot -> 'financialTerms'
        is distinct from v_replacement.financial_terms
      or new.regra_financeira_renegociacao_snapshot -> 'receiptPolicy'
        is distinct from v_replacement.collection_policy
    then
      raise exception 'Título substituto diverge do plano cercado.'
        using errcode = 'PT409';
    end if;
    return new;
  end if;
  if new.id is distinct from old.id
    or new.polo_id is distinct from old.polo_id
    or new.cliente_id is distinct from old.cliente_id
    or new.matricula_id is distinct from old.matricula_id
    or new.turma_id is distinct from old.turma_id
    or new.valor is distinct from old.valor
    or new.data_vencimento is distinct from old.data_vencimento
    or new.descricao is distinct from old.descricao
    or new.categoria is distinct from old.categoria
    or new.tipo_lancamento is distinct from old.tipo_lancamento
    or new.parcela_numero is distinct from old.parcela_numero
    or new.origem_cronograma_id is distinct from old.origem_cronograma_id
    or new.renegotiation_agreement_id is distinct from
      old.renegotiation_agreement_id
    or new.regra_financeira_renegociacao_snapshot is distinct from
      old.regra_financeira_renegociacao_snapshot
    or new.gateway_provider is distinct from 'banese_card'
    or new.gateway_environment is distinct from 'production'
    or new.gateway_payment_method is distinct from 'BOLETO'
    or new.gateway_issuer_polo_id is distinct from v_operation.issuer_polo_id
    or new.gateway_installments is distinct from 1
    or new.gateway_boleto_convenio is distinct from v_operation.gateway_convenio
    or new.gateway_boleto_agencia is distinct from v_operation.gateway_agency
    or new.gateway_financial_terms is distinct from v_replacement.financial_terms
  then
    raise exception 'Título substituto mudou identidade ou termos do acordo.'
      using errcode = 'PT409';
  end if;
  if v_replacement.state = 'ISSUED' then
    if internal_finance.receivable_renegotiation_confirmation_valid(
      old, new, v_replacement, v_operation
    ) then
      return new;
    end if;
    if new.gateway_payment_id is distinct from old.gateway_payment_id
      or new.gateway_customer_id is distinct from old.gateway_customer_id
      or new.gateway_payment_link_id is distinct from old.gateway_payment_link_id
      or new.gateway_boleto_nosso_numero is distinct from
        old.gateway_boleto_nosso_numero
      or new.gateway_boleto_linha_digitavel is distinct from
        old.gateway_boleto_linha_digitavel
      or new.gateway_boleto_codigo_barras is distinct from
        old.gateway_boleto_codigo_barras
      or new.gateway_creation_token is distinct from old.gateway_creation_token
      or new.gateway_creation_token is not null
      or new.gateway_submission_channel is distinct from
        old.gateway_submission_channel
      or new.gateway_submission_channel is distinct from 'API'
      or new.gateway_submission_status is distinct from
        old.gateway_submission_status
      or new.gateway_submission_status is distinct from 'API_REGISTERED'
      or new.gateway_financial_terms_confirmed_at is distinct from
        old.gateway_financial_terms_confirmed_at
      or new.gateway_financial_terms_confirmed_at is null
      or new.gateway_boleto_issued_at is distinct from old.gateway_boleto_issued_at
      or new.gateway_boleto_issued_at is null
    then
      raise exception 'Identidade bancária do título substituto é imutável.'
        using errcode = 'PT409';
    end if;
    return new;
  end if;
  if v_replacement.state not in ('PENDING', 'ISSUANCE_INTENT')
    or v_operation.state <> 'ISSUING_REPLACEMENTS'
    or v_operation.lease_token is null
    or v_operation.lease_until is null or v_operation.lease_until <= now()
    or new.gateway_creation_token is distinct from v_replacement.attempt_key
    or new.gateway_provider is distinct from 'banese_card'
    or new.gateway_environment is distinct from 'production'
    or new.gateway_payment_method is distinct from 'BOLETO'
    or new.status is distinct from old.status
    or new.data_pagamento is distinct from old.data_pagamento
    or new.valor_pago is distinct from old.valor_pago
  then
    raise exception 'Título substituto mudou fora do protocolo de emissão.'
      using errcode = 'PT409';
  end if;
  return new;
end;
$function$;

drop trigger if exists a00_guard_receivable_renegotiation_source
  on public.contas_receber;
create trigger a00_guard_receivable_renegotiation_source
before update or delete on public.contas_receber
for each row execute function internal_finance.guard_receivable_renegotiation_source();
drop trigger if exists a_guard_receivable_renegotiation_source_transaction
  on public.payment_gateway_transactions;
create trigger a_guard_receivable_renegotiation_source_transaction
before insert or update or delete on public.payment_gateway_transactions
for each row execute function
  internal_finance.guard_receivable_renegotiation_source_transaction();
drop trigger if exists a00_guard_receivable_renegotiation_replacement
  on public.contas_receber;
create trigger a00_guard_receivable_renegotiation_replacement
before insert or update or delete on public.contas_receber
for each row execute function internal_finance.guard_receivable_renegotiation_replacement();
revoke all on function
  internal_finance.receivable_renegotiation_worker_lease_valid(uuid, uuid),
  internal_finance.assert_receivable_renegotiation_worker(),
  internal_finance.mark_receivable_renegotiation_payment_review(
    uuid, uuid, text, text
  ),
  internal_finance.receivable_renegotiation_source_bypass_valid(uuid),
  internal_finance.guard_receivable_renegotiation_source(),
  internal_finance.guard_receivable_renegotiation_source_transaction(),
  internal_finance.receivable_renegotiation_confirmation_valid(
    public.contas_receber, public.contas_receber,
    public.receivable_renegotiation_replacements,
    public.receivable_renegotiation_activation_operations),
  internal_finance.guard_receivable_renegotiation_replacement()
  from public, anon, authenticated, service_role;

commit;
