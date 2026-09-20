-- Lossless deduplication: each observation keeps its original identity and timestamps.
CREATE TABLE internal_proesc.compacted_snapshot_observations (
  id uuid PRIMARY KEY,
  keeper_snapshot_id uuid NOT NULL REFERENCES internal_proesc.financial_snapshots(id),
  observed_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL,
  CHECK (id <> keeper_snapshot_id)
);
ALTER TABLE internal_proesc.compacted_snapshot_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON internal_proesc.compacted_snapshot_observations FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX proesc_compacted_keeper_idx ON internal_proesc.compacted_snapshot_observations(keeper_snapshot_id);
CREATE INDEX proesc_compacted_observed_idx ON internal_proesc.compacted_snapshot_observations(observed_at DESC,id DESC);
ALTER TABLE internal_proesc.reconciliation_events ADD COLUMN original_snapshot_id uuid;
ALTER TABLE internal_proesc.sync_run_items ADD COLUMN original_snapshot_id uuid;
CREATE INDEX proesc_items_original_snapshot_idx ON internal_proesc.sync_run_items
  ((coalesce(original_snapshot_id,snapshot_id)));

CREATE VIEW internal_proesc.financial_observation_history WITH (security_invoker=true) AS
SELECT * FROM internal_proesc.financial_snapshots
UNION ALL
SELECT a.id,s.link_id,a.observed_at,s.source_fingerprint,s.principal_cents,
  s.received_cents,s.payment_date,s.source_status,s.verification,s.evidence_kind,
  s.components,s.accounting_lines,s.review_reasons,s.recorded_by,a.recorded_at,
  s.open_evidence,s.collector_review_reasons
FROM internal_proesc.compacted_snapshot_observations a
JOIN internal_proesc.financial_snapshots s ON s.id=a.keeper_snapshot_id;
REVOKE ALL ON internal_proesc.financial_observation_history FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION internal_proesc.rehydrate_financial_snapshot(p_snapshot internal_proesc.financial_snapshots)
RETURNS void LANGUAGE plpgsql SET search_path=''
AS $function$
BEGIN
  PERFORM 1 FROM internal_proesc.compacted_snapshot_observations WHERE id=p_snapshot.id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO internal_proesc.financial_snapshots SELECT (p_snapshot).*;
  DELETE FROM internal_proesc.compacted_snapshot_observations WHERE id=p_snapshot.id;
END;
$function$;
REVOKE ALL ON FUNCTION internal_proesc.rehydrate_financial_snapshot(internal_proesc.financial_snapshots)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION internal_proesc.guard_compacted_snapshot_keeper()
RETURNS trigger LANGUAGE plpgsql SET search_path=''
AS $function$
BEGIN
  IF NEW IS DISTINCT FROM OLD AND EXISTS(
    SELECT 1 FROM internal_proesc.compacted_snapshot_observations WHERE keeper_snapshot_id=OLD.id
  ) THEN
    RAISE EXCEPTION 'Evidência compartilhada de observações é imutável.' USING ERRCODE='40001';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION internal_proesc.guard_compacted_snapshot_keeper()
  FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER proesc_guard_compacted_snapshot_keeper
BEFORE UPDATE ON internal_proesc.financial_snapshots
FOR EACH ROW EXECUTE FUNCTION internal_proesc.guard_compacted_snapshot_keeper();
