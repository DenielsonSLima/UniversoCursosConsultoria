-- Contracapa oficial: v1 permanece legível para envelopes históricos; toda
-- nova publicação congela arte, imagens configuradas, fontes e hashes em v2.

BEGIN;

ALTER FUNCTION public.assinatura_eletronica_pdf_asset_manifest_diario_valido(
  jsonb,
  jsonb,
  text
) RENAME TO assinatura_pdf_asset_manifest_diario_v1_valido;

CREATE FUNCTION public.assinatura_pdf_manifest_image_valida(
  p_image jsonb,
  p_max_bytes bigint
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $function$
  SELECT jsonb_typeof(p_image) = 'object'
    AND p_image ->> 'mimeType' IN ('image/png', 'image/jpeg', 'image/webp')
    AND jsonb_typeof(p_image -> 'byteSize') = 'number'
    AND p_image ->> 'byteSize' ~ '^[0-9]+$'
    AND (p_image ->> 'byteSize')::bigint BETWEEN 1 AND p_max_bytes
    AND jsonb_typeof(p_image -> 'width') = 'number'
    AND p_image ->> 'width' ~ '^[0-9]+$'
    AND (p_image ->> 'width')::integer BETWEEN 1 AND 4096
    AND jsonb_typeof(p_image -> 'height') = 'number'
    AND p_image ->> 'height' ~ '^[0-9]+$'
    AND (p_image ->> 'height')::integer BETWEEN 1 AND 4096
    AND (p_image ->> 'width')::bigint
      * (p_image ->> 'height')::bigint <= 12000000
    AND jsonb_typeof(p_image -> 'sha256') = 'string'
    AND p_image ->> 'sha256' ~ '^[0-9a-f]{64}$'
$function$;

CREATE FUNCTION public.assinatura_pdf_asset_manifest_diario_v2_valido(
  p_manifest jsonb,
  p_document_snapshot jsonb,
  p_document_snapshot_sha256 text
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $function$
DECLARE
  v_assets jsonb;
  v_background jsonb;
  v_images jsonb;
  v_image jsonb;
  v_raw_fields jsonb;
  v_expected_background text;
  v_expected_images jsonb;
  v_actual_images jsonb;
  v_seen_ids text[] := ARRAY[]::text[];
  v_total_back_cover_bytes bigint := 0;
BEGIN
  IF jsonb_typeof(p_manifest) <> 'object'
     OR pg_catalog.octet_length(p_manifest::text) > 262144
     OR NOT (p_manifest ?& ARRAY[
       'schemaVersion', 'source', 'documentSnapshotSha256', 'validationUrl',
       'assets'
     ]::text[])
     OR p_manifest - ARRAY[
       'schemaVersion', 'source', 'documentSnapshotSha256', 'validationUrl',
       'assets'
     ]::text[] <> '{}'::jsonb
     OR p_manifest -> 'schemaVersion' IS DISTINCT FROM '2'::jsonb
     OR p_manifest ->> 'source' <> 'UNIVERSO_DIARIO_PDF_ASSETS_V2'
     OR jsonb_typeof(p_manifest -> 'assets') <> 'object'
  THEN
    RETURN false;
  END IF;

  v_assets := p_manifest -> 'assets';
  IF NOT (v_assets ?& ARRAY[
       'headerLogo', 'watermark', 'validationQr', 'backCoverBackground',
       'backCoverImages'
     ]::text[])
     OR v_assets - ARRAY[
       'headerLogo', 'watermark', 'validationQr', 'backCoverBackground',
       'backCoverImages'
     ]::text[] <> '{}'::jsonb
     OR NOT public.assinatura_pdf_asset_manifest_diario_v1_valido(
       jsonb_build_object(
         'schemaVersion', 1,
         'source', 'UNIVERSO_DIARIO_PDF_ASSETS_V1',
         'documentSnapshotSha256', p_manifest -> 'documentSnapshotSha256',
         'validationUrl', p_manifest -> 'validationUrl',
         'assets', jsonb_build_object(
           'headerLogo', v_assets -> 'headerLogo',
           'watermark', v_assets -> 'watermark',
           'validationQr', v_assets -> 'validationQr'
         )
       ),
       p_document_snapshot,
       p_document_snapshot_sha256
     )
  THEN
    RETURN false;
  END IF;

  v_expected_background :=
    p_document_snapshot -> 'assetSources' ->> 'backCoverUrl';
  IF v_expected_background IS DISTINCT FROM
       p_document_snapshot -> 'template' ->> 'contracapaUrl'
  THEN
    RETURN false;
  END IF;
  v_background := v_assets -> 'backCoverBackground';
  IF v_expected_background IS NULL THEN
    IF v_background <> 'null'::jsonb THEN RETURN false; END IF;
  ELSIF jsonb_typeof(v_background) <> 'object'
     OR NOT (v_background ?& ARRAY[
       'sourceKind', 'sourceUrl', 'mimeType', 'byteSize', 'width', 'height',
       'sha256'
     ]::text[])
     OR v_background - ARRAY[
       'sourceKind', 'sourceUrl', 'mimeType', 'byteSize', 'width', 'height',
       'sha256'
     ]::text[] <> '{}'::jsonb
     OR v_background ->> 'sourceKind' <> 'HTTPS_URL'
     OR jsonb_typeof(v_background -> 'sourceUrl') <> 'string'
     OR v_background ->> 'sourceUrl' IS DISTINCT FROM v_expected_background
     OR v_background ->> 'sourceUrl'
       !~ '^https://kfekgwyqozhicpfuunpo[.]supabase[.]co/storage/v1/object/public/[^?#[:space:]]+$'
     OR NOT public.assinatura_pdf_manifest_image_valida(
       v_background,
       12582912
     )
  THEN
    RETURN false;
  END IF;
  IF v_background <> 'null'::jsonb THEN
    v_total_back_cover_bytes := (v_background ->> 'byteSize')::bigint;
  END IF;

  IF p_document_snapshot -> 'templateSource' -> 'raw'
       ? 'contracapaCampos'
     AND jsonb_typeof(
       p_document_snapshot -> 'templateSource' -> 'raw' -> 'contracapaCampos'
     ) <> 'array'
  THEN
    RETURN false;
  END IF;
  v_raw_fields := coalesce(
    p_document_snapshot -> 'templateSource' -> 'raw' -> 'contracapaCampos',
    '[]'::jsonb
  );
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_raw_fields) AS campos(campo)
    WHERE campo -> 'visible' = 'true'::jsonb
      AND campo -> 'isImage' = 'true'::jsonb
      AND (
        jsonb_typeof(campo -> 'id') <> 'string'
        OR length(campo ->> 'id') NOT BETWEEN 1 AND 80
        OR btrim(campo ->> 'id') <> campo ->> 'id'
        OR jsonb_typeof(campo -> 'imageUrl') <> 'string'
        OR campo ->> 'imageUrl'
          !~ '^https://kfekgwyqozhicpfuunpo[.]supabase[.]co/storage/v1/object/public/[^?#[:space:]]+$'
      )
  ) THEN
    RETURN false;
  END IF;
  v_images := v_assets -> 'backCoverImages';
  IF jsonb_typeof(v_images) <> 'array'
     OR jsonb_array_length(v_images) > 20
  THEN
    RETURN false;
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'fieldId', campo ->> 'id',
        'sourceUrl', campo ->> 'imageUrl'
      )
      ORDER BY ordinalidade
    ),
    '[]'::jsonb
  )
  INTO v_expected_images
  FROM jsonb_array_elements(v_raw_fields) WITH ORDINALITY
    AS campos(campo, ordinalidade)
  WHERE campo -> 'visible' = 'true'::jsonb
    AND campo -> 'isImage' = 'true'::jsonb;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'fieldId', imagem ->> 'fieldId',
        'sourceUrl', imagem ->> 'sourceUrl'
      )
      ORDER BY ordinalidade
    ),
    '[]'::jsonb
  )
  INTO v_actual_images
  FROM jsonb_array_elements(v_images) WITH ORDINALITY
    AS imagens(imagem, ordinalidade);
  IF v_actual_images IS DISTINCT FROM v_expected_images THEN RETURN false; END IF;

  FOR v_image IN SELECT value FROM jsonb_array_elements(v_images)
  LOOP
    IF jsonb_typeof(v_image) <> 'object'
       OR NOT (v_image ?& ARRAY[
         'fieldId', 'sourceUrl', 'mimeType', 'byteSize', 'width', 'height',
         'sha256'
       ]::text[])
       OR v_image - ARRAY[
         'fieldId', 'sourceUrl', 'mimeType', 'byteSize', 'width', 'height',
         'sha256'
       ]::text[] <> '{}'::jsonb
       OR jsonb_typeof(v_image -> 'fieldId') <> 'string'
       OR length(v_image ->> 'fieldId') NOT BETWEEN 1 AND 80
       OR btrim(v_image ->> 'fieldId') <> v_image ->> 'fieldId'
       OR v_image ->> 'fieldId' = ANY(v_seen_ids)
       OR jsonb_typeof(v_image -> 'sourceUrl') <> 'string'
       OR v_image ->> 'sourceUrl'
         !~ '^https://kfekgwyqozhicpfuunpo[.]supabase[.]co/storage/v1/object/public/[^?#[:space:]]+$'
       OR NOT public.assinatura_pdf_manifest_image_valida(v_image, 12582912)
    THEN
      RETURN false;
    END IF;
    v_seen_ids := pg_catalog.array_append(v_seen_ids, v_image ->> 'fieldId');
    v_total_back_cover_bytes := v_total_back_cover_bytes
      + (v_image ->> 'byteSize')::bigint;
    IF v_total_back_cover_bytes > 25165824 THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
EXCEPTION WHEN others THEN
  RETURN false;
END;
$function$;

CREATE FUNCTION public.assinatura_eletronica_pdf_asset_manifest_diario_valido(
  p_manifest jsonb,
  p_document_snapshot jsonb,
  p_document_snapshot_sha256 text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $function$
  SELECT CASE p_manifest ->> 'schemaVersion'
    WHEN '1' THEN public.assinatura_pdf_asset_manifest_diario_v1_valido(
      p_manifest,
      p_document_snapshot,
      p_document_snapshot_sha256
    )
    WHEN '2' THEN public.assinatura_pdf_asset_manifest_diario_v2_valido(
      p_manifest,
      p_document_snapshot,
      p_document_snapshot_sha256
    )
    ELSE false
  END
$function$;

ALTER TABLE public.assinatura_eletronica_envelopes
  DROP CONSTRAINT assinatura_eletronica_envelopes_pdf_asset_manifest_check;

ALTER TABLE public.assinatura_eletronica_envelopes
  ADD CONSTRAINT assinatura_eletronica_envelopes_pdf_asset_manifest_check
  CHECK (
    pdf_asset_manifest_snapshot IS NULL
    OR public.assinatura_eletronica_pdf_asset_manifest_diario_valido(
      pdf_asset_manifest_snapshot,
      documento_snapshot,
      academico_snapshot_sha256
    )
  ) NOT VALID;

ALTER TABLE public.assinatura_eletronica_envelopes
  VALIDATE CONSTRAINT assinatura_eletronica_envelopes_pdf_asset_manifest_check;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_proteger_pdf_asset_manifest()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.pdf_asset_manifest_snapshot IS DISTINCT FROM OLD.pdf_asset_manifest_snapshot THEN
    IF OLD.pdf_asset_manifest_snapshot IS NOT NULL
       OR NEW.pdf_asset_manifest_snapshot IS NULL
       OR NEW.pdf_asset_manifest_snapshot ->> 'schemaVersion' <> '2'
       OR OLD.status <> 'RASCUNHO'
       OR NEW.status <> 'PENDENTE'
       OR OLD.documento_original_sha256 IS NOT NULL
       OR NEW.documento_original_sha256 IS NULL
       OR NEW.original_congelado_em IS NULL
       OR NEW.publicado_em IS NULL
       OR NOT public.assinatura_eletronica_pdf_asset_manifest_diario_valido(
         NEW.pdf_asset_manifest_snapshot,
         NEW.documento_snapshot,
         NEW.academico_snapshot_sha256
       )
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'ASSINATURA_PDF_ASSET_MANIFEST_IMUTAVEL';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.assinatura_pdf_manifest_image_valida(jsonb, bigint)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assinatura_pdf_asset_manifest_diario_v1_valido(
  jsonb,
  jsonb,
  text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assinatura_pdf_asset_manifest_diario_v2_valido(
  jsonb,
  jsonb,
  text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_pdf_asset_manifest_diario_valido(
  jsonb,
  jsonb,
  text
) FROM PUBLIC, anon, authenticated;

COMMIT;
