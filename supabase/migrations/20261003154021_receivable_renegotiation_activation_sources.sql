begin;

create function internal_finance.assert_receivable_renegotiation_worker_item(
  p_operation_id uuid,
  p_receivable_id uuid,
  p_lease_token uuid,
  p_attempt_key uuid,
  p_expected_phase text
) returns public.receivable_renegotiation_activation_operations
language plpgsql security definer set search_path = '' as $function$
declare
  v_operation public.receivable_renegotiation_activation_operations%rowtype;
begin
  perform internal_finance.assert_receivable_renegotiation_worker();
  if p_operation_id is null or p_receivable_id is null
    or p_lease_token is null or p_attempt_key is null
    or p_expected_phase not in ('CANCELING_SOURCES', 'ISSUING_REPLACEMENTS') then
    raise exception 'Identidade do item de ativação inválida.' using errcode = '22023';
  end if;
  select operation.* into strict v_operation
  from public.receivable_renegotiation_activation_operations operation
  where operation.id = p_operation_id for update;
  if v_operation.state is distinct from p_expected_phase
    or v_operation.lease_token is distinct from p_lease_token
    or v_operation.lease_until is null or v_operation.lease_until <= now() then
    raise exception 'Lease da ativação expirado ou divergente.' using errcode = 'PT409';
  end if;
  perform internal_finance.assert_receivable_renegotiation_runtime_current(
    v_operation
  );
  return v_operation;
end;
$function$;

create function public.mark_receivable_renegotiation_cancel_intent_secure(
  p_operation_id uuid,
  p_receivable_id uuid,
  p_lease_token uuid,
  p_attempt_key uuid
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_operation public.receivable_renegotiation_activation_operations%rowtype;
  v_source public.receivable_renegotiation_activation_sources%rowtype;
  v_receivable public.contas_receber%rowtype;
begin
  v_operation := internal_finance.assert_receivable_renegotiation_worker_item(
    p_operation_id, p_receivable_id, p_lease_token, p_attempt_key,
    'CANCELING_SOURCES'
  );
  select source.* into strict v_source
  from public.receivable_renegotiation_activation_sources source
  where source.operation_id = v_operation.id
    and source.receivable_id = p_receivable_id
    and source.attempt_key = p_attempt_key for update;
  if v_source.kind <> 'BANESE' then
    raise exception 'Parcela local não aceita intenção bancária.' using errcode = 'PT409';
  end if;
  if v_source.state = 'CANCEL_INTENT' then
    return jsonb_build_object('mode', 'GET_ONLY');
  end if;
  if v_source.state <> 'PENDING' then
    raise exception 'Estado da origem incompatível com baixa.' using errcode = 'PT409';
  end if;
  select receivable.* into strict v_receivable
  from public.contas_receber receivable
  where receivable.id = v_source.receivable_id for update nowait;
  if internal_finance.receivable_renegotiation_current_source_fingerprint(
      v_receivable, v_source.source_snapshot
    ) <> v_source.source_fingerprint
    or v_receivable.status is null
    or v_receivable.status not in ('PENDENTE', 'VENCIDO')
    or v_receivable.data_pagamento is not null
    or coalesce(v_receivable.valor_pago, 0) <> 0
    or v_receivable.manual_settlement_id is not null
    or v_receivable.gateway_settlement_recorded_at is not null then
    raise exception 'RENEGOTIATION_SOURCE_CHANGED' using errcode = '40001';
  end if;
  update public.receivable_renegotiation_activation_sources
  set state = 'CANCEL_INTENT', cancel_intent_at = clock_timestamp(),
      cancel_intent_count = 1, updated_at = clock_timestamp()
  where id = v_source.id and state = 'PENDING' and cancel_intent_count = 0;
  if not found then
    raise exception 'Intenção de baixa já consumida.' using errcode = 'PT409';
  end if;
  return jsonb_build_object('mode', 'PUT_ALLOWED');
end;
$function$;

create function public.confirm_receivable_renegotiation_source_cancel_secure(
  p_operation_id uuid,
  p_receivable_id uuid,
  p_lease_token uuid,
  p_attempt_key uuid,
  p_evidence jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_operation public.receivable_renegotiation_activation_operations%rowtype;
  v_source public.receivable_renegotiation_activation_sources%rowtype;
  v_receivable public.contas_receber%rowtype;
  v_transaction public.payment_gateway_transactions%rowtype;
  v_evidence_hash text;
  v_confirmed_at timestamptz;
  v_now timestamptz := clock_timestamp();
begin
  v_operation := internal_finance.assert_receivable_renegotiation_worker_item(
    p_operation_id, p_receivable_id, p_lease_token, p_attempt_key,
    'CANCELING_SOURCES'
  );
  select source.* into strict v_source
  from public.receivable_renegotiation_activation_sources source
  where source.operation_id = v_operation.id
    and source.receivable_id = p_receivable_id
    and source.attempt_key = p_attempt_key for update;
  if jsonb_typeof(p_evidence) is distinct from 'object'
    or p_evidence - array['kind', 'situationCode', 'paymentsVerified',
      'paymentCount', 'identityVerified', 'evidenceFingerprint', 'confirmedAt']
      <> '{}'::jsonb
    or p_evidence ->> 'kind' is distinct from v_source.kind
    or jsonb_typeof(p_evidence -> 'paymentsVerified') is distinct from 'boolean'
    or jsonb_typeof(p_evidence -> 'identityVerified') is distinct from 'boolean'
    or jsonb_typeof(p_evidence -> 'confirmedAt') is distinct from 'string'
    or p_evidence ->> 'paymentCount' is distinct from '0'
    or coalesce(p_evidence ->> 'evidenceFingerprint', '') !~ '^[0-9a-f]{64}$'
  then
    raise exception 'Evidência de baixa inválida.' using errcode = '22023';
  end if;
  begin
    v_confirmed_at := (p_evidence ->> 'confirmedAt')::timestamptz;
  exception when others then
    raise exception 'Instante da evidência de baixa inválido.' using errcode = '22023';
  end;
  if v_confirmed_at < v_now - interval '1 day'
    or v_confirmed_at > v_now + interval '5 minutes' then
    raise exception 'Evidência de baixa fora da janela permitida.' using errcode = '22023';
  end if;
  v_evidence_hash := internal_finance.receivable_renegotiation_hash(p_evidence);
  if v_source.state = 'CANCELED_CONFIRMED' then
    if v_source.cancellation_evidence_fingerprint <> v_evidence_hash then
      raise exception 'Replay da baixa diverge da evidência original.'
        using errcode = 'PT409';
    end if;
    return internal_finance.receivable_renegotiation_activation_context(
      v_operation.id
    );
  end if;
  if (v_source.kind = 'BANESE' and (
      v_source.state <> 'CANCEL_INTENT'
      or p_evidence ->> 'situationCode' is distinct from '5'
      or p_evidence ->> 'paymentsVerified' is distinct from 'true'
      or p_evidence ->> 'identityVerified' is distinct from 'true'
    )) or (v_source.kind = 'LOCAL' and (
      v_source.state <> 'PENDING'
      or p_evidence -> 'situationCode' is distinct from 'null'::jsonb
      or p_evidence ->> 'paymentsVerified' is distinct from 'false'
      or p_evidence ->> 'identityVerified' is distinct from 'true'
    )) then
    raise exception 'Evidência não confirma a baixa desta origem.'
      using errcode = 'PT409';
  end if;
  select receivable.* into strict v_receivable
  from public.contas_receber receivable
  where receivable.id = v_source.receivable_id for update nowait;
  if internal_finance.receivable_renegotiation_current_source_fingerprint(
      v_receivable, v_source.source_snapshot
    ) <> v_source.source_fingerprint
    or v_receivable.status is null
    or v_receivable.status not in ('PENDENTE', 'VENCIDO')
    or v_receivable.data_pagamento is not null
    or coalesce(v_receivable.valor_pago, 0) <> 0
    or v_receivable.manual_settlement_id is not null
    or v_receivable.gateway_settlement_recorded_at is not null then
    raise exception 'RENEGOTIATION_SOURCE_CHANGED' using errcode = '40001';
  end if;
  perform set_config('app.receivable_renegotiation_operation_id',
    v_operation.id::text, true);
  perform set_config('app.receivable_renegotiation_lease_token',
    p_lease_token::text, true);
  if v_source.kind = 'BANESE' then
    select transaction.* into strict v_transaction
    from public.payment_gateway_transactions transaction
    where transaction.id = v_source.transaction_id
      and transaction.receivable_id = v_source.receivable_id
    for update nowait;
    if upper(coalesce(v_transaction.remote_status, ''))
        not in ('PENDING', 'REGISTERED')
      or v_transaction.last_error is not null then
      raise exception 'RENEGOTIATION_BANK_TRANSACTION_CHANGED'
        using errcode = '40001';
    end if;
    update public.payment_gateway_transactions
    set remote_status = 'CANCELED', last_error = null,
        synced_at = v_now, updated_at = v_now
    where id = v_transaction.id;
    update public.contas_receber
    set status = 'CANCELADO', gateway_status = 'CANCELED',
        gateway_synced_at = v_now, gateway_last_error = null,
        updated_at = v_now
    where id = v_receivable.id;
  else
    if v_receivable.gateway_provider is not null
      or v_receivable.gateway_payment_id is not null
      or exists (select 1 from public.payment_gateway_transactions transaction
        where transaction.receivable_id = v_receivable.id) then
      raise exception 'RENEGOTIATION_LOCAL_SOURCE_HAS_BANK_LINK'
        using errcode = '40001';
    end if;
    update public.contas_receber set status = 'CANCELADO', updated_at = v_now
    where id = v_receivable.id;
  end if;
  update public.receivable_renegotiation_activation_sources
  set state = 'CANCELED_CONFIRMED', cancellation_evidence = p_evidence,
      cancellation_evidence_fingerprint = v_evidence_hash,
      canceled_at = v_now, updated_at = v_now
  where id = v_source.id;
  return internal_finance.receivable_renegotiation_activation_context(
    v_operation.id
  );
end;
$function$;

revoke all on function
  internal_finance.assert_receivable_renegotiation_worker_item(
    uuid, uuid, uuid, uuid, text
  ),
  public.mark_receivable_renegotiation_cancel_intent_secure(
    uuid, uuid, uuid, uuid
  ),
  public.confirm_receivable_renegotiation_source_cancel_secure(
    uuid, uuid, uuid, uuid, jsonb
  ) from public, anon, authenticated, service_role;
grant execute on function public.mark_receivable_renegotiation_cancel_intent_secure(
  uuid, uuid, uuid, uuid
) to service_role;
grant execute on function public.confirm_receivable_renegotiation_source_cancel_secure(
  uuid, uuid, uuid, uuid, jsonb
) to service_role;

commit;
