-- Staged locally: cadence affects selection only, never lease authorization or money.
CREATE FUNCTION internal_proesc.settled_polling_delay(
  p_receivable public.contas_receber,
  p_snapshot internal_proesc.financial_snapshots,
  p_result text, p_stage text, p_run_succeeded boolean,
  p_confirmed_state_sha text
) RETURNS interval LANGUAGE plpgsql STABLE SET search_path='' SET timezone='UTC'
AS $function$
BEGIN
  IF p_run_succeeded IS DISTINCT FROM true OR p_result IS DISTINCT FROM 'UNCHANGED'
    OR p_snapshot.id IS NULL OR p_snapshot.recorded_at IS NULL
    OR p_receivable.updated_at IS NULL OR p_receivable.updated_at>p_snapshot.recorded_at
    OR p_snapshot.principal_cents IS DISTINCT FROM round(p_receivable.valor*100)::bigint
  THEN RETURN interval '0'; END IF;

  IF p_receivable.status='PAGO' AND p_stage='APPLY'
    AND p_snapshot.verification='VERIFIED' AND p_snapshot.source_status='PAID'
    AND p_snapshot.evidence_kind IN ('API_SINGLE_PAYMENT','API_PAYMENT_TOTAL')
    AND p_snapshot.review_reasons='[]'::jsonb
    AND p_snapshot.collector_review_reasons='[]'::jsonb
    AND p_snapshot.received_cents>0 AND p_snapshot.payment_date IS NOT NULL
    AND p_receivable.valor_pago=p_snapshot.received_cents::numeric/100
    AND p_receivable.data_pagamento=p_snapshot.payment_date
    AND p_confirmed_state_sha=internal_proesc.receivable_fingerprint(p_receivable)
  THEN RETURN interval '24 hours'; END IF;

  -- The collector distinguishes an ordinary empty payment search from REVIEW.
  -- No other review, partial payment, local change or failed run gets deferred.
  IF p_receivable.status IN ('PENDENTE','VENCIDO','AGUARDANDO_CONFIRMACAO')
    AND coalesce(p_receivable.valor_pago,0)=0 AND p_receivable.data_pagamento IS NULL
    AND p_stage='SNAPSHOT' AND p_snapshot.verification='REVIEW'
    AND p_snapshot.source_status='UNKNOWN' AND p_snapshot.evidence_kind='UNRESOLVED'
    AND p_snapshot.received_cents IS NULL AND p_snapshot.payment_date IS NULL
    AND p_snapshot.collector_review_reasons='["NO_PAYMENT_IN_OBSERVED_PERIODS"]'::jsonb
    AND p_snapshot.review_reasons <@ '["ESTADO_REQUER_REVISAO","SEM_CONFIRMACAO"]'::jsonb
  THEN RETURN interval '3 hours'; END IF;
  RETURN interval '0';
END;
$function$;
REVOKE ALL ON FUNCTION internal_proesc.settled_polling_delay(
  public.contas_receber,internal_proesc.financial_snapshots,text,text,boolean,text
) FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE internal_proesc.settled_polling_state (
  link_id uuid PRIMARY KEY REFERENCES internal_proesc.obligation_links(id) ON DELETE CASCADE,
  last_snapshot_id uuid,
  receivable_sha256 bytea CHECK(octet_length(receivable_sha256)=32),
  next_due_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  checked_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE internal_proesc.settled_polling_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON internal_proesc.settled_polling_state FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION internal_proesc.invalidate_settled_polling()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $function$
BEGIN
  INSERT INTO internal_proesc.settled_polling_state(link_id,last_snapshot_id,next_due_at)
    VALUES(NEW.link_id,NEW.id,clock_timestamp())
  ON CONFLICT(link_id) DO UPDATE SET last_snapshot_id=EXCLUDED.last_snapshot_id,
    receivable_sha256=NULL,next_due_at=clock_timestamp(),checked_at=clock_timestamp();
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION internal_proesc.invalidate_settled_polling()
  FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER invalidate_settled_polling_on_observation
  AFTER INSERT ON internal_proesc.financial_snapshots FOR EACH ROW
  EXECUTE FUNCTION internal_proesc.invalidate_settled_polling();

CREATE FUNCTION internal_proesc.refresh_settled_polling(p_run_id uuid)
RETURNS void LANGUAGE plpgsql SET search_path='' SET timezone='UTC' AS $function$
BEGIN
  -- At most 60 items in the finished run. No scan of the complete history.
  INSERT INTO internal_proesc.settled_polling_state(
    link_id,last_snapshot_id,receivable_sha256,next_due_at,checked_at)
  SELECT i.link_id,s.id,decode(internal_proesc.receivable_fingerprint(c),'hex'),
    CASE WHEN state.last_snapshot_id=s.id AND s.id=i.snapshot_id AND i.original_snapshot_id IS NULL
      AND s.recorded_at<=now() AND s.observed_at<=now()
    THEN s.recorded_at+internal_proesc.settled_polling_delay(
      c,s::internal_proesc.financial_snapshots,i.result,i.stage,
      r.status='SUCCEEDED' AND r.finished_at IS NOT NULL AND i.error_code IS NULL,event.state_sha)
    ELSE now() END,clock_timestamp()
  FROM internal_proesc.sync_run_items i
  JOIN internal_proesc.sync_runs r ON r.id=i.run_id
  JOIN LATERAL (SELECT l.* FROM internal_proesc.obligation_links l
    WHERE l.id=i.link_id OFFSET 0) l ON true
  JOIN public.contas_receber c ON c.id=l.receivable_id
  LEFT JOIN internal_proesc.financial_snapshots s ON s.id=i.snapshot_id
  LEFT JOIN internal_proesc.settled_polling_state state ON state.link_id=i.link_id
  LEFT JOIN LATERAL (
    SELECT e.after_state->>'stateSha256' state_sha
    FROM internal_proesc.reconciliation_events e
    WHERE e.snapshot_id=s.id AND e.original_snapshot_id IS NULL
      AND state.last_snapshot_id=s.id AND c.status='PAGO'
      AND e.mode='AUTO' AND e.result='UNCHANGED'
      AND e.before_state IS NULL AND e.after_state->>'unchanged'='true'
    ORDER BY e.recorded_at DESC LIMIT 1
  ) event ON c.status='PAGO'
  WHERE i.run_id=p_run_id AND r.status<>'RUNNING' AND r.finished_at IS NOT NULL
    AND (state.link_id IS NULL OR state.last_snapshot_id IS NOT DISTINCT FROM s.id)
  ON CONFLICT(link_id) DO UPDATE SET
    receivable_sha256=EXCLUDED.receivable_sha256,next_due_at=EXCLUDED.next_due_at,
    checked_at=EXCLUDED.checked_at
  -- A concurrent snapshot insert wins; stale finish cannot erase its invalidation.
  WHERE internal_proesc.settled_polling_state.last_snapshot_id
    IS NOT DISTINCT FROM EXCLUDED.last_snapshot_id;
END;
$function$;
REVOKE ALL ON FUNCTION internal_proesc.refresh_settled_polling(uuid)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION internal_proesc.sync_due_poll_links()
RETURNS uuid[] LANGUAGE sql STABLE SET search_path='' SET timezone='UTC'
AS $function$
  SELECT coalesce(array_agg(l.id),'{}'::uuid[])
  FROM internal_proesc.obligation_links l
  JOIN public.contas_receber c ON c.id=l.receivable_id
  LEFT JOIN internal_proesc.settled_polling_state state ON state.link_id=l.id
  WHERE l.auto_enabled AND CASE
    WHEN state.link_id IS NULL OR state.next_due_at<=now() OR state.receivable_sha256 IS NULL THEN true
    ELSE state.receivable_sha256 IS DISTINCT FROM decode(internal_proesc.receivable_fingerprint(c),'hex')
    END;
$function$;
REVOKE ALL ON FUNCTION internal_proesc.sync_due_poll_links()
  FROM PUBLIC,anon,authenticated,service_role;

DO $patch_claim_and_finish$
DECLARE
  v_definition text;
  v_needle text:='where internal_proesc.sync_link_allowed(l.id)';
  v_claim_start text:=$start$    if not exists(select 1 from internal_proesc.obligation_links l$start$;
  v_finish text:='  perform internal_proesc.finish_sync_run(v_state,p_payload);';
BEGIN
  v_definition:=pg_get_functiondef('public.proesc_sync_runtime_service(text,uuid,jsonb)'::regprocedure);
  IF md5(v_definition)<>'e4542f7bb705c0a13a6910b4fa50aba3' THEN
    RAISE EXCEPTION 'Remote Proesc runtime changed; rebase polling migration';
  END IF;
  IF (length(v_definition)-length(replace(v_definition,v_needle,'')))/length(v_needle)<>2
    OR position('internal_proesc.sync_due_poll_links' IN v_definition)>0
    OR (length(v_definition)-length(replace(v_definition,'  v_links jsonb;','')))/length('  v_links jsonb;')<>1
    OR (length(v_definition)-length(replace(v_definition,v_claim_start,'')))/length(v_claim_start)<>1
    OR (length(v_definition)-length(replace(v_definition,v_finish,'')))/length(v_finish)<>1
  THEN RAISE EXCEPTION 'Proesc claim/finish contract changed; rebase polling migration'; END IF;
  v_definition:=replace(v_definition,'  v_links jsonb;',E'  v_links jsonb;\n  v_due_links uuid[];');
  v_definition:=replace(v_definition,v_claim_start,
    E'    v_due_links:=internal_proesc.sync_due_poll_links();\n'||v_claim_start);
  v_definition:=replace(v_definition,v_finish,v_finish||
    E'\n  perform internal_proesc.refresh_settled_polling(v_state.lease_id);');
  -- Selection uses one cache scan; lease authorization and financial CAS stay unchanged.
  EXECUTE replace(v_definition,v_needle,v_needle||E'\n        and l.id=ANY(v_due_links)');
END;
$patch_claim_and_finish$;
