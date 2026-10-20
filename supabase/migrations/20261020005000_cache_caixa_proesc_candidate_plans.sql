BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='8s';

-- Keep both canonical evidence queries byte-identical inside a PL/pgSQL RETURN.
-- SPI can cache their plans across receipt calls. SQL functions with SET cannot
-- inline here and repeatedly plan these large guards during the monthly report.
-- No evidence predicate, financial value, privilege or search path is relaxed.
DO $patch$
DECLARE
  v_target record;
  v_oid oid;
  v_plpgsql oid;
  v_definition text;
  v_source text;
  v_query text;
  v_expected text;
  v_expected_source text;
  v_metadata jsonb;
BEGIN
  SELECT oid INTO STRICT v_plpgsql FROM pg_language WHERE lanname='plpgsql';
  FOR v_target IN SELECT * FROM (VALUES
    ('internal_proesc.v2_calculated_composition_candidate(uuid,uuid)',
      '65dafbb7f13bfd3fb2beb54a94b175cc'),
    ('internal_proesc.v2_net_discount_candidate(uuid,uuid)',
      '35212f70fdac83ae8decf4a9f8030f3e')
  ) AS targets(signature,definition_hash)
  LOOP
    v_oid:=to_regprocedure(v_target.signature);
    SELECT pg_get_functiondef(p.oid),p.prosrc,to_jsonb(p)-'prosrc'-'prolang'
      INTO v_definition,v_source,v_metadata FROM pg_proc p WHERE p.oid=v_oid;
    IF v_oid IS NULL OR md5(v_definition) IS DISTINCT FROM v_target.definition_hash
      OR position(E'\n LANGUAGE sql\n' IN v_definition)=0
      OR v_source !~ ';[[:space:]]*$' THEN
      RAISE EXCEPTION 'Composition candidate drift; review cached plan wrapper: %',
        v_target.signature;
    END IF;
    -- Remove only the final statement terminator, preserving the whole SELECT.
    v_query:=regexp_replace(v_source,';([[:space:]]*)$','\1');
    v_expected_source:=E'\nBEGIN\n  RETURN ('||v_query||E');\nEND;\n';
    v_expected:=replace(v_definition,E'\n LANGUAGE sql\n',E'\n LANGUAGE plpgsql\n');
    v_expected:=replace(v_expected,'$function$'||v_source||'$function$',
      '$function$'||v_expected_source||'$function$');
    EXECUTE v_expected;
    IF (SELECT to_jsonb(p)-'prosrc'-'prolang' FROM pg_proc p WHERE p.oid=v_oid)
        IS DISTINCT FROM v_metadata
      OR (SELECT p.prolang FROM pg_proc p WHERE p.oid=v_oid) IS DISTINCT FROM v_plpgsql
      OR (SELECT p.prosrc FROM pg_proc p WHERE p.oid=v_oid) IS DISTINCT FROM v_expected_source
      OR pg_get_functiondef(v_oid) IS DISTINCT FROM v_expected THEN
      RAISE EXCEPTION 'Cached candidate changed unreviewed body/metadata: %',
        v_target.signature;
    END IF;
  END LOOP;
END;
$patch$;
NOTIFY pgrst,'reload schema';
COMMIT;
