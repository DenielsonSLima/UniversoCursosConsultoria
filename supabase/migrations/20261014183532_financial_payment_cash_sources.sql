BEGIN;

-- Read-only rows for existing cash readers: paid components and the open balance.
-- The original obligation is never edited by these projections.

CREATE FUNCTION internal_financial_payments.cash_receivables()
RETURNS SETOF public.contas_receber
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT c.* FROM public.contas_receber c
  WHERE NOT EXISTS(SELECT 1 FROM public.financial_payment_events e
    WHERE e.source_kind='RECEIVABLE' AND e.source_id=c.id AND e.reversed_at IS NULL)
  UNION ALL
  SELECT (jsonb_populate_record(c,jsonb_build_object(
      'status','PENDENTE','valor',balance.remaining,'valor_pago',0,
      'data_pagamento',NULL,'conta_bancaria_id',NULL,'manual_settlement_id',NULL))).*
  FROM public.contas_receber c
  CROSS JOIN LATERAL (SELECT internal_financial_payments.cash_remaining('RECEIVABLE',c.id,c.valor) remaining) balance
  WHERE EXISTS(SELECT 1 FROM public.financial_payment_events e
    WHERE e.source_kind='RECEIVABLE' AND e.source_id=c.id AND e.reversed_at IS NULL)
    AND balance.remaining>0
  UNION ALL
  SELECT (jsonb_populate_record(c,jsonb_build_object(
      'id',p.id,'status','PAGO','valor',(p.principal_cents+p.discount_cents)::numeric/100,
      'valor_pago',p.amount_cents::numeric/100,'data_pagamento',p.payment_date,
      'conta_bancaria_id',p.account_id,'forma_pagamento',p.method,
      'manual_settlement_id',p.event_id,'manual_settlement_reversed_at',NULL,
      'manual_settlement_principal_cents',p.principal_cents+p.discount_cents,
      'manual_settlement_interest_cents',p.interest_cents,
      'manual_settlement_penalty_cents',p.penalty_cents,
      'manual_settlement_addition_cents',p.addition_cents,
      'manual_settlement_discount_cents',p.discount_cents,
      'manual_settlement_received_cents',p.amount_cents,
      'gateway_settlement_channel',p.method,'gateway_fee_value',0,
      'gateway_net_value',p.amount_cents::numeric/100,'asaas_fee_value',0,
      'asaas_net_value',p.amount_cents::numeric/100))).*
  FROM public.contas_receber c
  JOIN internal_financial_payments.cash_components() p
    ON p.source_kind='RECEIVABLE' AND p.source_id=c.id;
$$;
REVOKE ALL ON FUNCTION internal_financial_payments.cash_receivables()
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION internal_financial_payments.cash_expenses()
RETURNS SETOF public.despesas_lancamentos
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT c.* FROM public.despesas_lancamentos c
  WHERE NOT EXISTS(SELECT 1 FROM public.financial_payment_events e
    WHERE e.source_kind='EXPENSE' AND e.source_id=c.id AND e.reversed_at IS NULL)
  UNION ALL
  SELECT (jsonb_populate_record(c,jsonb_build_object(
      'status','PENDENTE','valor',balance.remaining,'valor_pago',0,
      'data_pagamento',NULL,'conta_bancaria_id',NULL,'valor_base',balance.remaining,
      'juros_valor',0,'multa_valor',0,'desconto_valor',0))).*
  FROM public.despesas_lancamentos c
  CROSS JOIN LATERAL (SELECT internal_financial_payments.cash_remaining('EXPENSE',c.id,c.valor) remaining) balance
  WHERE EXISTS(SELECT 1 FROM public.financial_payment_events e
    WHERE e.source_kind='EXPENSE' AND e.source_id=c.id AND e.reversed_at IS NULL)
    AND balance.remaining>0
  UNION ALL
  SELECT (jsonb_populate_record(c,jsonb_build_object(
      'id',p.id,'status','PAGO','valor',(p.principal_cents+p.discount_cents)::numeric/100,
      'valor_pago',p.amount_cents::numeric/100,'data_pagamento',p.payment_date,
      'conta_bancaria_id',p.account_id,'forma_pagamento',p.method,
      'valor_base',(p.principal_cents+p.discount_cents)::numeric/100,
      'juros_valor',p.interest_cents::numeric/100,
      'multa_valor',p.penalty_cents::numeric/100,
      'desconto_valor',p.discount_cents::numeric/100))).*
  FROM public.despesas_lancamentos c
  JOIN internal_financial_payments.cash_components() p
    ON p.source_kind='EXPENSE' AND p.source_id=c.id;
$$;
REVOKE ALL ON FUNCTION internal_financial_payments.cash_expenses()
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION internal_financial_payments.cash_payables()
RETURNS SETOF public.contas_pagar
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT c.* FROM public.contas_pagar c
  WHERE NOT EXISTS(SELECT 1 FROM public.financial_payment_events e
    WHERE e.source_kind='PAYABLE' AND e.source_id=c.id AND e.reversed_at IS NULL)
  UNION ALL
  SELECT (jsonb_populate_record(c,jsonb_build_object(
      'status','PENDENTE','valor',balance.remaining,'valor_pago',0,
      'data_pagamento',NULL,'conta_bancaria_id',NULL))).*
  FROM public.contas_pagar c
  CROSS JOIN LATERAL (SELECT internal_financial_payments.cash_remaining('PAYABLE',c.id,c.valor) remaining) balance
  WHERE EXISTS(SELECT 1 FROM public.financial_payment_events e
    WHERE e.source_kind='PAYABLE' AND e.source_id=c.id AND e.reversed_at IS NULL)
    AND balance.remaining>0
  UNION ALL
  SELECT (jsonb_populate_record(c,jsonb_build_object(
      'id',p.id,'status','PAGO','valor',(p.principal_cents+p.discount_cents)::numeric/100,
      'valor_pago',p.amount_cents::numeric/100,'data_pagamento',p.payment_date,
      'conta_bancaria_id',p.account_id,'forma_pagamento',p.method))).*
  FROM public.contas_pagar c
  JOIN internal_financial_payments.cash_components() p
    ON p.source_kind='PAYABLE' AND p.source_id=c.id;
$$;
REVOKE ALL ON FUNCTION internal_financial_payments.cash_payables()
  FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
