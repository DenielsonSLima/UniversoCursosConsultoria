-- Fonte da autorização: o responsável informou nesta conversa, em 23/08/2026,
-- que o Diário já foi autorizado pelo Jurídico. Nenhum número de parecer,
-- protocolo ou signatário jurídico foi informado; nenhum dado foi inventado.

BEGIN;

DO $migration$
DECLARE
  v_policy public.assinatura_eletronica_politicas%ROWTYPE;
  v_global public.assinatura_eletronica_politicas%ROWTYPE;
  v_asset public.assinatura_eletronica_modelo_assets%ROWTYPE;
  v_rows integer;
  v_expected_policy_sha constant text :=
    '1dbe055aeb4d519ac8938aeb709c3e4ceb35f98148bad7c13b754e5c658e2ce0';
  v_expected_global_sha constant text :=
    'f1b17c6731802734cf4dee81693798cb5c9d5b586f1c587e373278bb5a238c18';
  v_old_certificate constant jsonb := jsonb_build_object(
    'metodo', 'BLOQUEADO',
    'statusLabel', 'Aguardando parecer jurídico',
    'cadeiaEvidencias', false
  );
  v_target_certificate constant jsonb := jsonb_build_object(
    'metodo', 'SENHA_REAUTENTICADA',
    'cadeiaEvidencias', true,
    'statusLabel', 'Cadeia de evidências habilitada',
    'description',
      'Assinatura eletrônica com reautenticação por senha e cadeia de evidências obrigatórias.'
  );
BEGIN
  SELECT politica.*
  INTO v_policy
  FROM public.assinatura_eletronica_politicas AS politica
  JOIN public.polos AS polo ON polo.id = politica.polo_id
  WHERE politica.id = '9a8aa1b4-468b-4bfe-92fb-b34787ffd627'::uuid
    AND politica.documento = 'diario_classe'
    AND politica.versao = 4
    AND politica.arquivada_em IS NULL
    AND coalesce(polo.is_matriz, false)
  FOR UPDATE OF politica;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'ASSINATURA_APROVACAO_DIARIO_V4_ALVO_AUSENTE';
  END IF;

  IF encode(digest(v_policy.politica::text, 'sha256'), 'hex')
       IS DISTINCT FROM v_expected_policy_sha
     OR v_policy.request_id IS NOT NULL
     OR NOT public.assinatura_eletronica_politica_diario_signatarios_v6_valida(
       v_policy.politica
     )
     OR public.assinatura_eletronica_normalizar_editor(
       v_policy.politica -> 'editor'
     ) IS DISTINCT FROM v_policy.politica -> 'editor'
     OR v_policy.politica #> '{editor,signatureStamp,assetId}'
        IS DISTINCT FROM 'null'::jsonb
     OR v_policy.politica #> '{editor,signatureStamp,enabled}'
        IS DISTINCT FROM 'false'::jsonb
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_APROVACAO_DIARIO_V4_CONTEUDO_DIVERGENTE';
  END IF;

  IF v_policy.habilitada
     AND v_policy.status_juridico = 'APROVADA'
     AND v_policy.certificado = v_target_certificate
  THEN
    NULL;
  ELSE
    IF v_policy.habilitada
       OR v_policy.status_juridico <> 'PENDENTE_MATRIZ_JURIDICA'
       OR v_policy.certificado <> v_old_certificate
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'ASSINATURA_APROVACAO_DIARIO_V4_ESTADO_DIVERGENTE';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.assinatura_eletronica_envelopes AS envelope
      WHERE envelope.politica_id = v_policy.id
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'ASSINATURA_APROVACAO_DIARIO_V4_JA_REFERENCIADA';
    END IF;

    SELECT politica.*
    INTO v_global
    FROM public.assinatura_eletronica_politicas AS politica
    WHERE politica.id = 'd3948c48-d295-43da-972a-6a2c882e69aa'::uuid
      AND politica.documento = 'MODELO_PADRAO'
      AND politica.polo_id IS NULL
      AND politica.arquivada_em IS NULL
      AND politica.versao = 11
    FOR KEY SHARE;

    IF NOT FOUND
       OR encode(digest(v_global.politica::text, 'sha256'), 'hex')
          IS DISTINCT FROM v_expected_global_sha
       OR v_global.politica #>> '{editor,signatureStamp,assetId}'
          IS DISTINCT FROM '2867ca0a-edf3-4580-877a-ae013efdf7ab'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'ASSINATURA_APROVACAO_MODELO_GLOBAL_DIVERGENTE';
    END IF;

    SELECT asset.*
    INTO v_asset
    FROM public.assinatura_eletronica_modelo_assets AS asset
    WHERE asset.id = '2867ca0a-edf3-4580-877a-ae013efdf7ab'::uuid
      AND asset.status = 'PRONTO'
      AND asset.mime_type = 'image/png'
      AND asset.sha256 =
        'f9b54b10fcb44704922f5e663a3681edfab35cc37aac2827680e081850fa6fbd'
    FOR KEY SHARE;

    IF NOT FOUND
       OR v_global.politica -> 'signatureStampAssetSnapshot'
          IS DISTINCT FROM jsonb_build_object(
            'assetId', v_asset.id,
            'sha256', v_asset.sha256,
            'mimeType', v_asset.mime_type,
            'sizeBytes', v_asset.tamanho_bytes,
            'width', v_asset.largura,
            'height', v_asset.altura
          )
       OR NOT EXISTS (
         SELECT 1
         FROM storage.objects AS objeto
         WHERE objeto.bucket_id = v_asset.bucket_id
           AND objeto.name = v_asset.storage_path
       )
       OR NOT public.assinatura_eletronica_geometria_snapshot_valida(
         jsonb_build_object(
           'schemaVersion', 3,
           'coordinateSpace', 'PAGE_TOP_LEFT_BP_V1',
           'assetId',
             v_global.politica #> '{editor,signatureStamp,assetId}',
           'assetSnapshot',
             v_global.politica -> 'signatureStampAssetSnapshot',
           'template',
             v_global.politica #> '{editor,signatureStamp,template}',
           'autoLayout',
             v_global.politica #> '{editor,signatureStamp,autoLayout}'
         )
       )
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'ASSINATURA_APROVACAO_CARIMBO_GLOBAL_INDISPONIVEL';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.polos AS polo
      WHERE polo.id = v_policy.polo_id
        AND public.assinatura_eletronica_marca_retrato_apresentacao_valida(
          jsonb_build_object(
            'url', polo.watermark_url,
            'opacity', polo.watermark_opacity,
            'scale', polo.watermark_scale,
            'rotate', polo.watermark_rotate
          )
        )
    )
       OR NOT EXISTS (
         SELECT 1
         FROM public.documentos_templates
         WHERE id = 'diario_TECNICO'
       )
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'ASSINATURA_APROVACAO_RECURSO_INSTITUCIONAL_INDISPONIVEL';
    END IF;

    UPDATE public.assinatura_eletronica_politicas AS politica
    SET habilitada = true,
        status_juridico = 'APROVADA',
        certificado = v_target_certificate
    WHERE politica.id = v_policy.id
      AND politica.arquivada_em IS NULL
      AND NOT politica.habilitada
      AND politica.status_juridico = 'PENDENTE_MATRIZ_JURIDICA'
      AND politica.certificado = v_old_certificate
      AND encode(digest(politica.politica::text, 'sha256'), 'hex') =
        v_expected_policy_sha;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = '40001',
        MESSAGE = 'ASSINATURA_APROVACAO_DIARIO_V4_CONCORRENCIA';
    END IF;
  END IF;

  SELECT politica.*
  INTO v_policy
  FROM public.assinatura_eletronica_politicas AS politica
  WHERE politica.id = '9a8aa1b4-468b-4bfe-92fb-b34787ffd627'::uuid;

  IF NOT v_policy.habilitada
     OR v_policy.status_juridico <> 'APROVADA'
     OR v_policy.certificado <> v_target_certificate
     OR encode(digest(v_policy.politica::text, 'sha256'), 'hex') <>
        v_expected_policy_sha
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_APROVACAO_DIARIO_V4_POS_CHECK_FALHOU';
  END IF;
END;
$migration$;

COMMIT;
