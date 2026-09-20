BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='20s';
DO $test$
DECLARE
  v_actor uuid; v_snapshot internal_proesc.financial_snapshots;
  v_link internal_proesc.obligation_links; v_receivable public.contas_receber;
  v_request uuid:=gen_random_uuid(); v_lease uuid:=gen_random_uuid();
  v_payload jsonb; v_response jsonb; v_event internal_proesc.reconciliation_events;
  v_before text; v_after text;
BEGIN
  PERFORM 1 FROM internal_proesc.sync_runtime WHERE id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM internal_proesc.sync_runtime WHERE id AND lease_until>now()) THEN
    RAISE EXCEPTION 'Worker ativo; repetir ensaio após término' USING ERRCODE='40001';
  END IF;
  SELECT updated_by INTO STRICT v_actor FROM internal_proesc.connection WHERE id;
  SELECT l.* INTO STRICT v_link FROM internal_proesc.obligation_links l
    JOIN public.contas_receber c ON c.id=l.receivable_id
    WHERE l.auto_enabled AND c.status='PAGO' AND internal_proesc.sync_link_allowed(l.id)
      AND EXISTS(SELECT 1 FROM internal_proesc.reconciliation_events e
        WHERE e.link_id=l.id AND e.mode='AUTO' AND e.result='UNCHANGED')
    ORDER BY l.id LIMIT 1;
  SELECT * INTO STRICT v_receivable FROM public.contas_receber WHERE id=v_link.receivable_id;
  SELECT * INTO STRICT v_snapshot FROM internal_proesc.financial_snapshots
    WHERE link_id=v_link.id ORDER BY observed_at DESC, recorded_at DESC,id DESC LIMIT 1;
  SELECT md5(string_agg(md5(to_jsonb(c)::text),'' ORDER BY id)) INTO v_before FROM public.contas_receber c;
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  UPDATE internal_proesc.sync_runtime SET enabled=true,lease_id=v_lease,lease_until=now()+interval '3 minutes',
    lease_links=ARRAY[v_link.id],credential_revision=(SELECT revision FROM internal_proesc.connection WHERE id)
    WHERE id;
  v_payload:=jsonb_build_object('snapshotId',v_snapshot.id,'expectedBefore',
    internal_proesc.receivable_fingerprint(v_receivable),'mode','AUTO','syncLeaseId',v_lease);
  v_response:=public.proesc_apply_financial_snapshot_service(v_actor,v_request,v_payload);
  ASSERT v_response->>'result'='UNCHANGED','Expected unchanged payment';
  SELECT * INTO STRICT v_event FROM internal_proesc.reconciliation_events WHERE request_id=v_request;
  ASSERT v_event.before_state IS NULL AND v_event.after_state =
    internal_proesc.compact_unchanged_state(to_jsonb(v_receivable)), 'No-op not compacted';
  ASSERT octet_length(v_event.after_state::text)<150,'Oversized technical event';
  ASSERT public.proesc_apply_financial_snapshot_service(v_actor,v_request,v_payload)->>'replayed'='true',
    'Replay changed';
  BEGIN
    PERFORM public.proesc_apply_financial_snapshot_service(v_actor,v_request,v_payload||'{"mode":"CORRECTION"}');
    RAISE EXCEPTION 'Changed replay accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  PERFORM set_config('request.jwt.claims','{"role":"authenticated"}',true);
  BEGIN
    PERFORM public.proesc_apply_financial_snapshot_service(v_actor,v_request,v_payload);
    RAISE EXCEPTION 'Authorization bypass';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  SELECT md5(string_agg(md5(to_jsonb(c)::text),'' ORDER BY id)) INTO v_after FROM public.contas_receber c;
  ASSERT v_before=v_after,'Receivables changed';
END;
$test$;
ROLLBACK;
