BEGIN;

-- V2 observations are separate from the immutable accounting V1 history.
CREATE TABLE internal_proesc.v2_runs (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES public.usuarios_sistema(id),
  credential_revision uuid NOT NULL,
  mode text NOT NULL DEFAULT 'FULL' CHECK(mode IN ('FULL','RECENT')),
  status text NOT NULL DEFAULT 'RUNNING' CHECK(status IN ('RUNNING','COMPLETE','FAILED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CHECK((status='RUNNING')=(finished_at IS NULL))
);
CREATE UNIQUE INDEX proesc_v2_one_running ON internal_proesc.v2_runs((true)) WHERE status='RUNNING';
CREATE TABLE internal_proesc.v2_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES internal_proesc.v2_runs(id),
  resource text NOT NULL CHECK(resource IN ('people','invoices')),
  unit_id text NOT NULL CHECK(unit_id ~ '^[1-9][0-9]{0,17}$'),
  source_year integer NOT NULL CHECK(source_year BETWEEN 0 AND 2200),
  source_month integer NOT NULL CHECK(source_month BETWEEN 0 AND 12),
  next_page integer NOT NULL DEFAULT 1 CHECK(next_page BETWEEN 1 AND 100001),
  last_page integer CHECK(last_page BETWEEN 1 AND 100000),
  expected_total integer CHECK(expected_total BETWEEN 0 AND 1000000),
  records_seen integer NOT NULL DEFAULT 0 CHECK(records_seen>=0),
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','COLLECTED','COMPLETE','FAILED')),
  lease_id uuid,
  lease_until timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
  retry_after timestamptz NOT NULL DEFAULT now(),
  error_code text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(run_id,resource,unit_id,source_year,source_month),
  CHECK((resource='people' AND source_year=0 AND source_month=0)
    OR(resource='invoices' AND source_year BETWEEN 1900 AND 2200 AND source_month BETWEEN 1 AND 12))
);
CREATE INDEX proesc_v2_tasks_queue ON internal_proesc.v2_tasks(run_id,status,retry_after);
CREATE TABLE internal_proesc.v2_pages (
  task_id uuid NOT NULL REFERENCES internal_proesc.v2_tasks(id),
  page integer NOT NULL CHECK(page BETWEEN 1 AND 100000),
  last_page integer NOT NULL CHECK(last_page>=page),
  total integer NOT NULL CHECK(total>=0),
  row_count integer NOT NULL CHECK(row_count BETWEEN 0 AND 100),
  content_hash text NOT NULL CHECK(content_hash ~ '^[0-9a-f]{64}$'),
  observed_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  results jsonb NOT NULL CHECK(jsonb_typeof(results)='object'),
  PRIMARY KEY(task_id,page)
);
CREATE TABLE internal_proesc.v2_invoice_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES internal_proesc.v2_runs(id),
  task_id uuid NOT NULL REFERENCES internal_proesc.v2_tasks(id),
  unit_id text NOT NULL,
  invoice_id text NOT NULL CHECK(invoice_id ~ '^[1-9][0-9]{0,17}$'),
  link_id uuid REFERENCES internal_proesc.obligation_links(id),
  snapshot_id uuid REFERENCES internal_proesc.financial_snapshots(id),
  source_status text NOT NULL,
  normalized jsonb NOT NULL CHECK(jsonb_typeof(normalized)='object'),
  result text NOT NULL CHECK(result IN ('STAGED','APPLIED','OPEN_CONFIRMED','PRESERVED','REVIEW','UNLINKED')),
  reason text,
  observed_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(run_id,unit_id,invoice_id)
);
CREATE INDEX proesc_v2_invoice_link_time ON internal_proesc.v2_invoice_observations(link_id,observed_at DESC);
CREATE TABLE internal_proesc.v2_people_observations (
  run_id uuid NOT NULL REFERENCES internal_proesc.v2_runs(id),
  task_id uuid NOT NULL REFERENCES internal_proesc.v2_tasks(id),
  unit_id text NOT NULL,
  person_id text NOT NULL CHECK(person_id ~ '^[1-9][0-9]{0,17}$'),
  person_hash text CHECK(person_hash ~ '^[0-9a-f]{64}$'),
  enrollments jsonb NOT NULL CHECK(jsonb_typeof(enrollments)='array'),
  matched integer NOT NULL CHECK(matched>=0),
  review integer NOT NULL CHECK(review>=0),
  observed_at timestamptz NOT NULL,
  PRIMARY KEY(run_id,unit_id,person_id)
);
CREATE INDEX proesc_v2_people_document ON internal_proesc.v2_people_observations(run_id,unit_id,person_hash);
CREATE TABLE internal_proesc.v2_enrollment_links (
  unit_id text NOT NULL,
  source_enrollment_id text NOT NULL CHECK(source_enrollment_id ~ '^[1-9][0-9]{0,17}$'),
  source_person_id text NOT NULL CHECK(source_person_id ~ '^[1-9][0-9]{0,17}$'),
  source_class_id text NOT NULL CHECK(source_class_id ~ '^[1-9][0-9]{0,17}$'),
  person_hash text NOT NULL CHECK(person_hash ~ '^[0-9a-f]{64}$'),
  matricula_id uuid NOT NULL UNIQUE REFERENCES public.matriculas(id),
  first_run_id uuid NOT NULL REFERENCES internal_proesc.v2_runs(id),
  first_observed_at timestamptz NOT NULL,
  last_observed_at timestamptz NOT NULL,
  PRIMARY KEY(unit_id,source_enrollment_id)
);
CREATE TABLE internal_proesc.v2_runtime (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  enabled boolean NOT NULL DEFAULT false,
  activated_at timestamptz,
  activated_by uuid REFERENCES public.usuarios_sistema(id)
);
INSERT INTO internal_proesc.v2_runtime(singleton) VALUES(true);

DO $security$
DECLARE v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['v2_runs','v2_tasks','v2_pages','v2_invoice_observations',
    'v2_people_observations','v2_enrollment_links','v2_runtime'] LOOP
    EXECUTE format('ALTER TABLE internal_proesc.%I ENABLE ROW LEVEL SECURITY',v_name);
    EXECUTE format('REVOKE ALL ON internal_proesc.%I FROM PUBLIC,anon,authenticated,service_role',v_name);
  END LOOP;
END;
$security$;

ALTER TABLE internal_proesc.financial_snapshots DROP CONSTRAINT financial_snapshots_evidence_kind_check;
ALTER TABLE internal_proesc.financial_snapshots ADD CONSTRAINT financial_snapshots_evidence_kind_check
  CHECK(evidence_kind IN ('API_SINGLE_PAYMENT','API_PAYMENT_TOTAL','PORTAL_CONFIRMED','UNRESOLVED',
    'API_OPEN_OBLIGATION','API_V2_INVOICE_PAID','API_V2_INVOICE_OPEN','API_V2_INVOICE_REVIEW'));

COMMIT;
