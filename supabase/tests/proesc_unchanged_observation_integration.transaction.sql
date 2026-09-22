-- Isolated staging contract smoke; do not run against production.
-- Rollback-only contract smoke. Uses two existing eligible links, but
-- generates no financial snapshot, receipt or mutation. Synthetic runs vanish.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $test$
DECLARE
  candidate record; v_state internal_proesc.sync_runtime;
  v_actor uuid; v_lease uuid; v_revision uuid; v_payload jsonb; v_result jsonb;
  v_snapshot_count bigint; v_request_count bigint; v_event_count bigint;
  v_seen bigint; v_receivable_hash text; v_stage text; v_tested integer:=0;
  v_extra internal_proesc.financial_snapshots; v_finish jsonb;
BEGIN
  SELECT * INTO STRICT v_state FROM internal_proesc.sync_runtime WHERE id FOR UPDATE;
  SELECT updated_by,revision INTO STRICT v_actor,v_revision FROM internal_proesc.connection WHERE id;
  SELECT count(*) INTO v_snapshot_count FROM internal_proesc.financial_snapshots;
  SELECT count(*) INTO v_request_count FROM internal_proesc.reconciliation_requests;
  SELECT count(*) INTO v_event_count FROM internal_proesc.reconciliation_events;
  FOR candidate IN
    SELECT DISTINCT ON (c.status) l.id AS link_id,c,s,p,
      internal_proesc.receivable_fingerprint(c) AS state_hash
    FROM internal_proesc.obligation_links l JOIN public.contas_receber c ON c.id=l.receivable_id
    JOIN internal_proesc.settled_polling_state p ON p.link_id=l.id
    JOIN internal_proesc.financial_snapshots s ON s.id=p.last_snapshot_id
    WHERE l.auto_enabled AND c.status IN ('PAGO','PENDENTE')
      AND internal_proesc.sync_link_allowed(l.id)
      AND p.receivable_sha256=decode(internal_proesc.receivable_fingerprint(c),'hex')
      AND internal_proesc.settled_polling_delay(c,s,'UNCHANGED',
        CASE WHEN c.status='PAGO' THEN 'APPLY' ELSE 'SNAPSHOT' END,true,
        internal_proesc.receivable_fingerprint(c))>interval '0'
    ORDER BY c.status,l.id
  LOOP
    v_lease:=gen_random_uuid(); v_receivable_hash:=candidate.state_hash;
    v_stage:=CASE WHEN (candidate.c).status='PAGO' THEN 'APPLY' ELSE 'SNAPSHOT' END;
    UPDATE internal_proesc.sync_runtime SET enabled=true,lease_id=v_lease,lease_until=now()+interval '3 minutes',
      lease_links=ARRAY[candidate.link_id],lease_last_id=candidate.link_id,
      credential_revision=v_revision,last_started_at=now() WHERE id;
    PERFORM internal_proesc.start_sync_run(v_actor,v_lease);
    v_payload:=jsonb_build_object('linkId',candidate.link_id,'principalCents',(candidate.s).principal_cents,
      'receivedCents',(candidate.s).received_cents,'paymentDate',(candidate.s).payment_date,
      'sourceStatus',(candidate.s).source_status,'verification',(candidate.s).verification,
      'evidenceKind',(candidate.s).evidence_kind,'components',(candidate.s).components,
      'lines',(candidate.s).accounting_lines,'reviewReasons',(candidate.s).collector_review_reasons,
      'sourceFingerprint',(candidate.s).source_fingerprint,'observedAt',now());
    v_finish:=jsonb_build_object(
      'leaseId',v_lease,'lastId',candidate.link_id,'completedCount',1,'completedLastId',candidate.link_id,
      'success',true,'counts',jsonb_build_object('consulted',1,'applied',0,'unchanged',1,'review',0,'failed',0),
      'telemetry',jsonb_build_object('http','[]'::jsonb,'items',jsonb_build_array(jsonb_build_object(
        'linkId',candidate.link_id,'snapshotId',(candidate.s).id,'result','UNCHANGED','stage',v_stage,'errorCode',NULL)),
        'errorCode',NULL,'stage',NULL));
    -- An old snapshot cannot bypass finish before the server records proof.
    BEGIN
      PERFORM public.proesc_sync_runtime_service('finish',v_actor,v_finish);
      RAISE EXCEPTION 'Unproven old snapshot accepted by finish';
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
    -- A foreign lease must never establish proof.
    BEGIN
      PERFORM public.proesc_try_reuse_observation_service(v_actor,gen_random_uuid(),v_revision,v_receivable_hash,v_payload);
      RAISE EXCEPTION 'Foreign lease was accepted';
    EXCEPTION WHEN serialization_failure THEN NULL; END;
    BEGIN
      PERFORM public.proesc_try_reuse_observation_service(v_actor,v_lease,gen_random_uuid(),v_receivable_hash,v_payload);
      RAISE EXCEPTION 'Observation fetched under another credential revision was accepted';
    EXCEPTION WHEN serialization_failure THEN NULL; END;
    IF public.proesc_try_reuse_observation_service(v_actor,v_lease,v_revision,repeat('b',64),v_payload)->>'reused'
        IS DISTINCT FROM 'false'
      OR public.proesc_try_reuse_observation_service(v_actor,v_lease,v_revision,v_receivable_hash,
        v_payload||jsonb_build_object('observedAt',now()+interval '6 minutes'))->>'reused' IS DISTINCT FROM 'false'
      OR public.proesc_try_reuse_observation_service(v_actor,v_lease,v_revision,v_receivable_hash,
        v_payload||jsonb_build_object('observedAt',now()-interval '6 minutes'))->>'reused' IS DISTINCT FROM 'false'
    THEN RAISE EXCEPTION 'CAS mismatch or stale/future observation accepted'; END IF;
    BEGIN
      UPDATE internal_proesc.connection SET revision=gen_random_uuid() WHERE id;
      PERFORM public.proesc_try_reuse_observation_service(v_actor,v_lease,v_revision,v_receivable_hash,v_payload);
      RAISE EXCEPTION 'Credential rotation accepted';
    EXCEPTION WHEN serialization_failure THEN NULL; END;
    BEGIN
      v_extra:=candidate.s; v_extra.id:=gen_random_uuid(); v_extra.observed_at:=now();
      v_extra.recorded_at:=clock_timestamp(); v_extra.source_fingerprint:=repeat('c',64);
      v_extra.verification:='REVIEW'; v_extra.collector_review_reasons:='["IDENTITY_REQUIRES_REVIEW"]'::jsonb;
      INSERT INTO internal_proesc.financial_snapshots SELECT (v_extra).*;
      -- Simulate a stale cache as well as the normal invalidation trigger.
      UPDATE internal_proesc.settled_polling_state SET last_snapshot_id=(candidate.s).id,
        receivable_sha256=decode(v_receivable_hash,'hex') WHERE link_id=candidate.link_id;
      IF public.proesc_try_reuse_observation_service(v_actor,v_lease,v_revision,v_receivable_hash,v_payload)->>'reused'
        IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Newer review was masked by reuse'; END IF;
      RAISE EXCEPTION USING ERRCODE='PT001',MESSAGE='Rollback successful interleaving fixture';
    EXCEPTION WHEN SQLSTATE 'PT001' THEN NULL; END;
    v_result:=public.proesc_try_reuse_observation_service(v_actor,v_lease,v_revision,v_receivable_hash,v_payload);
    IF v_result->>'reused' IS DISTINCT FROM 'true' OR v_result->>'stage' IS DISTINCT FROM v_stage THEN
      RAISE EXCEPTION 'Eligible reuse rejected'; END IF;
    SELECT seen_count INTO v_seen FROM internal_proesc.unchanged_observation_state WHERE link_id=candidate.link_id;
    PERFORM public.proesc_try_reuse_observation_service(v_actor,v_lease,v_revision,v_receivable_hash,v_payload);
    IF (SELECT seen_count FROM internal_proesc.unchanged_observation_state WHERE link_id=candidate.link_id)<>v_seen THEN
      RAISE EXCEPTION 'Same-lease retry counted twice'; END IF;
    BEGIN
      PERFORM public.proesc_try_reuse_observation_service(v_actor,v_lease,v_revision,v_receivable_hash,
        v_payload||jsonb_build_object('observedAt',now()+interval '1 second'));
      RAISE EXCEPTION 'Same lease accepted a different observation';
    EXCEPTION WHEN serialization_failure THEN NULL; END;
    BEGIN
      v_extra:=candidate.s; v_extra.id:=gen_random_uuid(); v_extra.observed_at:=now();
      v_extra.recorded_at:=clock_timestamp(); v_extra.source_fingerprint:=repeat('c',64);
      v_extra.verification:='REVIEW'; v_extra.collector_review_reasons:='["IDENTITY_REQUIRES_REVIEW"]'::jsonb;
      INSERT INTO internal_proesc.financial_snapshots SELECT (v_extra).*;
      UPDATE internal_proesc.settled_polling_state SET last_snapshot_id=(candidate.s).id,
        receivable_sha256=decode(v_receivable_hash,'hex'),next_due_at=now()-interval '1 minute'
        WHERE link_id=candidate.link_id;
      PERFORM public.proesc_sync_runtime_service('finish',v_actor,v_finish);
      IF EXISTS(SELECT 1 FROM internal_proesc.settled_polling_state WHERE link_id=candidate.link_id
        AND next_due_at>now()) THEN RAISE EXCEPTION 'Finish delayed a newer review'; END IF;
      RAISE EXCEPTION USING ERRCODE='PT001',MESSAGE='Rollback successful finish interleaving fixture';
    EXCEPTION WHEN SQLSTATE 'PT001' THEN NULL; END;
    PERFORM public.proesc_sync_runtime_service('finish',v_actor,v_finish);
    IF EXISTS(SELECT 1 FROM internal_proesc.sync_run_items WHERE run_id=v_lease)
      OR (SELECT sum(reused_count) FROM internal_proesc.run_reused_observation_counts WHERE run_id=v_lease) IS DISTINCT FROM 1::bigint
      OR NOT EXISTS(SELECT 1 FROM internal_proesc.sync_runs WHERE id=v_lease AND status='SUCCEEDED'
        AND consulted=1 AND unchanged=1 AND applied=0 AND failed=0)
      OR NOT EXISTS(SELECT 1 FROM internal_proesc.settled_polling_state WHERE link_id=candidate.link_id
        AND next_due_at>now()+CASE WHEN v_stage='APPLY' THEN interval '23 hours' ELSE interval '2 hours' END)
    THEN RAISE EXCEPTION 'Transient item, scoped counts, run totals or new cooldown invalid'; END IF;
    IF internal_proesc.receivable_fingerprint((SELECT c FROM public.contas_receber c WHERE c.id=(candidate.c).id))
      IS DISTINCT FROM v_receivable_hash THEN RAISE EXCEPTION 'Reuse changed financial state'; END IF;
    v_tested:=v_tested+1;
  END LOOP;
  IF v_tested<>2 THEN RAISE EXCEPTION 'Both paid and open fixtures are required'; END IF;
  IF (SELECT count(*) FROM internal_proesc.financial_snapshots)<>v_snapshot_count
    OR (SELECT count(*) FROM internal_proesc.reconciliation_requests)<>v_request_count
    OR (SELECT count(*) FROM internal_proesc.reconciliation_events)<>v_event_count THEN
    RAISE EXCEPTION 'No-op wrote a financial snapshot, request receipt or event'; END IF;
  RAISE NOTICE 'PASS: paid/open reuse, lease, CAS, dates, credentials, retry, newer review before/after reuse, finish, scoped counts, no financial mutation';
END;
$test$;
ROLLBACK;
