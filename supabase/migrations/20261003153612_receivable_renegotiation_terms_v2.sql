begin;

create or replace function internal_finance.build_receivable_renegotiation_snapshot(
  p_receivable_ids uuid[],
  p_terms jsonb default '{}'::jsonb,
  p_policy_overrides jsonb default '{}'::jsonb,
  p_as_of date default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_ids uuid[];
  v_terms_input jsonb := coalesce(p_terms, '{}'::jsonb);
  v_overrides_input jsonb := coalesce(p_policy_overrides, '{}'::jsonb);
  v_as_of date := coalesce(
    p_as_of, (pg_catalog.timezone('America/Maceio', pg_catalog.now()))::date
  );
  v_unknown text;
  v_source_items jsonb;
  v_source_count integer;
  v_polo_id uuid;
  v_aluno_id uuid;
  v_matricula_id uuid;
  v_turma_id uuid;
  v_policy_kind text;
  v_identity jsonb;
  v_principal bigint;
  v_interest bigint;
  v_penalty bigint;
  v_gross bigint;
  v_waived_interest bigint;
  v_waived_penalty bigint;
  v_commercial_discount bigint;
  v_target bigint;
  v_cadence text;
  v_interval_days integer;
  v_negotiated bigint;
  v_down_payment bigint;
  v_financed bigint;
  v_installment_count integer;
  v_first_due date;
  v_default_policy jsonb;
  v_effective_policy jsonb;
  v_provenance jsonb;
  v_normalized_overrides jsonb := '{}'::jsonb;
  v_normalized_terms jsonb;
  v_penalty_override jsonb;
  v_override_bps integer;
  v_override_cents bigint;
  v_schedule jsonb;
  v_min_installment bigint;
  v_reasons jsonb := '[]'::jsonb;
  v_policy_snapshot jsonb;
  v_calculation jsonb;
  v_totals jsonb;
  v_selection_fingerprint text;
  v_policy_fingerprint text;
  v_calculation_fingerprint text;
  v_proposal_fingerprint text;
begin
  if not pg_catalog.isfinite(v_as_of)
    or jsonb_typeof(v_terms_input) <> 'object'
    or jsonb_typeof(v_overrides_input) <> 'object'
  then
    raise exception using errcode = '22023', message = 'RENEGOTIATION_INVALID_TERMS';
  end if;
  select key into v_unknown from jsonb_object_keys(v_terms_input) key
  where key not in (
    'commercialDiscountCents', 'downPaymentCents',
    'installmentCount', 'firstDueDate', 'targetNegotiatedCents', 'cadence', 'intervalDays'
  ) limit 1;
  if v_unknown is not null then
    raise exception using errcode = '22023', message = 'RENEGOTIATION_INVALID_TERMS',
      detail = pg_catalog.format('Termo não suportado: %s.', v_unknown);
  end if;
  select key into v_unknown from jsonb_object_keys(v_overrides_input) key
  where key not in (
    'punctualDiscountCents', 'monthlyInterestBasisPoints', 'penalty',
    'waivedInterestCents', 'waivedPenaltyCents'
  ) limit 1;
  if v_unknown is not null then
    raise exception using errcode = '22023', message = 'RENEGOTIATION_INVALID_TERMS',
      detail = pg_catalog.format('Exceção financeira não suportada: %s.', v_unknown);
  end if;

  if v_terms_input ? 'targetNegotiatedCents' and v_terms_input ? 'commercialDiscountCents' then
    raise exception using errcode = '22023', message = 'RENEGOTIATION_CONFLICTING_AMOUNT_INPUTS';
  end if;
  v_cadence := coalesce(v_terms_input ->> 'cadence', 'MONTHLY');
  if v_terms_input ? 'cadence' and v_terms_input ->> 'cadence' is null then
    raise exception using errcode = '22023', message = 'RENEGOTIATION_INVALID_CADENCE';
  end if;
  if v_terms_input ? 'intervalDays' then
    if coalesce(v_terms_input ->> 'intervalDays', '') !~ '^[0-9]+$'
      or (v_terms_input ->> 'intervalDays')::numeric not between 1 and 365 then
      raise exception using errcode = '22023', message = 'RENEGOTIATION_INVALID_CADENCE';
    end if;
    v_interval_days := (v_terms_input ->> 'intervalDays')::integer;
  end if;

  v_ids := internal_finance.normalize_receivable_renegotiation_ids(p_receivable_ids);
  with calculated as (
    select selected.id, internal_finance.receivable_renegotiation_source_item(
      selected.id, v_as_of
    ) as item
    from unnest(v_ids) selected(id)
  ), positioned as (
    select item,
      row_number() over (
        order by (item ->> 'dueDate')::date,
          (item ->> 'number')::integer nulls last, id
      )::integer as position
    from calculated
  )
  select jsonb_agg(
    item || jsonb_build_object('position', position) order by position
  ) into v_source_items from positioned;
  v_source_count := jsonb_array_length(v_source_items);

  select
    (array_agg(receivable.polo_id order by receivable.id))[1],
    (array_agg(receivable.cliente_id order by receivable.id))[1],
    (array_agg(receivable.matricula_id order by receivable.id))[1],
    (array_agg(receivable.turma_id order by receivable.id))[1]
  into v_polo_id, v_aluno_id, v_matricula_id, v_turma_id
  from public.contas_receber receivable where receivable.id = any(v_ids)
  having count(distinct receivable.polo_id) = 1
    and count(distinct receivable.cliente_id) = 1
    and count(distinct receivable.matricula_id) = 1
    and count(distinct receivable.turma_id) = 1;
  if v_matricula_id is null then
    raise exception using errcode = '23514', message = 'RENEGOTIATION_MIXED_IDENTITY',
      detail = 'Todas as parcelas devem pertencer à mesma matrícula, aluno, turma e polo.';
  end if;
  select count(distinct item ->> 'policyKind'), min(item ->> 'policyKind')
  into v_override_bps, v_policy_kind
  from jsonb_array_elements(v_source_items) item;
  if v_override_bps <> 1 then
    raise exception using errcode = '23514', message = 'RENEGOTIATION_MIXED_IDENTITY';
  end if;
  v_identity := jsonb_build_object(
    'poloId', v_polo_id, 'alunoId', v_aluno_id,
    'matriculaId', v_matricula_id, 'turmaId', v_turma_id
  );
  v_default_policy := internal_finance.resolve_receivable_renegotiation_policy(
    v_matricula_id, v_policy_kind
  );

  select
    sum((item ->> 'principalCents')::bigint),
    sum((item ->> 'interestCents')::bigint),
    sum((item ->> 'penaltyCents')::bigint)
  into v_principal, v_interest, v_penalty
  from jsonb_array_elements(v_source_items) item;
  v_gross := v_principal + v_interest + v_penalty;
  if v_gross > 9000000000000000 then
    raise exception using errcode = '22023', message = 'RENEGOTIATION_AMOUNT_OUT_OF_RANGE';
  end if;

  v_waived_interest := internal_finance.receivable_renegotiation_jsonb_cents(
    v_overrides_input, 'waivedInterestCents', 0
  );
  v_waived_penalty := internal_finance.receivable_renegotiation_jsonb_cents(
    v_overrides_input, 'waivedPenaltyCents', 0
  );
  v_commercial_discount := internal_finance.receivable_renegotiation_jsonb_cents(
    v_terms_input, 'commercialDiscountCents', 0
  );
  v_down_payment := internal_finance.receivable_renegotiation_jsonb_cents(
    v_terms_input, 'downPaymentCents', 0
  );
  if v_waived_interest > v_interest or v_waived_penalty > v_penalty then
    raise exception using errcode = '22023', message = 'RENEGOTIATION_INVALID_WAIVER',
      detail = 'O perdão não pode superar o encargo apurado.';
  end if;
  if v_terms_input ? 'targetNegotiatedCents' then
    v_target := internal_finance.receivable_renegotiation_jsonb_cents(
      v_terms_input, 'targetNegotiatedCents', 0
    );
    if v_target <= 0 or v_target > v_gross - v_waived_interest - v_waived_penalty then
      raise exception using errcode = '22023', message = 'RENEGOTIATION_INVALID_TARGET_TOTAL',
        detail = 'O total deve ser positivo e não superar a dívida após os perdões.';
    end if;
    v_commercial_discount := v_gross - v_waived_interest - v_waived_penalty - v_target;
  end if;
  v_negotiated := v_gross - v_waived_interest - v_waived_penalty
    - v_commercial_discount;
  if v_negotiated <= 0 or v_down_payment > v_negotiated then
    raise exception using errcode = '22023', message = 'RENEGOTIATION_INVALID_TERMS',
      detail = 'Descontos e entrada não correspondem ao saldo negociado.';
  end if;
  v_financed := v_negotiated - v_down_payment;

  if v_terms_input ? 'installmentCount' then
    if coalesce(v_terms_input ->> 'installmentCount', '') !~ '^[0-9]+$'
      or (v_terms_input ->> 'installmentCount')::numeric > 60 then
      raise exception using errcode = '22023', message = 'RENEGOTIATION_INVALID_TERMS';
    end if;
    v_installment_count := (v_terms_input ->> 'installmentCount')::integer;
  else
    v_installment_count := case when v_financed = 0 then 0
      else least(v_source_count, 60) end;
  end if;
  if v_installment_count > 0 and v_terms_input ? 'firstDueDate' then
    if coalesce(v_terms_input ->> 'firstDueDate', '')
      !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception using errcode = '22023', message = 'RENEGOTIATION_INVALID_TERMS';
    end if;
    begin
      v_first_due := (v_terms_input ->> 'firstDueDate')::date;
    exception when datetime_field_overflow or invalid_datetime_format then
      raise exception using errcode = '22023', message = 'RENEGOTIATION_INVALID_TERMS';
    end;
  else
    v_first_due := v_as_of;
  end if;
  if v_installment_count = 0 then v_first_due := null; end if;
  v_schedule := internal_finance.build_receivable_renegotiation_schedule_v2(
    v_negotiated, v_down_payment, v_installment_count, v_first_due, v_as_of,
    v_cadence, v_interval_days
  );

  v_effective_policy := jsonb_build_object(
    'punctualDiscount', v_default_policy -> 'punctualDiscount',
    'monthlyInterest', v_default_policy -> 'monthlyInterest',
    'penalty', v_default_policy -> 'penalty'
  );
  v_provenance := jsonb_build_object(
    'punctualDiscount', 'HERDADO',
    'monthlyInterest', 'HERDADO',
    'penalty', 'HERDADO'
  );
  if v_overrides_input ? 'punctualDiscountCents' then
    v_override_cents := internal_finance.receivable_renegotiation_jsonb_cents(
      v_overrides_input, 'punctualDiscountCents', 0
    );
    v_effective_policy := jsonb_set(
      v_effective_policy, '{punctualDiscount,amountCents}', to_jsonb(v_override_cents)
    );
    v_provenance := jsonb_set(v_provenance, '{punctualDiscount}', '"PROPOSTO"');
    v_normalized_overrides := v_normalized_overrides
      || jsonb_build_object('punctualDiscountCents', v_override_cents);
  end if;
  if v_overrides_input ? 'monthlyInterestBasisPoints' then
    if coalesce(v_overrides_input ->> 'monthlyInterestBasisPoints', '') !~ '^[0-9]+$'
      or (v_overrides_input ->> 'monthlyInterestBasisPoints')::numeric > 10000 then
      raise exception using errcode = '22023', message = 'RENEGOTIATION_INVALID_TERMS';
    end if;
    v_override_bps := (v_overrides_input ->> 'monthlyInterestBasisPoints')::integer;
    v_effective_policy := jsonb_set(
      v_effective_policy, '{monthlyInterest,basisPoints}', to_jsonb(v_override_bps)
    );
    v_effective_policy := jsonb_set(
      v_effective_policy, '{monthlyInterest,percent}',
      to_jsonb(v_override_bps::numeric / 100)
    );
    v_provenance := jsonb_set(v_provenance, '{monthlyInterest}', '"PROPOSTO"');
    v_normalized_overrides := v_normalized_overrides
      || jsonb_build_object('monthlyInterestBasisPoints', v_override_bps);
  end if;
  if v_overrides_input ? 'penalty' then
    v_penalty_override := v_overrides_input -> 'penalty';
    if jsonb_typeof(v_penalty_override) <> 'object'
      or coalesce(v_penalty_override ->> 'kind', '')
        <> v_default_policy -> 'penalty' ->> 'kind' then
      raise exception using errcode = '22023', message = 'RENEGOTIATION_INVALID_PENALTY_UNIT';
    end if;
    select key into v_unknown from jsonb_object_keys(v_penalty_override) key
    where key not in ('kind', 'basisPoints', 'amountCents') limit 1;
    if v_unknown is not null then
      raise exception using errcode = '22023', message = 'RENEGOTIATION_INVALID_TERMS';
    end if;
    if v_penalty_override ->> 'kind' = 'PERCENTAGE' then
      if not (v_penalty_override ? 'basisPoints')
        or v_penalty_override ? 'amountCents'
        or coalesce(v_penalty_override ->> 'basisPoints', '') !~ '^[0-9]+$'
        or (v_penalty_override ->> 'basisPoints')::numeric > 10000 then
        raise exception using errcode = '22023', message = 'RENEGOTIATION_INVALID_TERMS';
      end if;
      v_override_bps := (v_penalty_override ->> 'basisPoints')::integer;
      v_penalty_override := jsonb_build_object(
        'kind', 'PERCENTAGE',
        'percent', v_override_bps::numeric / 100,
        'basisPoints', v_override_bps,
        'unit', 'BASIS_POINTS_ON_PRINCIPAL'
      );
    else
      if not (v_penalty_override ? 'amountCents') or v_penalty_override ? 'basisPoints' then
        raise exception using errcode = '22023', message = 'RENEGOTIATION_INVALID_TERMS';
      end if;
      v_override_cents := internal_finance.receivable_renegotiation_jsonb_cents(
        v_penalty_override, 'amountCents', 0
      );
      v_penalty_override := jsonb_build_object(
        'kind', 'FIXED_CENTS', 'amountCents', v_override_cents,
        'unit', 'CENTS_PER_LATE_INSTALLMENT'
      );
    end if;
    v_effective_policy := jsonb_set(
      v_effective_policy, '{penalty}', v_penalty_override
    );
    v_provenance := jsonb_set(v_provenance, '{penalty}', '"PROPOSTO"');
    v_normalized_overrides := v_normalized_overrides
      || jsonb_build_object('penalty', v_penalty_override);
  end if;

  v_provenance := jsonb_build_object(
    'punctualDiscount', case
      when v_effective_policy -> 'punctualDiscount'
        is distinct from v_default_policy -> 'punctualDiscount'
      then 'PROPOSTO' else 'HERDADO' end,
    'monthlyInterest', case
      when v_effective_policy -> 'monthlyInterest'
        is distinct from v_default_policy -> 'monthlyInterest'
      then 'PROPOSTO' else 'HERDADO' end,
    'penalty', case
      when v_effective_policy -> 'penalty'
        is distinct from v_default_policy -> 'penalty'
      then 'PROPOSTO' else 'HERDADO' end
  );

  if v_installment_count > 0 then
    v_min_installment := v_financed / v_installment_count;
    if (v_effective_policy -> 'punctualDiscount' ->> 'amountCents')::bigint
      >= v_min_installment
      and (v_effective_policy -> 'punctualDiscount' ->> 'amountCents')::bigint > 0
    then
      raise exception using errcode = '22023', message = 'RENEGOTIATION_INVALID_TERMS',
        detail = 'O desconto de pontualidade deve ser menor que a menor parcela.';
    end if;
  end if;

  v_schedule := internal_finance.receivable_renegotiation_bank_schedule(v_schedule, v_effective_policy);

  if v_overrides_input ? 'waivedInterestCents' then
    v_normalized_overrides := v_normalized_overrides
      || jsonb_build_object('waivedInterestCents', v_waived_interest);
  end if;
  if v_overrides_input ? 'waivedPenaltyCents' then
    v_normalized_overrides := v_normalized_overrides
      || jsonb_build_object('waivedPenaltyCents', v_waived_penalty);
  end if;
  if v_commercial_discount > 0 then
    v_reasons := v_reasons || '"COMMERCIAL_DISCOUNT"'::jsonb;
  end if;
  if v_waived_interest > 0 then
    v_reasons := v_reasons || '"WAIVED_INTEREST"'::jsonb;
  end if;
  if v_waived_penalty > 0 then
    v_reasons := v_reasons || '"WAIVED_PENALTY"'::jsonb;
  end if;
  if v_provenance ->> 'punctualDiscount' = 'PROPOSTO' then
    v_reasons := v_reasons || '"POLICY_PUNCTUAL_DISCOUNT_CHANGED"'::jsonb;
  end if;
  if v_provenance ->> 'monthlyInterest' = 'PROPOSTO' then
    v_reasons := v_reasons || '"POLICY_MONTHLY_INTEREST_CHANGED"'::jsonb;
  end if;
  if v_provenance ->> 'penalty' = 'PROPOSTO' then
    v_reasons := v_reasons || '"POLICY_PENALTY_CHANGED"'::jsonb;
  end if;

  v_normalized_terms := case when v_target is not null
    then jsonb_build_object('targetNegotiatedCents', v_target)
    else jsonb_build_object('commercialDiscountCents', v_commercial_discount) end
    || jsonb_build_object('cadence', v_cadence)
    || case when v_interval_days is null then '{}'::jsonb
      else jsonb_build_object('intervalDays', v_interval_days) end
    || jsonb_build_object(
    'downPaymentCents', v_down_payment,
    'installmentCount', v_installment_count,
    'firstDueDate', v_first_due
  );
  v_policy_snapshot := jsonb_build_object(
    'kind', v_policy_kind,
    'receiptPolicy', jsonb_build_object('daysAfterDue', 60,
      'instruction', 'SR.(A) CAIXA: NÃO RECEBER ESTE TÍTULO APÓS 60 (SESSENTA) DIAS DO VENCIMENTO.'),
    'defaults', v_default_policy,
    'effective', v_effective_policy,
    'provenance', v_provenance,
    'differsFromDefault', v_effective_policy is distinct from jsonb_build_object(
      'punctualDiscount', v_default_policy -> 'punctualDiscount',
      'monthlyInterest', v_default_policy -> 'monthlyInterest',
      'penalty', v_default_policy -> 'penalty'
    )
  );
  v_calculation := jsonb_build_object(
    'sourceCharges', jsonb_build_object(
      'principalCents', v_principal, 'interestCents', v_interest,
      'penaltyCents', v_penalty, 'grossDebtCents', v_gross
    ),
    'waivers', jsonb_build_object(
      'interestCents', v_waived_interest, 'penaltyCents', v_waived_penalty,
      'totalCents', v_waived_interest + v_waived_penalty
    ),
    'commercialDiscountCents', v_commercial_discount,
    'negotiatedCents', v_negotiated,
    'downPaymentCents', v_down_payment,
    'financedCents', v_financed,
    'installmentCount', v_installment_count,
    'firstDueDate', v_first_due
  );
  v_totals := jsonb_build_object(
    'principalCents', v_principal,
    'accruedInterestCents', v_interest,
    'accruedPenaltyCents', v_penalty,
    'grossDebtCents', v_gross,
    'waivedInterestCents', v_waived_interest,
    'waivedPenaltyCents', v_waived_penalty,
    'commercialDiscountCents', v_commercial_discount,
    'negotiatedCents', v_negotiated,
    'downPaymentCents', v_down_payment,
    'financedCents', v_financed
  );
  v_selection_fingerprint := internal_finance.receivable_renegotiation_hash(
    jsonb_build_object('identity', v_identity, 'sourceItems', v_source_items)
  );
  v_policy_fingerprint := internal_finance.receivable_renegotiation_hash(v_policy_snapshot);
  v_calculation_fingerprint := internal_finance.receivable_renegotiation_hash(
    jsonb_build_object(
      'asOf', v_as_of, 'terms', v_normalized_terms,
      'policyOverrides', v_normalized_overrides,
      'calculationSnapshot', v_calculation, 'schedule', v_schedule
    )
  );
  v_proposal_fingerprint := internal_finance.receivable_renegotiation_hash(
    jsonb_build_object(
      'selectionFingerprint', v_selection_fingerprint,
      'policyFingerprint', v_policy_fingerprint,
      'calculationFingerprint', v_calculation_fingerprint
    )
  );

  return jsonb_build_object(
    'version', 2,
    'asOf', v_as_of,
    'identity', v_identity,
    'selection', jsonb_build_object(
      'receivableIds', to_jsonb(v_ids), 'itemCount', v_source_count,
      'overdueCount', (select count(*) from jsonb_array_elements(v_source_items) item
        where (item ->> 'overdue')::boolean),
      'futureCount', (select count(*) from jsonb_array_elements(v_source_items) item
        where not (item ->> 'overdue')::boolean)
    ),
    'sourceItems', v_source_items,
    'terms', v_normalized_terms,
    'policyOverrides', v_normalized_overrides,
    'policySnapshot', v_policy_snapshot,
    'calculationSnapshot', v_calculation,
    'totals', v_totals,
    'schedule', v_schedule,
    'requiresApproval', jsonb_array_length(v_reasons) > 0,
    'approvalReasons', v_reasons,
    'selectionFingerprint', v_selection_fingerprint,
    'policyFingerprint', v_policy_fingerprint,
    'calculationFingerprint', v_calculation_fingerprint,
    'proposalFingerprint', v_proposal_fingerprint
  );
end;
$function$;

revoke all on function internal_finance.build_receivable_renegotiation_snapshot(
  uuid[], jsonb, jsonb, date
) from public, anon, authenticated, service_role;

commit;
