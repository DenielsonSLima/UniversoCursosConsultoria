-- Run after the staged migration, inside its rehearsal transaction or after apply.
-- All financial fixtures are local composite values; no title or receivable is written.
BEGIN;
SET LOCAL statement_timeout='8s';
DO $test$
DECLARE
  v_c public.contas_receber;
  v_s internal_proesc.financial_snapshots;
  v_changed public.contas_receber;
  v_sha text; v_definition text;
BEGIN
  v_c:=jsonb_populate_record(NULL::public.contas_receber,jsonb_build_object(
    'id',gen_random_uuid(),'status','PAGO','valor',100,'valor_pago',100,
    'data_pagamento',current_date,'updated_at',now()-interval '2 hours'));
  v_s:=jsonb_populate_record(NULL::internal_proesc.financial_snapshots,jsonb_build_object(
    'id',gen_random_uuid(),'recorded_at',now()-interval '1 hour',
    'observed_at',now()-interval '1 hour','principal_cents',10000,'received_cents',10000,
    'payment_date',current_date,'source_status','PAID','verification','VERIFIED',
    'evidence_kind','API_PAYMENT_TOTAL','review_reasons','[]'::jsonb,
    'collector_review_reasons','[]'::jsonb));
  v_sha:=internal_proesc.receivable_fingerprint(v_c);
  IF internal_proesc.settled_polling_delay(v_c,v_s,'UNCHANGED','APPLY',true,v_sha)
    <>interval '24 hours' THEN RAISE EXCEPTION 'Confirmed unchanged paid must defer'; END IF;
  IF internal_proesc.settled_polling_delay(v_c,v_s,'UNCHANGED','APPLY',true,NULL)
    <>interval '0' THEN RAISE EXCEPTION 'Manual paid without exact source proof was deferred'; END IF;
  v_changed:=v_c; v_changed.valor_pago:=99;
  IF internal_proesc.settled_polling_delay(v_changed,v_s,'UNCHANGED','APPLY',true,v_sha)
    <>interval '0' THEN RAISE EXCEPTION 'Paid value divergence was deferred'; END IF;
  v_changed:=v_c; v_changed.valor:=101;
  IF internal_proesc.settled_polling_delay(v_changed,v_s,'UNCHANGED','APPLY',true,v_sha)
    <>interval '0' THEN RAISE EXCEPTION 'Principal change was deferred'; END IF;
  v_changed:=v_c; v_changed.data_pagamento:=current_date-1;
  IF internal_proesc.settled_polling_delay(v_changed,v_s,'UNCHANGED','APPLY',true,v_sha)
    <>interval '0' THEN RAISE EXCEPTION 'Payment date divergence was deferred'; END IF;
  v_changed:=v_c; v_changed.data_vencimento:=current_date+7;
  IF internal_proesc.settled_polling_delay(v_changed,v_s,'UNCHANGED','APPLY',true,v_sha)
    <>interval '0' THEN RAISE EXCEPTION 'Full financial fingerprint was not enforced'; END IF;
  v_changed:=v_c; v_changed.updated_at:=now();
  IF internal_proesc.settled_polling_delay(v_changed,v_s,'UNCHANGED','APPLY',true,v_sha)
    <>interval '0' THEN RAISE EXCEPTION 'New local write was deferred'; END IF;
  IF internal_proesc.settled_polling_delay(v_c,v_s,'REVIEW','APPLY',true,v_sha)
    <>interval '0' THEN RAISE EXCEPTION 'Review was deferred'; END IF;
  IF internal_proesc.settled_polling_delay(v_c,v_s,'UNCHANGED','APPLY',false,v_sha)
    <>interval '0' THEN RAISE EXCEPTION 'Unsuccessful run was deferred'; END IF;
  IF internal_proesc.settled_polling_delay(v_c,v_s,'APPLIED','APPLY',true,v_sha)
    <>interval '0' THEN RAISE EXCEPTION 'New settlement must get a confirming follow-up'; END IF;

  v_c.status:='PENDENTE'; v_c.valor_pago:=0; v_c.data_pagamento:=NULL;
  v_s.source_status:='UNKNOWN'; v_s.verification:='REVIEW'; v_s.evidence_kind:='UNRESOLVED';
  v_s.received_cents:=NULL; v_s.payment_date:=NULL;
  v_s.review_reasons:='["ESTADO_REQUER_REVISAO","SEM_CONFIRMACAO"]';
  v_s.collector_review_reasons:='["NO_PAYMENT_IN_OBSERVED_PERIODS"]';
  IF internal_proesc.settled_polling_delay(v_c,v_s,'UNCHANGED','SNAPSHOT',true,NULL)
    <>interval '3 hours' THEN RAISE EXCEPTION 'Ordinary open search was not deferred'; END IF;
  v_changed:=v_c; v_changed.valor_pago:=1;
  IF internal_proesc.settled_polling_delay(v_changed,v_s,'UNCHANGED','SNAPSHOT',true,NULL)
    <>interval '0' THEN RAISE EXCEPTION 'Partial local payment was deferred'; END IF;
  v_s.collector_review_reasons:='["NO_PAYMENT_IN_OBSERVED_PERIODS","SOURCE_CONFLICT"]';
  IF internal_proesc.settled_polling_delay(v_c,v_s,'UNCHANGED','SNAPSHOT',true,NULL)
    <>interval '0' THEN RAISE EXCEPTION 'Collector review was deferred'; END IF;
  v_s.collector_review_reasons:='["NO_PAYMENT_IN_OBSERVED_PERIODS"]';
  v_s.review_reasons:='["ESTADO_REQUER_REVISAO","HISTORICO_ABERTO_NAO_COMPROVADO"]';
  IF internal_proesc.settled_polling_delay(v_c,v_s,'UNCHANGED','SNAPSHOT',true,NULL)
    <>interval '0' THEN RAISE EXCEPTION 'Evidence review was deferred'; END IF;

  v_definition:=pg_get_functiondef('public.proesc_sync_runtime_service(text,uuid,jsonb)'::regprocedure);
  IF (length(v_definition)-length(replace(v_definition,'l.id=ANY(v_due_links)','')))
    /length('l.id=ANY(v_due_links)')<>2
  THEN RAISE EXCEPTION 'Claim and wrap must share polling predicate'; END IF;
  IF (length(v_definition)-length(replace(v_definition,'internal_proesc.sync_due_poll_links()','')))
    /length('internal_proesc.sync_due_poll_links()')<>1
  THEN RAISE EXCEPTION 'A claim must calculate polling cadence only once'; END IF;
  IF position('internal_proesc.refresh_settled_polling(v_state.lease_id)' IN v_definition)=0
  THEN RAISE EXCEPTION 'Finished run must refresh bounded cadence metadata'; END IF;
  IF position('sync_due_poll_links' IN pg_get_functiondef('internal_proesc.assert_sync_lease(uuid,uuid)'::regprocedure))>0
    OR position('sync_due_poll_links' IN pg_get_functiondef('internal_proesc.sync_link_allowed(uuid)'::regprocedure))>0
  THEN RAISE EXCEPTION 'Polling cadence must never invalidate an active lease'; END IF;
  IF has_function_privilege('authenticated',
    'internal_proesc.sync_due_poll_links()','EXECUTE')
    OR has_function_privilege('service_role',
      'internal_proesc.sync_due_poll_links()','EXECUTE')
  THEN RAISE EXCEPTION 'Polling helper exposed outside private runtime'; END IF;
END;
$test$;

DO $cache_test$
DECLARE
  v_link internal_proesc.obligation_links;
  v_c public.contas_receber;
  v_s internal_proesc.financial_snapshots;
  v_run uuid; v_snapshot uuid; v_before text; v_after text;
BEGIN
  SELECT l.* INTO STRICT v_link FROM internal_proesc.obligation_links l
    JOIN public.contas_receber c ON c.id=l.receivable_id
    WHERE l.auto_enabled AND c.status='PAGO' ORDER BY l.id LIMIT 1;
  SELECT * INTO STRICT v_c FROM public.contas_receber WHERE id=v_link.receivable_id;
  v_before:=internal_proesc.receivable_fingerprint(v_c);
  SELECT * INTO STRICT v_s FROM internal_proesc.financial_snapshots
    WHERE link_id=v_link.id ORDER BY observed_at DESC,recorded_at DESC,id DESC LIMIT 1;
  SELECT i.run_id INTO STRICT v_run FROM internal_proesc.sync_run_items i
    JOIN internal_proesc.sync_runs r ON r.id=i.run_id
    WHERE i.snapshot_id=v_s.id AND i.original_snapshot_id IS NULL AND r.status='SUCCEEDED'
    ORDER BY i.recorded_at DESC LIMIT 1;
  INSERT INTO internal_proesc.settled_polling_state(link_id,last_snapshot_id,receivable_sha256,next_due_at)
    VALUES(v_link.id,v_s.id,decode(v_before,'hex'),now()+interval '24 hours')
    ON CONFLICT(link_id) DO UPDATE SET last_snapshot_id=EXCLUDED.last_snapshot_id,
      receivable_sha256=EXCLUDED.receivable_sha256,next_due_at=EXCLUDED.next_due_at;
  IF v_link.id=ANY(internal_proesc.sync_due_poll_links())
  THEN RAISE EXCEPTION 'Matching future cadence was ignored'; END IF;
  UPDATE internal_proesc.settled_polling_state SET receivable_sha256=decode(repeat('0',64),'hex')
    WHERE link_id=v_link.id;
  IF NOT(v_link.id=ANY(internal_proesc.sync_due_poll_links()))
  THEN RAISE EXCEPTION 'Changed full financial state was not immediately eligible'; END IF;
  UPDATE internal_proesc.settled_polling_state SET receivable_sha256=decode(v_before,'hex')
    WHERE link_id=v_link.id;

  -- A new source observation invalidates the cache even when the receivable is untouched.
  v_snapshot:=gen_random_uuid(); v_s.id:=v_snapshot;
  v_s.observed_at:=now(); v_s.recorded_at:=now();
  INSERT INTO internal_proesc.financial_snapshots SELECT (v_s).*;
  IF NOT EXISTS(SELECT 1 FROM internal_proesc.settled_polling_state
    WHERE link_id=v_link.id AND last_snapshot_id=v_snapshot
      AND receivable_sha256 IS NULL AND next_due_at<=clock_timestamp())
  THEN RAISE EXCEPTION 'New observation did not invalidate cadence'; END IF;
  PERFORM internal_proesc.refresh_settled_polling(v_run);
  IF NOT EXISTS(SELECT 1 FROM internal_proesc.settled_polling_state
    WHERE link_id=v_link.id AND last_snapshot_id=v_snapshot AND next_due_at<=clock_timestamp())
  THEN RAISE EXCEPTION 'Stale finished run hid newer observation'; END IF;
  -- Simulate a different concurrently inserted source winning the cache CAS.
  UPDATE internal_proesc.settled_polling_state SET last_snapshot_id=gen_random_uuid(),
    receivable_sha256=NULL,next_due_at=now() WHERE link_id=v_link.id;
  PERFORM internal_proesc.refresh_settled_polling(v_run);
  IF NOT EXISTS(SELECT 1 FROM internal_proesc.settled_polling_state
    WHERE link_id=v_link.id AND receivable_sha256 IS NULL AND next_due_at<=now())
  THEN RAISE EXCEPTION 'Refresh erased a concurrent invalidation'; END IF;
  SELECT internal_proesc.receivable_fingerprint(c) INTO v_after FROM public.contas_receber c
    WHERE c.id=v_link.receivable_id;
  IF v_before IS DISTINCT FROM v_after THEN RAISE EXCEPTION 'Polling changed financial state'; END IF;
END;
$cache_test$;
ROLLBACK;
