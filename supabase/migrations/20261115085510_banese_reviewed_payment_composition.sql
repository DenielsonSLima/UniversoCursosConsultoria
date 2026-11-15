begin;

-- This evidence records an explicit review of an official payment total.
-- It does not establish individual interest, penalty or discount amounts.
create function internal_contas.banese_payment_variance_review_matches(
  p_review jsonb, p_receivable_id uuid, p_environment text, p_nosso_numero text,
  p_nominal numeric, p_paid numeric, p_due date, p_payment_date date,
  p_financial_terms jsonb
) returns boolean language plpgsql immutable security invoker set search_path = ''
as $review$
declare
  v_range jsonb;
begin
  if jsonb_typeof(p_review) is distinct from 'object'
    or not (p_review ?& array['receivableId','environment','nossoNumero','amount',
      'paymentDate','financialTerms','calculatedRange','authority','reason',
      'reviewedAt','varianceFromCalculatedExpected','varianceFromNominal','paidComponents'])
    or p_review->>'authority' is distinct from 'EXPLICIT_MANAGER_REVIEW'
    or p_review->>'reason' is distinct from 'OFFICIAL_PAYMENT_CONFIRMED_WITH_UNITEMIZED_VARIANCE'
    or p_review->'paidComponents' is distinct from 'null'::jsonb
    or p_receivable_id is null or p_environment is null or p_nosso_numero is null
    or p_review->>'receivableId' is distinct from p_receivable_id::text
    or p_environment not in ('production','sandbox')
    or p_review->>'environment' is distinct from p_environment
    or p_nosso_numero !~ '^[0-9]{9}$'
    or p_review->>'nossoNumero' is distinct from p_nosso_numero
    or p_nominal is null or p_nominal <= 0 or p_paid is null or p_paid <= 0
    or jsonb_typeof(p_review->'amount') is distinct from 'number'
    or p_due is null or p_payment_date is null
    or not isfinite(p_due) or not isfinite(p_payment_date)
    or p_review->'amount' is distinct from to_jsonb(round(p_paid,2))
    or p_review->>'paymentDate' is distinct from p_payment_date::text
    or coalesce(p_review->>'reviewedAt','') !~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?Z$'
    or jsonb_typeof(p_review->'financialTerms') is distinct from 'object'
    or jsonb_typeof(p_financial_terms) is distinct from 'object'
    or jsonb_typeof(p_review#>'{financialTerms,nominalAmount}') is distinct from 'number'
    or p_review#>'{financialTerms,nominalAmount}' is distinct from to_jsonb(round(p_nominal,2))
    or p_review#>>'{financialTerms,dueDate}' is distinct from p_due::text
    or p_review#>'{financialTerms,nominalAmount}' is distinct from p_financial_terms->'nominalAmount'
    or p_review#>'{financialTerms,dueDate}' is distinct from p_financial_terms->'dueDate'
    or coalesce(p_review#>'{financialTerms,discount}','null'::jsonb)
      is distinct from coalesce(p_financial_terms->'discount','null'::jsonb)
    or coalesce(p_review#>'{financialTerms,penalty}','null'::jsonb)
      is distinct from coalesce(p_financial_terms->'penalty','null'::jsonb)
    or coalesce(p_review#>'{financialTerms,interest}','null'::jsonb)
      is distinct from coalesce(p_financial_terms->'interest','null'::jsonb)
  then return false; end if;
  perform (p_review->>'reviewedAt')::timestamptz;

  v_range := p_review->'calculatedRange';
  if jsonb_typeof(v_range) is distinct from 'object'
    or jsonb_typeof(v_range->'minimumAmount') is distinct from 'number'
    or jsonb_typeof(v_range->'expectedAmount') is distinct from 'number'
    or jsonb_typeof(v_range->'maximumAmount') is distinct from 'number'
    or (v_range->>'minimumAmount')::numeric <= 0
    or (v_range->>'minimumAmount')::numeric > (v_range->>'expectedAmount')::numeric
    or (v_range->>'expectedAmount')::numeric > (v_range->>'maximumAmount')::numeric
    or p_review->'varianceFromNominal' is distinct from to_jsonb(round(p_paid-p_nominal,2))
    or p_review->'varianceFromCalculatedExpected' is distinct from
      to_jsonb(round(p_paid-(v_range->>'expectedAmount')::numeric,2))
  then return false; end if;
  return true;
exception when invalid_text_representation or numeric_value_out_of_range
  or datetime_field_overflow or invalid_datetime_format then
  return false;
end;
$review$;
revoke all on function internal_contas.banese_payment_variance_review_matches(
  jsonb,uuid,text,text,numeric,numeric,date,date,jsonb
) from public,anon,authenticated,service_role;

-- Mirror the validated review in the same transaction/CAS as the payment.
-- The canonical financial terms and all normal reconciliation checks remain intact.
do $persistence$
declare
  v_oid regprocedure := 'public.persist_banese_reconciliation_snapshot(uuid,text,text,timestamp with time zone,text,text,numeric,date,text,text,jsonb,boolean,boolean,boolean,boolean,numeric,date,text,text,text,text,text,jsonb,jsonb,jsonb)'::regprocedure;
  v_definition text := pg_get_functiondef(v_oid);
  v_before_lock text := $old$  select receivable.*
  into v_receivable$old$;
  v_review_guard text := $guard$  if p_transaction_snapshot ? 'paymentVarianceReview' then
    if p_remote_paid is not true or not internal_contas.banese_payment_variance_review_matches(
      p_transaction_snapshot->'paymentVarianceReview',p_receivable_id,p_environment,
      p_nosso_numero,p_expected_amount,p_payment_total,p_expected_due_date,
      p_payment_date,p_financial_terms
    ) then
      raise exception 'BANESE_PAYMENT_VARIANCE_REVIEW_INVALID' using errcode='22023';
    end if;
  end if;

$guard$;
  v_old_evidence text := $old$        ) else receivable.gateway_settlement_evidence
      end,$old$;
  v_new_evidence text := $new$        ) || case when p_transaction_snapshot ? 'paymentVarianceReview' then
          jsonb_build_object('paymentVarianceReview',p_transaction_snapshot->'paymentVarianceReview')
          else '{}'::jsonb end
        else receivable.gateway_settlement_evidence
      end,$new$;
begin
  if md5(v_definition) <> 'daa006fc2c4909612616d2fd65ead9bb'
    or position(v_before_lock in v_definition)=0
    or position(v_old_evidence in v_definition)=0
  then raise exception 'Banese persistence changed; rebase before applying.'; end if;
  v_definition := replace(v_definition,v_before_lock,v_review_guard || v_before_lock);
  execute replace(v_definition,v_old_evidence,v_new_evidence);
end;
$persistence$;

-- Read only the already joined receipt by PK; no per-row transaction lookup.
-- A malformed/stale review remains unknown and never falls back to formula.
do $composition$
declare
  v_oid regprocedure := 'public.resolve_integrated_receivable_financial_composition(uuid,numeric,numeric,date,date,jsonb,uuid,timestamp with time zone,bigint,bigint,bigint,bigint,bigint,bigint)'::regprocedure;
  v_definition text := pg_get_functiondef(v_oid);
  v_old text := $old$  v_addition numeric;
begin
  if p_manual_id is null and p_receivable_id is not null then$old$;
  v_new text := $new$  v_addition numeric;
  v_review_receipt record;
  v_review jsonb;
  v_review_valid boolean;
begin
  if p_manual_id is null and p_receivable_id is not null then
    select receipt.status,receipt.origem_pagamento,receipt.manual_settlement_id,
      receipt.valor,receipt.valor_pago,receipt.data_vencimento,receipt.data_pagamento,
      receipt.gateway_financial_terms,receipt.gateway_environment,
      receipt.gateway_boleto_nosso_numero,receipt.gateway_settlement_evidence
    into v_review_receipt
    from public.contas_receber receipt
    where receipt.id=p_receivable_id and receipt.gateway_provider='banese_card'
      and receipt.gateway_payment_method='BOLETO'
      and receipt.gateway_settlement_evidence ? 'paymentVarianceReview';
    if found then
      v_review := v_review_receipt.gateway_settlement_evidence->'paymentVarianceReview';
      v_review_valid := v_review_receipt.status='PAGO'
        and v_review_receipt.origem_pagamento='BANESE'
        and v_review_receipt.manual_settlement_id is null
        and v_review_receipt.valor is not distinct from p_valor_base
        and v_review_receipt.valor_pago is not distinct from p_valor_pago
        and v_review_receipt.data_vencimento is not distinct from p_data_vencimento
        and v_review_receipt.data_pagamento is not distinct from p_data_pagamento
        and v_review_receipt.gateway_financial_terms is not distinct from p_financial_terms
        and internal_contas.banese_payment_variance_review_matches(
          v_review,p_receivable_id,v_review_receipt.gateway_environment,
          v_review_receipt.gateway_boleto_nosso_numero,p_valor_base,p_valor_pago,
          p_data_vencimento,p_data_pagamento,p_financial_terms
        );
      return query select p_valor_base,NULL::numeric,NULL::numeric,NULL::numeric,
        NULL::numeric,p_valor_pago-p_valor_base,
        case when v_review_valid then 'NAO_DISCRIMINADA_PELO_GATEWAY'::text
          else 'NAO_DISCRIMINADA'::text end,p_valor_pago;
      return;
    end if;
  end if;
  if p_manual_id is null and p_receivable_id is not null then$new$;
begin
  if md5(v_definition) <> 'd104221899227e97a2e02fb39f65860a'
    or position(v_old in v_definition)=0
  then raise exception 'Financial composition changed; rebase before applying.'; end if;
  execute replace(v_definition,v_old,v_new);
end;
$composition$;

commit;
