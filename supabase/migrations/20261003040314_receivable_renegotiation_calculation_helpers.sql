begin;

create or replace function internal_finance.receivable_renegotiation_jsonb_cents(
  p_object jsonb,
  p_key text,
  p_default bigint default 0
) returns bigint language plpgsql immutable security invoker set search_path = '' as $function$
declare
  v_text text;
  v_value numeric;
begin
  if not (coalesce(p_object, '{}'::jsonb) ? p_key) then return p_default; end if;
  v_text := p_object ->> p_key;
  if v_text is null or v_text !~ '^[0-9]+$' then
    raise exception using errcode = '22023', message = 'RENEGOTIATION_INVALID_TERMS',
      detail = pg_catalog.format('%s deve ser um inteiro não negativo em centavos.', p_key);
  end if;
  v_value := v_text::numeric;
  if v_value > 9000000000000000 then
    raise exception using errcode = '22023', message = 'RENEGOTIATION_INVALID_TERMS',
      detail = pg_catalog.format('%s excede o limite monetário suportado.', p_key);
  end if;
  return v_value::bigint;
end;
$function$;

create or replace function internal_finance.calculate_receivable_renegotiation_accrual(
  p_principal_cents bigint,
  p_due_date date,
  p_as_of date,
  p_monthly_interest_percent numeric,
  p_penalty_kind text,
  p_penalty_value numeric,
  p_apply_late_charges boolean
) returns jsonb language plpgsql immutable security invoker set search_path = '' as $function$
declare
  v_days integer;
  v_interest numeric := 0;
  v_penalty numeric := 0;
begin
  if p_principal_cents is null or p_principal_cents <= 0
    or p_due_date is null or p_as_of is null
    or not pg_catalog.isfinite(p_due_date) or not pg_catalog.isfinite(p_as_of)
    or p_monthly_interest_percent is null
    or p_monthly_interest_percent not between 0 and 100
    or p_monthly_interest_percent::text in ('NaN', 'Infinity', '-Infinity')
    or upper(coalesce(p_penalty_kind, '')) not in ('PERCENTAGE', 'FIXED_CENTS')
    or p_penalty_value is null or p_penalty_value < 0
    or p_penalty_value::text in ('NaN', 'Infinity', '-Infinity')
  then
    raise exception using errcode = '22023', message = 'RENEGOTIATION_INVALID_ACCRUAL_INPUT';
  end if;
  if upper(p_penalty_kind) = 'PERCENTAGE' and p_penalty_value > 100 then
    raise exception using errcode = '22023', message = 'RENEGOTIATION_INVALID_ACCRUAL_INPUT';
  end if;

  v_days := greatest(p_as_of - p_due_date, 0);
  if coalesce(p_apply_late_charges, false) and v_days > 0 then
    v_interest := round(
      p_principal_cents::numeric * p_monthly_interest_percent
        * v_days::numeric / 3000.0
    );
    v_penalty := case upper(p_penalty_kind)
      when 'PERCENTAGE' then round(p_principal_cents::numeric * p_penalty_value / 100.0)
      else round(p_penalty_value)
    end;
  end if;
  if v_interest > 9000000000000000 or v_penalty > 9000000000000000 then
    raise exception using errcode = '22023', message = 'RENEGOTIATION_AMOUNT_OUT_OF_RANGE';
  end if;
  return jsonb_build_object(
    'lateDays', v_days,
    'interestCents', v_interest::bigint,
    'penaltyCents', v_penalty::bigint
  );
end;
$function$;

create or replace function internal_finance.build_receivable_renegotiation_schedule(
  p_negotiated_cents bigint,
  p_down_payment_cents bigint,
  p_installment_count integer,
  p_first_due_date date,
  p_as_of date
) returns jsonb language plpgsql immutable security invoker set search_path = '' as $function$
declare
  v_financed bigint;
  v_base bigint;
  v_remainder bigint;
  v_number integer;
  v_amount bigint;
  v_due date;
  v_entries jsonb := '[]'::jsonb;
begin
  if p_negotiated_cents is null or p_negotiated_cents <= 0
    or p_negotiated_cents > 9000000000000000
    or p_down_payment_cents is null
    or p_down_payment_cents < 0
    or p_down_payment_cents > p_negotiated_cents
    or p_installment_count is null or p_installment_count not between 0 and 60
    or p_as_of is null or not pg_catalog.isfinite(p_as_of)
    or (p_first_due_date is not null and not pg_catalog.isfinite(p_first_due_date))
  then
    raise exception using errcode = '22023', message = 'RENEGOTIATION_INVALID_TERMS';
  end if;
  v_financed := p_negotiated_cents - p_down_payment_cents;
  if (v_financed = 0 and p_installment_count <> 0)
    or (v_financed > 0 and p_installment_count = 0)
    or (v_financed > 0 and p_first_due_date is null)
    or (p_first_due_date is not null and p_first_due_date < p_as_of)
    or (p_installment_count > 0 and v_financed < p_installment_count)
  then
    raise exception using errcode = '22023', message = 'RENEGOTIATION_INVALID_TERMS',
      detail = 'Revise entrada, quantidade e primeiro vencimento.';
  end if;
  if p_down_payment_cents > 0 then
    v_entries := v_entries || jsonb_build_array(jsonb_build_object(
      'sequence', 0, 'kind', 'DOWN_PAYMENT',
      'dueDate', p_as_of, 'amountCents', p_down_payment_cents
    ));
  end if;
  if p_installment_count > 0 then
    v_base := v_financed / p_installment_count;
    v_remainder := v_financed % p_installment_count;
    for v_number in 1..p_installment_count loop
      v_amount := v_base + case when v_number <= v_remainder then 1 else 0 end;
      v_due := public.data_vencimento_mensal(
        p_first_due_date, extract(day from p_first_due_date)::integer, v_number - 1
      );
      v_entries := v_entries || jsonb_build_array(jsonb_build_object(
        'sequence', v_number, 'kind', 'INSTALLMENT',
        'dueDate', v_due, 'amountCents', v_amount
      ));
    end loop;
  end if;
  return jsonb_build_object(
    'installmentCount', p_installment_count,
    'firstDueDate', case when p_installment_count > 0 then p_first_due_date else null end,
    'entries', v_entries
  );
end;
$function$;

create or replace function internal_finance.receivable_renegotiation_source_item(
  p_receivable_id uuid,
  p_as_of date
) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_receivable public.contas_receber%rowtype;
  v_eligibility jsonb;
  v_snapshot jsonb;
  v_policy_kind text;
  v_interest numeric;
  v_penalty_cents bigint;
  v_discount_cents bigint;
  v_apply_late boolean;
  v_accrual jsonb;
  v_principal_cents bigint;
  v_source_policy jsonb;
  v_source_fingerprint text;
begin
  select * into v_receivable from public.contas_receber where id = p_receivable_id;
  v_eligibility := internal_finance.receivable_renegotiation_eligibility(
    v_receivable, p_as_of
  );
  if not coalesce((v_eligibility ->> 'eligible')::boolean, false) then
    raise exception using errcode = '23514',
      message = 'RENEGOTIATION_' || coalesce(v_eligibility ->> 'code', 'UNKNOWN_POLICY'),
      detail = coalesce(v_eligibility ->> 'reason', 'Parcela inelegível.');
  end if;

  v_principal_cents := round(v_receivable.valor * 100)::bigint;
  v_policy_kind := v_eligibility ->> 'policyKind';
  if v_policy_kind = 'TECNICO' then
    v_snapshot := v_receivable.regra_financeira_tecnica_snapshot;
    v_interest := (v_snapshot ->> 'jurosAtrasoPercentual')::numeric;
    v_penalty_cents := round((v_snapshot ->> 'multaAtrasoValor')::numeric * 100)::bigint;
    v_discount_cents := round(
      (v_snapshot ->> 'descontoPontualidade')::numeric * 100
    )::bigint;
    v_apply_late := (v_snapshot ->> 'aplicarMultaJuros')::boolean;
  else
    v_snapshot := v_receivable.regra_financeira_plano_unico_snapshot;
    v_interest := (v_snapshot ->> 'jurosAtrasoPercentual')::numeric;
    v_penalty_cents := round((v_snapshot ->> 'multaAtraso')::numeric * 100)::bigint;
    v_discount_cents := round(
      (v_snapshot ->> 'descontoPontualidade')::numeric * 100
    )::bigint;
    v_apply_late := true;
  end if;
  if v_interest not between 0 and 100 or v_penalty_cents < 0
    or v_discount_cents < 0 then
    raise exception using errcode = '23514', message = 'RENEGOTIATION_UNKNOWN_POLICY';
  end if;

  v_accrual := internal_finance.calculate_receivable_renegotiation_accrual(
    v_principal_cents, v_receivable.data_vencimento, p_as_of,
    v_interest, 'FIXED_CENTS', v_penalty_cents, v_apply_late
  );
  v_source_policy := jsonb_build_object(
    'kind', v_policy_kind,
    'sourceSnapshot', v_snapshot,
    'punctualDiscount', jsonb_build_object(
      'kind', 'FIXED_CENTS', 'amountCents', v_discount_cents,
      'appliedToRenegotiatedPrincipal', false
    ),
    'monthlyInterest', jsonb_build_object(
      'kind', 'MONTHLY_PERCENTAGE', 'percent', v_interest,
      'unit', 'PERCENT_PER_30_DAY_MONTH'
    ),
    'penalty', jsonb_build_object(
      'kind', 'FIXED_CENTS', 'amountCents', v_penalty_cents,
      'unit', 'CENTS_PER_LATE_INSTALLMENT'
    ),
    'lateChargesEnabled', v_apply_late
  );
  v_source_fingerprint := internal_finance.receivable_renegotiation_hash(
    jsonb_build_object(
      'receivableId', v_receivable.id,
      'status', v_receivable.status,
      'dueDate', v_receivable.data_vencimento,
      'principalCents', v_principal_cents,
      'paidAt', v_receivable.data_pagamento,
      'paidCents', round(coalesce(v_receivable.valor_pago, 0) * 100)::bigint,
      'updatedAtUtc', pg_catalog.to_char(
        v_receivable.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ),
      'sourcePolicy', v_source_policy,
      'sourceSystem', v_eligibility ->> 'sourceSystem'
    )
  );
  return jsonb_build_object(
    'receivableId', v_receivable.id,
    'number', v_receivable.parcela_numero,
    'label', v_receivable.descricao,
    'status', v_receivable.status,
    'dueDate', v_receivable.data_vencimento,
    'overdue', v_receivable.data_vencimento < p_as_of,
    'lateDays', (v_accrual ->> 'lateDays')::integer,
    'principalCents', v_principal_cents,
    'openAmountCents', v_principal_cents,
    'interestCents', (v_accrual ->> 'interestCents')::bigint,
    'penaltyCents', (v_accrual ->> 'penaltyCents')::bigint,
    'debtCents', v_principal_cents
      + (v_accrual ->> 'interestCents')::bigint
      + (v_accrual ->> 'penaltyCents')::bigint,
    'policyKind', v_policy_kind,
    'sourceSystem', v_eligibility ->> 'sourceSystem',
    'sourcePolicySnapshot', v_source_policy,
    'sourceFingerprint', v_source_fingerprint
  );
end;
$function$;

revoke all on function internal_finance.receivable_renegotiation_jsonb_cents(jsonb, text, bigint),
  internal_finance.calculate_receivable_renegotiation_accrual(bigint, date, date, numeric, text, numeric, boolean),
  internal_finance.build_receivable_renegotiation_schedule(bigint, bigint, integer, date, date),
  internal_finance.receivable_renegotiation_source_item(uuid, date)
  from public, anon, authenticated, service_role;

commit;
