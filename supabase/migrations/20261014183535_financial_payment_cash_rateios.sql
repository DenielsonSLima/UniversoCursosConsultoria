BEGIN;
-- Economic allocations follow the original proportions. They never create a
-- second physical bank movement; only cash_components feeds bank balances.
CREATE FUNCTION internal_financial_payments.cash_expense_allocations()
RETURNS SETOF public.despesas_lancamentos_rateios
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  WITH weights AS (
    SELECT r AS source,r.despesa_lancamento_id,r.id,r.polo_id,
      round(r.valor_total*100)::bigint weight,
      sum(round(r.valor_total*100)) OVER (PARTITION BY r.despesa_lancamento_id)::bigint total_weight,
      coalesce(sum(round(r.valor_total*100)) OVER (
        PARTITION BY r.despesa_lancamento_id ORDER BY r.polo_id,r.id
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0)::bigint before_weight
    FROM public.despesas_lancamentos_rateios r
  ), paid AS (
    SELECT w.*,p.id component_id,p.payment_date,
      p.interest_cents+p.penalty_cents+p.addition_cents charges,
      p.interest_cents,p.penalty_cents,p.addition_cents,p.amount_cents,
      internal_financial_payments.cash_part(p.amount_cents,w.before_weight,w.weight,w.total_weight) cash_part,
      floor(p.amount_cents::numeric*w.before_weight/w.total_weight)::bigint cash_before,
      internal_financial_payments.cash_part(p.discount_cents,w.before_weight,w.weight,w.total_weight) discount_part
    FROM weights w JOIN internal_financial_payments.cash_components() p
      ON p.source_kind='EXPENSE' AND p.source_id=w.despesa_lancamento_id
    WHERE w.total_weight>0
  ), charged AS (
    SELECT p.*,
      internal_financial_payments.cash_part(charges,cash_before,cash_part,amount_cents) charge_part,
      floor(charges::numeric*cash_before/amount_cents)::bigint charge_before
    FROM paid p
  ), composed AS (
    SELECT c.*,
      internal_financial_payments.cash_part(interest_cents,charge_before,charge_part,charges) interest_part
    FROM charged c
  ), completed AS (
    SELECT c.*,internal_financial_payments.cash_part(penalty_cents,
      charge_before-CASE WHEN charges>0 THEN floor(interest_cents::numeric*charge_before/charges)::bigint ELSE 0 END,
      charge_part-interest_part,charges-interest_cents) penalty_part
    FROM composed c
  )
  SELECT r.* FROM public.despesas_lancamentos_rateios r
  WHERE NOT EXISTS (SELECT 1 FROM public.financial_payment_events e
    WHERE e.source_kind='EXPENSE' AND e.source_id=r.despesa_lancamento_id AND e.reversed_at IS NULL)
  UNION ALL
  SELECT (jsonb_populate_record(w.source,jsonb_build_object(
    'status','PENDENTE','valor_base',allocation.amount::numeric/100,
    'juros_valor',0,'multa_valor',0,'desconto_valor',0,
    'valor_total',allocation.amount::numeric/100,'data_pagamento',NULL))).*
  FROM weights w JOIN public.despesas_lancamentos d ON d.id=w.despesa_lancamento_id
  CROSS JOIN LATERAL (SELECT internal_financial_payments.cash_part(
    round(internal_financial_payments.cash_remaining('EXPENSE',d.id,d.valor)*100)::bigint,
    w.before_weight,w.weight,w.total_weight) amount) allocation
  WHERE EXISTS (SELECT 1 FROM public.financial_payment_events e
    WHERE e.source_kind='EXPENSE' AND e.source_id=d.id AND e.reversed_at IS NULL)
    AND allocation.amount>0
  UNION ALL
  SELECT (jsonb_populate_record(c.source,jsonb_build_object(
    'despesa_lancamento_id',c.component_id,'status','PAGO',
    'valor_base',(c.cash_part-c.charge_part+c.discount_part)::numeric/100,
    'juros_valor',c.interest_part::numeric/100,
    'multa_valor',c.penalty_part::numeric/100,
    'desconto_valor',c.discount_part::numeric/100,
    'valor_total',c.cash_part::numeric/100,'data_pagamento',c.payment_date))).*
  FROM completed c;
$$;
REVOKE ALL ON FUNCTION internal_financial_payments.cash_expense_allocations()
  FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
