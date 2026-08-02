DO $migration$
DECLARE
  v_function_oid regprocedure := to_regprocedure('public.get_storage_dashboard()');
  v_definition text;
BEGIN
  IF v_function_oid IS NULL THEN
    RAISE EXCEPTION 'A função public.get_storage_dashboard() não foi encontrada.';
  END IF;

  SELECT pg_get_functiondef(v_function_oid::oid)
  INTO v_definition;

  IF position('''EM ANDAMENTO''' IN v_definition) = 0 THEN
    RETURN;
  END IF;

  v_definition := replace(
    v_definition,
    '''EM ANDAMENTO''',
    '''EM_ANDAMENTO'''
  );

  EXECUTE v_definition;
END;
$migration$;
