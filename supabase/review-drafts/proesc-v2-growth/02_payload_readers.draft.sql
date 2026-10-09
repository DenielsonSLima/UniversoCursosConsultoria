-- LOCAL REVIEW DRAFT. Readers first; writer flag remains disabled.
BEGIN;
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
COMMIT;
