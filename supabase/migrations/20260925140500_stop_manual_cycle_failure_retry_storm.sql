-- Permanent business conflicts must not trigger PostgREST 14 transaction retries.
-- Preserve all authorization, ownership, locks, accounting rules and existing ACL.
CREATE OR REPLACE FUNCTION public.mark_technical_manual_cycle_banese_failure(p_receivable_id uuid, p_authorization_request_id uuid, p_expected_creation_token uuid, p_remote_payment_may_exist boolean, p_retryable_reconciliation boolean, p_diagnostic_code text, p_error text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '5s'
AS $function$
declare
  v_receivable public.contas_receber%rowtype;
  v_run internal_academic.technical_manual_cycle_runs%rowtype;
  v_auth internal_academic.technical_manual_receivable_issuance_authorizations%rowtype;
  v_error text := left(coalesce(nullif(btrim(p_error), ''),
    'Falha não detalhada na emissão BolePix.'), 500);
  v_diagnostic text := left(coalesce(nullif(upper(btrim(p_diagnostic_code)), ''),
    'UNCLASSIFIED'), 80);
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and session_user not in ('postgres', 'supabase_admin', 'service_role')
  then
    raise exception 'Acesso negado à falha controlada do ciclo BolePix.'
      using errcode = '42501';
  end if;
  if p_receivable_id is null or p_authorization_request_id is null
    or p_expected_creation_token is null
    or v_diagnostic !~ '^[A-Z0-9_]+$'
  then
    raise exception 'Parâmetros inválidos para marcar falha BolePix.'
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
    raise exception 'Autorização da tentativa com falha divergiu.'
      using errcode = 'PT409';
  end if;
  if v_receivable.gateway_provider is distinct from 'banese_card'
    or v_receivable.gateway_environment is distinct from 'production'
    or v_receivable.gateway_payment_method is distinct from 'BOLETO'
    or v_receivable.forma_pagamento is distinct from 'BOLETO'
    or internal_academic.technical_manual_banese_has_settlement_evidence(
      v_receivable)
  then
    raise exception 'Rota ou liquidação do recebível divergiu da emissão BolePix.'
      using errcode = 'PT409';
  end if;

  if v_receivable.gateway_submission_status = 'API_REGISTERED' then
    if internal_academic.technical_manual_banese_receivable_complete(
        v_receivable
      ) and exists (
        select 1 from public.payment_gateway_transactions transaction
        where transaction.receivable_id = v_receivable.id
          and transaction.raw_payload -> 'manualCycleIssuance'
            ->> 'attemptToken' = p_expected_creation_token::text
          and transaction.raw_payload -> 'manualCycleIssuance'
            ->> 'authorizationRequestId' = p_authorization_request_id::text
      )
    then
      return jsonb_build_object(
        'success', true, 'alreadyPersisted', true,
        'remotePaymentMayExist', false, 'receivableId', v_receivable.id,
        'cycleNumber', v_run.cycle_number, 'state', 'EMITIDO'
      );
    end if;
    raise exception 'Título registrado não satisfaz o contrato atômico.'
      using errcode = 'PT409';
  end if;
  if v_receivable.gateway_creation_token is distinct from
      p_expected_creation_token
    or v_receivable.gateway_status is distinct from 'CREATING'
    or upper(coalesce(v_receivable.status, '')) not in ('PENDENTE', 'VENCIDO')
  then
    raise exception 'Ownership mudou antes de registrar a falha BolePix.'
      using errcode = 'PT409';
  end if;

  if not coalesce(p_remote_payment_may_exist, false) then
    if v_receivable.gateway_submission_channel is not null
      or v_receivable.gateway_submission_status is not null
      or v_receivable.gateway_payment_id is not null
      or v_receivable.gateway_payment_link_id is not null
      or v_receivable.gateway_invoice_url is not null
      or v_receivable.gateway_bank_slip_url is not null
      or v_receivable.gateway_transaction_receipt_url is not null
      or v_receivable.gateway_boleto_issued_at is not null
      or v_receivable.gateway_boleto_linha_digitavel is not null
      or v_receivable.gateway_boleto_codigo_barras is not null
      or nullif(btrim(coalesce(v_receivable.gateway_pix_payload, '')), '')
        is not null
      or nullif(btrim(coalesce(v_receivable.gateway_pix_encoded_image, '')), '')
        is not null
      or exists (select 1 from public.payment_gateway_transactions transaction
        where transaction.receivable_id = v_receivable.id)
    then
      raise exception 'Estado local não prova ausência de POST remoto.'
        using errcode = 'PT409';
    end if;
    update public.contas_receber receivable
    set gateway_status = null, gateway_creation_token = null,
        gateway_last_error = v_error, updated_at = v_now
    where receivable.id = v_receivable.id
      and receivable.gateway_creation_token = p_expected_creation_token
      and receivable.gateway_submission_status is null;
    if not found then
      raise exception 'CAS da falha pré-remota não foi aplicado.'
        using errcode = 'PT409';
    end if;
  else
    if v_receivable.gateway_submission_channel not in ('API')
        and v_receivable.gateway_submission_channel is not null
      or v_receivable.gateway_submission_status not in ('API_AMBIGUOUS')
        and v_receivable.gateway_submission_status is not null
      or exists (select 1 from public.payment_gateway_transactions transaction
        where transaction.receivable_id = v_receivable.id)
    then
      raise exception 'Estado remoto ambíguo exige revisão sem nova mutação.'
        using errcode = 'PT409';
    end if;
    update public.contas_receber receivable
    set gateway_submission_channel = 'API',
        gateway_submission_status = case
          when coalesce(p_retryable_reconciliation, false)
            then 'API_AMBIGUOUS' else 'API_REVIEW' end,
        gateway_last_error = case
          when coalesce(p_retryable_reconciliation, false)
            then 'CICLO_MANUAL_BANESE_RETRY_' || v_diagnostic || ': '
          else 'CICLO_MANUAL_BANESE_REVISAO_' || v_diagnostic || ': '
        end || v_error,
        updated_at = v_now
    where receivable.id = v_receivable.id
      and receivable.gateway_creation_token = p_expected_creation_token
      and coalesce(receivable.gateway_submission_status, 'API_AMBIGUOUS') =
        'API_AMBIGUOUS';
    if not found then
      raise exception 'CAS da falha remota ambígua não foi aplicado.'
        using errcode = 'PT409';
    end if;
  end if;

  perform public.registrar_turma_financeiro_auditoria(
    v_receivable.matricula_id,
    case when coalesce(p_remote_payment_may_exist, false)
      then 'CICLO_TECNICO_MANUAL_ITEM_BANESE_EM_REVISAO'
      else 'CICLO_TECNICO_MANUAL_ITEM_BANESE_FALHA_PRE_REMOTA'
    end,
    jsonb_build_object(
      'receivableId', v_receivable.id, 'cycleNumber', v_run.cycle_number,
      'cycleRequestId', v_run.request_id,
      'authorizationRequestId', p_authorization_request_id,
      'remotePaymentMayExist', coalesce(p_remote_payment_may_exist, false),
      'retryable', coalesce(p_retryable_reconciliation, false),
      'diagnosticCode', v_diagnostic
    ), 'Falha classificada sem apagar identidade bancária reservada.'
  );
  return jsonb_build_object(
    'success', false, 'alreadyPersisted', false,
    'remotePaymentMayExist', coalesce(p_remote_payment_may_exist, false),
    'receivableId', v_receivable.id, 'cycleNumber', v_run.cycle_number,
    'state', case when coalesce(p_remote_payment_may_exist, false)
      then 'EM_REVISAO' else 'PENDENTE_RETOMADA' end
  );
end;
$function$;
