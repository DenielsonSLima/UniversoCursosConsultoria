begin read only;

do $test$
declare
  v_codes jsonb;
begin
  select internal_proesc.collector_review_reason_codes((
    '["PAYMENT_REPEATED_OUTSIDE_ITS_PERIOD","NO_PAYMENT_IN_OBSERVED_PERIODS",' ||
    '"PAYMENT_REPEATED_OUTSIDE_ITS_PERIOD","untrusted arbitrary text",null,12,{}]'
  )::jsonb) into v_codes;
  if v_codes is distinct from
    '["NO_PAYMENT_IN_OBSERVED_PERIODS","PAYMENT_REPEATED_OUTSIDE_ITS_PERIOD"]'::jsonb then
    raise exception 'Collector diagnostics must be recognized codes, unique and deterministic.';
  end if;

  if internal_proesc.collector_review_reason_codes(null) <> '[]'::jsonb
    or internal_proesc.collector_review_reason_codes('null') <> '[]'::jsonb
    or internal_proesc.collector_review_reason_codes('{}') <> '[]'::jsonb
    or internal_proesc.collector_review_reason_codes('"NO_PAYMENT_IN_OBSERVED_PERIODS"') <> '[]'::jsonb then
    raise exception 'Legacy and non-array diagnostic inputs must remain compatible.';
  end if;

  if jsonb_array_length(internal_proesc.collector_review_reason_codes((
    '["IDENTITY_REQUIRES_REVIEW","SOURCE_STATE_REQUIRES_REVIEW",' ||
    '"PAYMENT_REPEATED_OUTSIDE_ITS_PERIOD","PRINCIPAL_REQUIRES_REVIEW",' ||
    '"PAYMENT_OBSERVED_IN_MULTIPLE_PERIODS",' ||
    '"NO_PAYMENT_IN_OBSERVED_PERIODS","PAYMENTS_ON_MULTIPLE_DATES_REQUIRE_REVIEW",' ||
    '"PAYMENT_AMOUNT_EXCEEDS_SAFE_RANGE","PAYMENT_REQUIRES_REVIEW"]'
  )::jsonb)) <> 9 then
    raise exception 'Every current collector reason must survive sanitization.';
  end if;

  if has_function_privilege('anon', 'internal_proesc.collector_review_reason_codes(jsonb)', 'execute')
    or has_function_privilege('authenticated', 'internal_proesc.collector_review_reason_codes(jsonb)', 'execute')
    or has_function_privilege('service_role', 'internal_proesc.collector_review_reason_codes(jsonb)', 'execute') then
    raise exception 'Diagnostic sanitizer must stay internal.';
  end if;
end;
$test$;

rollback;
