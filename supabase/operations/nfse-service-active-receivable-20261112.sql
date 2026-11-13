-- Authorized in the active session: create a local title for active NFS-e 7, due 30/11/2026.
-- Must run after the local cancellation of NFS-e 6 is confirmed. No BolePix is requested.
BEGIN;
DO $repair$
DECLARE o private.nfse_individual_operations%ROWTYPE;s private.nfse_partner_services%ROWTYPE;
  c public.contas_receber%ROWTYPE;v_category uuid;v_receivable uuid;
BEGIN
  SELECT * INTO STRICT c FROM public.contas_receber
    WHERE id='6eb7c97a-a8f2-44b8-a119-5247f92e0e1d' FOR UPDATE;
  IF c.status IS DISTINCT FROM 'CANCELADO' OR NOT EXISTS(SELECT 1 FROM private.nfse_service_cancellation_jobs j
    WHERE j.receivable_id=c.id AND j.state='DONE' AND j.outcome='LOCAL_CANCELLED') THEN
    RAISE EXCEPTION 'The prior local cancellation has not been confirmed.' USING ERRCODE='40001';
  END IF;
  SELECT * INTO STRICT o FROM private.nfse_individual_operations
    WHERE id='56c41df8-b940-4b75-821e-79048b3ef305' FOR UPDATE;
  SELECT * INTO STRICT s FROM private.nfse_partner_services
    WHERE id='933e7803-871a-48a4-9669-6d50ecf508c5' FOR UPDATE;
  IF o.state IS DISTINCT FROM 'AUTHORIZED' OR o.environment IS DISTINCT FROM 'PRODUCAO' OR o.result->>'number' IS DISTINCT FROM '7'
    OR o.authorized_xml IS NULL OR o.snapshot#>>'{source,id}' IS DISTINCT FROM s.id::text
    OR s.amount IS DISTINCT FROM 14863.71 OR s.polo_id IS DISTINCT FROM c.polo_id OR s.partner_id IS DISTINCT FROM c.cliente_id
    OR EXISTS(SELECT 1 FROM private.nfse_individual_cancellations x
      WHERE x.operation_id=o.id AND x.state='CANCELLED') THEN
    RAISE EXCEPTION 'The active invoice differs from the authorized correction.' USING ERRCODE='40001';
  END IF;
  SELECT receivable_id INTO v_receivable FROM private.nfse_service_receivables WHERE service_id=s.id;
  IF v_receivable IS NULL THEN
    IF s.receivable_id IS NOT NULL OR s.receivable_action IS DISTINCT FROM 'NONE'
      OR EXISTS(SELECT 1 FROM private.nfse_service_financial_plans WHERE service_id=s.id) THEN
      RAISE EXCEPTION 'The service financial plan changed before correction.' USING ERRCODE='40001';
    END IF;
    SELECT default_category_id INTO STRICT v_category FROM private.nfse_service_financial_policy WHERE singleton;
    INSERT INTO private.nfse_service_financial_plans(service_id,due_date,category_id,rule,issue_bolepix,requested_by)
      VALUES(s.id,date '2026-11-30',v_category,'EXPLICIT',false,o.actor_id);
    v_receivable:=private.ensure_nfse_service_receivable(o.id);
  END IF;
  SELECT * INTO STRICT c FROM public.contas_receber WHERE id=v_receivable;
  IF c.valor IS DISTINCT FROM 14863.71 OR c.data_vencimento IS DISTINCT FROM date '2026-11-30'
    OR c.polo_id IS DISTINCT FROM s.polo_id OR c.cliente_id IS DISTINCT FROM s.partner_id
    OR NOT EXISTS(SELECT 1 FROM private.nfse_service_financial_plans p WHERE p.service_id=s.id
      AND p.rule='EXPLICIT' AND NOT p.issue_bolepix AND p.existing_receivable_id IS NULL
      AND p.due_date=date '2026-11-30')
    OR NOT EXISTS(SELECT 1 FROM private.nfse_service_receivables l
      WHERE l.receivable_id=c.id AND l.service_id=s.id AND l.operation_id=o.id AND l.fiscal_number='7')
    OR EXISTS(SELECT 1 FROM private.nfse_service_bolepix_jobs WHERE receivable_id=c.id) THEN
    RAISE EXCEPTION 'The resulting receivable does not match the authorized terms.' USING ERRCODE='40001';
  END IF;
END;
$repair$;
COMMIT;
