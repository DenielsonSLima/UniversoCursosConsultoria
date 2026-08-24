-- Capa oficial: V1/V2 permanecem legíveis para envelopes históricos; toda
-- nova publicação congela também a URL e os bytes do fundo da capa em V3.

BEGIN;

CREATE FUNCTION public.assinatura_pdf_asset_manifest_diario_v3_valido(
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
  v_cover jsonb;
  v_expected_cover text;
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
     OR p_manifest -> 'schemaVersion' IS DISTINCT FROM '3'::jsonb
     OR p_manifest ->> 'source' <> 'UNIVERSO_DIARIO_PDF_ASSETS_V3'
     OR jsonb_typeof(p_manifest -> 'assets') <> 'object'
  THEN
    RETURN false;
  END IF;

  v_assets := p_manifest -> 'assets';
  IF NOT (v_assets ?& ARRAY[
       'headerLogo', 'watermark', 'validationQr', 'coverBackground',
       'backCoverBackground', 'backCoverImages'
     ]::text[])
     OR v_assets - ARRAY[
       'headerLogo', 'watermark', 'validationQr', 'coverBackground',
       'backCoverBackground', 'backCoverImages'
     ]::text[] <> '{}'::jsonb
     OR NOT public.assinatura_pdf_asset_manifest_diario_v2_valido(
       jsonb_build_object(
         'schemaVersion', 2,
         'source', 'UNIVERSO_DIARIO_PDF_ASSETS_V2',
         'documentSnapshotSha256', p_manifest -> 'documentSnapshotSha256',
         'validationUrl', p_manifest -> 'validationUrl',
         'assets', v_assets - 'coverBackground'
       ),
       p_document_snapshot,
       p_document_snapshot_sha256
     )
  THEN
    RETURN false;
  END IF;

  IF jsonb_typeof(p_document_snapshot -> 'template') <> 'object'
     OR jsonb_typeof(p_document_snapshot -> 'assetSources') <> 'object'
     OR NOT (p_document_snapshot -> 'template' ? 'capaUrl')
     OR NOT (p_document_snapshot -> 'assetSources' ? 'coverUrl')
  THEN
    RETURN false;
  END IF;
  v_expected_cover := p_document_snapshot -> 'assetSources' ->> 'coverUrl';
  IF v_expected_cover IS DISTINCT FROM
       p_document_snapshot -> 'template' ->> 'capaUrl'
  THEN
    RETURN false;
  END IF;

  v_cover := v_assets -> 'coverBackground';
  IF v_expected_cover IS NULL THEN
    IF v_cover <> 'null'::jsonb THEN RETURN false; END IF;
  ELSIF jsonb_typeof(v_cover) <> 'object'
     OR NOT (v_cover ?& ARRAY[
       'sourceKind', 'sourceUrl', 'mimeType', 'byteSize', 'width', 'height',
       'sha256'
     ]::text[])
     OR v_cover - ARRAY[
       'sourceKind', 'sourceUrl', 'mimeType', 'byteSize', 'width', 'height',
       'sha256'
     ]::text[] <> '{}'::jsonb
     OR v_cover ->> 'sourceKind' <> 'HTTPS_URL'
     OR jsonb_typeof(v_cover -> 'sourceUrl') <> 'string'
     OR v_cover ->> 'sourceUrl' IS DISTINCT FROM v_expected_cover
     OR pg_catalog.length(v_cover ->> 'sourceUrl') NOT BETWEEN 1 AND 2048
     OR v_cover ->> 'sourceUrl'
       !~ '^https://kfekgwyqozhicpfuunpo[.]supabase[.]co/storage/v1/object/public/[^?#[:space:]]+$'
     OR NOT public.assinatura_pdf_manifest_image_valida(v_cover, 12582912)
  THEN
    RETURN false;
  END IF;
  RETURN true;
EXCEPTION WHEN others THEN
  RETURN false;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_pdf_asset_manifest_diario_valido(
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
    WHEN '3' THEN public.assinatura_pdf_asset_manifest_diario_v3_valido(
      p_manifest,
      p_document_snapshot,
      p_document_snapshot_sha256
    )
    ELSE false
  END
$function$;

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
       OR NEW.pdf_asset_manifest_snapshot ->> 'schemaVersion' <> '3'
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

REVOKE ALL ON FUNCTION public.assinatura_pdf_asset_manifest_diario_v3_valido(
  jsonb,
  jsonb,
  text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_pdf_asset_manifest_diario_valido(
  jsonb,
  jsonb,
  text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_proteger_pdf_asset_manifest()
  FROM PUBLIC, anon, authenticated;

COMMIT;
