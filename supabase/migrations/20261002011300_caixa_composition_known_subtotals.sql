BEGIN;

-- Preserve the canonical totals, authorization and per-movement unknowns.
-- A partial section exposes only the known subtotal of each adjustment.
DO $migration$
DECLARE
  v_function regprocedure := 'public.get_caixa_composicao_mensal_secure(uuid,date)'::regprocedure;
  v_source text := pg_catalog.pg_get_functiondef(v_function);
  v_before jsonb;
  v_after jsonb;
  v_alias text;
  v_field text;
  v_old text;
  v_new text;
BEGIN
  SELECT to_jsonb(p) - 'prosrc' INTO v_before FROM pg_catalog.pg_proc p WHERE oid = v_function;
  FOREACH v_alias IN ARRAY ARRAY['recebimento', 'despesa'] LOOP
    FOREACH v_field IN ARRAY ARRAY['juros', 'multa', 'acrescimo', 'desconto'] LOOP
      v_old := pg_catalog.format(
        E'WHEN pg_catalog.count(*) FILTER (\n        WHERE %s.%s IS NULL\n      ) > 0 THEN NULL::numeric\n      ELSE coalesce(pg_catalog.sum(%s.%s), 0)',
        v_alias, v_field, v_alias, v_field);
      v_new := pg_catalog.format(
        E'WHEN pg_catalog.count(%s.%s) = 0 THEN NULL::numeric\n      ELSE pg_catalog.sum(%s.%s)',
        v_alias, v_field, v_alias, v_field);
      IF (length(v_source) - length(replace(v_source, v_old, ''))) / length(v_old) <> 1 THEN
        RAISE EXCEPTION 'Unexpected subtotal source for %.%', v_alias, v_field;
      END IF;
      v_source := replace(v_source, v_old, v_new);
    END LOOP;
  END LOOP;

  -- An equation between incomplete subtotals is not proof of complete components.
  -- Reconciliation against canonical received/paid totals remains unconditional.
  FOREACH v_alias IN ARRAY ARRAY['recebimentos', 'despesas'] LOOP
    v_old := pg_catalog.format('      v_%s_base IS NOT NULL', v_alias);
    v_new := pg_catalog.format(E'      v_%s_a_conferir = 0\n      AND v_%s_base IS NOT NULL', v_alias, v_alias);
    IF (length(v_source) - length(replace(v_source, v_old, ''))) / length(v_old) <> 1 THEN
      RAISE EXCEPTION 'Unexpected reconciliation source for %', v_alias;
    END IF;
    v_source := replace(v_source, v_old, v_new);
  END LOOP;
  v_source := replace(v_source,
    'composição parcial ou diferença a conferir.',
    'composição parcial ou diferença a conferir. Juros, multa, acréscimo e desconto exibem somente subtotais identificados; componentes não informados não integram esses subtotais.');
  EXECUTE v_source;
  SELECT to_jsonb(p) - 'prosrc' INTO v_after FROM pg_catalog.pg_proc p WHERE oid = v_function;
  IF v_after IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'Composition function security or identity changed';
  END IF;
END;
$migration$;

NOTIFY pgrst, 'reload schema';
COMMIT;
