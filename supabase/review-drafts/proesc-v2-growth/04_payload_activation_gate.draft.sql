-- LOCAL REVIEW DRAFT. Installs a guarded switch; does NOT enable it.
BEGIN;
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
