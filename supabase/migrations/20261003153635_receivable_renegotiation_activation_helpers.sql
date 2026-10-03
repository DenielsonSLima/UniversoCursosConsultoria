begin;

create function internal_finance.can_approve_receivable_renegotiation_terms(
  p_polo_id uuid
) returns boolean language sql stable security invoker set search_path = '' as $function$
  -- Acesso efetivo existente: Financeiro/Receber, polo, identidade e horário.
  -- Não usa is_financeiro_operador(), pois essa permissão também inclui Caixa.
  select auth.uid() is not null
    and coalesce(auth.jwt() ->> 'role', '') = 'authenticated'
    and coalesce(public.can_read_receivable_renegotiation_for_polo(p_polo_id), false);
$function$;

create function internal_finance.receivable_renegotiation_activation_runtime(
  p_turma_id uuid
) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_modality text;
  v_course_type text;
  v_route public.payment_gateway_routes%rowtype;
  v_route_count integer;
  v_metadata jsonb;
  v_issuer_id uuid;
  v_convenio text;
  v_agency text;
  v_account text;
  v_metadata_fingerprint text;
  v_runtime jsonb;
begin
  select translate(upper(btrim(course.modalidade)), 'ÁÉÍÓÚÃÕÇ', 'AEIOUAOC')
  into v_modality
  from public.turmas class
  join public.cursos course on course.id = class.curso_id
  where class.id = p_turma_id;
  v_course_type := case v_modality
    when 'TECNICO' then 'TECNICO'
    when 'LIVRE' then 'LIVRE'
    when 'ESPECIALIZACAO' then 'ESPECIALIZACAO'
    else null end;
  if v_course_type is null then
    raise exception 'RENEGOTIATION_UNSUPPORTED_COURSE_TYPE'
      using errcode = '23514';
  end if;
  select count(*)::integer into v_route_count
  from public.payment_gateway_routes route
  where translate(upper(btrim(route.modalidade)), 'ÁÉÍÓÚÃÕÇ', 'AEIOUAOC')
      = v_course_type
    and route.payment_method = 'BOLETO'
    and route.environment = 'production'
    and route.provider_code = 'banese_card'
    and route.enabled;
  if v_route_count <> 1 then
    raise exception 'RENEGOTIATION_GATEWAY_ROUTE_UNAVAILABLE'
      using errcode = '55000';
  end if;
  select route.* into strict v_route
  from public.payment_gateway_routes route
  where translate(upper(btrim(route.modalidade)), 'ÁÉÍÓÚÃÕÇ', 'AEIOUAOC')
      = v_course_type
    and route.payment_method = 'BOLETO'
    and route.environment = 'production'
    and route.provider_code = 'banese_card'
    and route.enabled;
  if v_route.credential_id is null then
    raise exception 'RENEGOTIATION_GATEWAY_CREDENTIAL_UNAVAILABLE'
      using errcode = '55000';
  end if;
  select credential.metadata into v_metadata
  from public.payment_gateway_credentials credential
  where credential.id = v_route.credential_id
    and credential.provider_code = 'banese_card'
    and credential.environment = 'production';
  if jsonb_typeof(v_metadata) is distinct from 'object' then
    raise exception 'RENEGOTIATION_GATEWAY_CREDENTIAL_UNAVAILABLE'
      using errcode = '55000';
  end if;
  select config.issuer_polo_id into v_issuer_id
  from public.payment_gateway_issuer_config config
  join public.polos issuer on issuer.id = config.issuer_polo_id
  where config.id = 1 and config.active and config.applies_to_all_polos
    and issuer.is_matriz and lower(issuer.status) = 'ativo';
  v_convenio := regexp_replace(coalesce(
    v_metadata ->> 'baneseBoletoConvenio',
    v_metadata ->> 'baneseConvenio', ''
  ), '\D', '', 'g');
  v_agency := lpad(regexp_replace(coalesce(
    v_metadata ->> 'baneseAgencia', ''
  ), '\D', '', 'g'), 3, '0');
  v_account := regexp_replace(coalesce(
    v_metadata ->> 'baneseConta',
    v_metadata ->> 'baneseContaDisplay', ''
  ), '\D', '', 'g');
  if v_issuer_id is null or v_convenio !~ '^[0-9]+$'
    or v_agency !~ '^[0-9]{3}$' or v_agency = '000'
    or v_account !~ '^[0-9]{9}$' then
    raise exception 'RENEGOTIATION_GATEWAY_RUNTIME_INVALID'
      using errcode = '55000';
  end if;
  v_metadata_fingerprint := internal_finance.receivable_renegotiation_hash(
    v_metadata
  );
  v_runtime := jsonb_build_object(
    'routeId', v_route.id,
    'credentialId', v_route.credential_id,
    'issuerPoloId', v_issuer_id,
    'environment', 'production',
    'convenio', v_convenio,
    'agency', v_agency,
    'account', v_account,
    'metadata', v_metadata,
    'metadataFingerprint', v_metadata_fingerprint,
    'courseType', v_course_type
  );
  return v_runtime || jsonb_build_object(
    'fingerprint', internal_finance.receivable_renegotiation_hash(v_runtime)
  );
end;
$function$;

create function internal_finance.receivable_renegotiation_current_source_fingerprint(
  p_receivable public.contas_receber,
  p_source_snapshot jsonb
) returns text language sql stable security invoker set search_path = '' as $function$
  select internal_finance.receivable_renegotiation_hash(jsonb_build_object(
    'receivableId', p_receivable.id,
    'status', p_receivable.status,
    'dueDate', p_receivable.data_vencimento,
    'principalCents', round(p_receivable.valor * 100)::bigint,
    'paidAt', p_receivable.data_pagamento,
    'paidCents', round(coalesce(p_receivable.valor_pago, 0) * 100)::bigint,
    'updatedAtUtc', pg_catalog.to_char(
      p_receivable.updated_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'sourcePolicy', p_source_snapshot -> 'sourcePolicySnapshot',
    'sourceSystem', p_source_snapshot ->> 'sourceSystem'
  ));
$function$;

create function internal_finance.assert_receivable_renegotiation_activation_snapshot(
  p_snapshot jsonb,
  p_negotiated_cents bigint
) returns void language plpgsql immutable security invoker set search_path = '' as $function$
declare
  v_entries jsonb;
  v_policy jsonb;
  v_instruction constant text :=
    'SR.(A) CAIXA: NÃO RECEBER ESTE TÍTULO APÓS 60 (SESSENTA) DIAS DO VENCIMENTO.';
  v_count integer;
  v_sum numeric;
begin
  v_entries := p_snapshot #> '{schedule,entries}';
  v_policy := p_snapshot #> '{policySnapshot,receiptPolicy}';
  if jsonb_typeof(p_snapshot) is distinct from 'object'
    or p_snapshot ->> 'version' is distinct from '2'
    or jsonb_typeof(v_entries) is distinct from 'array'
    or jsonb_array_length(v_entries) not between 1 and 120
    or p_snapshot #>> '{schedule,cadence}' is null
    or p_snapshot #>> '{schedule,cadence}' not in ('MONTHLY', 'FIXED_DAYS')
    or v_policy ->> 'daysAfterDue' is distinct from '60'
    or v_policy ->> 'instruction' is distinct from v_instruction
    or jsonb_typeof(p_snapshot -> 'requiresApproval') is distinct from 'boolean'
    or jsonb_typeof(p_snapshot -> 'approvalReasons') is distinct from 'array'
  then
    raise exception 'RENEGOTIATION_ACTIVATION_SNAPSHOT_INVALID'
      using errcode = '23514';
  end if;
  select count(*)::integer, sum((entry ->> 'amountCents')::numeric)
  into v_count, v_sum
  from jsonb_array_elements(v_entries) entry
  where jsonb_typeof(entry) = 'object'
    and coalesce(entry ->> 'sequence', '') ~ '^[0-9]+$'
    and entry ->> 'kind' in ('DOWN_PAYMENT', 'INSTALLMENT')
    and coalesce(entry ->> 'amountCents', '') ~ '^[0-9]+$'
    and (entry ->> 'amountCents')::numeric between 1 and 9000000000000000
    and coalesce(entry ->> 'dueDate', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    and jsonb_typeof(entry -> 'financialTerms') = 'object'
    and coalesce(entry #>> '{financialTerms,nominalAmount}', '')
      ~ '^[0-9]+([.][0-9]+)?$'
    and round((entry #>> '{financialTerms,nominalAmount}')::numeric * 100)::bigint
      = (entry ->> 'amountCents')::bigint
    and entry #>> '{financialTerms,dueDate}' = entry ->> 'dueDate';
  if v_count <> jsonb_array_length(v_entries)
    or v_sum is distinct from p_negotiated_cents::numeric
    or (select count(distinct entry ->> 'sequence')
      from jsonb_array_elements(v_entries) entry) <> v_count
  then
    raise exception 'RENEGOTIATION_ACTIVATION_SCHEDULE_INVALID'
      using errcode = '23514';
  end if;
end;
$function$;

revoke all on function
  internal_finance.can_approve_receivable_renegotiation_terms(uuid),
  internal_finance.receivable_renegotiation_activation_runtime(uuid),
  internal_finance.receivable_renegotiation_current_source_fingerprint(
    public.contas_receber, jsonb
  ),
  internal_finance.assert_receivable_renegotiation_activation_snapshot(jsonb, bigint)
  from public, anon, authenticated, service_role;

do $do$
begin
  if to_regprocedure(
    'internal_academic.guard_nontechnical_single_plan_receivable_snapshot()'
  ) is not null then
    execute 'drop trigger if exists guard_nontechnical_single_plan_receivable_snapshot on public.contas_receber';
    execute 'create trigger guard_nontechnical_single_plan_receivable_snapshot '
      || 'before insert or update on public.contas_receber for each row '
      || 'when (new.regra_financeira_renegociacao_snapshot is null) execute function '
      || 'internal_academic.guard_nontechnical_single_plan_receivable_snapshot()';
    execute 'create trigger guard_nontechnical_single_plan_receivable_snapshot_delete '
      || 'before delete on public.contas_receber for each row execute function '
      || 'internal_academic.guard_nontechnical_single_plan_receivable_snapshot()';
  end if;
  if to_regprocedure(
    'internal_academic.guard_manual_technical_receivable_first_bank_claim()'
  ) is not null then
    execute 'drop trigger if exists guard_manual_technical_receivable_first_bank_claim on public.contas_receber';
    execute 'create trigger guard_manual_technical_receivable_first_bank_claim '
      || 'before update of gateway_creation_token,gateway_cnab_file_id,'
      || 'gateway_submission_channel,gateway_submission_status on public.contas_receber '
      || 'for each row when (new.regra_financeira_renegociacao_snapshot is null) '
      || 'execute function internal_academic.guard_manual_technical_receivable_first_bank_claim()';
  end if;
  if to_regprocedure('internal_academic.guard_protected_technical_bank_post()')
    is not null then
    execute 'drop trigger if exists guard_protected_technical_bank_post on public.contas_receber';
    execute 'create trigger guard_protected_technical_bank_post '
      || 'before update of gateway_creation_token,gateway_cnab_file_id,'
      || 'gateway_submission_channel,gateway_submission_status on public.contas_receber '
      || 'for each row when (new.regra_financeira_renegociacao_snapshot is null) '
      || 'execute function internal_academic.guard_protected_technical_bank_post()';
  end if;
end;
$do$;

commit;
