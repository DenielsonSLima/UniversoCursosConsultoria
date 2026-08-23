-- Mantém manifestos históricos v1 e habilita a contracapa configurável v2.
-- O v2 congela a página 2 e exatamente dois slots não sobrepostos, por papel.

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_manifesto_diario_valido(
  p_manifest jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $function$
DECLARE
  v_schema_version integer;
  v_page_count integer;
  v_target_page_index integer;
  v_instructions_page_index integer;
  v_slot jsonb;
  v_first_slot jsonb;
  v_ordinality integer;
  v_expected_role text;
  v_expected_field_id text;
  v_x integer;
  v_y integer;
  v_width integer;
  v_height integer;
BEGIN
  IF jsonb_typeof(p_manifest) <> 'object'
     OR jsonb_typeof(p_manifest -> 'schemaVersion') <> 'number'
     OR p_manifest ->> 'schemaVersion' !~ '^[0-9]+$'
  THEN
    RETURN false;
  END IF;

  v_schema_version := (p_manifest ->> 'schemaVersion')::integer;

  IF v_schema_version = 1 THEN
    IF NOT (p_manifest ?& ARRAY[
         'schemaVersion', 'source', 'semanticTarget', 'pageCount',
         'targetPageIndex', 'instructionsPageIndex'
       ]::text[])
       OR p_manifest - ARRAY[
         'schemaVersion', 'source', 'semanticTarget', 'pageCount',
         'targetPageIndex', 'instructionsPageIndex'
       ]::text[] <> '{}'::jsonb
       OR p_manifest ->> 'source' <> 'UNIVERSO_DIARIO_PDF_V1'
       OR p_manifest ->> 'semanticTarget' <> 'DIARIO_LAST_CONTENT_PAGE'
       OR jsonb_typeof(p_manifest -> 'pageCount') <> 'number'
       OR p_manifest ->> 'pageCount' !~ '^[0-9]+$'
       OR jsonb_typeof(p_manifest -> 'targetPageIndex') <> 'number'
       OR p_manifest ->> 'targetPageIndex' !~ '^[0-9]+$'
       OR jsonb_typeof(coalesce(p_manifest -> 'instructionsPageIndex', 'null'::jsonb)) NOT IN ('number', 'null')
       OR (
         p_manifest -> 'instructionsPageIndex' <> 'null'::jsonb
         AND p_manifest ->> 'instructionsPageIndex' !~ '^[0-9]+$'
       )
    THEN
      RETURN false;
    END IF;

    v_page_count := (p_manifest ->> 'pageCount')::integer;
    v_target_page_index := (p_manifest ->> 'targetPageIndex')::integer;
    v_instructions_page_index := CASE
      WHEN p_manifest -> 'instructionsPageIndex' = 'null'::jsonb THEN NULL
      ELSE (p_manifest ->> 'instructionsPageIndex')::integer
    END;

    RETURN v_page_count BETWEEN 1 AND 500
      AND v_target_page_index BETWEEN 0 AND v_page_count - 1
      AND (
        (v_instructions_page_index IS NULL AND v_target_page_index = v_page_count - 1)
        OR
        (v_instructions_page_index = v_page_count - 1 AND v_target_page_index = v_page_count - 2)
      );
  END IF;

  IF v_schema_version <> 2
     OR NOT (p_manifest ?& ARRAY[
       'schemaVersion', 'source', 'semanticTarget', 'pageCount',
       'targetPageIndex', 'backCoverPageIndex', 'instructionsPageIndex',
       'signatureSlots'
     ]::text[])
     OR p_manifest - ARRAY[
       'schemaVersion', 'source', 'semanticTarget', 'pageCount',
       'targetPageIndex', 'backCoverPageIndex', 'instructionsPageIndex',
       'signatureSlots'
     ]::text[] <> '{}'::jsonb
     OR p_manifest ->> 'source' <> 'UNIVERSO_DIARIO_PDF_V1'
     OR p_manifest ->> 'semanticTarget' <> 'DIARIO_BACK_COVER'
     OR jsonb_typeof(p_manifest -> 'pageCount') <> 'number'
     OR p_manifest ->> 'pageCount' !~ '^[0-9]+$'
     OR jsonb_typeof(p_manifest -> 'targetPageIndex') <> 'number'
     OR p_manifest ->> 'targetPageIndex' !~ '^[0-9]+$'
     OR jsonb_typeof(p_manifest -> 'backCoverPageIndex') <> 'number'
     OR p_manifest ->> 'backCoverPageIndex' !~ '^[0-9]+$'
     OR jsonb_typeof(coalesce(p_manifest -> 'instructionsPageIndex', 'null'::jsonb)) NOT IN ('number', 'null')
     OR (
       p_manifest -> 'instructionsPageIndex' <> 'null'::jsonb
       AND p_manifest ->> 'instructionsPageIndex' !~ '^[0-9]+$'
     )
     OR jsonb_typeof(p_manifest -> 'signatureSlots') <> 'array'
     OR jsonb_array_length(p_manifest -> 'signatureSlots') <> 2
  THEN
    RETURN false;
  END IF;

  v_page_count := (p_manifest ->> 'pageCount')::integer;
  v_target_page_index := (p_manifest ->> 'targetPageIndex')::integer;
  v_instructions_page_index := CASE
    WHEN p_manifest -> 'instructionsPageIndex' = 'null'::jsonb THEN NULL
    ELSE (p_manifest ->> 'instructionsPageIndex')::integer
  END;
  IF v_page_count NOT BETWEEN 2 AND 500
     OR v_target_page_index <> 1
     OR (p_manifest ->> 'backCoverPageIndex')::integer <> 1
     OR (
       v_instructions_page_index IS NOT NULL
       AND v_instructions_page_index <> v_page_count - 1
     )
  THEN
    RETURN false;
  END IF;

  FOR v_slot, v_ordinality IN
    SELECT item.value, item.ordinality::integer
    FROM jsonb_array_elements(p_manifest -> 'signatureSlots')
      WITH ORDINALITY AS item(value, ordinality)
  LOOP
    v_expected_role := CASE v_ordinality WHEN 1 THEN 'PROFESSOR' ELSE 'COORDENADOR' END;
    v_expected_field_id := CASE v_ordinality
      WHEN 1 THEN 'contracapaAssinaturaProfessor'
      ELSE 'contracapaAssinaturaCoordenador'
    END;
    IF jsonb_typeof(v_slot) <> 'object'
       OR NOT (v_slot ?& ARRAY[
         'role', 'fieldId', 'pageTarget', 'coordinateSpace',
         'xBp', 'yBp', 'widthBp', 'heightBp'
       ]::text[])
       OR v_slot - ARRAY[
         'role', 'fieldId', 'pageTarget', 'coordinateSpace',
         'xBp', 'yBp', 'widthBp', 'heightBp'
       ]::text[] <> '{}'::jsonb
       OR v_slot ->> 'role' <> v_expected_role
       OR v_slot ->> 'fieldId' <> v_expected_field_id
       OR v_slot ->> 'pageTarget' <> 'DIARIO_BACK_COVER'
       OR v_slot ->> 'coordinateSpace' <> 'PAGE_TOP_LEFT_BP_V1'
       OR EXISTS (
         SELECT 1
         FROM unnest(ARRAY['xBp', 'yBp', 'widthBp', 'heightBp']) AS key_name
         WHERE jsonb_typeof(v_slot -> key_name) <> 'number'
            OR v_slot ->> key_name !~ '^[0-9]+$'
       )
    THEN
      RETURN false;
    END IF;

    v_x := (v_slot ->> 'xBp')::integer;
    v_y := (v_slot ->> 'yBp')::integer;
    v_width := (v_slot ->> 'widthBp')::integer;
    v_height := (v_slot ->> 'heightBp')::integer;
    IF v_width NOT BETWEEN 38000 AND 90000
       OR v_height NOT BETWEEN 14000 AND 25000
       OR v_x < 0 OR v_y < 0
       OR v_x + v_width > 100000
       OR v_y + v_height > 100000
    THEN
      RETURN false;
    END IF;

    IF v_ordinality = 1 THEN
      v_first_slot := v_slot;
    ELSIF (v_first_slot ->> 'xBp')::integer < v_x + v_width
       AND (v_first_slot ->> 'xBp')::integer + (v_first_slot ->> 'widthBp')::integer > v_x
       AND (v_first_slot ->> 'yBp')::integer < v_y + v_height
       AND (v_first_slot ->> 'yBp')::integer + (v_first_slot ->> 'heightBp')::integer > v_y
    THEN
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
EXCEPTION WHEN others THEN
  RETURN false;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_target_diario_valido(
  p_target jsonb,
  p_manifest jsonb,
  p_original_sha256 text
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $function$
DECLARE
  v_target_page jsonb;
  v_media_box jsonb;
  v_crop_box jsonb;
BEGIN
  IF NOT public.assinatura_eletronica_manifesto_diario_valido(p_manifest)
     OR jsonb_typeof(p_target) <> 'object'
     OR NOT (p_target ?& ARRAY[
       'originalSha256', 'pageCount', 'semanticTarget', 'manifest',
       'targetPageIndex', 'targetPage'
     ]::text[])
     OR p_target - ARRAY[
       'originalSha256', 'pageCount', 'semanticTarget', 'manifest',
       'targetPageIndex', 'targetPage'
     ]::text[] <> '{}'::jsonb
     OR p_target ->> 'originalSha256' IS DISTINCT FROM p_original_sha256
     OR p_target ->> 'originalSha256' !~ '^[0-9a-f]{64}$'
     OR p_target ->> 'semanticTarget' IS DISTINCT FROM p_manifest ->> 'semanticTarget'
     OR p_target -> 'manifest' IS DISTINCT FROM p_manifest
     OR jsonb_typeof(p_target -> 'pageCount') IS DISTINCT FROM 'number'
     OR p_target ->> 'pageCount' !~ '^[0-9]+$'
     OR jsonb_typeof(p_target -> 'targetPageIndex') IS DISTINCT FROM 'number'
     OR p_target ->> 'targetPageIndex' !~ '^[0-9]+$'
     OR p_target ->> 'pageCount' IS DISTINCT FROM p_manifest ->> 'pageCount'
     OR p_target ->> 'targetPageIndex' IS DISTINCT FROM p_manifest ->> 'targetPageIndex'
     OR jsonb_typeof(p_target -> 'targetPage') <> 'object'
  THEN
    RETURN false;
  END IF;

  v_target_page := p_target -> 'targetPage';
  IF NOT (v_target_page ?& ARRAY[
       'pageIndex', 'pageNumber', 'mediaBox', 'cropBox', 'rotationDegrees',
       'visibleWidth', 'visibleHeight'
     ]::text[])
     OR v_target_page - ARRAY[
       'pageIndex', 'pageNumber', 'mediaBox', 'cropBox', 'rotationDegrees',
       'visibleWidth', 'visibleHeight'
     ]::text[] <> '{}'::jsonb
     OR jsonb_typeof(v_target_page -> 'pageIndex') IS DISTINCT FROM 'number'
     OR v_target_page ->> 'pageIndex' !~ '^[0-9]+$'
     OR jsonb_typeof(v_target_page -> 'pageNumber') IS DISTINCT FROM 'number'
     OR v_target_page ->> 'pageNumber' !~ '^[0-9]+$'
     OR jsonb_typeof(v_target_page -> 'rotationDegrees') IS DISTINCT FROM 'number'
     OR v_target_page ->> 'rotationDegrees' !~ '^[0-9]+$'
     OR jsonb_typeof(v_target_page -> 'visibleWidth') IS DISTINCT FROM 'number'
     OR jsonb_typeof(v_target_page -> 'visibleHeight') IS DISTINCT FROM 'number'
     OR (v_target_page ->> 'pageIndex')::integer <> (p_manifest ->> 'targetPageIndex')::integer
     OR (v_target_page ->> 'pageNumber')::integer <> (p_manifest ->> 'targetPageIndex')::integer + 1
     OR (v_target_page ->> 'rotationDegrees')::integer NOT IN (0, 90, 180, 270)
     OR (v_target_page ->> 'visibleWidth')::numeric NOT BETWEEN 1 AND 20000
     OR (v_target_page ->> 'visibleHeight')::numeric NOT BETWEEN 1 AND 20000
     OR jsonb_typeof(v_target_page -> 'mediaBox') <> 'object'
     OR jsonb_typeof(v_target_page -> 'cropBox') <> 'object'
  THEN
    RETURN false;
  END IF;

  v_media_box := v_target_page -> 'mediaBox';
  v_crop_box := v_target_page -> 'cropBox';
  IF NOT (v_media_box ?& ARRAY['x', 'y', 'width', 'height']::text[])
     OR v_media_box - ARRAY['x', 'y', 'width', 'height']::text[] <> '{}'::jsonb
     OR NOT (v_crop_box ?& ARRAY['x', 'y', 'width', 'height']::text[])
     OR v_crop_box - ARRAY['x', 'y', 'width', 'height']::text[] <> '{}'::jsonb
     OR EXISTS (
       SELECT 1 FROM jsonb_each(v_media_box) AS coordinate
       WHERE jsonb_typeof(coordinate.value) IS DISTINCT FROM 'number'
     )
     OR EXISTS (
       SELECT 1 FROM jsonb_each(v_crop_box) AS coordinate
       WHERE jsonb_typeof(coordinate.value) IS DISTINCT FROM 'number'
     )
     OR (v_media_box ->> 'width')::numeric NOT BETWEEN 1 AND 20000
     OR (v_media_box ->> 'height')::numeric NOT BETWEEN 1 AND 20000
     OR (v_crop_box ->> 'width')::numeric NOT BETWEEN 1 AND 20000
     OR (v_crop_box ->> 'height')::numeric NOT BETWEEN 1 AND 20000
     OR (
       (v_target_page ->> 'rotationDegrees')::integer IN (0, 180)
       AND (
         (v_target_page ->> 'visibleWidth')::numeric IS DISTINCT FROM (v_crop_box ->> 'width')::numeric
         OR (v_target_page ->> 'visibleHeight')::numeric IS DISTINCT FROM (v_crop_box ->> 'height')::numeric
       )
     )
     OR (
       (v_target_page ->> 'rotationDegrees')::integer IN (90, 270)
       AND (
         (v_target_page ->> 'visibleWidth')::numeric IS DISTINCT FROM (v_crop_box ->> 'height')::numeric
         OR (v_target_page ->> 'visibleHeight')::numeric IS DISTINCT FROM (v_crop_box ->> 'width')::numeric
       )
     )
  THEN
    RETURN false;
  END IF;

  RETURN true;
EXCEPTION WHEN others THEN
  RETURN false;
END;
$function$;

REVOKE ALL ON FUNCTION public.assinatura_eletronica_manifesto_diario_valido(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_target_diario_valido(jsonb, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_manifesto_diario_valido(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_target_diario_valido(jsonb, jsonb, text) TO authenticated, service_role;
