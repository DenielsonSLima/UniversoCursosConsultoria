-- LOCAL REVIEW DRAFT. Not a production migration; no activation or backfill.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';

CREATE TABLE internal_proesc.v2_payload_storage_control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  enabled boolean NOT NULL DEFAULT false
);
INSERT INTO internal_proesc.v2_payload_storage_control(singleton) VALUES(true);
CREATE TABLE internal_proesc.v2_invoice_payloads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id text NOT NULL,
  invoice_id text NOT NULL,
  normalization_version integer NOT NULL CHECK(normalization_version=1),
  content_hash bytea NOT NULL CHECK(octet_length(content_hash)=32),
  normalized jsonb NOT NULL CHECK(jsonb_typeof(normalized)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(unit_id,invoice_id,normalization_version,content_hash),
  UNIQUE(id,unit_id,invoice_id)
);
ALTER TABLE internal_proesc.v2_payload_storage_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_proesc.v2_invoice_payloads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON internal_proesc.v2_payload_storage_control,
  internal_proesc.v2_invoice_payloads FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE internal_proesc.v2_invoice_observations
  ADD COLUMN normalized_payload_id uuid,
  ALTER COLUMN normalized DROP NOT NULL,
  ADD CONSTRAINT v2_invoice_payload_identity_fk
    FOREIGN KEY(normalized_payload_id,unit_id,invoice_id)
    REFERENCES internal_proesc.v2_invoice_payloads(id,unit_id,invoice_id) NOT VALID,
  ADD CONSTRAINT v2_invoice_one_payload
    CHECK((normalized IS NOT NULL) <> (normalized_payload_id IS NOT NULL)) NOT VALID;
-- Existing observations already have normalized NOT NULL. No history is rewritten.
-- Validate in a separately approved bounded deployment window, not by this draft.

CREATE FUNCTION internal_proesc.v2_invoice_normalized(p_observation internal_proesc.v2_invoice_observations)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $function$
DECLARE v_payload jsonb;
BEGIN
  IF p_observation.normalized IS NOT NULL AND p_observation.normalized_payload_id IS NULL THEN
    RETURN p_observation.normalized;
  END IF;
  IF p_observation.normalized IS NOT NULL OR p_observation.normalized_payload_id IS NULL THEN
    RAISE EXCEPTION 'Invalid V2 payload representation' USING ERRCODE='22023';
  END IF;
  SELECT normalized INTO STRICT v_payload FROM internal_proesc.v2_invoice_payloads
    WHERE id=p_observation.normalized_payload_id AND unit_id=p_observation.unit_id
      AND invoice_id=p_observation.invoice_id;
  RETURN v_payload;
END;
$function$;

CREATE FUNCTION internal_proesc.v2_invoice_evidence(p_observation internal_proesc.v2_invoice_observations)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $function$
  SELECT (to_jsonb(p_observation)-'normalized_payload_id')
    || jsonb_build_object('normalized',internal_proesc.v2_invoice_normalized(p_observation));
$function$;

CREATE FUNCTION internal_proesc.v2_intern_invoice_payload(p_unit text,p_invoice text,p_normalized jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $function$
DECLARE v_id uuid; v_existing jsonb;
  v_hash bytea:=extensions.digest(p_normalized::text,'sha256');
BEGIN
  IF p_unit IS NULL OR p_invoice IS NULL OR jsonb_typeof(p_normalized) IS DISTINCT FROM 'object'
    OR p_normalized->>'unitId' IS DISTINCT FROM p_unit
    OR p_normalized->>'invoiceId' IS DISTINCT FROM p_invoice THEN
    RAISE EXCEPTION 'Invalid canonical invoice identity' USING ERRCODE='22023';
  END IF;
  SELECT id,normalized INTO v_id,v_existing FROM internal_proesc.v2_invoice_payloads
    WHERE unit_id=p_unit AND invoice_id=p_invoice AND normalization_version=1 AND content_hash=v_hash;
  IF NOT FOUND THEN
    INSERT INTO internal_proesc.v2_invoice_payloads(unit_id,invoice_id,normalization_version,content_hash,normalized)
      VALUES(p_unit,p_invoice,1,v_hash,p_normalized)
      ON CONFLICT(unit_id,invoice_id,normalization_version,content_hash) DO NOTHING
      RETURNING id,normalized INTO v_id,v_existing;
    IF NOT FOUND THEN
      -- A separate statement receives a fresh READ COMMITTED snapshot after a rival commit.
      -- A stronger isolation level may abort for retry; never fabricate or lose evidence.
      SELECT id,normalized INTO STRICT v_id,v_existing FROM internal_proesc.v2_invoice_payloads
        WHERE unit_id=p_unit AND invoice_id=p_invoice AND normalization_version=1 AND content_hash=v_hash;
    END IF;
  END IF;
  IF v_existing IS DISTINCT FROM p_normalized THEN
    RAISE EXCEPTION 'Canonical invoice hash collision' USING ERRCODE='40001';
  END IF;
  RETURN v_id;
END;
$function$;

CREATE FUNCTION internal_proesc.v2_guard_invoice_payload_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $function$
BEGIN
  RAISE EXCEPTION 'Canonical invoice payload is immutable' USING ERRCODE='55000';
END;
$function$;
CREATE TRIGGER v2_invoice_payload_immutable BEFORE UPDATE OR DELETE
  ON internal_proesc.v2_invoice_payloads FOR EACH ROW
  EXECUTE FUNCTION internal_proesc.v2_guard_invoice_payload_immutable();

REVOKE ALL ON FUNCTION
  internal_proesc.v2_invoice_normalized(internal_proesc.v2_invoice_observations),
  internal_proesc.v2_invoice_evidence(internal_proesc.v2_invoice_observations),
  internal_proesc.v2_intern_invoice_payload(text,text,jsonb),
  internal_proesc.v2_guard_invoice_payload_immutable()
FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
