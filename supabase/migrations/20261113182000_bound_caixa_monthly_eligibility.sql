-- Bound monthly candidates before any EAD/evidence lookup; keep financial rules intact.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '5s';
DO $patch$
DECLARE
  v_oid regprocedure := 'internal_contas.caixa_monthly_delinquency(uuid,date,date)'::regprocedure;
  v_definition text := pg_get_functiondef(v_oid);
  v_metadata jsonb;
  v_change record;
BEGIN
  SELECT to_jsonb(p)-'prosrc' INTO STRICT v_metadata FROM pg_proc p WHERE p.oid=v_oid;
  IF md5(v_definition) IS DISTINCT FROM '52f6b7586248cb2213a95c033db8d592' THEN
    RAISE EXCEPTION 'Monthly delinquency drift; review bounded candidates before applying';
  END IF;
  FOR v_change IN SELECT * FROM (VALUES
    (
$old$  ), source_rows as materialized ($old$,
$new$  ), eligible_receivables as materialized (
    -- The fence keeps costly per-receivable predicates after month/scope bounds.
    select c.*
    from internal_financial_payments.cash_receivables() c cross join cutoff b
    where c.data_vencimento>=b.inicio and c.data_vencimento<b.fim
      and (p_polo_id is null or c.polo_id=p_polo_id)
      and c.status in ('PAGO','PENDENTE','VENCIDO','AGUARDANDO_CONFIRMACAO','AGUARDANDO_PAGAMENTO')
  ), source_rows as materialized ($new$
    ),
    (
$old$    from internal_financial_payments.cash_receivables() c cross join cutoff b
    left join internal_proesc.obligation_links$old$,
$new$    from eligible_receivables c cross join cutoff b
    left join internal_proesc.obligation_links$new$
    ),
    (
$old$internal_proesc.reconciliation_source_system(c)$old$,
$new$internal_proesc.reconciliation_source_system(c::public.contas_receber)$new$
    ),
    (
$old$internal_contas.caixa_proesc_effective_snapshot(c,l.id)$old$,
$new$internal_contas.caixa_proesc_effective_snapshot(c::public.contas_receber,l.id)$new$
    )
  ) changes(before_text,after_text)
  LOOP
    IF (length(v_definition)-length(replace(v_definition,v_change.before_text,'')))
      /length(v_change.before_text)<>1 THEN
      RAISE EXCEPTION 'Monthly delinquency optimization anchor is not unique';
    END IF;
    v_definition := replace(v_definition,v_change.before_text,v_change.after_text);
  END LOOP;
  EXECUTE v_definition;
  IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE p.oid=v_oid) IS DISTINCT FROM v_metadata
    OR pg_get_functiondef(v_oid) IS DISTINCT FROM v_definition THEN
    RAISE EXCEPTION 'Monthly delinquency optimization changed metadata or unreviewed SQL';
  END IF;
END;
$patch$;
NOTIFY pgrst, 'reload schema';
