-- Prepared for explicit installation approval. Atomic, OFF by default; no backfill or cleanup.
BEGIN;
-- Phase 01_payload_storage
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

-- Phase 02_payload_readers
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
DO $patch$
DECLARE v_item jsonb; v_edit jsonb; v_oid oid; v_body text; v_new text; v_definition text; v_meta jsonb;
BEGIN
  IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='internal_proesc.v2_invoice_observations'::regclass
    AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'Unreviewed V2 observation trigger: expand reader inventory';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_rewrite r JOIN pg_depend d
    ON d.classid='pg_rewrite'::regclass AND d.objid=r.oid
    WHERE d.refobjid='internal_proesc.v2_invoice_observations'::regclass) THEN
    RAISE EXCEPTION 'Unreviewed V2 observation view or rule: expand reader inventory';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
      AND p.prokind IN ('f','p','w') AND (pg_get_functiondef(p.oid) ILIKE '%v2_invoice_observations%'
        OR EXISTS(SELECT 1 FROM pg_depend dep WHERE dep.classid='pg_proc'::regclass
          AND dep.objid=p.oid AND ((dep.refclassid='pg_class'::regclass
            AND dep.refobjid='internal_proesc.v2_invoice_observations'::regclass)
            OR (dep.refclassid='pg_type'::regclass
              AND dep.refobjid='internal_proesc.v2_invoice_observations'::regtype::oid)))
        OR 'internal_proesc.v2_invoice_observations'::regtype::oid=ANY(p.proargtypes::oid[])
        OR p.prorettype='internal_proesc.v2_invoice_observations'::regtype::oid)
      AND p.oid NOT IN (SELECT to_regprocedure(value)::oid FROM jsonb_array_elements_text(
        $allowed$[
  "public.get_caixa_review_pending_page_secure(uuid,date,text,integer,integer)",
  "internal_proesc.v2_run_status(uuid)",
  "public.proesc_v2_runtime_service(text,uuid,jsonb)",
  "internal_proesc.v2_monitor_state(uuid)",
  "internal_proesc.archive_unconfirmed_receivables(uuid,jsonb)",
  "internal_proesc.restore_archived_receivable(uuid,jsonb)",
  "internal_proesc.v2_stage_invoice(internal_proesc.v2_tasks,jsonb,timestamp with time zone)",
  "internal_proesc.v2_apply_invoice(uuid,uuid)",
  "internal_proesc.v2_calculated_composition_candidate(uuid,uuid)",
  "internal_proesc.v2_net_discount_candidate(uuid,uuid)",
  "internal_proesc.confirm_portal_payment(uuid,uuid,jsonb)",
  "internal_proesc.v2_invoice_normalized(internal_proesc.v2_invoice_observations)",
  "internal_proesc.v2_invoice_evidence(internal_proesc.v2_invoice_observations)",
  "internal_proesc.v2_assert_payload_readers()",
  "internal_proesc.v2_set_payload_storage_enabled(boolean)"
]$allowed$::jsonb) WHERE to_regprocedure(value) IS NOT NULL)) THEN
    RAISE EXCEPTION 'Unreviewed V2 observation function: expand reader inventory';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements($metadata$[
  {
    "signature": "public.get_caixa_review_pending_page_secure(uuid,date,text,integer,integer)",
    "hash": "2e99bb1426b9f2d3a2a2683c1156de74"
  },
  {
    "signature": "internal_proesc.v2_run_status(uuid)",
    "hash": "041cd992b61ebf2f9131cc4785116be0"
  },
  {
    "signature": "public.proesc_v2_runtime_service(text,uuid,jsonb)",
    "hash": "fa86c5c9a7a99cb7e03be8f7798f10fc"
  },
  {
    "signature": "internal_proesc.v2_monitor_state(uuid)",
    "hash": "b3e37c8c47cca2c982b4f2dc33057014"
  },
  {
    "signature": "internal_proesc.archive_unconfirmed_receivables(uuid,jsonb)",
    "hash": "56abeb9b609c9a7ba0b06599e33be3b8"
  },
  {
    "signature": "internal_proesc.restore_archived_receivable(uuid,jsonb)",
    "hash": "3f765f6169ae63f237de2ae8736b7c4b"
  }
]$metadata$::jsonb) LOOP
    v_oid:=to_regprocedure(v_item->>'signature');
    IF v_oid IS NOT NULL AND (SELECT md5(prosrc) FROM pg_proc WHERE oid=v_oid)
      IS DISTINCT FROM v_item->>'hash' THEN
      RAISE EXCEPTION 'Metadata reader drift: %',v_item->>'signature';
    END IF;
  END LOOP;
  FOR v_item IN SELECT value FROM jsonb_array_elements($registry$[
  {
    "signature": "internal_proesc.v2_apply_invoice(uuid,uuid)",
    "before_hash": "7bcac0e6ab91c13c22490181328083a2",
    "edits": [
      {
        "old": "v_observation.normalized",
        "new": "internal_proesc.v2_invoice_normalized(v_observation)"
      }
    ],
    "after_hash": "5eb46c01890142167d9cee5e5bbfdc65"
  },
  {
    "signature": "internal_proesc.v2_calculated_composition_candidate(uuid,uuid)",
    "before_hash": "060aa57790f55888d40ce5c4caaae650",
    "edits": [
      {
        "old": "SELECT * FROM internal_proesc.v2_invoice_observations o",
        "new": "SELECT o.*,internal_proesc.v2_invoice_normalized(o) canonical_normalized FROM internal_proesc.v2_invoice_observations o"
      },
      {
        "old": "o.normalized",
        "new": "o.canonical_normalized"
      }
    ],
    "after_hash": "7544fba285e21ffc726aaae31e306898"
  },
  {
    "signature": "internal_proesc.v2_net_discount_candidate(uuid,uuid)",
    "before_hash": "655fa66a72ad259535d815aa46dd78a0",
    "edits": [
      {
        "old": "SELECT * FROM internal_proesc.v2_invoice_observations o",
        "new": "SELECT o.*,internal_proesc.v2_invoice_normalized(o) canonical_normalized FROM internal_proesc.v2_invoice_observations o"
      },
      {
        "old": "o.normalized",
        "new": "o.canonical_normalized"
      }
    ],
    "after_hash": "aee0311a5723f5ac3e79da01d8397a27"
  },
  {
    "signature": "internal_proesc.confirm_portal_payment(uuid,uuid,jsonb)",
    "before_hash": "f38efbdea10825c81b0472ce73469427",
    "edits": [
      {
        "old": "v_observation.normalized",
        "new": "internal_proesc.v2_invoice_normalized(v_observation)"
      },
      {
        "old": "newer.normalized",
        "new": "internal_proesc.v2_invoice_normalized(newer)"
      },
      {
        "old": "md5(to_jsonb(v_observation)::text)",
        "new": "md5(internal_proesc.v2_invoice_evidence(v_observation)::text)"
      }
    ],
    "after_hash": "e3128e3a5fb953e6488c1df6aba5eeca"
  }
]$registry$::jsonb) LOOP
    v_oid:=to_regprocedure(v_item->>'signature');
    SELECT p.prosrc,pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc'
      INTO v_body,v_definition,v_meta FROM pg_proc p WHERE p.oid=v_oid;
    IF v_oid IS NULL OR md5(v_body) IS DISTINCT FROM v_item->>'before_hash' THEN
      RAISE EXCEPTION 'V2 reader source drift: %',v_item->>'signature';
    END IF;
    v_new:=v_body;
    FOR v_edit IN SELECT value FROM jsonb_array_elements(v_item->'edits') LOOP
      IF strpos(v_new,v_edit->>'old')=0 THEN RAISE EXCEPTION 'Missing exact reader anchor'; END IF;
      v_new:=replace(v_new,v_edit->>'old',v_edit->>'new');
    END LOOP;
    IF md5(v_new)<>v_item->>'after_hash' THEN RAISE EXCEPTION 'Unexpected reader patch'; END IF;
    EXECUTE replace(v_definition,v_body,v_new);
    IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE p.oid=v_oid) IS DISTINCT FROM v_meta THEN
      RAISE EXCEPTION 'Reader privileges or metadata changed';
    END IF;
  END LOOP;
END;
$patch$;

-- Phase 03_payload_writer
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
DO $patch$
DECLARE v_oid oid:='internal_proesc.v2_stage_invoice(internal_proesc.v2_tasks,jsonb,timestamp with time zone)'::regprocedure;
  v_body text; v_definition text; v_meta jsonb; v_new text;
BEGIN
  SELECT p.prosrc,pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc'
    INTO v_body,v_definition,v_meta FROM pg_proc p WHERE p.oid=v_oid;
  IF md5(v_body)<>'1bd14b66bb10cac772a2619646f857d8' THEN RAISE EXCEPTION 'V2 writer drift'; END IF;
  v_new:=replace(v_body,$old$  INSERT INTO internal_proesc.v2_invoice_observations(run_id,task_id,unit_id,invoice_id,
    source_status,normalized,result,observed_at)
  VALUES(p_task.run_id,p_task.id,p_task.unit_id,p_row->>'invoiceId',p_row->>'sourceStatus',p_row,'STAGED',p_observed);$old$,$new$  IF (SELECT enabled FROM internal_proesc.v2_payload_storage_control WHERE singleton) THEN
    INSERT INTO internal_proesc.v2_invoice_observations(run_id,task_id,unit_id,invoice_id,
      source_status,normalized,normalized_payload_id,result,observed_at)
    VALUES(p_task.run_id,p_task.id,p_task.unit_id,p_row->>'invoiceId',p_row->>'sourceStatus',NULL,
      internal_proesc.v2_intern_invoice_payload(p_task.unit_id,p_row->>'invoiceId',p_row),'STAGED',p_observed);
  ELSE
  INSERT INTO internal_proesc.v2_invoice_observations(run_id,task_id,unit_id,invoice_id,
    source_status,normalized,result,observed_at)
  VALUES(p_task.run_id,p_task.id,p_task.unit_id,p_row->>'invoiceId',p_row->>'sourceStatus',p_row,'STAGED',p_observed);
  END IF;$new$);
  IF md5(v_new)<>'2a1b1ae96ebbc411b6b17c5a8295787f' THEN RAISE EXCEPTION 'V2 writer anchor drift'; END IF;
  EXECUTE replace(v_definition,v_body,v_new);
  IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE p.oid=v_oid) IS DISTINCT FROM v_meta THEN
    RAISE EXCEPTION 'Writer privileges or metadata changed';
  END IF;
END;
$patch$;

-- Phase 04_payload_activation_gate
CREATE FUNCTION internal_proesc.v2_assert_payload_readers()
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $function$
DECLARE v_item jsonb; v_oid oid;
BEGIN
  IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='internal_proesc.v2_invoice_observations'::regclass
    AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'Unreviewed V2 observation trigger: expand reader inventory';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_rewrite r JOIN pg_depend d
    ON d.classid='pg_rewrite'::regclass AND d.objid=r.oid
    WHERE d.refobjid='internal_proesc.v2_invoice_observations'::regclass) THEN
    RAISE EXCEPTION 'Unreviewed V2 observation view or rule: expand reader inventory';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
      AND p.prokind IN ('f','p','w') AND (pg_get_functiondef(p.oid) ILIKE '%v2_invoice_observations%'
        OR EXISTS(SELECT 1 FROM pg_depend dep WHERE dep.classid='pg_proc'::regclass
          AND dep.objid=p.oid AND ((dep.refclassid='pg_class'::regclass
            AND dep.refobjid='internal_proesc.v2_invoice_observations'::regclass)
            OR (dep.refclassid='pg_type'::regclass
              AND dep.refobjid='internal_proesc.v2_invoice_observations'::regtype::oid)))
        OR 'internal_proesc.v2_invoice_observations'::regtype::oid=ANY(p.proargtypes::oid[])
        OR p.prorettype='internal_proesc.v2_invoice_observations'::regtype::oid)
      AND p.oid NOT IN (SELECT to_regprocedure(value)::oid FROM jsonb_array_elements_text(
        $allowed$[
  "public.get_caixa_review_pending_page_secure(uuid,date,text,integer,integer)",
  "internal_proesc.v2_run_status(uuid)",
  "public.proesc_v2_runtime_service(text,uuid,jsonb)",
  "internal_proesc.v2_monitor_state(uuid)",
  "internal_proesc.archive_unconfirmed_receivables(uuid,jsonb)",
  "internal_proesc.restore_archived_receivable(uuid,jsonb)",
  "internal_proesc.v2_stage_invoice(internal_proesc.v2_tasks,jsonb,timestamp with time zone)",
  "internal_proesc.v2_apply_invoice(uuid,uuid)",
  "internal_proesc.v2_calculated_composition_candidate(uuid,uuid)",
  "internal_proesc.v2_net_discount_candidate(uuid,uuid)",
  "internal_proesc.confirm_portal_payment(uuid,uuid,jsonb)",
  "internal_proesc.v2_invoice_normalized(internal_proesc.v2_invoice_observations)",
  "internal_proesc.v2_invoice_evidence(internal_proesc.v2_invoice_observations)",
  "internal_proesc.v2_assert_payload_readers()",
  "internal_proesc.v2_set_payload_storage_enabled(boolean)"
]$allowed$::jsonb) WHERE to_regprocedure(value) IS NOT NULL)) THEN
    RAISE EXCEPTION 'Unreviewed V2 observation function: expand reader inventory';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements($metadata$[
  {
    "signature": "public.get_caixa_review_pending_page_secure(uuid,date,text,integer,integer)",
    "hash": "2e99bb1426b9f2d3a2a2683c1156de74"
  },
  {
    "signature": "internal_proesc.v2_run_status(uuid)",
    "hash": "041cd992b61ebf2f9131cc4785116be0"
  },
  {
    "signature": "public.proesc_v2_runtime_service(text,uuid,jsonb)",
    "hash": "fa86c5c9a7a99cb7e03be8f7798f10fc"
  },
  {
    "signature": "internal_proesc.v2_monitor_state(uuid)",
    "hash": "b3e37c8c47cca2c982b4f2dc33057014"
  },
  {
    "signature": "internal_proesc.archive_unconfirmed_receivables(uuid,jsonb)",
    "hash": "56abeb9b609c9a7ba0b06599e33be3b8"
  },
  {
    "signature": "internal_proesc.restore_archived_receivable(uuid,jsonb)",
    "hash": "3f765f6169ae63f237de2ae8736b7c4b"
  }
]$metadata$::jsonb) LOOP
    v_oid:=to_regprocedure(v_item->>'signature');
    IF v_oid IS NOT NULL AND (SELECT md5(prosrc) FROM pg_proc WHERE oid=v_oid)
      IS DISTINCT FROM v_item->>'hash' THEN
      RAISE EXCEPTION 'Metadata reader drift: %',v_item->>'signature';
    END IF;
  END LOOP;
  FOR v_item IN SELECT value FROM jsonb_array_elements($after$[
  {
    "signature": "internal_proesc.v2_apply_invoice(uuid,uuid)",
    "hash": "5eb46c01890142167d9cee5e5bbfdc65"
  },
  {
    "signature": "internal_proesc.v2_calculated_composition_candidate(uuid,uuid)",
    "hash": "7544fba285e21ffc726aaae31e306898"
  },
  {
    "signature": "internal_proesc.v2_net_discount_candidate(uuid,uuid)",
    "hash": "aee0311a5723f5ac3e79da01d8397a27"
  },
  {
    "signature": "internal_proesc.confirm_portal_payment(uuid,uuid,jsonb)",
    "hash": "e3128e3a5fb953e6488c1df6aba5eeca"
  },
  {
    "signature": "internal_proesc.v2_stage_invoice(internal_proesc.v2_tasks,jsonb,timestamp with time zone)",
    "hash": "2a1b1ae96ebbc411b6b17c5a8295787f"
  },
  {
    "signature": "internal_proesc.v2_invoice_normalized(internal_proesc.v2_invoice_observations)",
    "hash": "fcc69d018d861f572e86136f353a0980"
  },
  {
    "signature": "internal_proesc.v2_invoice_evidence(internal_proesc.v2_invoice_observations)",
    "hash": "e57cc4fe8fe3896593a6fd8abe84ba1a"
  },
  {
    "signature": "internal_proesc.v2_intern_invoice_payload(text,text,jsonb)",
    "hash": "15a1dd495634b891497e065fd5a4c5a8"
  },
  {
    "signature": "internal_proesc.v2_guard_invoice_payload_immutable()",
    "hash": "d943044933bb64b7c4689bbfa6a65b79"
  }
]$after$::jsonb) LOOP
    v_oid:=to_regprocedure(v_item->>'signature');
    IF v_oid IS NULL OR (SELECT md5(prosrc) FROM pg_proc WHERE oid=v_oid)
      IS DISTINCT FROM v_item->>'hash' THEN
      RAISE EXCEPTION 'Payload adapter drift: %',v_item->>'signature';
    END IF;
  END LOOP;
END;
$function$;

CREATE FUNCTION internal_proesc.v2_set_payload_storage_enabled(p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET lock_timeout='3s' AS $function$
DECLARE v_current boolean;
BEGIN
  IF current_user<>'postgres' OR p_enabled IS NULL THEN
    RAISE EXCEPTION 'Authorized database operator and explicit mode required' USING ERRCODE='42501';
  END IF;
  -- Same lock as the canonical runtime: no halfway change during page commit.
  PERFORM pg_advisory_xact_lock(hashtextextended('proesc:v2:runtime',0));
  SELECT enabled INTO STRICT v_current FROM internal_proesc.v2_payload_storage_control WHERE singleton FOR UPDATE;
  IF p_enabled THEN
    PERFORM internal_proesc.v2_assert_payload_readers();
    IF EXISTS(SELECT 1 FROM internal_proesc.v2_runs WHERE status='RUNNING') THEN
      RAISE EXCEPTION 'Wait for the current run to finish before activation' USING ERRCODE='55000';
    END IF;
    IF (SELECT count(*) FROM pg_constraint
      WHERE conrelid='internal_proesc.v2_invoice_observations'::regclass
        AND conname IN ('v2_invoice_payload_identity_fk','v2_invoice_one_payload') AND convalidated)<>2 THEN
      RAISE EXCEPTION 'Validate payload constraints in an approved deployment window first' USING ERRCODE='55000';
    END IF;
    IF (SELECT count(*) FROM pg_class WHERE oid IN ('internal_proesc.v2_invoice_payloads'::regclass,
      'internal_proesc.v2_payload_storage_control'::regclass) AND relrowsecurity)<>2 THEN
      RAISE EXCEPTION 'Payload/control RLS must remain enabled' USING ERRCODE='42501';
    END IF;
    IF EXISTS(SELECT 1 FROM unnest(ARRAY['anon','authenticated','service_role']) role_name
      CROSS JOIN unnest(ARRAY['internal_proesc.v2_invoice_payloads',
        'internal_proesc.v2_payload_storage_control']) relation_name
      WHERE has_table_privilege(role_name,relation_name,'SELECT,INSERT,UPDATE,DELETE')) THEN
      RAISE EXCEPTION 'Unexpected public payload/control permissions' USING ERRCODE='42501';
    END IF;
  END IF;
  UPDATE internal_proesc.v2_payload_storage_control SET enabled=p_enabled
    WHERE singleton AND enabled IS DISTINCT FROM p_enabled;
  SELECT enabled INTO STRICT v_current FROM internal_proesc.v2_payload_storage_control WHERE singleton;
  IF v_current IS DISTINCT FROM p_enabled THEN RAISE EXCEPTION 'Payload activation was not persisted'; END IF;
  RETURN jsonb_build_object('enabled',v_current,'historyRemoved',false,'scheduleChanged',false);
END;
$function$;
REVOKE ALL ON FUNCTION internal_proesc.v2_assert_payload_readers(),
  internal_proesc.v2_set_payload_storage_enabled(boolean) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
