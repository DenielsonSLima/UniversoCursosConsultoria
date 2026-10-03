begin;

do $test$
declare
  v_result jsonb;
  v_schedule jsonb;
  v_ids uuid[];
  v_failed boolean;
begin
  v_ids := internal_finance.normalize_receivable_renegotiation_ids(array[
    '00000000-0000-0000-0000-000000000003'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000003'::uuid
  ]);
  if v_ids is distinct from array[
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000003'::uuid
  ] then
    raise exception 'A seleção deve ser livre, deduplicada e ordenada sem exigir continuidade.';
  end if;

  v_result := internal_finance.calculate_receivable_renegotiation_accrual(
    10000, date '2026-11-10', date '2026-10-03', 1.00,
    'FIXED_CENTS', 200, true
  );
  if (v_result ->> 'lateDays')::integer <> 0
    or (v_result ->> 'interestCents')::bigint <> 0
    or (v_result ->> 'penaltyCents')::bigint <> 0 then
    raise exception 'Parcela futura não pode receber mora.';
  end if;

  v_result := internal_finance.calculate_receivable_renegotiation_accrual(
    10000, date '2026-09-03', date '2026-10-03', 1.00,
    'FIXED_CENTS', 200, true
  );
  if (v_result ->> 'lateDays')::integer <> 30
    or (v_result ->> 'interestCents')::bigint <> 100
    or (v_result ->> 'penaltyCents')::bigint <> 200 then
    raise exception 'Mora mensal pro rata ou multa fixa calculada incorretamente: %', v_result;
  end if;

  v_result := internal_finance.calculate_receivable_renegotiation_accrual(
    10000, date '2026-10-03', date '2026-10-03', 1.00,
    'PERCENTAGE', 2, true
  );
  if (v_result ->> 'interestCents')::bigint <> 0
    or (v_result ->> 'penaltyCents')::bigint <> 0 then
    raise exception 'Parcela vencendo hoje não pode receber mora: %', v_result;
  end if;

  v_result := internal_finance.calculate_receivable_renegotiation_accrual(
    10000, date '2026-09-03', date '2026-10-03', 1.00,
    'PERCENTAGE', 2, false
  );
  if (v_result ->> 'lateDays')::integer <> 30
    or (v_result ->> 'interestCents')::bigint <> 0
    or (v_result ->> 'penaltyCents')::bigint <> 0 then
    raise exception 'Regra com encargos desabilitados deve preservar atraso sem mora: %', v_result;
  end if;

  v_result := internal_finance.calculate_receivable_renegotiation_accrual(
    12345, date '2026-10-02', date '2026-10-03', 1.2375,
    'PERCENTAGE', 2.5, true
  );
  if (v_result ->> 'interestCents')::bigint <> 5
    or (v_result ->> 'penaltyCents')::bigint <> 309 then
    raise exception 'Percentuais fracionários devem arredondar somente o resultado monetário: %', v_result;
  end if;

  v_schedule := internal_finance.build_receivable_renegotiation_schedule(
    11000, 1000, 3, date '2028-01-31', date '2028-01-01'
  );
  if v_schedule #>> '{entries,0,kind}' <> 'DOWN_PAYMENT'
    or (v_schedule #>> '{entries,0,amountCents}')::bigint <> 1000
    or v_schedule #>> '{entries,2,dueDate}' <> '2028-02-29'
    or v_schedule #>> '{entries,3,dueDate}' <> '2028-03-31'
    or (select sum((entry ->> 'amountCents')::bigint)
      from jsonb_array_elements(v_schedule -> 'entries') entry) <> 11000 then
    raise exception 'Cronograma em centavos/mês-calendário inválido: %', v_schedule;
  end if;

  v_schedule := internal_finance.build_receivable_renegotiation_schedule(
    10001, 0, 3, date '2027-01-31', date '2027-01-01'
  );
  if v_schedule #>> '{entries,0,amountCents}' <> '3334'
    or v_schedule #>> '{entries,1,amountCents}' <> '3334'
    or v_schedule #>> '{entries,2,amountCents}' <> '3333'
    or v_schedule #>> '{entries,1,dueDate}' <> '2027-02-28'
    or v_schedule #>> '{entries,2,dueDate}' <> '2027-03-31' then
    raise exception 'O rateio deve preservar centavos e o dia-base após fevereiro: %', v_schedule;
  end if;

  v_schedule := internal_finance.build_receivable_renegotiation_schedule(
    10000, 10000, 0, null, date '2026-10-03'
  );
  if jsonb_array_length(v_schedule -> 'entries') <> 1
    or v_schedule #>> '{entries,0,kind}' <> 'DOWN_PAYMENT'
    or v_schedule #>> '{entries,0,dueDate}' <> '2026-10-03'
    or v_schedule ->> 'firstDueDate' is not null then
    raise exception 'Entrada integral não deve fabricar parcelas remanescentes: %', v_schedule;
  end if;

  v_failed := false;
  begin
    perform internal_finance.build_receivable_renegotiation_schedule(
      2, 0, 3, date '2026-10-04', date '2026-10-03'
    );
  exception when sqlstate '22023' then v_failed := true;
  end;
  if not v_failed then raise exception 'Não deve permitir parcelas zeradas.'; end if;

  v_failed := false;
  begin
    perform internal_finance.build_receivable_renegotiation_schedule(
      10000, 10000, 1, date '2026-10-04', date '2026-10-03'
    );
  exception when sqlstate '22023' then v_failed := true;
  end;
  if not v_failed then raise exception 'Entrada integral exige zero parcelas remanescentes.'; end if;

  v_failed := false;
  begin
    perform internal_finance.build_receivable_renegotiation_schedule(
      10000, 0, 61, date '2026-10-04', date '2026-10-03'
    );
  exception when sqlstate '22023' then v_failed := true;
  end;
  if not v_failed then raise exception 'O limite de 60 parcelas deve ser canônico.'; end if;

  v_failed := false;
  begin
    perform internal_finance.build_receivable_renegotiation_schedule(
      10000, 0, 1, date '2026-10-02', date '2026-10-03'
    );
  exception when sqlstate '22023' then v_failed := true;
  end;
  if not v_failed then raise exception 'O primeiro vencimento não pode anteceder a data-base.'; end if;

  v_failed := false;
  begin
    perform internal_finance.receivable_renegotiation_jsonb_cents(
      '{"downPaymentCents":1.5}'::jsonb, 'downPaymentCents', 0
    );
  exception when sqlstate '22023' then v_failed := true;
  end;
  if not v_failed then raise exception 'Entrada fracionária em centavos deve ser rejeitada.'; end if;

  v_failed := false;
  begin
    perform internal_finance.calculate_receivable_renegotiation_accrual(
      10000, date '2026-09-03', date '2026-10-03', 'NaN'::numeric,
      'PERCENTAGE', 2, true
    );
  exception when sqlstate '22023' then v_failed := true;
  end;
  if not v_failed then raise exception 'Taxa não finita deve ser rejeitada.'; end if;

  v_failed := false;
  begin
    perform internal_finance.normalize_receivable_renegotiation_ids(
      array['00000000-0000-0000-0000-000000000001'::uuid, null]
    );
  exception when sqlstate '22023' then v_failed := true;
  end;
  if not v_failed then raise exception 'Identificador nulo deve ser rejeitado.'; end if;

  v_failed := false;
  begin
    perform internal_finance.normalize_receivable_renegotiation_ids(array(
      select ('00000000-0000-0000-0000-' || lpad(number::text, 12, '0'))::uuid
      from generate_series(1, 121) as number
    ));
  exception when sqlstate '22023' then v_failed := true;
  end;
  if not v_failed then raise exception 'O limite de 120 títulos deve ser canônico.'; end if;

  v_result := internal_finance.classify_receivable_renegotiation_eligibility(
    '{"exists":true,"identityComplete":true,"open":true,"partialPayment":true,
      "proescManaged":false,"conflictingSource":false,"remotePaid":false,
      "operationInProgress":false,"renegotiationConflict":false,
      "supportedCharge":true,"supportedSource":true,"bankManaged":false,
      "bankCancelable":false,"policyReadable":true}'::jsonb
  );
  if v_result ->> 'code' <> 'PARTIAL_PAYMENT' then
    raise exception 'Pagamento parcial deve falhar fechado: %', v_result;
  end if;

  v_result := internal_finance.classify_receivable_renegotiation_eligibility(
    '{"exists":true,"identityComplete":true,"open":true,"partialPayment":false,
      "proescManaged":true,"conflictingSource":false,"remotePaid":false,
      "operationInProgress":false,"renegotiationConflict":false,
      "supportedCharge":true,"supportedSource":false,"bankManaged":false,
      "bankCancelable":false,"policyReadable":true}'::jsonb
  );
  if v_result ->> 'code' <> 'PROESC_MANAGED' then
    raise exception 'Origem Proesc deve permanecer somente leitura: %', v_result;
  end if;

  v_result := internal_finance.classify_receivable_renegotiation_eligibility(
    '{"exists":true,"identityComplete":true,"open":true,"partialPayment":false,
      "proescManaged":false,"conflictingSource":false,"remotePaid":false,
      "operationInProgress":false,"renegotiationConflict":false,
      "supportedCharge":true,"supportedSource":true,"bankManaged":false,
      "bankCancelable":false,"policyReadable":false}'::jsonb
  );
  if v_result ->> 'code' <> 'UNKNOWN_POLICY' then
    raise exception 'Política incompleta deve falhar fechado: %', v_result;
  end if;

  v_result := internal_finance.classify_receivable_renegotiation_eligibility(
    '{"exists":true,"identityComplete":true,"open":true,"partialPayment":false,
      "proescManaged":false,"conflictingSource":false,"remotePaid":false,
      "operationInProgress":false,"renegotiationConflict":false,
      "supportedCharge":true,"supportedSource":true,"bankManaged":false,
      "bankCancelable":false,"policyReadable":true}'::jsonb
  );
  if not (v_result ->> 'eligible')::boolean or v_result ->> 'code' <> 'ELIGIBLE' then
    raise exception 'Parcela local íntegra deveria ser elegível: %', v_result;
  end if;
end;
$test$;

rollback;
