BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='8s';

-- OPEN/UNKNOWN evidence with no accounting lines cannot contradict the net
-- rule. Keep the complete conflict guard, but index its necessary superset.
-- Fail closed on function drift before acquiring the bounded index-build lock.
DO $guard$
BEGIN
  IF md5(pg_get_functiondef('internal_proesc.v2_calculated_composition_candidate(uuid,uuid)'::regprocedure))
       IS DISTINCT FROM '0c10af969046179c46963a6d2b1180a8'
    OR md5(pg_get_functiondef('internal_proesc.v2_net_discount_candidate(uuid,uuid)'::regprocedure))
       IS DISTINCT FROM '298ca5df35dc56c6f38c309cc7b84090' THEN
    RAISE EXCEPTION 'Composition candidate drift; review indexed history';
  END IF;
END;
$guard$;

CREATE INDEX proesc_snapshots_net_rule_history_idx
  ON internal_proesc.financial_snapshots(link_id)
  WHERE source_status IN ('CANCELED','PAID') OR accounting_lines<>'[]'::jsonb;

DO $patch$
DECLARE
  v_target record;
  v_oid oid;
  v_definition text;
  v_source text;
  v_expected_source text;
  v_metadata jsonb;
  v_old text:=$old$AND NOT EXISTS(SELECT 1 FROM internal_proesc.financial_snapshots h WHERE h.link_id=l.id AND ($old$;
  v_new text:=$new$AND NOT EXISTS(SELECT 1 FROM internal_proesc.financial_snapshots h WHERE h.link_id=l.id
        AND (h.source_status IN ('CANCELED','PAID') OR h.accounting_lines<>'[]'::jsonb)
        AND ($new$;
BEGIN
  FOR v_target IN SELECT * FROM (VALUES
    ('internal_proesc.v2_calculated_composition_candidate(uuid,uuid)',false),
    ('internal_proesc.v2_net_discount_candidate(uuid,uuid)',true)
  ) AS targets(signature,net_rule)
  LOOP
    v_oid:=v_target.signature::regprocedure;
    SELECT pg_get_functiondef(p.oid),p.prosrc,to_jsonb(p)-'prosrc'-'proconfig'
      INTO v_definition,v_source,v_metadata FROM pg_proc p WHERE p.oid=v_oid;
    IF (SELECT p.proconfig FROM pg_proc p WHERE p.oid=v_oid)
        IS DISTINCT FROM ARRAY['search_path=""']::text[] THEN
      RAISE EXCEPTION 'Unexpected candidate configuration: %',v_target.signature;
    END IF;
    v_expected_source:=v_source;
    IF v_target.net_rule THEN
      IF (length(v_source)-length(replace(v_source,v_old,'')))/length(v_old)<>1 THEN
        RAISE EXCEPTION 'Net history marker drift';
      END IF;
      v_expected_source:=replace(v_source,v_old,v_new);
      EXECUTE replace(v_definition,'$function$'||v_source||'$function$',
        '$function$'||v_expected_source||'$function$');
    END IF;
    -- The complete queries are parameterized. Avoid their measured repeated
    -- custom-plan cost; keep this setting scoped to these two guard functions.
    EXECUTE 'ALTER FUNCTION '||v_target.signature||' SET plan_cache_mode TO ''force_generic_plan''';
    IF (SELECT to_jsonb(p)-'prosrc'-'proconfig' FROM pg_proc p WHERE p.oid=v_oid)
        IS DISTINCT FROM v_metadata
      OR (SELECT p.prosrc FROM pg_proc p WHERE p.oid=v_oid) IS DISTINCT FROM v_expected_source
      OR (SELECT p.proconfig FROM pg_proc p WHERE p.oid=v_oid)
        IS DISTINCT FROM ARRAY['search_path=""','plan_cache_mode=force_generic_plan']::text[] THEN
      RAISE EXCEPTION 'Indexed history changed unreviewed candidate body/metadata: %',
        v_target.signature;
    END IF;
  END LOOP;
END;
$patch$;
NOTIFY pgrst,'reload schema';
COMMIT;
