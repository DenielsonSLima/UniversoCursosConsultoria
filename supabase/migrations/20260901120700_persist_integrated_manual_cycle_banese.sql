begin;
set local lock_timeout = '5s';

create or replace function
internal_academic.technical_manual_banese_receivable_complete(
  p_receivable public.contas_receber
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_expected_terms jsonb;
  v_total integer;
  v_matching integer;
begin
  begin
    v_expected_terms :=
      internal_academic.technical_manual_banese_expected_terms(p_receivable);
  exception when others then
    return false;
  end;
  if p_receivable.gateway_provider is distinct from 'banese_card'
    or p_receivable.gateway_environment is distinct from 'production'
    or p_receivable.gateway_payment_method is distinct from 'BOLETO'
    or p_receivable.forma_pagamento is distinct from 'BOLETO'
    or p_receivable.gateway_submission_channel is distinct from 'API'
    or p_receivable.gateway_submission_status is distinct from 'API_REGISTERED'
    or upper(coalesce(p_receivable.status, '')) not in ('PENDENTE', 'VENCIDO')
    or p_receivable.data_pagamento is not null
    or p_receivable.valor_pago is not null
    or p_receivable.manual_settlement_id is not null
    or p_receivable.manual_settlement_principal_cents is not null
    or p_receivable.manual_settlement_interest_cents is not null
    or p_receivable.manual_settlement_penalty_cents is not null
    or p_receivable.manual_settlement_addition_cents is not null
    or p_receivable.manual_settlement_discount_cents is not null
    or p_receivable.manual_settlement_received_cents is not null
    or p_receivable.manual_settlement_reversed_at is not null
    or p_receivable.gateway_settlement_channel is not null
    or p_receivable.gateway_settlement_source is not null
    or p_receivable.gateway_settlement_evidence is not null
    or p_receivable.gateway_settlement_recorded_at is not null
    or p_receivable.gateway_transaction_receipt_url is not null
    or p_receivable.gateway_creation_token is not null
    or p_receivable.gateway_payment_link_id is not null
    or p_receivable.gateway_cnab_file_id is not null
    or upper(coalesce(p_receivable.gateway_status, '')) <> 'PENDING'
    or p_receivable.gateway_boleto_issued_at is null
    or p_receivable.gateway_financial_terms_confirmed_at is null
    or p_receivable.gateway_financial_terms is distinct from v_expected_terms
    or p_receivable.gateway_payment_id is distinct from
      p_receivable.gateway_boleto_nosso_numero
    or coalesce(p_receivable.gateway_payment_id, '') !~ '^[0-9]{9}$'
    or coalesce(p_receivable.gateway_boleto_linha_digitavel, '')
      !~ '^0479[0-9]{43}$'
    or coalesce(p_receivable.gateway_boleto_codigo_barras, '')
      !~ '^0479[0-9]{40}$'
    or substring(p_receivable.gateway_boleto_codigo_barras from 31 for 9)
      <> p_receivable.gateway_payment_id
    or concat(
      substring(p_receivable.gateway_boleto_linha_digitavel from 1 for 4),
      substring(p_receivable.gateway_boleto_linha_digitavel from 33 for 1),
      substring(p_receivable.gateway_boleto_linha_digitavel from 34 for 14),
      substring(p_receivable.gateway_boleto_linha_digitavel from 5 for 5),
      substring(p_receivable.gateway_boleto_linha_digitavel from 11 for 10),
      substring(p_receivable.gateway_boleto_linha_digitavel from 22 for 10)
    ) <> p_receivable.gateway_boleto_codigo_barras
    or coalesce(p_receivable.gateway_pix_payload, '') !~
      '^000201.*BR[.]GOV[.]BCB[.]PIX.*5303986.*5802BR.*6304[0-9A-Fa-f]{4}$'
    or coalesce(p_receivable.gateway_pix_encoded_image, '') !~
      '^data:image/(png|jpeg);base64,(iVBORw0KGgo|/9j/)[A-Za-z0-9+/=]+$'
    or exists (
      select 1
      from internal_academic.technical_manual_cycle_runs run
      join public.contas_receber sibling
        on sibling.id = any(run.receivable_ids)
       and sibling.id <> p_receivable.id
      where p_receivable.id = any(run.receivable_ids)
        and run.state = 'LOCAL_CREATED'
        and (
          sibling.gateway_boleto_nosso_numero =
            p_receivable.gateway_boleto_nosso_numero
          or sibling.gateway_boleto_linha_digitavel =
            p_receivable.gateway_boleto_linha_digitavel
          or sibling.gateway_boleto_codigo_barras =
            p_receivable.gateway_boleto_codigo_barras
          or sibling.gateway_pix_payload = p_receivable.gateway_pix_payload
        )
    )
  then
    return false;
  end if;
  select count(*)::integer,
    count(*) filter (where
      transaction.provider_code = 'banese_card'
      and transaction.environment = 'production'
      and transaction.payment_method = 'BOLETO'
      and transaction.remote_payment_id = p_receivable.gateway_payment_id
      and transaction.remote_status = p_receivable.gateway_status
      and round(transaction.amount, 2) = round(p_receivable.valor, 2)
      and transaction.origin_polo_id = p_receivable.polo_id
      and transaction.issuer_polo_id = p_receivable.gateway_issuer_polo_id
      and transaction.bank_slip_our_number =
        p_receivable.gateway_boleto_nosso_numero
      and transaction.bank_slip_digitable_line =
        p_receivable.gateway_boleto_linha_digitavel
      and transaction.bank_slip_barcode =
        p_receivable.gateway_boleto_codigo_barras
      and transaction.pix_payload = p_receivable.gateway_pix_payload
      and transaction.pix_encoded_image = p_receivable.gateway_pix_encoded_image
      and jsonb_typeof(transaction.raw_payload -> 'manualCycleIssuance')
        = 'object'
    )::integer
  into v_total, v_matching
  from public.payment_gateway_transactions transaction
  where transaction.receivable_id = p_receivable.id;
  return v_total = 1 and v_matching = 1;
end;
$function$;

revoke all on function
  internal_academic.technical_manual_banese_receivable_complete(
    public.contas_receber
  ) from public, anon, authenticated, service_role;

create or replace function
public.persist_technical_manual_cycle_banese_issuance(
  p_receivable_id uuid,
  p_authorization_request_id uuid,
  p_expected_creation_token uuid,
  p_result jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set lock_timeout = '5s'
set statement_timeout = '45s'
as $function$
declare
  v_receivable public.contas_receber%rowtype;
  v_run internal_academic.technical_manual_cycle_runs%rowtype;
  v_auth internal_academic.technical_manual_receivable_issuance_authorizations%rowtype;
  v_expected_terms jsonb;
  v_our_number text := p_result ->> 'bankSlipOurNumber';
  v_line text := p_result ->> 'bankSlipDigitableLine';
  v_barcode text := p_result ->> 'bankSlipBarcode';
  v_pix_payload text := p_result ->> 'pixPayload';
  v_pix_image text := p_result ->> 'pixEncodedImage';
  v_remote_status text := upper(coalesce(p_result ->> 'remoteStatus', ''));
  v_result_fingerprint text := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(coalesce(p_result, '{}'::jsonb)::text, 'UTF8'),
      'sha256'
    ), 'hex'
  );
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_transaction_id uuid;
  v_updated integer;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and session_user not in ('postgres', 'supabase_admin', 'service_role')
  then
    raise exception 'Acesso negado à persistência do ciclo BolePix.'
      using errcode = '42501';
  end if;
  if p_receivable_id is null or p_authorization_request_id is null
    or p_expected_creation_token is null
    or jsonb_typeof(p_result) is distinct from 'object'
  then
    raise exception 'Parâmetros inválidos para persistir o ciclo BolePix.'
      using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('technical-manual-banese:' || p_receivable_id, 0)
  );
  select receivable.* into strict v_receivable
  from public.contas_receber receivable
  where receivable.id = p_receivable_id
  for update;
  select run.* into strict v_run
  from internal_academic.technical_manual_cycle_runs run
  where run.matricula_id = v_receivable.matricula_id
    and run.turma_id = v_receivable.turma_id
    and v_receivable.id = any(run.receivable_ids)
    and run.state = 'LOCAL_CREATED'
  for update;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'technical-manual-banese-cycle:' || v_run.matricula_id::text || ':' ||
        v_run.cycle_number::text,
      0
    )
  );
  select authz.* into strict v_auth
  from internal_academic.technical_manual_receivable_issuance_authorizations
    as authz
  where authz.receivable_id = v_receivable.id
    and authz.request_id = p_authorization_request_id
  for update;
  if v_auth.matricula_id is distinct from v_run.matricula_id
    or v_auth.turma_id is distinct from v_run.turma_id
    or v_auth.cycle_number is distinct from v_run.cycle_number
    or v_auth.first_claimed_at is null or v_auth.claim_count < 1
    or v_auth.receivable_fingerprint is distinct from
      internal_academic.technical_manual_receivable_issuance_fingerprint(
        v_receivable
      )
  then
    raise exception 'Autorização ou fingerprint do recebível divergiu.'
      using errcode = '40001';
  end if;
  v_expected_terms :=
    internal_academic.technical_manual_banese_expected_terms(v_receivable);
  if v_receivable.gateway_provider is distinct from 'banese_card'
    or v_receivable.gateway_environment is distinct from 'production'
    or v_receivable.gateway_payment_method is distinct from 'BOLETO'
    or v_receivable.forma_pagamento is distinct from 'BOLETO'
    or v_receivable.gateway_issuer_polo_id is null
    or coalesce(v_receivable.gateway_boleto_convenio, '') !~ '^[0-9]+$'
    or coalesce(v_receivable.gateway_boleto_agencia, '') !~ '^[0-9]{3}$'
    or v_receivable.gateway_financial_terms is distinct from v_expected_terms
    or p_result -> 'financialTerms' is distinct from v_expected_terms
    or p_result ->> 'providerCode' is distinct from 'banese_card'
    or p_result ->> 'remotePaymentId' is distinct from v_our_number
    or nullif(p_result ->> 'remotePaymentLinkId', '') is not null
    or p_result ->> 'issuerPoloId' is distinct from
      v_receivable.gateway_issuer_polo_id::text
    or coalesce(v_our_number, '') !~ '^[0-9]{9}$'
    or coalesce(v_line, '') !~ '^0479[0-9]{43}$'
    or coalesce(v_barcode, '') !~ '^0479[0-9]{40}$'
    or substring(v_barcode from 31 for 9) <> v_our_number
    or concat(substring(v_line from 1 for 4), substring(v_line from 33 for 1),
      substring(v_line from 34 for 14), substring(v_line from 5 for 5),
      substring(v_line from 11 for 10), substring(v_line from 22 for 10))
      <> v_barcode
    or coalesce(v_pix_payload, '') !~
      '^000201.*BR[.]GOV[.]BCB[.]PIX.*5303986.*5802BR.*6304[0-9A-Fa-f]{4}$'
    or coalesce(v_pix_image, '') !~
      '^data:image/(png|jpeg);base64,(iVBORw0KGgo|/9j/)[A-Za-z0-9+/=]+$'
    or v_remote_status <> 'PENDING'
    or jsonb_typeof(p_result -> 'rawPayload') is distinct from 'object'
    or not (p_result -> 'rawPayload' ? 'request')
    or not (p_result -> 'rawPayload' ? 'response')
  then
    raise exception 'Resultado Banese diverge do contrato BolePix do ciclo.'
      using errcode = '23514';
  end if;

  if v_receivable.gateway_submission_status = 'API_REGISTERED' then
    select transaction.id into v_transaction_id
    from public.payment_gateway_transactions transaction
    where transaction.receivable_id = v_receivable.id
      and transaction.raw_payload -> 'manualCycleIssuance'
        ->> 'attemptToken' = p_expected_creation_token::text
      and transaction.raw_payload -> 'manualCycleIssuance'
        ->> 'authorizationRequestId' = p_authorization_request_id::text
      and transaction.raw_payload -> 'manualCycleIssuance'
        ->> 'resultFingerprint' = v_result_fingerprint;
    if not internal_academic.technical_manual_banese_receivable_complete(
        v_receivable
      )
      or v_receivable.gateway_provider is distinct from
        p_result ->> 'providerCode'
      or v_receivable.gateway_payment_id is distinct from
        p_result ->> 'remotePaymentId'
      or v_receivable.gateway_customer_id is distinct from
        nullif(p_result ->> 'remoteCustomerId', '')
      or v_receivable.gateway_payment_link_id is distinct from
        nullif(p_result ->> 'remotePaymentLinkId', '')
      or v_receivable.gateway_status is distinct from v_remote_status
      or v_receivable.gateway_issuer_polo_id::text is distinct from
        p_result ->> 'issuerPoloId'
      or v_receivable.gateway_invoice_url is distinct from
        nullif(p_result ->> 'invoiceUrl', '')
      or v_receivable.gateway_bank_slip_url is distinct from
        nullif(p_result ->> 'bankSlipUrl', '')
      or v_receivable.gateway_boleto_nosso_numero is distinct from v_our_number
      or v_receivable.gateway_boleto_linha_digitavel is distinct from v_line
      or v_receivable.gateway_boleto_codigo_barras is distinct from v_barcode
      or v_receivable.gateway_pix_payload is distinct from v_pix_payload
      or v_receivable.gateway_pix_encoded_image is distinct from v_pix_image
      or v_receivable.gateway_financial_terms is distinct from
        p_result -> 'financialTerms'
      or v_transaction_id is null
    then
      raise exception 'Replay BolePix não corresponde à emissão persistida.'
        using errcode = '40001';
    end if;
    return jsonb_build_object(
      'success', true, 'replayed', true, 'receivableId', v_receivable.id,
      'cycleNumber', v_run.cycle_number, 'nossoNumero',
      v_receivable.gateway_boleto_nosso_numero,
      'transactionId', v_transaction_id, 'status', 'EMITIDO'
    );
  end if;
  if v_receivable.gateway_creation_token is distinct from
      p_expected_creation_token
    or v_receivable.gateway_status is distinct from 'CREATING'
    or v_receivable.gateway_submission_channel is distinct from 'API'
    or v_receivable.gateway_submission_status is distinct from 'API_AMBIGUOUS'
    or v_receivable.gateway_boleto_nosso_numero is distinct from v_our_number
    or v_receivable.gateway_financial_terms_confirmed_at is not null
    or v_receivable.gateway_boleto_issued_at is not null
    or v_receivable.gateway_payment_id is not null
    or upper(coalesce(v_receivable.status, '')) not in ('PENDENTE', 'VENCIDO')
    or v_receivable.data_pagamento is not null
    or v_receivable.valor_pago is not null
    or v_receivable.manual_settlement_id is not null
    or v_receivable.manual_settlement_principal_cents is not null
    or v_receivable.manual_settlement_interest_cents is not null
    or v_receivable.manual_settlement_penalty_cents is not null
    or v_receivable.manual_settlement_addition_cents is not null
    or v_receivable.manual_settlement_discount_cents is not null
    or v_receivable.manual_settlement_received_cents is not null
    or v_receivable.manual_settlement_reversed_at is not null
    or v_receivable.gateway_settlement_channel is not null
    or v_receivable.gateway_settlement_source is not null
    or v_receivable.gateway_settlement_evidence is not null
    or v_receivable.gateway_settlement_recorded_at is not null
    or v_receivable.gateway_transaction_receipt_url is not null
    or exists (select 1 from public.payment_gateway_transactions transaction
      where transaction.receivable_id = v_receivable.id)
  then
    raise exception 'Ownership ou estado ambíguo mudou antes da persistência.'
      using errcode = 'PT409';
  end if;

  insert into public.payment_gateway_transactions(
    receivable_id, provider_code, environment, payment_method,
    origin_polo_id, issuer_polo_id, installments, remote_payment_id,
    remote_customer_id, remote_payment_link_id, remote_status, amount,
    invoice_url, bank_slip_url, bank_slip_digitable_line, bank_slip_barcode,
    bank_slip_our_number, pix_payload, pix_encoded_image, raw_payload,
    synced_at, updated_at
  ) values (
    v_receivable.id, 'banese_card', 'production', 'BOLETO',
    v_receivable.polo_id, v_receivable.gateway_issuer_polo_id,
    coalesce(v_receivable.gateway_installments, 1), v_our_number,
    nullif(p_result ->> 'remoteCustomerId', ''),
    nullif(p_result ->> 'remotePaymentLinkId', ''), v_remote_status,
    v_receivable.valor, nullif(p_result ->> 'invoiceUrl', ''),
    nullif(p_result ->> 'bankSlipUrl', ''), v_line, v_barcode, v_our_number,
    v_pix_payload, v_pix_image,
    (p_result -> 'rawPayload') || jsonb_build_object(
      'manualCycleIssuance', jsonb_build_object(
        'cycleNumber', v_run.cycle_number,
        'cycleRequestId', v_run.request_id,
        'authorizationRequestId', p_authorization_request_id,
        'attemptToken', p_expected_creation_token,
        'resultFingerprint', v_result_fingerprint,
        'persistedAt', v_now
      )
    ), v_now, v_now
  ) returning id into v_transaction_id;

  perform pg_catalog.set_config(
    'app.technical_manual_cycle_atomic_receivable_id', v_receivable.id::text,
    true
  );
  update public.contas_receber receivable
  set gateway_payment_id = v_our_number,
      gateway_customer_id = nullif(p_result ->> 'remoteCustomerId', ''),
      gateway_payment_link_id = nullif(p_result ->> 'remotePaymentLinkId', ''),
      gateway_status = v_remote_status,
      gateway_invoice_url = nullif(p_result ->> 'invoiceUrl', ''),
      gateway_bank_slip_url = nullif(p_result ->> 'bankSlipUrl', ''),
      gateway_boleto_linha_digitavel = v_line,
      gateway_boleto_codigo_barras = v_barcode,
      gateway_boleto_nosso_numero = v_our_number,
      gateway_pix_payload = v_pix_payload,
      gateway_pix_encoded_image = v_pix_image,
      gateway_financial_terms = v_expected_terms,
      gateway_financial_terms_confirmed_at = v_now,
      gateway_boleto_issued_at = v_now,
      gateway_submission_channel = 'API',
      gateway_submission_status = 'API_REGISTERED',
      gateway_creation_token = null,
      gateway_synced_at = v_now, gateway_last_error = null, updated_at = v_now
  where receivable.id = v_receivable.id
    and receivable.gateway_creation_token = p_expected_creation_token
    and receivable.gateway_submission_status = 'API_AMBIGUOUS'
    and upper(coalesce(receivable.status, '')) in ('PENDENTE', 'VENCIDO')
    and receivable.data_pagamento is null
    and receivable.valor_pago is null
    and receivable.manual_settlement_id is null
    and receivable.manual_settlement_principal_cents is null
    and receivable.manual_settlement_interest_cents is null
    and receivable.manual_settlement_penalty_cents is null
    and receivable.manual_settlement_addition_cents is null
    and receivable.manual_settlement_discount_cents is null
    and receivable.manual_settlement_received_cents is null
    and receivable.manual_settlement_reversed_at is null
    and receivable.gateway_settlement_channel is null
    and receivable.gateway_settlement_source is null
    and receivable.gateway_settlement_evidence is null
    and receivable.gateway_settlement_recorded_at is null
    and receivable.gateway_transaction_receipt_url is null;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'CAS do recebível falhou após inserir a transação.'
      using errcode = '40001';
  end if;
  select receivable.* into strict v_receivable
  from public.contas_receber receivable where receivable.id = p_receivable_id;
  if not internal_academic.technical_manual_banese_receivable_complete(
      v_receivable
    )
  then
    raise exception 'Persistência BolePix não concluiu o contrato estrito.'
      using errcode = '23514';
  end if;
  perform public.registrar_turma_financeiro_auditoria(
    v_receivable.matricula_id, 'CICLO_TECNICO_MANUAL_ITEM_EMITIDO_BANESE',
    jsonb_build_object(
      'receivableId', v_receivable.id, 'cycleNumber', v_run.cycle_number,
      'cycleRequestId', v_run.request_id,
      'authorizationRequestId', p_authorization_request_id,
      'transactionId', v_transaction_id, 'nossoNumero', v_our_number
    ), 'Transação e recebível BolePix persistidos atomicamente.'
  );
  return jsonb_build_object(
    'success', true, 'replayed', false, 'receivableId', v_receivable.id,
    'cycleNumber', v_run.cycle_number, 'nossoNumero', v_our_number,
    'transactionId', v_transaction_id, 'status', 'EMITIDO'
  );
end;
$function$;

revoke all on function
  public.persist_technical_manual_cycle_banese_issuance(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function
  public.persist_technical_manual_cycle_banese_issuance(uuid, uuid, uuid, jsonb)
  to service_role;

comment on function
  public.persist_technical_manual_cycle_banese_issuance(uuid, uuid, uuid, jsonb)
is 'Confirma um item do ciclo manual somente com transação Banese e recebível gravados na mesma transação.';

notify pgrst, 'reload schema';
commit;
