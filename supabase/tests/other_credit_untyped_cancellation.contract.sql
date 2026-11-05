-- Run after 20261105193000; only composite values are inspected, no financial data is changed.
DO $test$
DECLARE
  r public.contas_receber;
  base public.contas_receber;
BEGIN
  r := jsonb_populate_record(NULL::public.contas_receber, jsonb_build_object(
    'id', gen_random_uuid(), 'polo_id', gen_random_uuid(),
    'categoria', 'OUTROS_CREDITOS', 'status', 'PENDENTE', 'origem_pagamento', 'LOCAL'));
  IF NOT internal_other_credit_cancellation.eligible(r) THEN
    RAISE EXCEPTION 'Untyped standalone local credit must remain selectable';
  END IF;
  base := r;
  r.tipo_lancamento := 'OUTRO_CREDITO';
  IF NOT internal_other_credit_cancellation.eligible(r) THEN
    RAISE EXCEPTION 'Explicit standalone credit regressed';
  END IF;
  r := base; r.tipo_lancamento := 'PARCELA';
  IF internal_other_credit_cancellation.eligible(r) THEN RAISE EXCEPTION 'Academic kind accepted'; END IF;
  r := base; r.matricula_id := gen_random_uuid();
  IF internal_other_credit_cancellation.eligible(r) THEN RAISE EXCEPTION 'Enrollment accepted'; END IF;
  r := base; r.turma_id := gen_random_uuid();
  IF internal_other_credit_cancellation.eligible(r) THEN RAISE EXCEPTION 'Class accepted'; END IF;
  r := base; r.ead_checkout_attempt_id := gen_random_uuid();
  IF internal_other_credit_cancellation.eligible(r) THEN RAISE EXCEPTION 'EAD accepted'; END IF;
  r := base; r.outros_creditos_plano_id := gen_random_uuid();
  IF internal_other_credit_cancellation.eligible(r) THEN RAISE EXCEPTION 'Untyped plan accepted'; END IF;
  r := base; r.valor_pago := 1;
  IF internal_other_credit_cancellation.eligible(r) THEN RAISE EXCEPTION 'Payment accepted'; END IF;
  r := base; r.status := 'PAGO';
  IF internal_other_credit_cancellation.eligible(r) THEN RAISE EXCEPTION 'Paid credit accepted'; END IF;
  r := base; r.origem_pagamento := 'SISTEMA_ANTERIOR';
  IF internal_other_credit_cancellation.eligible(r) THEN RAISE EXCEPTION 'Legacy accepted'; END IF;
  r := base;
  r.origem_pagamento := 'BANESE'; r.gateway_provider := 'banese_card';
  r.gateway_payment_method := 'BOLETO'; r.forma_pagamento := 'BOLETO';
  r.gateway_environment := 'sandbox'; r.gateway_submission_channel := 'API';
  r.gateway_submission_status := 'API_REGISTERED'; r.gateway_status := 'PENDING';
  r.gateway_boleto_issued_at := now(); r.gateway_financial_terms_confirmed_at := now();
  r.gateway_financial_terms := '{}'::jsonb;
  r.gateway_payment_id := '000000001'; r.gateway_boleto_nosso_numero := '000000001';
  IF NOT internal_other_credit_cancellation.eligible(r) THEN
    RAISE EXCEPTION 'Registered untyped standalone bank credit must remain selectable';
  END IF;
  base := r;
  r.gateway_submission_status := 'API_AMBIGUOUS';
  IF internal_other_credit_cancellation.eligible(r) THEN RAISE EXCEPTION 'Ambiguous bank accepted'; END IF;
  r := base; r.gateway_submission_channel := 'CNAB240';
  IF internal_other_credit_cancellation.eligible(r) THEN RAISE EXCEPTION 'CNAB accepted'; END IF;
  r := base; r.gateway_status := 'PAID';
  IF internal_other_credit_cancellation.eligible(r) THEN RAISE EXCEPTION 'Bank payment accepted'; END IF;
END;
$test$;
