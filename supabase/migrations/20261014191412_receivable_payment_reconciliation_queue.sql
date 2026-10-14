BEGIN;
-- The worker is an invoker function. Expose only this service-role gate rather
-- than granting access to private attempts or changing the worker's ACL model.
CREATE FUNCTION public.receivable_payment_reconciliation_available_service(p_receivable_id uuid,p_lock boolean)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM internal_other_credit_cancellation.service_only();
 IF p_lock THEN
   PERFORM 1 FROM public.contas_receber WHERE id=p_receivable_id FOR UPDATE SKIP LOCKED;
   IF NOT FOUND THEN RETURN false; END IF;
 END IF;
 -- VOLATILE ensures this check gets a fresh snapshot after acquiring the source.
 RETURN NOT EXISTS(SELECT 1 FROM internal_receivable_payments.attempts
   WHERE receivable_id=p_receivable_id AND state NOT IN ('COMPLETE','FAILED_SAFE'));
END $$;
REVOKE ALL ON FUNCTION public.receivable_payment_reconciliation_available_service(uuid,boolean)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.receivable_payment_reconciliation_available_service(uuid,boolean) TO service_role;

DO $patch$
DECLARE definition text; old_text text; new_text text;
BEGIN
 definition:=pg_get_functiondef('public.prepare_banese_reconciliation_batch_v3()'::regprocedure);
 IF md5(definition)<>'4caa12e911e76c6ffc0e0871365e0d52' THEN
   RAISE EXCEPTION 'PAYMENT_RECONCILIATION_DEFINITION_DRIFT';
 END IF;
 definition:=replace(definition,
   $old$WHERE queue.environment = v_environment$old$,
   $new$WHERE queue.environment = v_environment
      AND public.receivable_payment_reconciliation_available_service(receivable.id,false)$new$);
 definition:=replace(definition,'candidates AS MATERIALIZED (','ranked_candidates AS MATERIALIZED (');
 definition:=replace(definition,
   $old$    JOIN public.banese_reconciliation_queue AS locked_queue
      ON locked_queue.receivable_id = eligible.receivable_id
$old$,'');
 old_text:=$old$    LIMIT v_available
    FOR UPDATE OF locked_queue SKIP LOCKED
  ),
  created_run AS ($old$;
 new_text:=$new$    LIMIT v_available
  ),
  source_candidates AS MATERIALIZED (
    SELECT ranked.* FROM ranked_candidates ranked
    WHERE public.receivable_payment_reconciliation_available_service(ranked.receivable_id,true)
  ),
  candidates AS MATERIALIZED (
    SELECT source.* FROM source_candidates source
    JOIN public.banese_reconciliation_queue locked_queue
      ON locked_queue.receivable_id=source.receivable_id
    FOR UPDATE OF locked_queue SKIP LOCKED
  ),
  created_run AS ($new$;
 IF strpos(definition,old_text)=0 THEN RAISE EXCEPTION 'PAYMENT_RECONCILIATION_CANDIDATES_DRIFT'; END IF;
 -- Lock bounded source candidates first, then queue rows. A receipt cannot start
 -- between the fresh attempt check and queue lease; busy sources never abort peers.
 EXECUTE replace(definition,old_text,new_text);
END $patch$;
NOTIFY pgrst,'reload schema';
COMMIT;
