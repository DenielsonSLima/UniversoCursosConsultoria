-- Authorized in the active session: close only the local receivable of cancelled NFS-e 6.
-- Does not transmit a fiscal or bank cancellation. The existing worker completes the local audit.
BEGIN;
DO $repair$
DECLARE c public.contas_receber%ROWTYPE;l private.nfse_service_receivables%ROWTYPE;
  o private.nfse_individual_operations%ROWTYPE;x private.nfse_individual_cancellations%ROWTYPE;
  b private.nfse_service_bolepix_jobs%ROWTYPE;
BEGIN
  SELECT * INTO STRICT c FROM public.contas_receber
    WHERE id='6eb7c97a-a8f2-44b8-a119-5247f92e0e1d' FOR UPDATE;
  SELECT * INTO STRICT l FROM private.nfse_service_receivables WHERE receivable_id=c.id FOR UPDATE;
  SELECT * INTO STRICT o FROM private.nfse_individual_operations WHERE id=l.operation_id;
  SELECT * INTO STRICT x FROM private.nfse_individual_cancellations
    WHERE id='81b43427-205d-4b20-bcd3-1b184821c881' AND operation_id=o.id;
  SELECT * INTO b FROM private.nfse_service_bolepix_jobs WHERE receivable_id=c.id;
  IF l.origin IS DISTINCT FROM 'HISTORICAL' OR l.fiscal_number IS DISTINCT FROM '6' OR c.valor IS DISTINCT FROM 14863.71
    OR c.data_vencimento IS DISTINCT FROM date '2026-11-30' OR o.environment IS DISTINCT FROM 'PRODUCAO'
    OR l.fiscal_cancelled_at IS NULL OR private.nfse_service_cancellation_proven(x.id) IS NOT TRUE
    OR private.nfse_service_cancellation_has_payment(c) IS DISTINCT FROM false
    OR private.nfse_service_cancellation_is_local(c,b) IS NOT TRUE
    OR c.status IS NULL OR c.status NOT IN ('PENDENTE','CANCELADO') THEN
    RAISE EXCEPTION 'Authorized local correction does not match the original facts.' USING ERRCODE='40001';
  END IF;
  IF c.status='CANCELADO' THEN
    IF NOT EXISTS(SELECT 1 FROM private.nfse_service_cancellation_jobs j
      WHERE j.receivable_id=c.id AND j.state='DONE' AND j.outcome='LOCAL_CANCELLED') THEN
      RAISE EXCEPTION 'Local cancellation audit is missing.' USING ERRCODE='40001';
    END IF;
    RETURN;
  END IF;
  INSERT INTO private.nfse_service_cancellation_jobs(receivable_id,service_id,operation_id,cancellation_id,
    fiscal_actor_id,fiscal_context_key,bank_actor_id,polo_id,month,intent)
  VALUES(c.id,l.service_id,o.id,x.id,o.actor_id,o.context_id,o.actor_id,c.polo_id,o.month,
    private.nfse_service_cancellation_identity(c,l)) ON CONFLICT(receivable_id) DO NOTHING;
END;
$repair$;
COMMIT;
