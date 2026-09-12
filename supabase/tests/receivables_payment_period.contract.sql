-- Contrato sem gravação: executa os corpos reais das três RPCs sobre CTEs sintéticas.
-- A guarda é conferida e substituída somente neste harness; RBAC real é validado à parte.
DO $test$
DECLARE
  v_function record;
  v_sql text;
  v_result jsonb;
  v_ids jsonb;
  v_count integer := 0;
  v_scope text;
  v_expected_count integer;
  v_fixtures text := $fixtures$
WITH fixture_input(id, data_vencimento, data_pagamento, status, valor) AS (
  VALUES
    ('00000000-0000-0000-0000-000000000001', '2026-09-15', '2026-08-24', 'PAGO', 260),
    ('00000000-0000-0000-0000-000000000002', '2026-09-15', '2026-09-10', 'PAGO', 100),
    ('00000000-0000-0000-0000-000000000003', '2026-08-15', '2026-09-10', 'PAGO', 200),
    ('00000000-0000-0000-0000-000000000004', '2026-10-15', '2026-09-01', 'PAGO', 300),
    ('00000000-0000-0000-0000-000000000005', '2026-10-15', '2026-09-30', 'PAGO', 400),
    ('00000000-0000-0000-0000-000000000006', '2026-09-15', NULL, 'PAGO', 500),
    ('00000000-0000-0000-0000-000000000007', '2026-09-15', NULL, 'PENDENTE', 600),
    ('00000000-0000-0000-0000-000000000008', '2026-09-15', NULL, 'CANCELADO', 700),
    ('00000000-0000-0000-0000-000000000009', '2026-09-15', NULL, 'VENCIDO', 800),
    ('00000000-0000-0000-0000-000000000010', '2026-09-15', NULL, 'SUSPENSO', 900)
), fixture_contas_receber AS (
  SELECT populated.*
  FROM fixture_input input
  CROSS JOIN LATERAL pg_catalog.jsonb_populate_record(NULL::public.contas_receber,
    pg_catalog.to_jsonb(input) || pg_catalog.jsonb_build_object(
      'polo_id', '10000000-0000-0000-0000-000000000001',
      'turma_id', '20000000-0000-0000-0000-000000000001',
      'cliente_id', '30000000-0000-0000-0000-000000000001',
      'categoria', 'MENSALIDADE', 'valor_pago', CASE WHEN input.status = 'PAGO' THEN input.valor END
    )) populated
), fixture_turmas AS (
  SELECT * FROM pg_catalog.jsonb_populate_record(NULL::public.turmas,
    '{"id":"20000000-0000-0000-0000-000000000001","curso_id":"40000000-0000-0000-0000-000000000001"}'::jsonb)
), fixture_cursos AS (
  SELECT * FROM pg_catalog.jsonb_populate_record(NULL::public.cursos,
    '{"id":"40000000-0000-0000-0000-000000000001","modalidade":"TECNICO"}'::jsonb)
), fixture_parceiros AS (
  SELECT * FROM pg_catalog.jsonb_populate_record(NULL::public.parceiros,
    '{"id":"30000000-0000-0000-0000-000000000001","nome":"Aluno sintético"}'::jsonb)
), fixture_polos AS (
  SELECT * FROM pg_catalog.jsonb_populate_record(NULL::public.polos,
    '{"id":"10000000-0000-0000-0000-000000000001","nome":"Polo sintético"}'::jsonb)
),
$fixtures$;
BEGIN
  FOR v_function IN
    SELECT p.proname, pg_catalog.pg_get_functiondef(p.oid) AS definition
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN (
      'get_receivables_modality_page_v3_secure',
      'get_receivables_modality_groups_page_v3_secure',
      'get_receivables_modality_summary_v3_secure'
    )
  LOOP
    v_count := v_count + 1;
    IF position('public.assert_receivables_filter_scope(p_polo_id)' IN v_function.definition) = 0
      OR position('SET search_path TO ''''' IN v_function.definition) = 0 THEN
      RAISE EXCEPTION 'Guarda ou search_path ausente em %', v_function.proname;
    END IF;
    v_sql := (pg_catalog.regexp_match(v_function.definition,
      '(?s)AS \$function\$(.*)\$function\$'))[1];
    IF v_sql IS NULL THEN RAISE EXCEPTION 'Corpo SQL não encontrado'; END IF;
    v_sql := replace(v_sql, 'public.assert_receivables_filter_scope(p_polo_id)', 'TRUE');
    v_sql := replace(v_sql, 'public.contas_receber cr', 'fixture_contas_receber cr');
    v_sql := replace(v_sql, 'public.turmas t', 'fixture_turmas t');
    v_sql := replace(v_sql, 'public.cursos c', 'fixture_cursos c');
    v_sql := replace(v_sql, 'public.parceiros pa', 'fixture_parceiros pa');
    v_sql := replace(v_sql, 'public.polos po', 'fixture_polos po');
    v_sql := replace(v_sql, 'p_modality', '''TECNICO''::text');
    v_sql := replace(v_sql, 'p_polo_id', 'NULL::uuid');
    v_sql := replace(v_sql, 'p_turma_id', 'NULL::uuid');
    v_sql := replace(v_sql, 'p_search', 'NULL::text');
    v_sql := replace(v_sql, 'p_due_start', '''2026-09-01''::date');
    v_sql := replace(v_sql, 'p_due_end', '''2026-09-30''::date');
    v_sql := replace(v_sql, 'p_status_scope', '''received''::text');
    v_sql := replace(v_sql, 'p_group_mode', '''student''::text');
    v_sql := replace(v_sql, 'p_group_key', 'NULL::text');
    v_sql := replace(v_sql, 'p_page_size', '100');
    v_sql := replace(v_sql, 'p_page', '1');
    v_sql := v_fixtures || pg_catalog.regexp_replace(v_sql, '^\s*WITH\s+', '', 'i');
    EXECUTE v_sql INTO v_result;

    IF v_function.proname = 'get_receivables_modality_summary_v3_secure' THEN
      IF v_result IS DISTINCT FROM '{"pending_count":3,"received_count":4,"canceled_count":1,"overdue_count":1,"all_count":7,"pending_value":2300,"received_value":1000,"canceled_value":700,"overdue_value":800,"all_value":3860}'::jsonb THEN
        RAISE EXCEPTION 'Resumo divergente na fixture: %', v_result;
      END IF;
    ELSIF v_function.proname = 'get_receivables_modality_groups_page_v3_secure' THEN
      IF (v_result ->> 'total_receivables')::integer IS DISTINCT FROM 4
        OR (v_result ->> 'total_items')::integer IS DISTINCT FROM 1
        OR (v_result #>> '{groups,0,received_count}')::integer IS DISTINCT FROM 4 THEN
        RAISE EXCEPTION 'Grupos divergentes na fixture';
      END IF;
    ELSE
      SELECT pg_catalog.jsonb_agg(entry ->> 'id' ORDER BY entry ->> 'id') INTO v_ids
      FROM pg_catalog.jsonb_array_elements(v_result -> 'rows') entry;
      IF (v_result ->> 'total_items')::integer IS DISTINCT FROM 4 OR v_ids IS DISTINCT FROM
        '["00000000-0000-0000-0000-000000000002","00000000-0000-0000-0000-000000000003","00000000-0000-0000-0000-000000000004","00000000-0000-0000-0000-000000000005"]'::jsonb THEN
        RAISE EXCEPTION 'Lista não respeitou pagamento e limites inclusivos';
      END IF;
    END IF;
    IF v_function.proname <> 'get_receivables_modality_summary_v3_secure' THEN
      FOREACH v_scope IN ARRAY ARRAY['pending', 'all'] LOOP
        v_expected_count := CASE WHEN v_scope = 'pending' THEN 3 ELSE 7 END;
        EXECUTE replace(v_sql, '''received''::text', pg_catalog.quote_literal(v_scope) || '::text')
          INTO v_result;
        IF v_function.proname = 'get_receivables_modality_groups_page_v3_secure' THEN
          IF (v_result ->> 'total_receivables')::integer IS DISTINCT FROM v_expected_count
            OR (v_result ->> 'total_items')::integer IS DISTINCT FROM 1
            OR (v_result #>> '{groups,0,item_count}')::integer IS DISTINCT FROM v_expected_count THEN
            RAISE EXCEPTION 'Grupos alteraram o filtro por vencimento: %', v_scope;
          END IF;
        ELSE
          IF (v_result ->> 'total_items')::integer IS DISTINCT FROM v_expected_count
            OR pg_catalog.jsonb_array_length(v_result -> 'rows') IS DISTINCT FROM v_expected_count THEN
            RAISE EXCEPTION 'Lista alterou o filtro por vencimento: %', v_scope;
          END IF;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
  IF v_count <> 3 THEN RAISE EXCEPTION 'RPCs esperadas não encontradas'; END IF;
END;
$test$;
