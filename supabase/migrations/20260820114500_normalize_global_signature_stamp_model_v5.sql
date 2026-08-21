-- Repara somente o MODELO_PADRAO ativo que ficou no schema v3 apos a
-- migração v5. O modelo global ainda não referencia envelopes, portanto sua
-- normalização in-place não reinterpreta nenhuma prova histórica.

BEGIN;

DO $migration$
DECLARE
  v_policy public.assinatura_eletronica_politicas%ROWTYPE;
  v_updated_policy public.assinatura_eletronica_politicas%ROWTYPE;
  v_link public.assinatura_eletronica_politica_carimbo_assets%ROWTYPE;
  v_link_after public.assinatura_eletronica_politica_carimbo_assets%ROWTYPE;
  v_asset public.assinatura_eletronica_modelo_assets%ROWTYPE;
  v_policy_count integer;
  v_link_count integer;
  v_editor_v3 jsonb;
  v_editor_v5 jsonb;
  v_asset_snapshot jsonb;
  v_editor_asset_id text;
  v_snapshot_asset_id text;
  v_snapshot_sha256 text;
  v_snapshot_mime_type text;
  v_snapshot_size_bytes text;
  v_snapshot_width text;
  v_snapshot_height text;
BEGIN
  -- Impede que uma segunda política global ou um vínculo de asset seja criado
  -- entre a checagem fechada e a atualização.
  LOCK TABLE public.assinatura_eletronica_politicas IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.assinatura_eletronica_politica_carimbo_assets
    IN SHARE ROW EXCLUSIVE MODE;

  SELECT count(*)
  INTO v_policy_count
  FROM public.assinatura_eletronica_politicas AS politica
  WHERE politica.documento = 'MODELO_PADRAO'
    AND politica.polo_id IS NULL
    AND politica.arquivada_em IS NULL;
  IF v_policy_count <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_MODELO_PADRAO_V5_CARDINALIDADE_INVALIDA';
  END IF;

  SELECT politica.*
  INTO v_policy
  FROM public.assinatura_eletronica_politicas AS politica
  WHERE politica.documento = 'MODELO_PADRAO'
    AND politica.polo_id IS NULL
    AND politica.arquivada_em IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_MODELO_PADRAO_V5_INDISPONIVEL';
  END IF;

  -- Nunca atualize in-place um modelo que já tenha sido congelado por um
  -- envelope: isto protege a imutabilidade mesmo diante de drift inesperado.
  IF EXISTS (
    SELECT 1
    FROM public.assinatura_eletronica_envelopes AS envelope
    WHERE envelope.politica_id = v_policy.id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_MODELO_PADRAO_V5_REFERENCIADO_POR_ENVELOPE';
  END IF;

  IF jsonb_typeof(v_policy.politica) IS DISTINCT FROM 'object'
     OR jsonb_typeof((v_policy.politica -> 'editor')) IS DISTINCT FROM 'object'
     OR jsonb_typeof((v_policy.politica -> 'editor' -> 'schemaVersion'))
          IS DISTINCT FROM 'number'
     OR (v_policy.politica -> 'editor' ->> 'schemaVersion') IS DISTINCT FROM '3'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_MODELO_PADRAO_V5_EDITOR_ORIGEM_INVALIDO';
  END IF;

  v_editor_v3 := v_policy.politica -> 'editor';
  IF jsonb_typeof((v_editor_v3 -> 'signatureStamp')) IS DISTINCT FROM 'object'
     OR jsonb_typeof((v_editor_v3 -> 'signatureStamp' -> 'assetId'))
          IS DISTINCT FROM 'string'
     OR (v_editor_v3 -> 'signatureStamp' ->> 'assetId')
          !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_MODELO_PADRAO_V5_CARIMBO_ORIGEM_INVALIDO';
  END IF;

  v_asset_snapshot := v_policy.politica -> 'signatureStampAssetSnapshot';
  IF jsonb_typeof(v_asset_snapshot) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_MODELO_PADRAO_V5_SNAPSHOT_AUSENTE';
  END IF;
  IF (
       SELECT array_agg(entry.key ORDER BY entry.key)
       FROM jsonb_object_keys(v_asset_snapshot) AS entry(key)
     ) IS DISTINCT FROM ARRAY[
       'assetId', 'height', 'mimeType', 'sha256', 'sizeBytes', 'width'
     ]::text[] THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_MODELO_PADRAO_V5_SNAPSHOT_INVALIDO';
  END IF;
  IF jsonb_typeof((v_asset_snapshot -> 'assetId')) IS DISTINCT FROM 'string'
     OR jsonb_typeof((v_asset_snapshot -> 'sha256')) IS DISTINCT FROM 'string'
     OR jsonb_typeof((v_asset_snapshot -> 'mimeType')) IS DISTINCT FROM 'string'
     OR jsonb_typeof((v_asset_snapshot -> 'sizeBytes')) IS DISTINCT FROM 'number'
     OR jsonb_typeof((v_asset_snapshot -> 'width')) IS DISTINCT FROM 'number'
     OR jsonb_typeof((v_asset_snapshot -> 'height')) IS DISTINCT FROM 'number'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_MODELO_PADRAO_V5_SNAPSHOT_INVALIDO';
  END IF;
  v_editor_asset_id := v_editor_v3 #>> ARRAY['signatureStamp', 'assetId'];
  v_snapshot_asset_id := v_asset_snapshot ->> 'assetId';
  v_snapshot_sha256 := v_asset_snapshot ->> 'sha256';
  v_snapshot_mime_type := v_asset_snapshot ->> 'mimeType';
  v_snapshot_size_bytes := v_asset_snapshot ->> 'sizeBytes';
  v_snapshot_width := v_asset_snapshot ->> 'width';
  v_snapshot_height := v_asset_snapshot ->> 'height';
  IF v_snapshot_asset_id IS DISTINCT FROM v_editor_asset_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_MODELO_PADRAO_V5_SNAPSHOT_ASSET_ID_DIVERGENTE';
  END IF;
  IF v_snapshot_asset_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_MODELO_PADRAO_V5_SNAPSHOT_ASSET_ID_INVALIDO';
  END IF;
  IF v_snapshot_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_MODELO_PADRAO_V5_SNAPSHOT_SHA256_INVALIDO';
  END IF;

  SELECT count(*)
  INTO v_link_count
  FROM public.assinatura_eletronica_politica_carimbo_assets AS vinculo
  WHERE vinculo.politica_id = v_policy.id;
  IF v_link_count <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_MODELO_PADRAO_V5_VINCULO_CARIMBO_INVALIDO';
  END IF;

  SELECT vinculo.*
  INTO v_link
  FROM public.assinatura_eletronica_politica_carimbo_assets AS vinculo
  WHERE vinculo.politica_id = v_policy.id
  FOR KEY SHARE;
  IF NOT FOUND
     OR v_link.asset_id::text IS DISTINCT FROM v_snapshot_asset_id
     OR v_link.asset_sha256 IS DISTINCT FROM v_snapshot_sha256
     OR v_link.asset_snapshot IS DISTINCT FROM v_asset_snapshot
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_MODELO_PADRAO_V5_VINCULO_CARIMBO_DIVERGENTE';
  END IF;

  SELECT asset.*
  INTO v_asset
  FROM public.assinatura_eletronica_modelo_assets AS asset
  WHERE asset.id = v_link.asset_id
    AND asset.status = 'PRONTO'
  FOR SHARE;
  IF NOT FOUND
     OR v_asset.sha256 IS DISTINCT FROM v_snapshot_sha256
     OR v_asset.mime_type IS DISTINCT FROM v_snapshot_mime_type
     OR v_asset.tamanho_bytes::text
          IS DISTINCT FROM v_snapshot_size_bytes
     OR v_asset.largura::text IS DISTINCT FROM v_snapshot_width
     OR v_asset.altura::text IS DISTINCT FROM v_snapshot_height
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_MODELO_PADRAO_V5_ASSET_CARIMBO_DIVERGENTE';
  END IF;

  -- A função v5 preserva as páginas/asset canônicos do editor v3 e introduz
  -- somente template global e auto-layout fechados.
  v_editor_v5 := public.assinatura_eletronica_normalizar_editor(v_editor_v3);
  IF (v_editor_v5 ->> 'schemaVersion') IS DISTINCT FROM '5'
     OR v_editor_v5 IS DISTINCT FROM public.assinatura_eletronica_normalizar_editor(
       v_editor_v5
     )
     OR (v_editor_v5 -> 'signatureStamp' -> 'assetId')
          IS DISTINCT FROM pg_catalog.to_jsonb(v_snapshot_asset_id)
     OR NOT public.assinatura_eletronica_template_carimbo_v5_valido(
       v_editor_v5 -> 'signatureStamp' -> 'template'
     )
     OR NOT public.assinatura_eletronica_auto_layout_carimbo_v5_valido(
       v_editor_v5 -> 'signatureStamp' -> 'autoLayout'
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_MODELO_PADRAO_V5_NORMALIZACAO_INVALIDA';
  END IF;

  UPDATE public.assinatura_eletronica_politicas AS politica
  SET politica = pg_catalog.jsonb_set(
    politica.politica,
    ARRAY['editor'],
    v_editor_v5,
    true
  )
  WHERE politica.id = v_policy.id
    AND politica.documento = 'MODELO_PADRAO'
    AND politica.polo_id IS NULL
    AND politica.arquivada_em IS NULL
  RETURNING politica.* INTO v_updated_policy;
  IF NOT FOUND
     OR (v_updated_policy.politica -> 'editor') IS DISTINCT FROM v_editor_v5
     OR (v_updated_policy.politica -> 'signatureStampAssetSnapshot')
          IS DISTINCT FROM v_asset_snapshot
     OR (v_updated_policy.politica -> 'editor' ->> 'schemaVersion')
          IS DISTINCT FROM '5'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_MODELO_PADRAO_V5_ATUALIZACAO_INVALIDA';
  END IF;

  SELECT vinculo.*
  INTO v_link_after
  FROM public.assinatura_eletronica_politica_carimbo_assets AS vinculo
  WHERE vinculo.politica_id = v_policy.id
  FOR KEY SHARE;
  IF NOT FOUND
     OR v_link_after.asset_id IS DISTINCT FROM v_link.asset_id
     OR v_link_after.asset_sha256 IS DISTINCT FROM v_link.asset_sha256
     OR v_link_after.asset_snapshot IS DISTINCT FROM v_link.asset_snapshot
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_MODELO_PADRAO_V5_VINCULO_CARIMBO_ALTERADO';
  END IF;
END;
$migration$;

COMMIT;
