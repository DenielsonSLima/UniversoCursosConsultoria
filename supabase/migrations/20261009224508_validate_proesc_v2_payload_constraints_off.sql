-- Validate existing V2 payload references while canonical writes remain OFF.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='120s';
DO $guard$
DECLARE v_enabled boolean;
BEGIN
  SELECT enabled INTO STRICT v_enabled
    FROM internal_proesc.v2_payload_storage_control WHERE singleton FOR SHARE;
  IF v_enabled IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Payload storage must remain OFF during this validation' USING ERRCODE='55000';
  END IF;
  PERFORM internal_proesc.v2_assert_payload_readers();
END;
$guard$;
ALTER TABLE internal_proesc.v2_invoice_observations
  VALIDATE CONSTRAINT v2_invoice_payload_identity_fk,
  VALIDATE CONSTRAINT v2_invoice_one_payload;
COMMIT;
