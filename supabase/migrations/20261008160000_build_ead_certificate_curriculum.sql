BEGIN;

-- Conteúdo e paginação canônicos do verso EAD. Não calcula cargas por aula:
-- cronograma e duração de vídeo podem divergir da carga oficial do curso.
CREATE FUNCTION internal_academic.ead_certificate_curriculum_snapshot(
  p_config jsonb,
  p_total_hours numeric
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_source text;
  v_entries jsonb;
  v_entry record;
  v_items jsonb := '[]'::jsonb;
  v_pages jsonb := '[]'::jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_text text := '';
  v_line text;
  v_title text;
  v_cut integer;
  v_index integer := 0;
  v_page integer := 1;
BEGIN
  IF p_total_hours IS NOT NULL AND p_total_hours <= 0 THEN
    RAISE EXCEPTION 'A carga horária total do certificado EAD deve ser positiva ou não informada.'
      USING ERRCODE = '23514';
  END IF;
  IF jsonb_typeof(p_config -> 'cronograma') = 'array'
    AND jsonb_array_length(p_config -> 'cronograma') > 0 THEN
    v_source := 'cronograma';
  ELSE
    v_source := 'conteudos';
  END IF;
  v_entries := p_config -> v_source;
  IF jsonb_typeof(v_entries) IS DISTINCT FROM 'array'
    OR jsonb_array_length(v_entries) = 0 THEN
    RAISE EXCEPTION 'O curso EAD não possui conteúdo programático cadastrado.'
      USING ERRCODE = '23514';
  END IF;

  FOR v_entry IN
    SELECT value, ordinality
    FROM jsonb_array_elements(v_entries) WITH ORDINALITY
    ORDER BY CASE WHEN value ->> 'ordem' ~ '^[0-9]{1,9}$'
      THEN (value ->> 'ordem')::bigint ELSE ordinality END, ordinality
  LOOP
    v_title := btrim(regexp_replace(v_entry.value ->> 'titulo', '[[:space:]]+', ' ', 'g'));
    IF coalesce(v_title, '') = '' THEN
      RAISE EXCEPTION 'O conteúdo programático EAD possui um item sem título.'
        USING ERRCODE = '23514';
    END IF;
    v_index := v_index + 1;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'id', coalesce(nullif(v_entry.value ->> 'id', ''), v_source || '-' || v_entry.ordinality),
      'title', v_title
    ));
    v_line := v_index::text || '. ' || v_title;
    v_text := v_text || CASE WHEN v_index > 1 THEN E'\n' ELSE '' END || v_line;

    -- Orçamento conservador do bloco oficial: 705px, fonte16, até16linhas.
    -- O renderizador desenha estas linhas e páginas sem refazer a paginação.
    LOOP
      IF char_length(v_line) > 70 THEN
        v_cut := 71 - strpos(reverse(left(v_line, 70)), ' ');
        IF v_cut = 71 OR v_cut < 2 THEN v_cut := 70; END IF;
      ELSE
        v_cut := char_length(v_line);
      END IF;
      v_lines := v_lines || jsonb_build_array(rtrim(left(v_line, v_cut)));
      v_line := ltrim(substring(v_line FROM v_cut + 1));
      IF jsonb_array_length(v_lines) = 16 THEN
        v_pages := v_pages || jsonb_build_array(jsonb_build_object('number', v_page, 'lines', v_lines));
        v_lines := '[]'::jsonb;
        v_page := v_page + 1;
      END IF;
      EXIT WHEN v_line = '';
    END LOOP;
  END LOOP;
  IF jsonb_array_length(v_lines) > 0 THEN
    v_pages := v_pages || jsonb_build_array(jsonb_build_object('number', v_page, 'lines', v_lines));
  END IF;

  RETURN jsonb_build_object(
    'eadCurriculum', jsonb_build_object(
      'version', 1, 'source', v_source, 'items', v_items,
      'totalHours', p_total_hours, 'pages', v_pages
    ),
    'programContent', v_text
  );
END;
$function$;

REVOKE ALL ON FUNCTION internal_academic.ead_certificate_curriculum_snapshot(jsonb, numeric)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION internal_academic.ead_certificate_curriculum_snapshot(jsonb, numeric) IS
  'Snapshot programático EAD, ordenação e paginação de títulos no servidor; carga total oficial sem rateio.';

-- Valida exclusivamente os dados congelados, sem ler o cadastro atual do curso.
CREATE FUNCTION internal_academic.ead_certificate_curriculum_from_snapshot(p_snapshot jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_curriculum jsonb := p_snapshot -> 'eadCurriculum';
  v_entries jsonb;
  v_expected jsonb;
BEGIN
  IF jsonb_typeof(v_curriculum) IS DISTINCT FROM 'object'
    OR v_curriculum -> 'version' IS DISTINCT FROM '1'::jsonb
    OR coalesce(v_curriculum ->> 'source', '') NOT IN ('cronograma', 'conteudos')
    OR jsonb_typeof(v_curriculum -> 'items') IS DISTINCT FROM 'array'
    OR jsonb_typeof(v_curriculum -> 'totalHours') IS NULL
    OR jsonb_typeof(v_curriculum -> 'totalHours') NOT IN ('number', 'null')
    OR jsonb_typeof(p_snapshot -> 'programContent') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'O conteúdo programático EAD congelado está ausente ou inválido; exige revisão administrativa.'
      USING ERRCODE = '55000';
  END IF;
  IF jsonb_array_length(v_curriculum -> 'items') = 0 OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_curriculum -> 'items') item
    WHERE jsonb_typeof(item -> 'id') IS DISTINCT FROM 'string'
      OR coalesce(btrim(item ->> 'id'), '') = ''
      OR jsonb_typeof(item -> 'title') IS DISTINCT FROM 'string'
      OR coalesce(btrim(item ->> 'title'), '') = ''
  ) THEN
    RAISE EXCEPTION 'O conteúdo programático EAD congelado possui itens inválidos.' USING ERRCODE = '55000';
  END IF;
  SELECT jsonb_agg(jsonb_build_object('id', value ->> 'id', 'titulo', value ->> 'title') ORDER BY ordinality)
  INTO v_entries FROM jsonb_array_elements(v_curriculum -> 'items') WITH ORDINALITY;
  v_expected := internal_academic.ead_certificate_curriculum_snapshot(
    jsonb_build_object(v_curriculum ->> 'source', v_entries),
    (v_curriculum ->> 'totalHours')::numeric
  );
  IF v_expected -> 'eadCurriculum' IS DISTINCT FROM v_curriculum
    OR v_expected -> 'programContent' IS DISTINCT FROM p_snapshot -> 'programContent' THEN
    RAISE EXCEPTION 'O conteúdo programático EAD congelado está divergente; exige revisão administrativa.'
      USING ERRCODE = '55000';
  END IF;
  RETURN jsonb_build_object('eadCurriculum', v_curriculum, 'programContent', p_snapshot -> 'programContent');
END;
$function$;

REVOKE ALL ON FUNCTION internal_academic.ead_certificate_curriculum_from_snapshot(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
