BEGIN;
SET LOCAL lock_timeout='2s';
-- Bound index construction separately; application requests retain their 8s cap.
SET LOCAL statement_timeout='30s';

DO $guard$
BEGIN
  IF md5(pg_get_functiondef('internal_proesc.v2_calculated_composition_candidate(uuid,uuid)'::regprocedure))
      IS DISTINCT FROM '6157da1ee238cacd73cacfc4da0d494b' THEN
    RAISE EXCEPTION 'Early composition candidate drift; review indexed history';
  END IF;
END;
$guard$;

-- PORTAL_CONFIRMED must remain a barrier even when accounting_lines is empty.
-- Nonempty/non-array JSON stays in this necessary superset: the existing
-- complete guard still decides eligibility (and preserves malformed-data errors).
CREATE INDEX proesc_snapshots_early_rule_history_idx
  ON internal_proesc.financial_snapshots(link_id)
  WHERE evidence_kind='PORTAL_CONFIRMED' OR source_status='CANCELED'
    OR accounting_lines<>'[]'::jsonb;

DO $patch$
DECLARE
  v_oid oid:='internal_proesc.v2_calculated_composition_candidate(uuid,uuid)'::regprocedure;
  v_definition text; v_source text; v_expected text; v_metadata jsonb;
  v_old text:=$old$AND NOT EXISTS(SELECT 1 FROM internal_proesc.financial_snapshots h WHERE h.link_id=l.id AND ($old$;
  v_new text:=$new$AND NOT EXISTS(SELECT 1 FROM internal_proesc.financial_snapshots h WHERE h.link_id=l.id
        AND (h.evidence_kind='PORTAL_CONFIRMED' OR h.source_status='CANCELED'
          OR h.accounting_lines<>'[]'::jsonb)
        AND ($new$;
BEGIN
  SELECT pg_get_functiondef(p.oid),p.prosrc,to_jsonb(p)-'prosrc'
    INTO v_definition,v_source,v_metadata FROM pg_proc p WHERE p.oid=v_oid;
  IF md5(v_definition) IS DISTINCT FROM '6157da1ee238cacd73cacfc4da0d494b'
    OR (length(v_source)-length(replace(v_source,v_old,'')))/length(v_old)<>1 THEN
    RAISE EXCEPTION 'Early history marker drift';
  END IF;
  v_expected:=replace(v_definition,v_old,v_new);
  EXECUTE v_expected;
  IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE p.oid=v_oid)
      IS DISTINCT FROM v_metadata
    OR pg_get_functiondef(v_oid) IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'Early history patch changed unreviewed body or metadata';
  END IF;
END;
$patch$;

COMMIT;
