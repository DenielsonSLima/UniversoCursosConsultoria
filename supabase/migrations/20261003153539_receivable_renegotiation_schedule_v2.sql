begin;

-- Mantém intacta a assinatura mensal já usada por propostas históricas.
create function internal_finance.build_receivable_renegotiation_schedule_v2(
  p_negotiated_cents bigint,
  p_down_payment_cents bigint,
  p_installment_count integer,
  p_first_due_date date,
  p_as_of date,
  p_cadence text,
  p_interval_days integer
) returns jsonb language plpgsql immutable security invoker set search_path = '' as $function$
declare
  v_schedule jsonb;
  v_entries jsonb;
begin
  if p_cadence is null or p_cadence not in ('MONTHLY', 'FIXED_DAYS')
    or (p_cadence = 'MONTHLY' and p_interval_days is not null)
    or (p_cadence = 'FIXED_DAYS' and
      (p_interval_days is null or p_interval_days not between 1 and 365)) then
    raise exception using errcode = '22023', message = 'RENEGOTIATION_INVALID_CADENCE',
      detail = 'Escolha mensal ou um intervalo de 1 a 365 dias.';
  end if;
  -- Reutiliza as validações e o rateio inteiro: entrada + parcelas = total.
  v_schedule := internal_finance.build_receivable_renegotiation_schedule(
    p_negotiated_cents, p_down_payment_cents, p_installment_count,
    p_first_due_date, p_as_of
  );
  if p_cadence = 'FIXED_DAYS' then
    select coalesce(jsonb_agg(case when entry ->> 'kind' = 'INSTALLMENT'
      then jsonb_set(entry, '{dueDate}', to_jsonb(
        p_first_due_date + ((entry ->> 'sequence')::integer - 1) * p_interval_days
      )) else entry end order by ordinal), '[]'::jsonb)
    into v_entries
    from jsonb_array_elements(v_schedule -> 'entries') with ordinality e(entry, ordinal);
    v_schedule := jsonb_set(v_schedule, '{entries}', v_entries);
  end if;
  return v_schedule || jsonb_build_object(
    'cadence', p_cadence, 'intervalDays', p_interval_days
  );
end;
$function$;

-- Congela os termos de cada novo boleto antes de qualquer cancelamento.
-- Os abatimentos da dívida antiga já integram o nominal e não reaparecem aqui.
create function internal_finance.receivable_renegotiation_bank_schedule(
  p_schedule jsonb, p_policy jsonb
) returns jsonb language plpgsql immutable security invoker set search_path = '' as $function$
declare
  v_entry jsonb;
  v_entries jsonb := '[]'::jsonb;
  v_amount bigint;
  v_due date;
  v_discount bigint := (p_policy #>> '{punctualDiscount,amountCents}')::bigint;
  v_interest numeric := coalesce((p_policy #>> '{monthlyInterest,percent}')::numeric,
    (p_policy #>> '{monthlyInterest,basisPoints}')::numeric / 100);
  v_penalty_kind text := p_policy #>> '{penalty,kind}';
  v_penalty numeric;
  v_terms jsonb;
begin
  v_penalty := case when v_penalty_kind = 'PERCENTAGE'
    then coalesce((p_policy #>> '{penalty,percent}')::numeric,
      (p_policy #>> '{penalty,basisPoints}')::numeric / 100)
    else (p_policy #>> '{penalty,amountCents}')::numeric / 100 end;
  if v_discount is null or v_discount < 0
    or v_interest is null or not (v_interest >= 0 and v_interest < 100)
    or v_penalty_kind is null or v_penalty_kind not in ('PERCENTAGE', 'FIXED_CENTS')
    or v_penalty is null or v_penalty < 0
    or (v_penalty_kind = 'PERCENTAGE' and not (v_penalty < 100)) then
    raise exception using errcode = '22023', message = 'RENEGOTIATION_INVALID_BANK_POLICY';
  end if;
  for v_entry in select value from jsonb_array_elements(p_schedule -> 'entries') loop
    v_amount := (v_entry ->> 'amountCents')::bigint;
    v_due := (v_entry ->> 'dueDate')::date;
    if v_amount is null or v_amount <= 0 or v_due is null or not isfinite(v_due)
      or v_discount >= v_amount
      or (v_penalty_kind = 'FIXED_CENTS' and v_penalty * 100 >= v_amount) then
      raise exception using errcode = '22023', message = 'RENEGOTIATION_INVALID_BANK_POLICY',
        detail = 'Desconto e multa fixa devem ser menores que cada boleto, inclusive a entrada.';
    end if;
    v_terms := jsonb_build_object(
      'nominalAmount', v_amount::numeric / 100, 'dueDate', v_due,
      'discount', case when v_discount > 0 then jsonb_build_object(
        'type', 'fixed', 'value', v_discount::numeric / 100, 'validUntil', v_due) else null end,
      'penalty', case when v_penalty > 0 then jsonb_build_object(
        'type', case when v_penalty_kind = 'PERCENTAGE' then 'percentage' else 'fixed' end,
        'value', v_penalty, 'startsOn', v_due + 1) else null end,
      'interest', case when v_interest > 0 then jsonb_build_object(
        'type', 'monthly-percentage', 'value', v_interest, 'startsOn', v_due + 1) else null end
    );
    v_entries := v_entries || jsonb_build_array(v_entry || jsonb_build_object('financialTerms', v_terms));
  end loop;
  if jsonb_array_length(v_entries) = 0 then
    raise exception using errcode = '22023', message = 'RENEGOTIATION_INVALID_TERMS';
  end if;
  return jsonb_set(p_schedule, '{entries}', v_entries);
end;
$function$;

revoke all on function internal_finance.receivable_renegotiation_bank_schedule(jsonb, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function internal_finance.build_receivable_renegotiation_schedule_v2(
  bigint, bigint, integer, date, date, text, integer
) from public, anon, authenticated, service_role;

commit;
