begin;

create function public.release_receivable_renegotiation_activation_secure(
  p_operation_id uuid,
  p_lease_token uuid,
  p_retry_code text default null
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_operation public.receivable_renegotiation_activation_operations%rowtype;
  v_now timestamptz := clock_timestamp();
  v_recovery_count integer;
  v_backoff interval;
begin
  perform internal_finance.assert_receivable_renegotiation_worker();
  if p_retry_code is not null
    and p_retry_code is distinct from 'BANESE_PIX_PENDING' then
    raise exception 'Código de retomada inválido.' using errcode = '22023';
  end if;
  select operation.* into strict v_operation
  from public.receivable_renegotiation_activation_operations operation
  where operation.id = p_operation_id for update;
  if v_operation.state in ('ACTIVE', 'REVIEW_REQUIRED') then
    return jsonb_build_object('released', true, 'state', v_operation.state);
  end if;
  if p_lease_token is null
    or v_operation.lease_token is distinct from p_lease_token then
    raise exception 'Lease da ativação divergente.' using errcode = 'PT409';
  end if;
  if p_retry_code = 'BANESE_PIX_PENDING' then
    if v_operation.pix_recovery_first_pending_at is not null
      and v_operation.pix_recovery_first_pending_at <= v_now - interval '7 days' then
      perform internal_finance.mark_receivable_renegotiation_activation_review(
        v_operation.id, 'BANESE_PIX_RECOVERY_EXPIRED',
        jsonb_build_object('stage', v_operation.state)
      );
      return jsonb_build_object(
        'released', true, 'state', 'REVIEW_REQUIRED',
        'retryCode', 'BANESE_PIX_RECOVERY_EXPIRED'
      );
    end if;
    v_recovery_count := v_operation.pix_recovery_count + 1;
    v_backoff := case v_recovery_count
      when 1 then interval '1 minute'
      when 2 then interval '5 minutes'
      else interval '1 hour' end;
    update public.receivable_renegotiation_activation_operations
    set lease_token = null, lease_until = null,
        pix_recovery_first_pending_at = coalesce(
          pix_recovery_first_pending_at, v_now
        ),
        pix_recovery_count = v_recovery_count,
        next_attempt_at = v_now + v_backoff,
        last_error_code = 'BANESE_PIX_PENDING', updated_at = v_now
    where id = v_operation.id;
  else
    update public.receivable_renegotiation_activation_operations
    set lease_token = null, lease_until = null,
        next_attempt_at = v_now + interval '2 seconds',
        last_error_code = null, updated_at = v_now
    where id = v_operation.id;
  end if;
  return jsonb_build_object(
    'released', true, 'state', v_operation.state, 'retryCode', p_retry_code
  );
end;
$function$;

create function public.mark_receivable_renegotiation_activation_review_secure(
  p_operation_id uuid,
  p_lease_token uuid,
  p_error_code text
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_operation public.receivable_renegotiation_activation_operations%rowtype;
begin
  perform internal_finance.assert_receivable_renegotiation_worker();
  select operation.* into strict v_operation
  from public.receivable_renegotiation_activation_operations operation
  where operation.id = p_operation_id for update;
  if v_operation.state = 'REVIEW_REQUIRED' then
    return jsonb_build_object('state', 'REVIEW_REQUIRED');
  end if;
  if p_lease_token is null
    or v_operation.lease_token is distinct from p_lease_token
    or v_operation.lease_until is null or v_operation.lease_until <= now() then
    raise exception 'Lease da revisão expirado ou divergente.' using errcode = 'PT409';
  end if;
  perform internal_finance.mark_receivable_renegotiation_activation_review(
    v_operation.id, p_error_code, jsonb_build_object('stage', v_operation.state)
  );
  return jsonb_build_object('state', 'REVIEW_REQUIRED');
end;
$function$;

create function public.finish_receivable_renegotiation_activation_secure(
  p_operation_id uuid,
  p_lease_token uuid
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_operation public.receivable_renegotiation_activation_operations%rowtype;
  v_agreement public.receivable_renegotiation_agreements%rowtype;
  v_now timestamptz := clock_timestamp();
  v_details jsonb;
  v_lock_id uuid;
begin
  perform internal_finance.assert_receivable_renegotiation_worker();
  select operation.* into strict v_operation
  from public.receivable_renegotiation_activation_operations operation
  where operation.id = p_operation_id for update;
  if v_operation.state = 'ACTIVE' then
    return internal_finance.receivable_renegotiation_activation_context(
      v_operation.id
    );
  end if;
  if v_operation.state <> 'ISSUING_REPLACEMENTS'
    or p_lease_token is null
    or v_operation.lease_token is distinct from p_lease_token
    or v_operation.lease_until is null or v_operation.lease_until <= now() then
    raise exception 'Lease da conclusão expirado ou divergente.'
      using errcode = 'PT409';
  end if;
  perform internal_finance.assert_receivable_renegotiation_runtime_current(
    v_operation
  );
  for v_lock_id in
    select receivable_id from (
      select source.receivable_id
      from public.receivable_renegotiation_activation_sources source
      where source.operation_id = v_operation.id
      union
      select replacement.receivable_id
      from public.receivable_renegotiation_replacements replacement
      where replacement.operation_id = v_operation.id
    ) locked order by receivable_id
  loop
    perform 1 from public.contas_receber receivable
    where receivable.id = v_lock_id for update nowait;
  end loop;
  for v_lock_id in
    select transaction_id from (
      select source.transaction_id
      from public.receivable_renegotiation_activation_sources source
      where source.operation_id = v_operation.id
        and source.transaction_id is not null
      union
      select replacement.gateway_transaction_id
      from public.receivable_renegotiation_replacements replacement
      where replacement.operation_id = v_operation.id
        and replacement.gateway_transaction_id is not null
    ) locked order by transaction_id
  loop
    perform 1 from public.payment_gateway_transactions transaction
    where transaction.id = v_lock_id for update nowait;
  end loop;
  if (select count(*) from public.receivable_renegotiation_activation_sources source
      where source.operation_id = v_operation.id
        and source.state = 'CANCELED_CONFIRMED') <> v_operation.source_count
    or exists (
      select 1
      from public.receivable_renegotiation_activation_sources source
      join public.contas_receber receivable on receivable.id = source.receivable_id
      left join public.payment_gateway_transactions transaction
        on transaction.id = source.transaction_id
      where source.operation_id = v_operation.id
        and (receivable.status is distinct from 'CANCELADO'
          or receivable.data_pagamento is not null
          or coalesce(receivable.valor_pago, 0) <> 0
          or (source.kind = 'BANESE' and (
            receivable.gateway_status is distinct from 'CANCELED'
            or transaction.remote_status is distinct from 'CANCELED'
          )))
    ) then
    raise exception 'RENEGOTIATION_SOURCE_CANCELLATION_INCOMPLETE'
      using errcode = 'PT409';
  end if;
  if (select count(*) from public.receivable_renegotiation_replacements replacement
      where replacement.operation_id = v_operation.id
        and replacement.state = 'ISSUED') <> v_operation.replacement_count
    or exists (
      select 1
      from public.receivable_renegotiation_replacements replacement
      join public.contas_receber receivable
        on receivable.id = replacement.receivable_id
      join public.payment_gateway_transactions transaction
        on transaction.id = replacement.gateway_transaction_id
      where replacement.operation_id = v_operation.id
        and (receivable.status not in ('PENDENTE', 'VENCIDO')
          or receivable.data_pagamento is not null
          or receivable.valor_pago is not null
          or receivable.gateway_provider is distinct from 'banese_card'
          or receivable.gateway_environment is distinct from 'production'
          or receivable.gateway_payment_method is distinct from 'BOLETO'
          or receivable.gateway_status is distinct from 'PENDING'
          or receivable.gateway_submission_channel is distinct from 'API'
          or receivable.gateway_submission_status is distinct from 'API_REGISTERED'
          or receivable.gateway_creation_token is not null
          or receivable.gateway_issuer_polo_id is distinct from
            v_operation.issuer_polo_id
          or receivable.gateway_financial_terms is distinct from
            replacement.financial_terms
          or receivable.gateway_financial_terms_confirmed_at is null
          or nullif(btrim(coalesce(receivable.gateway_pix_payload, '')), '') is null
          or nullif(btrim(coalesce(receivable.gateway_pix_encoded_image, '')), '') is null
          or receivable.regra_financeira_renegociacao_snapshot
            #>> '{receiptPolicy,daysAfterDue}' is distinct from '60'
          or transaction.receivable_id is distinct from receivable.id
          or transaction.provider_code is distinct from 'banese_card'
          or transaction.environment is distinct from 'production'
          or transaction.payment_method is distinct from 'BOLETO'
          or transaction.remote_payment_id is distinct from
            receivable.gateway_payment_id
          or transaction.remote_status is distinct from 'PENDING')
    ) then
    raise exception 'RENEGOTIATION_REPLACEMENT_ISSUANCE_INCOMPLETE'
      using errcode = 'PT409';
  end if;
  select agreement.* into strict v_agreement
  from public.receivable_renegotiation_agreements agreement
  where agreement.id = v_operation.agreement_id for update;
  if v_agreement.lifecycle_status <> 'ACTIVATING'
    or v_agreement.proposal_fingerprint <> v_operation.expected_fingerprint then
    raise exception 'RENEGOTIATION_AGREEMENT_CHANGED' using errcode = '40001';
  end if;
  update public.receivable_renegotiation_activation_operations
  set state = 'ACTIVE', completed_at = v_now, lease_token = null,
      lease_until = null, last_error_code = null, updated_at = v_now
  where id = v_operation.id and state = 'ISSUING_REPLACEMENTS';
  update public.receivable_renegotiation_agreements
  set lifecycle_status = 'ACTIVE', version = version + 1,
      activated_at = v_now, updated_at = v_now
  where id = v_agreement.id and lifecycle_status = 'ACTIVATING'
  returning * into v_agreement;
  if not found then
    raise exception 'RENEGOTIATION_AGREEMENT_CHANGED' using errcode = '40001';
  end if;
  v_details := jsonb_build_object(
    'operationId', v_operation.id,
    'sourceCount', v_operation.source_count,
    'replacementCount', v_operation.replacement_count
  );
  insert into public.receivable_renegotiation_events (
    agreement_id, polo_id, event_type, from_lifecycle_status,
    to_lifecycle_status, version, actor_id, request_id, payload_hash, details
  ) values (
    v_agreement.id, v_agreement.polo_id, 'ACTIVATION_COMPLETED',
    'ACTIVATING', 'ACTIVE', v_agreement.version, null,
    v_operation.request_id,
    internal_finance.receivable_renegotiation_hash(v_details), v_details
  );
  return internal_finance.receivable_renegotiation_activation_context(
    v_operation.id
  );
end;
$function$;

revoke all on function
  public.release_receivable_renegotiation_activation_secure(uuid, uuid, text),
  public.mark_receivable_renegotiation_activation_review_secure(
    uuid, uuid, text
  ),
  public.finish_receivable_renegotiation_activation_secure(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.release_receivable_renegotiation_activation_secure(
  uuid, uuid, text
) to service_role;
grant execute on function public.mark_receivable_renegotiation_activation_review_secure(
  uuid, uuid, text
) to service_role;
grant execute on function public.finish_receivable_renegotiation_activation_secure(
  uuid, uuid
) to service_role;

commit;
