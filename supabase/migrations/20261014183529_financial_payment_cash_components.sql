BEGIN;

-- A monetary component is a cash movement. Allocate charges first, so an
-- allocation can never consume more than the actual cash in that component.
-- Cumulative integer allocation conserves every cent, including odd splits.
CREATE FUNCTION internal_financial_payments.cash_part(
  p_total bigint,p_before bigint,p_weight bigint,p_weights bigint
) RETURNS bigint LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE WHEN p_weights>0 THEN
    (floor(p_total::numeric*(p_before+p_weight)/p_weights)
      -floor(p_total::numeric*p_before/p_weights))::bigint ELSE 0::bigint END;
$$;

CREATE FUNCTION internal_financial_payments.cash_components()
RETURNS TABLE (
  id uuid,event_id uuid,source_kind text,source_id uuid,polo_id uuid,
  payment_date date,account_id uuid,method text,amount_cents bigint,
  principal_cents bigint,interest_cents bigint,penalty_cents bigint,
  addition_cents bigint,discount_cents bigint
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  WITH weighted AS (
    SELECT c.*,e.source_kind,e.source_id,e.polo_id,e.payment_date,
      e.payment_cents,e.interest_cents AS event_interest,
      e.penalty_cents AS event_penalty,e.discount_cents AS event_discount,
      e.interest_cents+e.penalty_cents+e.addition_cents AS event_charges,
      coalesce(sum(c.amount_cents) OVER (
        PARTITION BY c.event_id ORDER BY c.sequence
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0)::bigint AS before_cents
    FROM public.financial_payment_components c
    JOIN public.financial_payment_events e ON e.id=c.event_id
    WHERE e.reversed_at IS NULL
  ), charges AS (
    SELECT w.*,
      internal_financial_payments.cash_part(event_charges,before_cents,amount_cents,payment_cents) charge_cents,
      floor(event_charges::numeric*before_cents/payment_cents)::bigint charges_before
    FROM weighted w
  ), parts AS (
    SELECT c.*,
      internal_financial_payments.cash_part(event_interest,charges_before,charge_cents,event_charges) interest_part
    FROM charges c
  ), completed AS (
    SELECT p.*,internal_financial_payments.cash_part(event_penalty,
      charges_before-CASE WHEN event_charges>0 THEN floor(event_interest::numeric*charges_before/event_charges)::bigint ELSE 0 END,
      charge_cents-interest_part,event_charges-event_interest) penalty_part
    FROM parts p
  )
  SELECT p.id,p.event_id,p.source_kind,p.source_id,p.polo_id,p.payment_date,
    p.account_id,p.method,p.amount_cents,p.amount_cents-p.charge_cents,
    p.interest_part,p.penalty_part,
    p.charge_cents-p.interest_part-p.penalty_part,
    internal_financial_payments.cash_part(p.event_discount,p.before_cents,p.amount_cents,p.payment_cents)
  FROM completed p;
$$;

-- Keeps title counts stable when a title appears in several payment movements.
CREATE FUNCTION internal_financial_payments.cash_source_id(p_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT coalesce((SELECT e.source_id FROM public.financial_payment_components c
    JOIN public.financial_payment_events e ON e.id=c.event_id WHERE c.id=p_id),p_id);
$$;

CREATE FUNCTION internal_financial_payments.cash_remaining(p_kind text,p_source uuid,p_nominal numeric)
RETURNS numeric LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT (round(p_nominal*100)-coalesce(sum(e.principal_cents+e.discount_cents),0))/100
  FROM public.financial_payment_events e
  WHERE e.source_kind=p_kind AND e.source_id=p_source AND e.reversed_at IS NULL;
$$;

REVOKE ALL ON FUNCTION internal_financial_payments.cash_part(bigint,bigint,bigint,bigint),
  internal_financial_payments.cash_components(),
  internal_financial_payments.cash_source_id(uuid),
  internal_financial_payments.cash_remaining(text,uuid,numeric)
  FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
