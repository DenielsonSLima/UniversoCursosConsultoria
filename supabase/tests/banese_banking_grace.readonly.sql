-- Run after migration20260912221000 inside the caller's rollback transaction.
-- Pure projection checks: no receivable, queue or accounting mutation.
DO $$
DECLARE
  v_row record;
  v_terms jsonb := '{"nominalAmount":279.90,"dueDate":"2026-09-06",
    "discount":{"type":"fixed","value":19.90,"validUntil":"2026-09-06"},
    "penalty":{"type":"fixed","value":5.60,"startsOn":"2026-09-07"},
    "interest":{"type":"daily-fixed","value":0.09,"startsOn":"2026-09-07"}}';
  v_test record;
BEGIN
  FOR v_test IN SELECT * FROM (VALUES
    ('2026-01-01'::date,'2026-01-02'::date),('2026-02-14','2026-02-18'),
    ('2026-02-16','2026-02-18'),('2026-02-17','2026-02-18'),
    ('2026-04-03','2026-04-06'),('2026-04-21','2026-04-22'),
    ('2026-05-01','2026-05-04'),('2026-06-04','2026-06-05'),
    ('2026-09-06','2026-09-08'),('2026-10-12','2026-10-13'),
    ('2026-11-02','2026-11-03'),('2026-11-15','2026-11-16'),
    ('2026-11-20','2026-11-23'),('2026-12-25','2026-12-28'),
    ('2026-02-18','2026-02-18'),('2026-06-05','2026-06-05')
  ) AS cases(due_date,expected_date) LOOP
    IF public.banese_next_national_banking_day(v_test.due_date) IS DISTINCT FROM v_test.expected_date THEN
      RAISE EXCEPTION 'Calendar regression for %',v_test.due_date;
    END IF;
  END LOOP;
  IF public.banese_next_national_banking_day('2027-09-05') IS NOT NULL THEN
    RAISE EXCEPTION 'Unverified year received banking grace';
  END IF;
  SELECT * INTO v_row FROM public.resolve_receivable_financial_composition(
    279.90,260,'2026-09-06','2026-09-08',v_terms,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL);
  IF v_row.desconto IS DISTINCT FROM 19.90 OR v_row.juros IS DISTINCT FROM 0
     OR v_row.multa IS DISTINCT FROM 0 OR v_row.valor_recebido IS DISTINCT FROM 260
     OR v_row.diferenca_nao_discriminada IS DISTINCT FROM 0
     OR v_row.composicao_status <> 'CONCILIADO_POR_FORMULA_BANESE' THEN
    RAISE EXCEPTION 'Grace payment composition differs';
  END IF;
  SELECT * INTO v_row FROM public.resolve_receivable_financial_composition(
    279.90,260,'2026-09-06','2026-09-09',v_terms,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL);
  IF v_row.composicao_status <> 'NAO_DISCRIMINADA_PELO_GATEWAY' THEN
    RAISE EXCEPTION 'Grace incorrectly extended after banking due date';
  END IF;
  SELECT * INTO v_row FROM public.resolve_receivable_financial_composition(
    279.90,270,'2026-09-06','2026-09-08',v_terms,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL);
  IF v_row.composicao_status <> 'NAO_DISCRIMINADA_PELO_GATEWAY' THEN
    RAISE EXCEPTION 'Intermediate partial amount incorrectly resolved';
  END IF;
  SELECT * INTO v_row FROM public.resolve_receivable_financial_composition(
    279.90,260,'2026-09-06','2026-09-08',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL);
  IF v_row.composicao_status <> 'NAO_DISCRIMINADA_PELO_GATEWAY' THEN
    RAISE EXCEPTION 'Missing terms incorrectly resolved';
  END IF;
  SELECT * INTO v_row FROM public.resolve_receivable_financial_composition(
    279.90,260,'2026-09-06','2026-09-08',v_terms,
    '11111111-1111-4111-8111-111111111111',NULL,27990,0,0,0,1990,26000);
  IF v_row.composicao_status <> 'COMPOSICAO_EXPLICITA' THEN
    RAISE EXCEPTION 'Manual composition precedence changed';
  END IF;
END;
$$;
