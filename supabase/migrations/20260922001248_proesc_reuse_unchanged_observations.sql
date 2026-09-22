-- A bounded proof per obligation replaces new snapshots/receipts for strict no-ops.
-- Existing observation identities and financial mutation/replay paths stay intact.
CREATE TABLE internal_proesc.unchanged_observation_state (
  link_id uuid PRIMARY KEY REFERENCES internal_proesc.obligation_links(id) ON DELETE CASCADE,
  snapshot_id uuid NOT NULL,
  last_run_id uuid NOT NULL,
  observation_hash bytea NOT NULL CHECK (octet_length(observation_hash)=32),
  receivable_sha256 bytea NOT NULL CHECK (octet_length(receivable_sha256)=32),
  credential_revision uuid NOT NULL,
  stage text NOT NULL CHECK (stage IN ('SNAPSHOT','APPLY')),
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  last_observed_at timestamptz NOT NULL,
  seen_count bigint NOT NULL DEFAULT 1 CHECK (seen_count>0),
  CHECK (last_seen_at>=first_seen_at)
);
ALTER TABLE internal_proesc.unchanged_observation_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON internal_proesc.unchanged_observation_state FROM PUBLIC,anon,authenticated,service_role;

-- Only scoped totals survive each no-op run; no permanent per-check item/UUID.
CREATE TABLE internal_proesc.run_reused_observation_counts (
  run_id uuid NOT NULL REFERENCES internal_proesc.sync_runs(id),
  polo_id uuid NOT NULL,
  class_id uuid NOT NULL,
  reused_count integer NOT NULL CHECK(reused_count BETWEEN 1 AND 60),
  first_checked_at timestamptz NOT NULL,
  last_checked_at timestamptz NOT NULL,
  PRIMARY KEY(run_id,polo_id,class_id),
  CHECK(last_checked_at>=first_checked_at)
);
ALTER TABLE internal_proesc.run_reused_observation_counts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON internal_proesc.run_reused_observation_counts FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION internal_proesc.reusable_observation_delay(
  p_receivable public.contas_receber,
  p_snapshot internal_proesc.financial_snapshots,
  p_state internal_proesc.settled_polling_state,
  p_observation jsonb,
  p_expected_before text
) RETURNS interval LANGUAGE plpgsql STABLE SET search_path='' SET timezone='UTC'
AS $function$
DECLARE v_stage text;
BEGIN
  IF p_snapshot.id IS NULL OR p_state.link_id IS NULL
    OR p_snapshot.link_id IS DISTINCT FROM p_state.link_id
    OR p_state.last_snapshot_id IS DISTINCT FROM p_snapshot.id
    OR p_state.receivable_sha256 IS NULL
    OR p_expected_before IS DISTINCT FROM internal_proesc.receivable_fingerprint(p_receivable)
    OR encode(p_state.receivable_sha256,'hex') IS DISTINCT FROM p_expected_before
    OR jsonb_typeof(p_observation) IS DISTINCT FROM 'object'
    OR p_observation-ARRAY['linkId','principalCents','receivedCents','paymentDate','sourceStatus',
      'verification','evidenceKind','components','lines','reviewReasons','observedAt','sourceFingerprint']<>'{}'::jsonb
    OR (p_observation-ARRAY['observedAt']) IS DISTINCT FROM jsonb_build_object(
      'linkId',p_snapshot.link_id,'principalCents',p_snapshot.principal_cents,
      'receivedCents',p_snapshot.received_cents,'paymentDate',p_snapshot.payment_date,
      'sourceStatus',p_snapshot.source_status,'verification',p_snapshot.verification,
      'evidenceKind',p_snapshot.evidence_kind,'components',p_snapshot.components,
      'lines',p_snapshot.accounting_lines,'reviewReasons',p_snapshot.collector_review_reasons,
      'sourceFingerprint',p_snapshot.source_fingerprint)
    OR p_snapshot.open_evidence IS NOT NULL
  THEN RETURN interval '0'; END IF;
  v_stage:=CASE WHEN p_receivable.status='PAGO' THEN 'APPLY' ELSE 'SNAPSHOT' END;
  -- The existing proof checks payment amount/date, empty-payment classification,
  -- review reasons, principal and local changes. No ordinary REVIEW is reusable.
  RETURN internal_proesc.settled_polling_delay(p_receivable,p_snapshot,
    'UNCHANGED',v_stage,true,p_expected_before);
END;
$function$;
REVOKE ALL ON FUNCTION internal_proesc.reusable_observation_delay(
  public.contas_receber,internal_proesc.financial_snapshots,
  internal_proesc.settled_polling_state,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.proesc_try_reuse_observation_service(
  p_actor_id uuid,p_lease_id uuid,p_credential_revision uuid,p_expected_before text,p_observation jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC'
SET lock_timeout='5s'
AS $function$
DECLARE
  v_link internal_proesc.obligation_links;
  v_receivable public.contas_receber;
  v_snapshot internal_proesc.financial_snapshots;
  v_poll internal_proesc.settled_polling_state;
  v_previous internal_proesc.unchanged_observation_state;
  v_observed timestamptz; v_hash bytea; v_revision uuid; v_stage text;
BEGIN
  PERFORM internal_proesc.authorize_financial_operator(p_actor_id);
  IF jsonb_typeof(p_observation) IS DISTINCT FROM 'object'
    OR NOT coalesce(p_expected_before ~ '^[0-9a-f]{64}$',false) THEN
    RAISE EXCEPTION 'Observação ou estado anterior inválido.' USING ERRCODE='22023'; END IF;
  PERFORM internal_proesc.assert_sync_lease(p_lease_id,(p_observation->>'linkId')::uuid);
  SELECT * INTO STRICT v_link FROM internal_proesc.obligation_links
    WHERE id=(p_observation->>'linkId')::uuid FOR UPDATE;
  SELECT * INTO STRICT v_receivable FROM public.contas_receber
    WHERE id=v_link.receivable_id FOR UPDATE;
  PERFORM internal_proesc.assert_historical_receivable(v_receivable);
  SELECT revision INTO STRICT v_revision FROM internal_proesc.connection WHERE id FOR SHARE;
  IF p_credential_revision IS NULL OR p_credential_revision IS DISTINCT FROM v_revision THEN
    RAISE EXCEPTION 'Credencial mudou após a consulta Proesc.' USING ERRCODE='40001';
  END IF;
  SELECT * INTO v_poll FROM internal_proesc.settled_polling_state WHERE link_id=v_link.id;
  SELECT * INTO v_snapshot FROM internal_proesc.financial_snapshots WHERE id=v_poll.last_snapshot_id;
  v_hash:=extensions.digest(p_observation::text,'sha256');
  SELECT * INTO v_previous FROM internal_proesc.unchanged_observation_state WHERE link_id=v_link.id;
  IF v_previous.last_run_id=p_lease_id AND (
    v_previous.observation_hash IS DISTINCT FROM v_hash
    OR v_previous.receivable_sha256 IS DISTINCT FROM decode(p_expected_before,'hex')
    OR v_previous.credential_revision IS DISTINCT FROM v_revision) THEN
    RAISE EXCEPTION 'Observação da concessão reutilizada com intenção diferente.' USING ERRCODE='40001';
  END IF;
  v_observed:=(p_observation->>'observedAt')::timestamptz;
  IF v_observed IS NULL OR NOT isfinite(v_observed)
    OR v_observed>now()+interval '5 minutes' OR v_observed<now()-interval '5 minutes'
    OR v_observed<v_snapshot.observed_at
    OR EXISTS(SELECT 1 FROM internal_proesc.financial_snapshots newer
      WHERE newer.link_id=v_link.id AND (newer.observed_at,newer.recorded_at,newer.id)
        >(v_snapshot.observed_at,v_snapshot.recorded_at,v_snapshot.id))
    OR internal_proesc.reusable_observation_delay(v_receivable,v_snapshot,v_poll,
      p_observation,p_expected_before)<=interval '0'
  THEN RETURN jsonb_build_object('reused',false); END IF;
  IF v_receivable.status='PAGO' AND v_receivable.conta_bancaria_id IS DISTINCT FROM
    internal_proesc.shared_account(v_receivable.polo_id)
  THEN RETURN jsonb_build_object('reused',false); END IF;
  v_stage:=CASE WHEN v_receivable.status='PAGO' THEN 'APPLY' ELSE 'SNAPSHOT' END;
  IF v_previous.last_run_id=p_lease_id THEN
    IF v_previous.observation_hash IS DISTINCT FROM v_hash
      OR v_previous.snapshot_id IS DISTINCT FROM v_snapshot.id
      OR v_previous.receivable_sha256 IS DISTINCT FROM decode(p_expected_before,'hex')
      OR v_previous.credential_revision IS DISTINCT FROM v_revision THEN
      RAISE EXCEPTION 'Observação da concessão reutilizada com intenção diferente.' USING ERRCODE='40001';
    END IF;
    RETURN jsonb_build_object('reused',true,'snapshotId',v_snapshot.id,'stage',v_stage);
  END IF;
  INSERT INTO internal_proesc.unchanged_observation_state(link_id,snapshot_id,last_run_id,
    observation_hash,receivable_sha256,credential_revision,stage,first_seen_at,last_seen_at,last_observed_at)
  VALUES(v_link.id,v_snapshot.id,p_lease_id,v_hash,decode(p_expected_before,'hex'),v_revision,
    v_stage,clock_timestamp(),clock_timestamp(),v_observed)
  ON CONFLICT(link_id) DO UPDATE SET snapshot_id=EXCLUDED.snapshot_id,last_run_id=EXCLUDED.last_run_id,
    observation_hash=EXCLUDED.observation_hash,receivable_sha256=EXCLUDED.receivable_sha256,
    credential_revision=EXCLUDED.credential_revision,stage=EXCLUDED.stage,
    last_seen_at=EXCLUDED.last_seen_at,last_observed_at=EXCLUDED.last_observed_at,
    seen_count=least(internal_proesc.unchanged_observation_state.seen_count,9223372036854775806)+1;
  RETURN jsonb_build_object('reused',true,'snapshotId',v_snapshot.id,'stage',v_stage);
END;
$function$;
REVOKE ALL ON FUNCTION public.proesc_try_reuse_observation_service(uuid,uuid,uuid,text,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.proesc_try_reuse_observation_service(uuid,uuid,uuid,text,jsonb) TO service_role;
