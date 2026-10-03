begin;

create function public.prepare_receivable_renegotiation_replacements_secure(
  p_operation_id uuid,
  p_lease_token uuid
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_operation public.receivable_renegotiation_activation_operations%rowtype;
  v_agreement public.receivable_renegotiation_agreements%rowtype;
  v_entry jsonb;
  v_policy jsonb;
  v_financial_terms jsonb;
  v_snapshot jsonb;
  v_plan_fingerprint text;
  v_receivable_id uuid;
  v_attempt_key uuid;
  v_sequence integer;
  v_amount_cents bigint;
  v_due_date date;
  v_kind text;
  v_lock_id uuid;
  v_inserted integer := 0;
  v_now timestamptz := clock_timestamp();
  v_today date := (clock_timestamp() at time zone 'America/Maceio')::date;
begin
  perform internal_finance.assert_receivable_renegotiation_worker();
  if p_operation_id is null or p_lease_token is null then
    raise exception 'Identidade da preparação inválida.' using errcode = '22023';
  end if;
  select operation.* into strict v_operation
  from public.receivable_renegotiation_activation_operations operation
  where operation.id = p_operation_id for update;
  if v_operation.state = 'ISSUING_REPLACEMENTS'
    and v_operation.lease_token = p_lease_token
    and v_operation.lease_until > now() then
    return internal_finance.receivable_renegotiation_activation_context(
      v_operation.id
    );
  end if;
  if v_operation.state <> 'CANCELING_SOURCES'
    or v_operation.lease_token is distinct from p_lease_token
    or v_operation.lease_until is null or v_operation.lease_until <= now() then
    raise exception 'Lease da preparação expirado ou divergente.'
      using errcode = 'PT409';
  end if;
  perform internal_finance.assert_receivable_renegotiation_runtime_current(
    v_operation
  );
  for v_lock_id in
    select source.receivable_id
    from public.receivable_renegotiation_activation_sources source
    where source.operation_id = v_operation.id
    order by source.receivable_id
  loop
    perform 1 from public.contas_receber receivable
    where receivable.id = v_lock_id for update nowait;
  end loop;
  for v_lock_id in
    select source.transaction_id
    from public.receivable_renegotiation_activation_sources source
    where source.operation_id = v_operation.id
      and source.transaction_id is not null
    order by source.transaction_id
  loop
    perform 1 from public.payment_gateway_transactions transaction
    where transaction.id = v_lock_id for update nowait;
  end loop;
  if v_operation.snapshot_fingerprint <> internal_finance.receivable_renegotiation_hash(
      v_operation.activation_snapshot
    )
    or jsonb_typeof(v_operation.activation_snapshot -> 'replacementPlan')
      is distinct from 'array'
    or jsonb_array_length(v_operation.activation_snapshot -> 'replacementPlan')
      <> v_operation.replacement_count
    or (select count(*) from public.receivable_renegotiation_activation_sources source
      where source.operation_id = v_operation.id) <> v_operation.source_count
    or (select count(*) from public.receivable_renegotiation_activation_sources source
      where source.operation_id = v_operation.id
        and source.state = 'CANCELED_CONFIRMED') <> v_operation.source_count
    or exists (select 1 from public.receivable_renegotiation_replacements replacement
      where replacement.operation_id = v_operation.id) then
    raise exception 'RENEGOTIATION_SOURCES_NOT_CONFIRMED'
      using errcode = 'PT409';
  end if;
  select agreement.* into strict v_agreement
  from public.receivable_renegotiation_agreements agreement
  where agreement.id = v_operation.agreement_id for update;
  if v_agreement.lifecycle_status <> 'ACTIVATING'
    or v_agreement.proposal_fingerprint <> v_operation.expected_fingerprint
    or v_agreement.canonical_snapshot is distinct from
      v_operation.activation_snapshot -> 'proposalSnapshot' then
    raise exception 'RENEGOTIATION_AGREEMENT_CHANGED' using errcode = '40001';
  end if;
  update public.receivable_renegotiation_activation_operations
  set state = 'ISSUING_REPLACEMENTS', updated_at = v_now
  where id = v_operation.id and state = 'CANCELING_SOURCES';
  perform set_config('app.receivable_renegotiation_operation_id',
    v_operation.id::text, true);
  perform set_config('app.receivable_renegotiation_lease_token',
    p_lease_token::text, true);
  for v_entry in
    select entry from jsonb_array_elements(
      v_operation.activation_snapshot -> 'replacementPlan'
    ) entry order by (entry ->> 'sequence')::integer
  loop
    v_sequence := (v_entry ->> 'sequence')::integer;
    v_amount_cents := (v_entry ->> 'amountCents')::bigint;
    v_due_date := (v_entry ->> 'dueDate')::date;
    v_kind := v_entry ->> 'kind';
    v_financial_terms := v_entry -> 'financialTerms';
    v_policy := v_entry -> 'collectionPolicy';
    if v_sequence not between 0 and 120
      or v_kind not in ('DOWN_PAYMENT', 'INSTALLMENT')
      or v_amount_cents not between 1 and 9000000000000000
      or v_due_date < v_today
      or jsonb_typeof(v_financial_terms) is distinct from 'object'
      or v_financial_terms ->> 'dueDate' is distinct from v_due_date::text
      or round((v_financial_terms ->> 'nominalAmount')::numeric * 100)::bigint
        is distinct from v_amount_cents
      or v_policy #>> '{daysAfterDue}' is distinct from '60'
      or v_policy ->> 'instruction' is distinct from
        'SR.(A) CAIXA: NÃO RECEBER ESTE TÍTULO APÓS 60 (SESSENTA) DIAS DO VENCIMENTO.'
    then
      raise exception 'RENEGOTIATION_REPLACEMENT_PLAN_INVALID'
        using errcode = '23514';
    end if;
    v_receivable_id := gen_random_uuid();
    v_attempt_key := gen_random_uuid();
    v_plan_fingerprint := internal_finance.receivable_renegotiation_hash(
      v_entry
    );
    v_snapshot := jsonb_build_object(
      'version', 1,
      'origin', 'RENEGOTIATION',
      'agreementId', v_operation.agreement_id,
      'operationId', v_operation.id,
      'sequence', v_sequence,
      'receiptPolicy', v_policy,
      'financialTerms', v_financial_terms,
      'planFingerprint', v_plan_fingerprint
    );
    insert into public.receivable_renegotiation_replacements (
      operation_id, agreement_id, receivable_id, sequence, kind, due_date,
      amount_cents, state, attempt_key, financial_terms, collection_policy,
      plan_fingerprint
    ) values (
      v_operation.id, v_operation.agreement_id, v_receivable_id, v_sequence,
      v_kind, v_due_date, v_amount_cents, 'PENDING', v_attempt_key,
      v_financial_terms, v_policy, v_plan_fingerprint
    );
    insert into public.contas_receber (
      id, polo_id, cliente_id, matricula_id, turma_id, descricao, valor,
      data_vencimento, status, categoria, tipo_lancamento, parcela_numero,
      origem_cronograma_id, forma_pagamento, gateway_provider,
      gateway_environment, gateway_payment_method, gateway_status,
      gateway_installments, gateway_issuer_polo_id, gateway_boleto_convenio,
      gateway_boleto_agencia, gateway_financial_terms, gateway_creation_token,
      regra_financeira_renegociacao_snapshot, renegotiation_agreement_id,
      updated_at
    ) values (
      v_receivable_id, v_operation.polo_id, v_operation.aluno_id,
      v_operation.matricula_id, v_operation.turma_id,
      case when v_kind = 'DOWN_PAYMENT' then 'Entrada da renegociação'
        else 'Renegociação - parcela ' || v_sequence::text end,
      v_amount_cents::numeric / 100, v_due_date, 'PENDENTE', 'MENSALIDADE',
      'RENEGOCIACAO', v_sequence,
      'renegotiation:' || v_operation.agreement_id::text || ':' || v_sequence::text,
      'BOLETO', 'banese_card', 'production', 'BOLETO', 'CREATING', 1,
      v_operation.issuer_polo_id, v_operation.gateway_convenio,
      v_operation.gateway_agency, v_financial_terms, v_attempt_key,
      v_snapshot, v_operation.agreement_id, v_now
    );
    v_inserted := v_inserted + 1;
  end loop;
  if v_inserted <> v_operation.replacement_count then
    raise exception 'RENEGOTIATION_REPLACEMENT_COUNT_MISMATCH'
      using errcode = '23514';
  end if;
  return internal_finance.receivable_renegotiation_activation_context(
    v_operation.id
  );
end;
$function$;

revoke all on function public.prepare_receivable_renegotiation_replacements_secure(
  uuid, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.prepare_receivable_renegotiation_replacements_secure(
  uuid, uuid
) to service_role;

commit;
