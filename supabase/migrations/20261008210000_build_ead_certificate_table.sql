BEGIN;

CREATE FUNCTION internal_academic.ead_certificate_table_pages(p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = ''
AS $function$
DECLARE
  v_row jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_pages jsonb := '[]'::jsonb;
  v_lines integer := 0;
  v_cost integer;
BEGIN
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_cost := greatest(1, ceil(char_length(v_row ->> 'nome') / 60.0)::integer);
    IF v_cost > 12 THEN
      RAISE EXCEPTION 'O título de um componente EAD excede o espaço disponível no modelo de tabela.'
        USING ERRCODE = '23514';
    END IF;
    IF jsonb_array_length(v_rows) = 6 OR v_lines + v_cost > 12 THEN
      v_pages := v_pages || jsonb_build_array(jsonb_build_object(
        'number', jsonb_array_length(v_pages) + 1, 'rows', v_rows));
      v_rows := '[]'::jsonb;
      v_lines := 0;
    END IF;
    v_rows := v_rows || jsonb_build_array(v_row);
    v_lines := v_lines + v_cost;
  END LOOP;
  IF jsonb_array_length(v_rows) > 0 THEN
    v_pages := v_pages || jsonb_build_array(jsonb_build_object(
      'number', jsonb_array_length(v_pages) + 1, 'rows', v_rows));
  END IF;
  RETURN v_pages;
END;
$function$;

CREATE FUNCTION internal_academic.ead_certificate_table_snapshot(
  p_config jsonb, p_total_hours numeric, p_progress jsonb, p_snapshot jsonb
)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = ''
AS $function$
DECLARE
  v_original jsonb;
  v_source text;
  v_entries jsonb;
  v_entry record;
  v_index integer := 0;
  v_rows jsonb := '[]'::jsonb;
  v_required jsonb;
  v_completed jsonb;
  v_content jsonb;
  v_is_complete boolean;
  v_all_complete boolean := true;
  v_valid_hours boolean := true;
  v_hours numeric;
  v_scheduled_hours numeric := 0;
  v_hours_status text;
BEGIN
  v_original := internal_academic.ead_certificate_curriculum_from_snapshot(p_snapshot);
  IF v_original IS DISTINCT FROM internal_academic.ead_certificate_curriculum_snapshot(p_config, p_total_hours) THEN
    RAISE EXCEPTION 'A grade EAD congelada diverge do cadastro; a tabela exige revisão administrativa.'
      USING ERRCODE = '55000';
  END IF;
  v_source := v_original #>> '{eadCurriculum,source}';
  v_entries := p_config -> v_source;
  IF v_source = 'cronograma' THEN
    FOR v_content IN SELECT value FROM jsonb_array_elements(v_entries) LOOP
      IF jsonb_typeof(v_content -> 'cargaHoraria') IS DISTINCT FROM 'number' THEN
        v_valid_hours := false;
      ELSE
        v_hours := (v_content ->> 'cargaHoraria')::numeric;
        IF v_hours <= 0 THEN v_valid_hours := false;
        ELSE v_scheduled_hours := v_scheduled_hours + v_hours; END IF;
      END IF;
    END LOOP;
    v_hours_status := CASE
      WHEN NOT v_valid_hours THEN 'MISSING_MODULE_HOURS'
      WHEN p_total_hours IS NULL THEN 'MISSING_OFFICIAL_HOURS'
      WHEN v_scheduled_hours <> p_total_hours THEN 'MODULE_TOTAL_MISMATCH'
      ELSE 'CONSISTENT' END;
  ELSE
    v_valid_hours := false;
    v_hours_status := 'SOURCE_WITHOUT_MODULE_HOURS';
  END IF;
  v_completed := CASE WHEN jsonb_typeof(p_progress -> 'completedContentIds') = 'array'
    THEN p_progress -> 'completedContentIds' ELSE '[]'::jsonb END;

  FOR v_entry IN SELECT value, ordinality FROM jsonb_array_elements(v_entries) WITH ORDINALITY
    ORDER BY CASE WHEN value ->> 'ordem' ~ '^[0-9]{1,9}$'
      THEN (value ->> 'ordem')::bigint ELSE ordinality END, ordinality
  LOOP
    v_required := CASE WHEN v_source = 'cronograma' THEN v_entry.value -> 'conteudos'
      ELSE jsonb_build_array(v_entry.value ->> 'id') END;
    v_is_complete := false;
    IF jsonb_typeof(v_required) = 'array' AND jsonb_array_length(v_required) > 0 THEN
      v_is_complete := true;
      FOR v_content IN SELECT value FROM jsonb_array_elements(v_required) LOOP
        IF jsonb_typeof(v_content) IS DISTINCT FROM 'string'
          OR coalesce(btrim(v_content #>> '{}'), '') = ''
          OR NOT (v_completed @> jsonb_build_array(v_content))
          OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p_config -> 'conteudos', '[]'::jsonb)) lesson
            WHERE lesson ->> 'id' = v_content #>> '{}') THEN
          v_is_complete := false;
        END IF;
      END LOOP;
    END IF;
    v_all_complete := v_all_complete AND v_is_complete;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'nome', v_original #>> ARRAY['eadCurriculum', 'items', v_index::text, 'title'],
      'carga', CASE WHEN v_hours_status = 'CONSISTENT'
        THEN replace(trim_scale((v_entry.value ->> 'cargaHoraria')::numeric)::text, '.', ',') || 'h'
        ELSE '—' END,
      'status', CASE WHEN v_is_complete THEN 'Concluído' ELSE '—' END
    ));
    v_index := v_index + 1;
  END LOOP;
  RETURN jsonb_build_object('eadCurriculumTable', jsonb_build_object(
    'version', 2, 'source', v_source, 'rows', v_rows,
    'pages', internal_academic.ead_certificate_table_pages(v_rows),
    'quality', jsonb_build_object(
      'hoursSource', CASE WHEN v_source = 'cronograma' THEN 'cronograma.cargaHoraria' ELSE 'none' END,
      'hoursStatus', v_hours_status,
      'scheduledHours', CASE WHEN v_valid_hours THEN v_scheduled_hours ELSE NULL END,
      'officialHours', p_total_hours,
      'completionSource', 'ead_aluno_progresso.completedContentIds',
      'completionStatus', CASE WHEN v_all_complete THEN 'ALL_MODULES_COMPLETED' ELSE 'PARTIAL_OR_UNKNOWN' END,
      'gradeSource', 'NONE'
    )
  ));
END;
$function$;

-- Reutilização valida o payload congelado, sem consultar nem recalcular o curso.
CREATE FUNCTION internal_academic.ead_certificate_table_from_snapshot(p_snapshot jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = ''
AS $function$
DECLARE
  v_original jsonb;
  v_table jsonb := p_snapshot -> 'eadCurriculumTable';
  v_row jsonb;
  v_index integer := 0;
  v_sum numeric := 0;
  v_all_complete boolean := true;
  v_quality jsonb;
BEGIN
  v_original := internal_academic.ead_certificate_curriculum_from_snapshot(p_snapshot);
  IF jsonb_typeof(v_table) IS DISTINCT FROM 'object'
    OR v_table -> 'version' IS DISTINCT FROM '2'::jsonb
    OR v_table -> 'source' IS DISTINCT FROM v_original #> '{eadCurriculum,source}'
    OR jsonb_typeof(v_table -> 'rows') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'A tabela EAD congelada está ausente ou inválida.' USING ERRCODE = '55000';
  END IF;
  IF jsonb_array_length(v_table -> 'rows') <> jsonb_array_length(v_original #> '{eadCurriculum,items}') THEN
    RAISE EXCEPTION 'Os componentes da tabela EAD divergem da grade congelada.' USING ERRCODE = '55000';
  END IF;
  v_quality := v_table -> 'quality';
  IF jsonb_typeof(v_quality) IS DISTINCT FROM 'object'
    OR v_quality ->> 'hoursSource' IS DISTINCT FROM (CASE WHEN v_table ->> 'source' = 'cronograma'
      THEN 'cronograma.cargaHoraria' ELSE 'none' END)
    OR coalesce(v_quality ->> 'hoursStatus', '') NOT IN (
      'CONSISTENT','MISSING_MODULE_HOURS','MISSING_OFFICIAL_HOURS','MODULE_TOTAL_MISMATCH','SOURCE_WITHOUT_MODULE_HOURS')
    OR v_quality -> 'officialHours' IS DISTINCT FROM v_original #> '{eadCurriculum,totalHours}'
    OR v_quality ->> 'completionSource' IS DISTINCT FROM 'ead_aluno_progresso.completedContentIds'
    OR v_quality ->> 'gradeSource' IS DISTINCT FROM 'NONE' THEN
    RAISE EXCEPTION 'A origem dos dados da tabela EAD congelada está inválida.' USING ERRCODE = '55000';
  END IF;
  FOR v_row IN SELECT value FROM jsonb_array_elements(v_table -> 'rows') LOOP
    IF v_row ->> 'nome' IS DISTINCT FROM v_original #>> ARRAY['eadCurriculum', 'items', v_index::text, 'title']
      OR coalesce(v_row ->> 'status', '') NOT IN ('Concluído', '—')
      OR coalesce(v_row ->> 'carga', '') !~ '^(—|[0-9]+(,[0-9]+)?h)$' THEN
      RAISE EXCEPTION 'Uma linha da tabela EAD congelada está inválida.' USING ERRCODE = '55000';
    END IF;
    IF v_quality ->> 'hoursStatus' = 'CONSISTENT' THEN
      IF v_row ->> 'carga' = '—' THEN
        RAISE EXCEPTION 'A tabela EAD não possui a carga horária confirmada.' USING ERRCODE = '55000';
      END IF;
      IF replace(rtrim(v_row ->> 'carga', 'h'), ',', '.')::numeric <= 0 THEN
        RAISE EXCEPTION 'A carga horária de componente EAD está inválida.' USING ERRCODE = '55000';
      END IF;
      v_sum := v_sum + replace(rtrim(v_row ->> 'carga', 'h'), ',', '.')::numeric;
    ELSIF v_row ->> 'carga' <> '—' THEN
      RAISE EXCEPTION 'A tabela EAD apresenta carga horária sem confirmação.' USING ERRCODE = '55000';
    END IF;
    v_all_complete := v_all_complete AND v_row ->> 'status' = 'Concluído';
    v_index := v_index + 1;
  END LOOP;
  IF (v_quality ->> 'hoursStatus' = 'CONSISTENT'
      AND (v_sum IS DISTINCT FROM (v_quality ->> 'officialHours')::numeric
        OR v_sum IS DISTINCT FROM (v_quality ->> 'scheduledHours')::numeric))
    OR v_quality ->> 'completionStatus' IS DISTINCT FROM (CASE WHEN v_all_complete
      THEN 'ALL_MODULES_COMPLETED' ELSE 'PARTIAL_OR_UNKNOWN' END) THEN
    RAISE EXCEPTION 'O resumo da tabela EAD congelada diverge dos componentes.' USING ERRCODE = '55000';
  END IF;
  IF v_table -> 'pages' IS DISTINCT FROM internal_academic.ead_certificate_table_pages(v_table -> 'rows') THEN
    RAISE EXCEPTION 'A paginação da tabela EAD congelada está inválida.' USING ERRCODE = '55000';
  END IF;
  RETURN jsonb_build_object('eadCurriculumTable', v_table);
END;
$function$;

REVOKE ALL ON FUNCTION internal_academic.ead_certificate_table_pages(jsonb),
  internal_academic.ead_certificate_table_snapshot(jsonb,numeric,jsonb,jsonb),
  internal_academic.ead_certificate_table_from_snapshot(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION internal_academic.ead_certificate_table_snapshot(jsonb,numeric,jsonb,jsonb) IS
  'Tabela EAD v2: carga acadêmica explícita coerente, conclusão por conteúdo, sem nota por módulo ou rateio.';

COMMIT;
