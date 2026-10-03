begin;

create function public.start_receivable_renegotiation_activation_secure(
  p_agreement_id uuid,
  p_request_id uuid,
  p_expected_version bigint,
  p_expected_fingerprint text,
  p_confirm boolean,
  p_approve_custom_terms boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_agreement public.receivable_renegotiation_agreements%rowtype;
  v_existing public.receivable_renegotiation_activation_operations%rowtype;
  v_operation public.receivable_renegotiation_activation_operations%rowtype;
  v_source_item public.receivable_renegotiation_source_items%rowtype;
  v_receivable public.contas_receber%rowtype;
  v_transaction public.payment_gateway_transactions%rowtype;
  v_runtime jsonb;
  v_plan jsonb;
  v_activation_snapshot jsonb;
  v_custom_terms_approval jsonb := jsonb_build_object('approved', false);
  v_payload jsonb;
  v_payload_hash text;
  v_capabilities jsonb;
  v_kind text;
  v_source_count integer := 0;
  v_transaction_count integer;
  v_transaction_id uuid;
  v_payer_document text;
  v_bank_snapshot jsonb;
  v_bank_fingerprint text;
  v_current_fingerprint text;
  v_now timestamptz := clock_timestamp();
  v_today date := (clock_timestamp() at time zone 'America/Maceio')::date;
begin
  if p_agreement_id is null or p_request_id is null
    or p_expected_version is null or p_expected_version < 1
    or coalesce(p_expected_fingerprint, '') !~ '^[0-9a-f]{64}$'
    or p_confirm is distinct from true or p_approve_custom_terms is null then
    raise exception 'Payload de ativação inválido.' using errcode = '22023';
  end if;
  perform internal_finance.assert_receivable_renegotiation_identity();
  v_payload := jsonb_build_object(
    'agreementId', p_agreement_id,
    'expectedVersion', p_expected_version,
    'expectedFingerprint', p_expected_fingerprint,
    'confirm', p_confirm,
    'approveCustomTerms', p_approve_custom_terms
  );
  v_payload_hash := internal_finance.receivable_renegotiation_hash(v_payload);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_id::text, 0)
  );
  select operation.* into v_existing
  from public.receivable_renegotiation_activation_operations operation
  where operation.request_id = p_request_id for update;
  if found then
    perform internal_finance.assert_receivable_renegotiation_scope(
      v_existing.polo_id
    );
    if p_approve_custom_terms and not
      internal_finance.can_approve_receivable_renegotiation_terms(v_existing.polo_id)
    then
      raise exception 'RENEGOTIATION_APPROVAL_REQUIRED' using errcode = '42501';
    end if;
    if v_existing.agreement_id is distinct from p_agreement_id
      or v_existing.actor_id is distinct from auth.uid()
      or v_existing.payload_hash <> v_payload_hash then
      raise exception 'Chave de idempotência reutilizada com outro payload.'
        using errcode = '22023';
    end if;
    return jsonb_build_object(
      'operationId', v_existing.id,
      'agreementId', v_existing.agreement_id,
      'requestId', v_existing.request_id,
      'state', v_existing.state,
      'approvedCustomTerms', coalesce(
        v_existing.activation_snapshot #> '{customTermsApproval,approved}' = 'true'::jsonb,
        false
      ),
      'replayed', true,
      'version', (select agreement.version
        from public.receivable_renegotiation_agreements agreement
        where agreement.id = v_existing.agreement_id)
    );
  end if;

  select agreement.* into v_agreement
  from public.receivable_renegotiation_agreements agreement
  where agreement.id = p_agreement_id
    and (coalesce(auth.jwt() ->> 'role', '') = 'service_role'
      or public.can_read_receivable_renegotiation_for_polo(agreement.polo_id))
  for update;
  if not found then
    raise exception 'Proposta indisponível no escopo autorizado.'
      using errcode = '42501';
  end if;
  perform internal_finance.assert_receivable_renegotiation_scope(v_agreement.polo_id);
  if exists (
    select 1 from public.receivable_renegotiation_activation_operations operation
    where operation.agreement_id = p_agreement_id
  ) then
    raise exception 'RENEGOTIATION_ACTIVATION_ALREADY_STARTED'
      using errcode = '40001';
  end if;
  if v_agreement.lifecycle_status <> 'PROPOSED'
    or v_agreement.version is distinct from p_expected_version
    or v_agreement.proposal_fingerprint <> p_expected_fingerprint then
    raise exception 'RENEGOTIATION_PROPOSAL_STALE' using errcode = '40001';
  end if;
  perform internal_finance.assert_receivable_renegotiation_activation_snapshot(
    v_agreement.canonical_snapshot, v_agreement.negotiated_cents
  );
  if (v_agreement.canonical_snapshot ->> 'requiresApproval')::boolean then
    if not p_approve_custom_terms or not
      internal_finance.can_approve_receivable_renegotiation_terms(v_agreement.polo_id)
    then
      raise exception 'RENEGOTIATION_APPROVAL_REQUIRED' using errcode = '42501';
    end if;
    if nullif(btrim(v_agreement.reason), '') is null then
      raise exception 'RENEGOTIATION_JUSTIFICATION_REQUIRED' using errcode = '22023';
    end if;
    v_custom_terms_approval := jsonb_build_object(
      'approved', true, 'authority', 'FINANCEIRO', 'actorId', auth.uid(),
      'approvedAt', v_now,
      'proposalFingerprint', v_agreement.proposal_fingerprint,
      'approvalReasons', v_agreement.canonical_snapshot -> 'approvalReasons',
      'reason', v_agreement.reason
    );
  elsif p_approve_custom_terms then
    raise exception 'A proposta não possui termos personalizados para aprovação.'
      using errcode = '22023';
  end if;

  v_runtime := internal_finance.receivable_renegotiation_activation_runtime(
    v_agreement.turma_id
  );
  select regexp_replace(coalesce(partner.cpf_cnpj, ''), '\D', '', 'g')
  into v_payer_document
  from public.parceiros partner where partner.id = v_agreement.aluno_id;
  if length(v_payer_document) not in (11, 14) then
    raise exception 'RENEGOTIATION_PAYER_IDENTITY_INVALID'
      using errcode = '23514';
  end if;
  select jsonb_agg(
    entry || jsonb_build_object(
      'collectionPolicy', v_agreement.policy_snapshot -> 'receiptPolicy'
    ) order by (entry ->> 'sequence')::integer
  ) into v_plan
  from jsonb_array_elements(
    v_agreement.canonical_snapshot #> '{schedule,entries}'
  ) entry;
  if exists (
    select 1 from jsonb_array_elements(v_plan) entry
    where (entry ->> 'dueDate')::date < v_today
  ) then
    raise exception 'RENEGOTIATION_REPLACEMENT_DUE_DATE_PAST'
      using errcode = '23514';
  end if;
  v_activation_snapshot := jsonb_build_object(
    'version', 1,
    'proposalFingerprint', v_agreement.proposal_fingerprint,
    'proposalSnapshot', v_agreement.canonical_snapshot,
    'customTermsApproval', v_custom_terms_approval,
    'payerDocument', v_payer_document,
    'runtime', v_runtime,
    'replacementPlan', v_plan
  );
  insert into public.receivable_renegotiation_activation_operations (
    agreement_id, request_id, company_id, polo_id, aluno_id, matricula_id,
    turma_id, actor_id, state, expected_version, expected_fingerprint,
    payload_hash, course_type, route_id, credential_id, issuer_polo_id,
    gateway_environment, gateway_convenio, gateway_agency, gateway_account,
    gateway_runtime_snapshot, gateway_runtime_fingerprint,
    activation_snapshot, snapshot_fingerprint, source_count, replacement_count
  ) values (
    v_agreement.id, p_request_id, v_agreement.company_id, v_agreement.polo_id,
    v_agreement.aluno_id, v_agreement.matricula_id, v_agreement.turma_id,
    auth.uid(), 'CANCELING_SOURCES', p_expected_version,
    p_expected_fingerprint, v_payload_hash, v_runtime ->> 'courseType',
    (v_runtime ->> 'routeId')::uuid, (v_runtime ->> 'credentialId')::uuid,
    (v_runtime ->> 'issuerPoloId')::uuid, v_runtime ->> 'environment',
    v_runtime ->> 'convenio', v_runtime ->> 'agency', v_runtime ->> 'account',
    v_runtime, v_runtime ->> 'fingerprint', v_activation_snapshot,
    internal_finance.receivable_renegotiation_hash(v_activation_snapshot),
    v_agreement.source_count, jsonb_array_length(v_plan)
  ) returning * into v_operation;

  for v_source_item in
    select source.*
    from public.receivable_renegotiation_source_items source
    where source.agreement_id = v_agreement.id
    order by source.receivable_id
    for update
  loop
    v_source_count := v_source_count + 1;
    select receivable.* into strict v_receivable
    from public.contas_receber receivable
    where receivable.id = v_source_item.receivable_id for update;
    v_current_fingerprint :=
      internal_finance.receivable_renegotiation_current_source_fingerprint(
        v_receivable, v_source_item.source_snapshot
      );
    if v_source_item.released_at is not null
      or v_current_fingerprint <> v_source_item.source_fingerprint
      or v_receivable.status is null
      or v_receivable.status not in ('PENDENTE', 'VENCIDO')
      or v_receivable.data_pagamento is not null
      or coalesce(v_receivable.valor_pago, 0) <> 0
      or v_receivable.manual_settlement_id is not null
      or v_receivable.gateway_settlement_recorded_at is not null
      or exists (select 1 from internal_proesc.obligation_links link
        where link.receivable_id = v_receivable.id)
      or exists (select 1 from public.banese_cancellation_outbox job
        where job.receivable_id = v_receivable.id and job.state <> 'DONE')
    then
      raise exception 'RENEGOTIATION_SOURCE_CHANGED' using errcode = '40001';
    end if;
    v_capabilities := internal_academic.receivable_operation_capabilities(
      v_receivable
    );
    v_kind := v_capabilities ->> 'sourceSystem';
    if v_kind is null or v_kind not in ('LOCAL', 'BANESE')
      or v_kind is distinct from v_source_item.source_snapshot ->> 'sourceSystem'
    then
      raise exception 'RENEGOTIATION_SOURCE_UNSUPPORTED' using errcode = '23514';
    end if;

    v_bank_snapshot := null;
    v_bank_fingerprint := null;
    v_transaction_id := null;
    if v_kind = 'BANESE' then
      if not coalesce((v_capabilities ->> 'canCancel')::boolean, false)
        or v_capabilities ->> 'provenanceKind' is distinct from 'NATIVE_ISSUED'
        or v_receivable.gateway_provider is distinct from 'banese_card'
        or v_receivable.gateway_environment is distinct from 'production'
        or v_receivable.gateway_payment_method is distinct from 'BOLETO'
        or v_receivable.gateway_submission_channel is distinct from 'API'
        or v_receivable.gateway_submission_status is distinct from 'API_REGISTERED'
        or upper(coalesce(v_receivable.gateway_status, ''))
          not in ('PENDING', 'REGISTERED')
        or v_receivable.gateway_issuer_polo_id is distinct from
          (v_runtime ->> 'issuerPoloId')::uuid
        or v_receivable.gateway_boleto_convenio is distinct from
          v_runtime ->> 'convenio'
        or v_receivable.gateway_boleto_agencia is distinct from
          v_runtime ->> 'agency'
        or coalesce(v_receivable.gateway_boleto_nosso_numero, '')
          !~ '^[0-9]{9}$'
        or v_receivable.gateway_payment_id is distinct from
          v_receivable.gateway_boleto_nosso_numero
        or coalesce(v_receivable.gateway_boleto_linha_digitavel, '')
          !~ '^[0-9]{47}$'
        or coalesce(v_receivable.gateway_boleto_codigo_barras, '')
          !~ '^[0-9]{44}$'
        or jsonb_typeof(v_receivable.gateway_financial_terms)
          is distinct from 'object'
        or v_receivable.gateway_financial_terms_confirmed_at is null
      then
        raise exception 'RENEGOTIATION_BANK_SOURCE_UNVERIFIED'
          using errcode = '23514';
      end if;
      select count(*)::integer into v_transaction_count
      from public.payment_gateway_transactions transaction
      where transaction.receivable_id = v_receivable.id;
      if v_transaction_count <> 1 then
        raise exception 'RENEGOTIATION_BANK_TRANSACTION_UNVERIFIED'
          using errcode = '23514';
      end if;
      select transaction.* into strict v_transaction
      from public.payment_gateway_transactions transaction
      where transaction.receivable_id = v_receivable.id for update;
      if v_transaction.provider_code is distinct from 'banese_card'
        or v_transaction.environment is distinct from 'production'
        or v_transaction.payment_method is distinct from 'BOLETO'
        or v_transaction.remote_payment_id is distinct from
          v_receivable.gateway_boleto_nosso_numero
        or v_transaction.bank_slip_our_number is distinct from
          v_receivable.gateway_boleto_nosso_numero
        or v_transaction.bank_slip_digitable_line is distinct from
          v_receivable.gateway_boleto_linha_digitavel
        or v_transaction.bank_slip_barcode is distinct from
          v_receivable.gateway_boleto_codigo_barras
        or round(v_transaction.amount, 2) is distinct from
          round(v_receivable.valor, 2)
        or upper(coalesce(v_transaction.remote_status, ''))
          not in ('PENDING', 'REGISTERED')
        or v_transaction.origin_polo_id is distinct from v_agreement.polo_id
        or v_transaction.issuer_polo_id is distinct from
          (v_runtime ->> 'issuerPoloId')::uuid
      then
        raise exception 'RENEGOTIATION_BANK_TRANSACTION_UNVERIFIED'
          using errcode = '23514';
      end if;
      v_bank_snapshot := jsonb_build_object(
        'provider', 'banese_card', 'environment', 'production',
        'paymentMethod', 'BOLETO',
        'credentialId', v_runtime ->> 'credentialId',
        'issuerPoloId', v_runtime ->> 'issuerPoloId',
        'convenio', v_receivable.gateway_boleto_convenio,
        'nossoNumero', v_receivable.gateway_boleto_nosso_numero,
        'amount', v_receivable.valor, 'dueDate', v_receivable.data_vencimento,
        'agency', v_receivable.gateway_boleto_agencia,
        'account', v_runtime ->> 'account',
        'documentNumber', left(v_receivable.id::text, 15),
        'companyTitleId', left(v_receivable.id::text, 25),
        'payerDocument', v_payer_document,
        'digitableLine', v_receivable.gateway_boleto_linha_digitavel,
        'barcode', v_receivable.gateway_boleto_codigo_barras,
        'financialTerms', v_receivable.gateway_financial_terms
      );
      v_bank_fingerprint := internal_finance.receivable_renegotiation_hash(
        v_bank_snapshot
      );
      v_transaction_id := v_transaction.id;
    elsif v_receivable.gateway_provider is not null
      or v_receivable.gateway_payment_id is not null
      or v_receivable.gateway_boleto_nosso_numero is not null
      or v_receivable.gateway_submission_status is not null
      or exists (select 1 from public.payment_gateway_transactions transaction
        where transaction.receivable_id = v_receivable.id) then
      raise exception 'RENEGOTIATION_LOCAL_SOURCE_HAS_BANK_LINK'
        using errcode = '23514';
    end if;

    insert into public.receivable_renegotiation_activation_sources (
      operation_id, source_item_id, receivable_id, position, kind, state,
      attempt_key, source_fingerprint, source_snapshot, bank_snapshot,
      bank_snapshot_fingerprint, transaction_id
    ) values (
      v_operation.id, v_source_item.id, v_receivable.id,
      v_source_item.position, v_kind, 'PENDING', gen_random_uuid(),
      v_source_item.source_fingerprint, v_source_item.source_snapshot,
      v_bank_snapshot, v_bank_fingerprint, v_transaction_id
    );
  end loop;
  if v_source_count <> v_agreement.source_count then
    raise exception 'RENEGOTIATION_SOURCE_COUNT_MISMATCH' using errcode = '23514';
  end if;

  update public.receivable_renegotiation_agreements
  set lifecycle_status = 'ACTIVATING', version = version + 1,
      activation_started_at = v_now, updated_at = v_now
  where id = v_agreement.id and lifecycle_status = 'PROPOSED'
    and version = p_expected_version
  returning * into v_agreement;
  if not found then
    raise exception 'RENEGOTIATION_PROPOSAL_STALE' using errcode = '40001';
  end if;
  insert into public.receivable_renegotiation_events (
    agreement_id, polo_id, event_type, from_lifecycle_status,
    to_lifecycle_status, version, actor_id, request_id, payload_hash, details
  ) values (
    v_agreement.id, v_agreement.polo_id, 'ACTIVATION_STARTED', 'PROPOSED',
    'ACTIVATING', v_agreement.version, auth.uid(), p_request_id, v_payload_hash,
    jsonb_build_object('operationId', v_operation.id,
      'sourceCount', v_operation.source_count,
      'replacementCount', v_operation.replacement_count,
      'customTermsApproval', v_custom_terms_approval)
  );
  return jsonb_build_object(
    'operationId', v_operation.id, 'agreementId', v_operation.agreement_id,
    'requestId', v_operation.request_id, 'state', v_operation.state,
    'approvedCustomTerms', p_approve_custom_terms,
    'replayed', false, 'version', v_agreement.version
  );
end;
$function$;

revoke all on function public.start_receivable_renegotiation_activation_secure(
  uuid, uuid, bigint, text, boolean, boolean
) from public, anon, authenticated, service_role;
grant execute on function public.start_receivable_renegotiation_activation_secure(
  uuid, uuid, bigint, text, boolean, boolean
) to authenticated, service_role;

comment on function public.start_receivable_renegotiation_activation_secure(
  uuid, uuid, bigint, text, boolean, boolean
) is 'Autoriza, revalida e cerca a ativação; ainda não cancela nem emite títulos.';

commit;
