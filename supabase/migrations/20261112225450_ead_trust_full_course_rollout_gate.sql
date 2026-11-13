BEGIN;

-- Keep the existing study-only trust contract until every certificate guard,
-- payment callback and expiration worker has been installed and verified.
CREATE TABLE internal_academic.ead_trust_runtime_control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  full_course_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
ALTER TABLE internal_academic.ead_trust_runtime_control ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON internal_academic.ead_trust_runtime_control
  FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO internal_academic.ead_trust_runtime_control(singleton, full_course_enabled)
VALUES (true, false);

CREATE FUNCTION internal_academic.ead_trust_full_course_enabled()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT coalesce((SELECT full_course_enabled
    FROM internal_academic.ead_trust_runtime_control WHERE singleton), false);
$function$;
REVOKE ALL ON FUNCTION internal_academic.ead_trust_full_course_enabled()
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
