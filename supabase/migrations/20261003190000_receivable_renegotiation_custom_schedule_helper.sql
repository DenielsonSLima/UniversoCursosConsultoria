begin;

create function internal_finance.apply_receivable_renegotiation_custom_schedule(
  p_snapshot jsonb,
  p_schedule_entries jsonb,
  p_force_custom boolean default false
) returns jsonb language plpgsql immutable security invoker set search_path = '' as $function$
declare
  v_installment_count integer;
  v_financed_cents bigint;
  v_down_payment_cents bigint;
  v_negotiated_cents bigint;
  v_as_of date;
  v_entry jsonb;
  v_unknown text;
  v_sequence integer;
  v_expected_sequence integer := 1;
  v_amount_cents bigint;
  v_due_date date;
  v_first_due_date date;
  v_previous_due_date date;
  v_sum_cents bigint;
  v_normalized_entries jsonb := '[]'::jsonb;
  v_base_entries jsonb;
  v_output_entries jsonb := '[]'::jsonb;
  v_schedule jsonb;
  v_terms jsonb;
  v_calculation jsonb;
  v_reasons jsonb;
  v_calculation_fingerprint text;
  v_proposal_fingerprint text;
begin
  if p_schedule_entries is null then
    return p_snapshot;
  end if;
  if jsonb_typeof(p_snapshot) is distinct from 'object'
    or p_snapshot ->> 'version' is distinct from '2'
    or jsonb_typeof(p_snapshot -> 'terms') is distinct from 'object'
    or jsonb_typeof(p_snapshot -> 'calculationSnapshot') is distinct from 'object'
    or jsonb_typeof(p_snapshot -> 'totals') is distinct from 'object'
    or jsonb_typeof(p_snapshot -> 'schedule') is distinct from 'object'
    or jsonb_typeof(p_snapshot #> '{schedule,entries}') is distinct from 'array'
    or jsonb_typeof(p_snapshot #> '{policySnapshot,effective}') is distinct from 'object'
    or jsonb_typeof(p_snapshot -> 'approvalReasons') is distinct from 'array'
    or coalesce(p_snapshot ->> 'selectionFingerprint', '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_snapshot ->> 'policyFingerprint', '') !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '55000',
      message = 'RENEGOTIATION_CANONICAL_SNAPSHOT_INVALID';
  end if;
  if jsonb_typeof(p_schedule_entries) is distinct from 'array'
    or coalesce(p_snapshot #>> '{schedule,installmentCount}', '') !~ '^[0-9]+$'
    or coalesce(p_snapshot #>> '{totals,financedCents}', '') !~ '^[0-9]+$'
    or coalesce(p_snapshot #>> '{totals,downPaymentCents}', '') !~ '^[0-9]+$'
    or coalesce(p_snapshot #>> '{totals,negotiatedCents}', '') !~ '^[0-9]+$'
    or coalesce(p_snapshot ->> 'asOf', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  then
    raise exception using errcode = '22023',
      message = 'RENEGOTIATION_INVALID_CUSTOM_SCHEDULE';
  end if;

  v_installment_count := (p_snapshot #>> '{schedule,installmentCount}')::integer;
  v_financed_cents := (p_snapshot #>> '{totals,financedCents}')::bigint;
  v_down_payment_cents := (p_snapshot #>> '{totals,downPaymentCents}')::bigint;
  v_negotiated_cents := (p_snapshot #>> '{totals,negotiatedCents}')::bigint;
  begin
    v_as_of := (p_snapshot ->> 'asOf')::date;
  exception when datetime_field_overflow or invalid_datetime_format then
    raise exception using errcode = '55000',
      message = 'RENEGOTIATION_CANONICAL_SNAPSHOT_INVALID';
  end;
  if not pg_catalog.isfinite(v_as_of)
    or v_installment_count not between 1 and 60
    or jsonb_array_length(p_schedule_entries) <> v_installment_count
    or v_financed_cents < v_installment_count
    or v_financed_cents > 9000000000000000
    or v_down_payment_cents < 0
    or v_negotiated_cents is distinct from v_financed_cents + v_down_payment_cents
  then
    raise exception using errcode = '22023',
      message = 'RENEGOTIATION_INVALID_CUSTOM_SCHEDULE',
      detail = 'O cronograma deve representar todas as parcelas do saldo financiado.';
  end if;

  for v_entry in select value from jsonb_array_elements(p_schedule_entries) loop
    if jsonb_typeof(v_entry) is distinct from 'object'
      or not (v_entry ? 'sequence' and v_entry ? 'dueDate' and v_entry ? 'amountCents')
    then
      raise exception using errcode = '22023',
        message = 'RENEGOTIATION_INVALID_CUSTOM_SCHEDULE';
    end if;
    select key into v_unknown from jsonb_object_keys(v_entry) key
    where key not in ('sequence', 'dueDate', 'amountCents') limit 1;
    if v_unknown is not null
      or coalesce(v_entry ->> 'sequence', '') !~ '^[0-9]+$'
      or (v_entry ->> 'sequence')::numeric not between 1 and 60
      or coalesce(v_entry ->> 'amountCents', '') !~ '^[0-9]+$'
      or (v_entry ->> 'amountCents')::numeric not between 1 and 9000000000000000
      or coalesce(v_entry ->> 'dueDate', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    then
      raise exception using errcode = '22023',
        message = 'RENEGOTIATION_INVALID_CUSTOM_SCHEDULE';
    end if;
    v_sequence := (v_entry ->> 'sequence')::integer;
    v_amount_cents := (v_entry ->> 'amountCents')::bigint;
    begin
      v_due_date := (v_entry ->> 'dueDate')::date;
    exception when datetime_field_overflow or invalid_datetime_format then
      raise exception using errcode = '22023',
        message = 'RENEGOTIATION_INVALID_CUSTOM_SCHEDULE',
        detail = 'Informe vencimentos existentes no calendário.';
    end;
    if not pg_catalog.isfinite(v_due_date) then
      raise exception using errcode = '22023',
        message = 'RENEGOTIATION_INVALID_CUSTOM_SCHEDULE';
    end if;
    v_normalized_entries := v_normalized_entries || jsonb_build_array(
      jsonb_build_object('sequence', v_sequence, 'dueDate', v_due_date,
        'amountCents', v_amount_cents)
    );
  end loop;

  select jsonb_agg(entry order by (entry ->> 'sequence')::integer)
  into v_normalized_entries
  from jsonb_array_elements(v_normalized_entries) entry;
  for v_entry in select value from jsonb_array_elements(v_normalized_entries) loop
    v_sequence := (v_entry ->> 'sequence')::integer;
    v_amount_cents := (v_entry ->> 'amountCents')::bigint;
    v_due_date := (v_entry ->> 'dueDate')::date;
    if v_sequence <> v_expected_sequence
      or v_due_date < v_as_of
      or (v_previous_due_date is not null and v_due_date <= v_previous_due_date)
    then
      raise exception using errcode = '22023',
        message = 'RENEGOTIATION_INVALID_CUSTOM_SCHEDULE',
        detail = 'As sequências devem ser contínuas e os vencimentos futuros, em ordem crescente.';
    end if;
    if v_first_due_date is null then v_first_due_date := v_due_date; end if;
    v_previous_due_date := v_due_date;
    v_expected_sequence := v_expected_sequence + 1;
    v_sum_cents := coalesce(v_sum_cents, 0) + v_amount_cents;
  end loop;
  if v_expected_sequence - 1 <> v_installment_count
    or v_sum_cents is distinct from v_financed_cents then
    raise exception using errcode = '22023',
      message = 'RENEGOTIATION_CUSTOM_SCHEDULE_TOTAL_MISMATCH',
      detail = 'A soma das parcelas deve ser exatamente igual ao saldo financiado.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'sequence', (entry ->> 'sequence')::integer,
    'dueDate', (entry ->> 'dueDate')::date,
    'amountCents', (entry ->> 'amountCents')::bigint
  ) order by (entry ->> 'sequence')::integer), '[]'::jsonb)
  into v_base_entries
  from jsonb_array_elements(p_snapshot #> '{schedule,entries}') entry
  where entry ->> 'kind' = 'INSTALLMENT';
  if v_normalized_entries = v_base_entries and not coalesce(p_force_custom, false) then
    return p_snapshot;
  end if;

  if v_down_payment_cents > 0 then
    v_output_entries := v_output_entries || jsonb_build_array(jsonb_build_object(
      'sequence', 0, 'kind', 'DOWN_PAYMENT',
      'dueDate', v_as_of, 'amountCents', v_down_payment_cents
    ));
  end if;
  for v_entry in select value from jsonb_array_elements(v_normalized_entries) loop
    v_output_entries := v_output_entries || jsonb_build_array(
      v_entry || jsonb_build_object('kind', 'INSTALLMENT')
    );
  end loop;
  v_schedule := jsonb_build_object(
    'installmentCount', v_installment_count,
    'firstDueDate', v_first_due_date,
    'cadence', 'CUSTOM',
    'intervalDays', null,
    'entries', v_output_entries
  );
  v_schedule := internal_finance.receivable_renegotiation_bank_schedule(
    v_schedule, p_snapshot #> '{policySnapshot,effective}'
  );
  v_terms := (p_snapshot -> 'terms')
    - 'cadence' - 'intervalDays' - 'firstDueDate' - 'scheduleEntries'
    || jsonb_build_object(
      'cadence', 'CUSTOM',
      'firstDueDate', v_first_due_date,
      'scheduleEntries', v_normalized_entries
    );
  v_calculation := jsonb_set(
    p_snapshot -> 'calculationSnapshot', '{firstDueDate}',
    to_jsonb(v_first_due_date), true
  );
  v_reasons := p_snapshot -> 'approvalReasons';
  if not (v_reasons ? 'CUSTOM_SCHEDULE') then
    v_reasons := v_reasons || jsonb_build_array('CUSTOM_SCHEDULE');
  end if;
  v_calculation_fingerprint := internal_finance.receivable_renegotiation_hash(
    jsonb_build_object(
      'asOf', v_as_of,
      'terms', v_terms,
      'policyOverrides', p_snapshot -> 'policyOverrides',
      'calculationSnapshot', v_calculation,
      'schedule', v_schedule
    )
  );
  v_proposal_fingerprint := internal_finance.receivable_renegotiation_hash(
    jsonb_build_object(
      'selectionFingerprint', p_snapshot ->> 'selectionFingerprint',
      'policyFingerprint', p_snapshot ->> 'policyFingerprint',
      'calculationFingerprint', v_calculation_fingerprint
    )
  );
  return p_snapshot || jsonb_build_object(
    'version', 3,
    'terms', v_terms,
    'calculationSnapshot', v_calculation,
    'schedule', v_schedule,
    'requiresApproval', true,
    'approvalReasons', v_reasons,
    'calculationFingerprint', v_calculation_fingerprint,
    'proposalFingerprint', v_proposal_fingerprint
  );
end;
$function$;

revoke all on function internal_finance.apply_receivable_renegotiation_custom_schedule(
  jsonb, jsonb, boolean
) from public, anon, authenticated, service_role;

comment on function internal_finance.apply_receivable_renegotiation_custom_schedule(
  jsonb, jsonb, boolean
) is 'Valida e congela parcelas personalizadas sem alterar entrada, total ou títulos de origem.';

commit;
