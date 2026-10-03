begin;

create function public.mark_receivable_renegotiation_issuance_intent_secure(
  p_operation_id uuid,
  p_receivable_id uuid,
  p_lease_token uuid,
  p_attempt_key uuid
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_operation public.receivable_renegotiation_activation_operations%rowtype;
  v_replacement public.receivable_renegotiation_replacements%rowtype;
  v_receivable public.contas_receber%rowtype;
  v_mode text;
begin
  v_operation := internal_finance.assert_receivable_renegotiation_worker_item(
    p_operation_id, p_receivable_id, p_lease_token, p_attempt_key,
    'ISSUING_REPLACEMENTS'
  );
  select replacement.* into strict v_replacement
  from public.receivable_renegotiation_replacements replacement
  where replacement.operation_id = v_operation.id
    and replacement.receivable_id = p_receivable_id
    and replacement.attempt_key = p_attempt_key for update;
  select receivable.* into strict v_receivable
  from public.contas_receber receivable
  where receivable.id = v_replacement.receivable_id for update nowait;
  if v_replacement.state = 'ISSUED' then
    return jsonb_build_object(
      'mode', 'GET_ONLY', 'receivable', to_jsonb(v_receivable),
      'financialTerms', v_replacement.financial_terms,
      'creationResponse', v_replacement.creation_response
    );
  end if;
  if v_replacement.state not in ('PENDING', 'ISSUANCE_INTENT')
    or v_receivable.status not in ('PENDENTE', 'VENCIDO')
    or v_receivable.data_pagamento is not null
    or v_receivable.valor_pago is not null
    or v_receivable.manual_settlement_id is not null
    or v_receivable.gateway_settlement_recorded_at is not null
    or v_receivable.gateway_provider is distinct from 'banese_card'
    or v_receivable.gateway_environment is distinct from 'production'
    or v_receivable.gateway_payment_method is distinct from 'BOLETO'
    or v_receivable.gateway_status is distinct from 'CREATING'
    or v_receivable.gateway_creation_token is distinct from p_attempt_key
    or v_receivable.gateway_issuer_polo_id is distinct from v_operation.issuer_polo_id
    or v_receivable.gateway_financial_terms is distinct from
      v_replacement.financial_terms
    or v_receivable.regra_financeira_renegociacao_snapshot #>> '{agreementId}'
      is distinct from v_operation.agreement_id::text
    or exists (select 1 from public.payment_gateway_transactions transaction
      where transaction.receivable_id = v_receivable.id) then
    raise exception 'RENEGOTIATION_REPLACEMENT_CHANGED' using errcode = '40001';
  end if;
  if v_replacement.state = 'PENDING' then
    update public.receivable_renegotiation_replacements
    set state = 'ISSUANCE_INTENT', issuance_intent_at = clock_timestamp(),
        issuance_intent_count = 1, updated_at = clock_timestamp()
    where id = v_replacement.id and state = 'PENDING'
      and issuance_intent_count = 0;
    if not found then
      raise exception 'Intenção de emissão já consumida.' using errcode = 'PT409';
    end if;
    v_mode := 'POST_ALLOWED';
  else
    v_mode := 'GET_ONLY';
  end if;
  return jsonb_build_object(
    'mode', v_mode,
    'receivable', to_jsonb(v_receivable),
    'financialTerms', v_replacement.financial_terms,
    'creationResponse', v_replacement.creation_response
  );
end;
$function$;

create function public.record_receivable_renegotiation_bank_response_secure(
  p_operation_id uuid,
  p_receivable_id uuid,
  p_lease_token uuid,
  p_attempt_key uuid,
  p_response jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_operation public.receivable_renegotiation_activation_operations%rowtype;
  v_replacement public.receivable_renegotiation_replacements%rowtype;
  v_receivable public.contas_receber%rowtype;
  v_fingerprint text;
  v_now timestamptz := clock_timestamp();
begin
  v_operation := internal_finance.assert_receivable_renegotiation_worker_item(
    p_operation_id, p_receivable_id, p_lease_token, p_attempt_key,
    'ISSUING_REPLACEMENTS'
  );
  select replacement.* into strict v_replacement
  from public.receivable_renegotiation_replacements replacement
  where replacement.operation_id = v_operation.id
    and replacement.receivable_id = p_receivable_id
    and replacement.attempt_key = p_attempt_key for update;
  select receivable.* into strict v_receivable
  from public.contas_receber receivable
  where receivable.id = v_replacement.receivable_id for update nowait;
  if v_replacement.state <> 'ISSUANCE_INTENT'
    or jsonb_typeof(p_response) is distinct from 'object'
    or p_response - array['response', 'request'] <> '{}'::jsonb
    or jsonb_typeof(p_response -> 'response') is distinct from 'object'
    or jsonb_typeof(p_response -> 'request') is distinct from 'object'
    or (p_response -> 'request') - array[
      'nossoNumero', 'amount', 'dueDate', 'convenio', 'agency'
    ] <> '{}'::jsonb
    or coalesce(p_response #>> '{request,nossoNumero}', '') !~ '^[0-9]{9}$'
    or p_response #>> '{request,nossoNumero}' is distinct from
      v_receivable.gateway_boleto_nosso_numero
    or round((p_response #>> '{request,amount}')::numeric, 2)
      is distinct from round(v_receivable.valor, 2)
    or p_response #>> '{request,dueDate}' is distinct from
      v_receivable.data_vencimento::text
    or p_response #>> '{request,convenio}' is distinct from
      v_operation.gateway_convenio
    or p_response #>> '{request,agency}' is distinct from
      v_operation.gateway_agency
    or v_receivable.gateway_submission_channel is distinct from 'API'
    or v_receivable.gateway_submission_status is distinct from 'API_AMBIGUOUS'
    or pg_column_size(p_response) > 1048576 then
    raise exception 'Resposta original da emissão diverge da tentativa.'
      using errcode = 'PT409';
  end if;
  v_fingerprint := internal_finance.receivable_renegotiation_hash(p_response);
  if v_replacement.creation_response is not null then
    if v_replacement.creation_response_fingerprint <> v_fingerprint then
      raise exception 'Resposta bancária original já registrada com outro conteúdo.'
        using errcode = 'PT409';
    end if;
    return jsonb_build_object('recorded', true, 'replayed', true);
  end if;
  update public.receivable_renegotiation_replacements
  set creation_response = p_response,
      creation_response_fingerprint = v_fingerprint,
      creation_response_recorded_at = v_now, updated_at = v_now
  where id = v_replacement.id and creation_response is null;
  if not found then
    raise exception 'Resposta bancária original não foi registrada.'
      using errcode = 'PT409';
  end if;
  return jsonb_build_object('recorded', true, 'replayed', false);
end;
$function$;

create function public.confirm_receivable_renegotiation_replacement_issued_secure(
  p_operation_id uuid,
  p_receivable_id uuid,
  p_lease_token uuid,
  p_attempt_key uuid,
  p_result jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_operation public.receivable_renegotiation_activation_operations%rowtype;
  v_replacement public.receivable_renegotiation_replacements%rowtype;
  v_receivable public.contas_receber%rowtype;
  v_transaction_id uuid;
  v_our_number text;
  v_line text;
  v_barcode text;
  v_pix_payload text;
  v_pix_image text;
  v_result_fingerprint text;
  v_now timestamptz := clock_timestamp();
begin
  v_operation := internal_finance.assert_receivable_renegotiation_worker_item(
    p_operation_id, p_receivable_id, p_lease_token, p_attempt_key,
    'ISSUING_REPLACEMENTS'
  );
  select replacement.* into strict v_replacement
  from public.receivable_renegotiation_replacements replacement
  where replacement.operation_id = v_operation.id
    and replacement.receivable_id = p_receivable_id
    and replacement.attempt_key = p_attempt_key for update;
  if v_replacement.state = 'ISSUED' then
    return internal_finance.receivable_renegotiation_activation_context(
      v_operation.id
    );
  end if;
  select receivable.* into strict v_receivable
  from public.contas_receber receivable
  where receivable.id = v_replacement.receivable_id for update nowait;
  v_our_number := p_result ->> 'bankSlipOurNumber';
  v_line := regexp_replace(coalesce(p_result ->> 'bankSlipDigitableLine', ''),
    '\D', '', 'g');
  v_barcode := regexp_replace(coalesce(p_result ->> 'bankSlipBarcode', ''),
    '\D', '', 'g');
  v_pix_payload := nullif(btrim(coalesce(p_result ->> 'pixPayload', '')), '');
  v_pix_image := nullif(btrim(coalesce(p_result ->> 'pixEncodedImage', '')), '');
  if v_replacement.state <> 'ISSUANCE_INTENT'
    or jsonb_typeof(p_result) is distinct from 'object'
    or p_result - array['providerCode', 'remotePaymentId', 'remotePaymentLinkId',
      'remoteCustomerId', 'remoteStatus', 'invoiceUrl', 'bankSlipUrl',
      'pixPayload', 'pixEncodedImage', 'bankSlipDigitableLine',
      'bankSlipBarcode', 'bankSlipOurNumber', 'issuerPoloId',
      'financialTerms', 'rawPayload'] <> '{}'::jsonb
    or p_result ->> 'providerCode' is distinct from 'banese_card'
    or p_result ->> 'remoteStatus' is distinct from 'PENDING'
    or p_result ->> 'issuerPoloId' is distinct from v_operation.issuer_polo_id::text
    or coalesce(v_our_number, '') !~ '^[0-9]{9}$'
    or p_result ->> 'remotePaymentId' is distinct from v_our_number
    or v_receivable.gateway_boleto_nosso_numero is distinct from v_our_number
    or v_line !~ '^[0-9]{47}$' or v_barcode !~ '^[0-9]{44}$'
    or substring(v_barcode from 31 for 9) is distinct from v_our_number
    or substring(v_barcode from 10 for 10)::bigint is distinct from
      v_replacement.amount_cents
    or v_pix_payload is null or v_pix_image is null
    or p_result -> 'financialTerms' is distinct from v_replacement.financial_terms
    or jsonb_typeof(p_result -> 'rawPayload') is distinct from 'object'
    or pg_column_size(p_result) > 1048576
    or v_receivable.gateway_status is distinct from 'CREATING'
    or v_receivable.gateway_creation_token is distinct from p_attempt_key
    or v_receivable.gateway_submission_channel is distinct from 'API'
    or v_receivable.gateway_submission_status is distinct from 'API_AMBIGUOUS'
    or v_receivable.data_pagamento is not null or v_receivable.valor_pago is not null
    or v_receivable.manual_settlement_id is not null
    or v_receivable.gateway_settlement_recorded_at is not null
    or exists (select 1 from public.payment_gateway_transactions transaction
      where transaction.receivable_id = v_receivable.id) then
    raise exception 'RENEGOTIATION_REPLACEMENT_RESULT_INVALID'
      using errcode = 'PT409';
  end if;
  v_result_fingerprint := internal_finance.receivable_renegotiation_hash(p_result);
  insert into public.payment_gateway_transactions (
    receivable_id, provider_code, environment, payment_method,
    origin_polo_id, issuer_polo_id, installments, remote_payment_id,
    remote_customer_id, remote_payment_link_id, remote_status, amount,
    invoice_url, bank_slip_url, bank_slip_digitable_line, bank_slip_barcode,
    bank_slip_our_number, pix_payload, pix_encoded_image, raw_payload,
    last_error, synced_at, updated_at
  ) values (
    v_receivable.id, 'banese_card', 'production', 'BOLETO',
    v_operation.polo_id, v_operation.issuer_polo_id, 1, v_our_number,
    nullif(p_result ->> 'remoteCustomerId', ''), null, 'PENDING',
    v_receivable.valor, nullif(p_result ->> 'invoiceUrl', ''),
    nullif(p_result ->> 'bankSlipUrl', ''), v_line, v_barcode, v_our_number,
    v_pix_payload, v_pix_image,
    (p_result -> 'rawPayload') || jsonb_build_object(
      'renegotiationActivation', jsonb_build_object(
        'operationId', v_operation.id, 'agreementId', v_operation.agreement_id,
        'attemptKey', p_attempt_key, 'resultFingerprint', v_result_fingerprint,
        'persistedAt', v_now
      )
    ), null, v_now, v_now
  ) returning id into v_transaction_id;
  update public.receivable_renegotiation_replacements
  set state = 'ISSUED', gateway_transaction_id = v_transaction_id,
      issuance_evidence_fingerprint = v_result_fingerprint,
      issued_at = v_now, updated_at = v_now
  where id = v_replacement.id and state = 'ISSUANCE_INTENT';
  if not found then
    raise exception 'Fence da emissão mudou antes da persistência.'
      using errcode = 'PT409';
  end if;
  perform set_config('app.receivable_renegotiation_operation_id',
    v_operation.id::text, true);
  perform set_config('app.receivable_renegotiation_lease_token',
    p_lease_token::text, true);
  update public.contas_receber
  set gateway_payment_id = v_our_number,
      gateway_customer_id = nullif(p_result ->> 'remoteCustomerId', ''),
      gateway_payment_link_id = null, gateway_status = 'PENDING',
      gateway_invoice_url = nullif(p_result ->> 'invoiceUrl', ''),
      gateway_bank_slip_url = nullif(p_result ->> 'bankSlipUrl', ''),
      gateway_boleto_linha_digitavel = v_line,
      gateway_boleto_codigo_barras = v_barcode,
      gateway_boleto_nosso_numero = v_our_number,
      gateway_pix_payload = v_pix_payload,
      gateway_pix_encoded_image = v_pix_image,
      gateway_financial_terms = v_replacement.financial_terms,
      gateway_financial_terms_confirmed_at = v_now,
      gateway_boleto_issued_at = v_now,
      gateway_submission_channel = 'API',
      gateway_submission_status = 'API_REGISTERED',
      gateway_creation_token = null, gateway_synced_at = v_now,
      gateway_last_error = null, updated_at = v_now
  where id = v_receivable.id and gateway_creation_token = p_attempt_key;
  if not found then
    raise exception 'Título substituto não foi persistido atomicamente.'
      using errcode = 'PT409';
  end if;
  return internal_finance.receivable_renegotiation_activation_context(
    v_operation.id
  );
end;
$function$;

revoke all on function
  public.mark_receivable_renegotiation_issuance_intent_secure(
    uuid, uuid, uuid, uuid
  ),
  public.record_receivable_renegotiation_bank_response_secure(
    uuid, uuid, uuid, uuid, jsonb
  ),
  public.confirm_receivable_renegotiation_replacement_issued_secure(
    uuid, uuid, uuid, uuid, jsonb
  ) from public, anon, authenticated, service_role;
grant execute on function public.mark_receivable_renegotiation_issuance_intent_secure(
  uuid, uuid, uuid, uuid
) to service_role;
grant execute on function public.record_receivable_renegotiation_bank_response_secure(
  uuid, uuid, uuid, uuid, jsonb
) to service_role;
grant execute on function public.confirm_receivable_renegotiation_replacement_issued_secure(
  uuid, uuid, uuid, uuid, jsonb
) to service_role;

commit;
