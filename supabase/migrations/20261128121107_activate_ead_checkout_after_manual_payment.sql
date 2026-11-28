BEGIN;

-- A checkout with its own current attempt can activate from its verified
-- manual receipt. Legacy records still require the prior trust audit because
-- their inscription trigger can select a receivable by enrollment.
DO $migration$
DECLARE
  definition text := pg_get_functiondef(
    'internal_academic.ead_has_own_trust_manual_payment(uuid)'::regprocedure);
  audit_join constant text := E'  JOIN internal_academic.ead_trust_access_audit audit ON audit.matricula_id=m.id\n';
  status_anchor constant text := '   AND m.status IN (';
  checkout_guard constant text := $guard$   AND (c.ead_checkout_attempt_id IS NOT NULL OR EXISTS (
    SELECT 1 FROM internal_academic.ead_trust_access_audit audit WHERE audit.matricula_id=m.id))
$guard$;
BEGIN
  IF length(definition) - length(replace(definition, audit_join, '')) <> length(audit_join)
    OR length(definition) - length(replace(definition, status_anchor, '')) <> length(status_anchor) THEN
    RAISE EXCEPTION 'EAD_MANUAL_PAYMENT_PROJECTION_DRIFT';
  END IF;

  EXECUTE replace(replace(definition, audit_join, ''), status_anchor, checkout_guard || status_anchor);
END $migration$;

COMMIT;
