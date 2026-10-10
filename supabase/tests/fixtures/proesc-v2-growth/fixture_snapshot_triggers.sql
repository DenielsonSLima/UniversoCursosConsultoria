-- Synthetic dependent state; trigger bodies are exact catalog definitions from 2026-10-09.
CREATE TABLE internal_proesc.compacted_snapshot_observations(keeper_snapshot_id uuid);
CREATE TABLE internal_proesc.packed_item_snapshot_refs(snapshot_id uuid);
CREATE TABLE internal_proesc.settled_polling_state(link_id uuid PRIMARY KEY,last_snapshot_id uuid,
  next_due_at timestamptz,receivable_sha256 text,checked_at timestamptz);

CREATE OR REPLACE FUNCTION internal_proesc.guard_compacted_snapshot_keeper()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW IS DISTINCT FROM OLD AND EXISTS(
    SELECT 1 FROM internal_proesc.compacted_snapshot_observations WHERE keeper_snapshot_id=OLD.id
  ) THEN
    RAISE EXCEPTION 'Evidência compartilhada de observações é imutável.' USING ERRCODE='40001';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION internal_proesc.guard_packed_item_keeper()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW IS DISTINCT FROM OLD AND EXISTS(
    SELECT 1 FROM internal_proesc.packed_item_snapshot_refs WHERE snapshot_id=OLD.id
  ) THEN RAISE EXCEPTION 'Evidência referenciada por itens compactados é imutável.' USING ERRCODE='40001'; END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION internal_proesc.invalidate_settled_polling()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO internal_proesc.settled_polling_state(link_id,last_snapshot_id,next_due_at)
    VALUES(NEW.link_id,NEW.id,clock_timestamp())
  ON CONFLICT(link_id) DO UPDATE SET last_snapshot_id=EXCLUDED.last_snapshot_id,
    receivable_sha256=NULL,next_due_at=clock_timestamp(),checked_at=clock_timestamp();
  RETURN NEW;
END;
$function$
;

CREATE TRIGGER invalidate_settled_polling_on_observation AFTER INSERT ON internal_proesc.financial_snapshots
 FOR EACH ROW EXECUTE FUNCTION internal_proesc.invalidate_settled_polling();
CREATE TRIGGER proesc_guard_compacted_snapshot_keeper BEFORE UPDATE ON internal_proesc.financial_snapshots
 FOR EACH ROW EXECUTE FUNCTION internal_proesc.guard_compacted_snapshot_keeper();
CREATE TRIGGER proesc_guard_packed_item_keeper BEFORE UPDATE ON internal_proesc.financial_snapshots
 FOR EACH ROW EXECUTE FUNCTION internal_proesc.guard_packed_item_keeper();

