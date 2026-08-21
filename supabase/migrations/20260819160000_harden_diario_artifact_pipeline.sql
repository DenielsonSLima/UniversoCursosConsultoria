-- Endurece o pipeline de artefatos do Diário de Classe sem habilitar a política.
--
-- O serviço continua sendo o único chamador das RPCs internas, mas toda ação
-- fica vinculada ao ator e à sessão autenticada que a originaram. O manifesto
-- de assets é congelado junto do PDF original e deriva somente do snapshot
-- acadêmico canônico devolvido pelo PostgreSQL.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. A marca-d'água canônica pode ser HTTPS ou data URI de imagem estrita.
--    Nenhum outro campo do snapshot passa a aceitar conteúdo inline.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_watermark_source_diario_valido(
  p_source text
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $function$
DECLARE
  v_match text[];
  v_mime text;
  v_base64 text;
  v_bytes bytea;
BEGIN
  IF p_source IS NULL THEN
    RETURN true;
  END IF;
  IF p_source ~ '^https://[^/?#@]+(/[^?#]*)?$' THEN
    RETURN true;
  END IF;

  v_match := pg_catalog.regexp_match(
    p_source,
    '^data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$'
  );
  IF v_match IS NULL THEN
    RETURN false;
  END IF;
  v_mime := v_match[1];
  v_base64 := v_match[2];
  IF pg_catalog.char_length(v_base64) > 1398104 THEN
    RETURN false;
  END IF;
  v_bytes := pg_catalog.decode(v_base64, 'base64');

  IF pg_catalog.octet_length(v_bytes) NOT BETWEEN 1 AND 1048576
     OR pg_catalog.replace(pg_catalog.encode(v_bytes, 'base64'), E'\n', '')
       IS DISTINCT FROM v_base64
  THEN
    RETURN false;
  END IF;

  RETURN CASE v_mime
    WHEN 'png' THEN pg_catalog.substring(v_bytes, 1, 8)
      = pg_catalog.decode('89504e470d0a1a0a', 'hex')
    WHEN 'jpeg' THEN pg_catalog.substring(v_bytes, 1, 3)
      = pg_catalog.decode('ffd8ff', 'hex')
    WHEN 'webp' THEN pg_catalog.octet_length(v_bytes) >= 12
      AND pg_catalog.substring(v_bytes, 1, 4) = pg_catalog.decode('52494646', 'hex')
      AND pg_catalog.substring(v_bytes, 9, 4) = pg_catalog.decode('57454250', 'hex')
    ELSE false
  END;
EXCEPTION WHEN others THEN
  RETURN false;
END;
$function$;

-- Preserva integralmente o validador v1 e normaliza somente as duas referências
-- canônicas da marca-d'água antes de reutilizá-lo. O template bruto continua
-- proibido de introduzir data URI.
ALTER FUNCTION public.assinatura_eletronica_snapshot_academico_diario_valido(jsonb)
  RENAME TO assinatura_eletronica_snapshot_academico_diario_valido_v1_https;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_snapshot_academico_diario_valido(
  p_snapshot jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $function$
DECLARE
  v_watermark_source text := p_snapshot -> 'assetSources' ->> 'watermarkUrl';
  v_normalized jsonb := p_snapshot;
  v_placeholder jsonb := pg_catalog.to_jsonb(
    'https://inline-watermark.invalid/canonical-image'::text
  );
BEGIN
  IF p_snapshot -> 'assetSources' ->> 'headerLogoUrl'
       !~ '^https://kfekgwyqozhicpfuunpo[.]supabase[.]co/storage/v1/object/public/[^?#[:space:]]+$'
  THEN
    RETURN false;
  END IF;
  IF NOT public.assinatura_eletronica_watermark_source_diario_valido(v_watermark_source) THEN
    RETURN false;
  END IF;
  IF v_watermark_source ~ '^https://'
     AND v_watermark_source
       !~ '^https://kfekgwyqozhicpfuunpo[.]supabase[.]co/storage/v1/object/public/[^?#[:space:]]+$'
  THEN
    RETURN false;
  END IF;

  IF v_watermark_source LIKE 'data:image/%;base64,%' THEN
    IF p_snapshot -> 'institutionalIdentity' ->> 'watermarkUrl'
         IS DISTINCT FROM v_watermark_source
    THEN
      RETURN false;
    END IF;
    v_normalized := pg_catalog.jsonb_set(
      v_normalized,
      ARRAY['assetSources', 'watermarkUrl'],
      v_placeholder,
      false
    );
    v_normalized := pg_catalog.jsonb_set(
      v_normalized,
      ARRAY['institutionalIdentity', 'watermarkUrl'],
      v_placeholder,
      false
    );
  END IF;

  RETURN public.assinatura_eletronica_snapshot_academico_diario_valido_v1_https(
    v_normalized
  );
EXCEPTION WHEN others THEN
  RETURN false;
END;
$function$;

-- A RPC de criação v1 também possuía uma rejeição HTTPS local antes de montar
-- o snapshot. A alteração abaixo é deliberadamente fail-closed e só substitui
-- essa expressão conhecida; drift na definição anterior aborta a migration.
DO $migration$
DECLARE
  v_definition text;
  v_hardened_definition text;
  v_occurrences integer;
  v_old_fragment constant text :=
    $$v_asset_sources ->> 'watermarkUrl' !~ '^https://[^/?#@]+(/[^?#]*)?$'$$;
  v_new_fragment constant text :=
    $$NOT public.assinatura_eletronica_watermark_source_diario_valido(v_asset_sources ->> 'watermarkUrl')$$;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.assinatura_eletronica_solicitar_envelope_diario(uuid,uuid,text,uuid,uuid)'::regprocedure
  ) INTO v_definition;
  v_occurrences := (
    pg_catalog.length(v_definition)
      - pg_catalog.length(pg_catalog.replace(v_definition, v_old_fragment, ''))
  ) / pg_catalog.length(v_old_fragment);
  IF v_occurrences <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_DIARIO_WATERMARK_PATCH_DRIFT';
  END IF;
  v_hardened_definition := pg_catalog.replace(
    v_definition,
    v_old_fragment,
    v_new_fragment
  );
  IF v_hardened_definition IS NOT DISTINCT FROM v_definition THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_DIARIO_WATERMARK_PATCH_DRIFT';
  END IF;
  EXECUTE v_hardened_definition;
END;
$migration$;

-- ---------------------------------------------------------------------------
-- 2. Manifesto estrito e inseparável do snapshot integral do documento.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_pdf_asset_manifest_diario_valido(
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
  v_document_sha256 text;
  v_validation_code text;
  v_validation_url text;
  v_assets jsonb;
  v_logo jsonb;
  v_watermark jsonb;
  v_qr jsonb;
  v_watermark_source text;
  v_inline_match text[];
  v_inline_bytes bytea;
BEGIN
  v_document_sha256 := public.assinatura_eletronica_sha256_json(p_document_snapshot);
  v_validation_code := p_document_snapshot ->> 'validationCode';

  IF jsonb_typeof(p_manifest) <> 'object'
     OR pg_catalog.octet_length(p_manifest::text) > 65536
     OR NOT (p_manifest ?& ARRAY[
       'schemaVersion', 'source', 'documentSnapshotSha256', 'validationUrl', 'assets'
     ]::text[])
     OR p_manifest - ARRAY[
       'schemaVersion', 'source', 'documentSnapshotSha256', 'validationUrl', 'assets'
     ]::text[] <> '{}'::jsonb
     OR jsonb_typeof(p_manifest -> 'schemaVersion') <> 'number'
     OR p_manifest ->> 'schemaVersion' <> '1'
     OR jsonb_typeof(p_manifest -> 'source') <> 'string'
     OR p_manifest ->> 'source' <> 'UNIVERSO_DIARIO_PDF_ASSETS_V1'
     OR jsonb_typeof(p_manifest -> 'documentSnapshotSha256') <> 'string'
     OR p_manifest ->> 'documentSnapshotSha256' IS DISTINCT FROM v_document_sha256
     OR lower(btrim(p_document_snapshot_sha256)) IS DISTINCT FROM v_document_sha256
     OR jsonb_typeof(p_manifest -> 'validationUrl') <> 'string'
     OR jsonb_typeof(p_manifest -> 'assets') <> 'object'
     OR p_document_snapshot -> 'template' -> 'imprimirValidacaoContracapa'
       IS DISTINCT FROM 'true'::jsonb
     OR NOT public.assinatura_eletronica_snapshot_academico_diario_valido(
       p_document_snapshot
     )
  THEN
    RETURN false;
  END IF;

  v_validation_url := p_manifest ->> 'validationUrl';
  IF v_validation_code IS NULL
     OR v_validation_url NOT IN (
       'https://universocc.com.br/validador?code=' || v_validation_code,
       'https://www.universocc.com.br/validador?code=' || v_validation_code
     )
  THEN
    RETURN false;
  END IF;

  v_assets := p_manifest -> 'assets';
  IF NOT (v_assets ?& ARRAY['headerLogo', 'watermark', 'validationQr']::text[])
     OR v_assets - ARRAY['headerLogo', 'watermark', 'validationQr']::text[] <> '{}'::jsonb
  THEN
    RETURN false;
  END IF;
  v_logo := v_assets -> 'headerLogo';
  v_watermark := v_assets -> 'watermark';
  v_qr := v_assets -> 'validationQr';

  IF jsonb_typeof(v_logo) <> 'object'
     OR NOT (v_logo ?& ARRAY[
       'sourceKind', 'sourceUrl', 'mimeType', 'byteSize', 'width', 'height', 'sha256'
     ]::text[])
     OR v_logo - ARRAY[
       'sourceKind', 'sourceUrl', 'mimeType', 'byteSize', 'width', 'height', 'sha256'
     ]::text[] <> '{}'::jsonb
     OR v_logo ->> 'sourceKind' <> 'HTTPS_URL'
     OR jsonb_typeof(v_logo -> 'sourceUrl') <> 'string'
     OR v_logo ->> 'sourceUrl' IS DISTINCT FROM
       p_document_snapshot -> 'assetSources' ->> 'headerLogoUrl'
     OR v_logo ->> 'sourceUrl'
       !~ '^https://kfekgwyqozhicpfuunpo[.]supabase[.]co/storage/v1/object/public/[^?#[:space:]]+$'
     OR v_logo ->> 'mimeType' NOT IN ('image/png', 'image/jpeg', 'image/webp')
     OR jsonb_typeof(v_logo -> 'byteSize') <> 'number'
     OR v_logo ->> 'byteSize' !~ '^[0-9]+$'
     OR (v_logo ->> 'byteSize')::bigint NOT BETWEEN 1 AND 12582912
     OR jsonb_typeof(v_logo -> 'width') <> 'number'
     OR v_logo ->> 'width' !~ '^[0-9]+$'
     OR (v_logo ->> 'width')::integer NOT BETWEEN 1 AND 4096
     OR jsonb_typeof(v_logo -> 'height') <> 'number'
     OR v_logo ->> 'height' !~ '^[0-9]+$'
     OR (v_logo ->> 'height')::integer NOT BETWEEN 1 AND 4096
     OR (v_logo ->> 'width')::bigint * (v_logo ->> 'height')::bigint > 12000000
     OR jsonb_typeof(v_logo -> 'sha256') <> 'string'
     OR v_logo ->> 'sha256' !~ '^[0-9a-f]{64}$'
  THEN
    RETURN false;
  END IF;

  v_watermark_source := p_document_snapshot -> 'assetSources' ->> 'watermarkUrl';
  IF v_watermark = 'null'::jsonb THEN
    IF v_watermark_source IS NOT NULL THEN
      RETURN false;
    END IF;
  ELSIF jsonb_typeof(v_watermark) <> 'object' THEN
    RETURN false;
  ELSIF v_watermark ->> 'sourceKind' = 'HTTPS_URL' THEN
    IF NOT (v_watermark ?& ARRAY[
         'sourceKind', 'sourceUrl', 'mimeType', 'byteSize', 'width', 'height', 'sha256'
       ]::text[])
       OR v_watermark - ARRAY[
         'sourceKind', 'sourceUrl', 'mimeType', 'byteSize', 'width', 'height', 'sha256'
       ]::text[] <> '{}'::jsonb
       OR jsonb_typeof(v_watermark -> 'sourceUrl') <> 'string'
       OR v_watermark ->> 'sourceUrl' IS DISTINCT FROM v_watermark_source
       OR NOT public.assinatura_eletronica_watermark_source_diario_valido(
         v_watermark ->> 'sourceUrl'
       )
       OR v_watermark ->> 'sourceUrl'
         !~ '^https://kfekgwyqozhicpfuunpo[.]supabase[.]co/storage/v1/object/public/[^?#[:space:]]+$'
    THEN
      RETURN false;
    END IF;
  ELSIF v_watermark ->> 'sourceKind' = 'INLINE_DATA_URI' THEN
    IF NOT (v_watermark ?& ARRAY[
         'sourceKind', 'sourceRef', 'mimeType', 'byteSize', 'width', 'height', 'sha256'
       ]::text[])
       OR v_watermark - ARRAY[
         'sourceKind', 'sourceRef', 'mimeType', 'byteSize', 'width', 'height', 'sha256'
       ]::text[] <> '{}'::jsonb
       OR v_watermark ->> 'sourceRef'
         <> 'documentSnapshot.assetSources.watermarkUrl'
       OR NOT public.assinatura_eletronica_watermark_source_diario_valido(
         v_watermark_source
       )
       OR v_watermark_source NOT LIKE 'data:image/%;base64,%'
    THEN
      RETURN false;
    END IF;
    v_inline_match := pg_catalog.regexp_match(
      v_watermark_source,
      '^data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$'
    );
    IF v_inline_match IS NULL THEN
      RETURN false;
    END IF;
    v_inline_bytes := pg_catalog.decode(v_inline_match[2], 'base64');
    IF v_watermark ->> 'mimeType' IS DISTINCT FROM (
         CASE v_inline_match[1]
           WHEN 'png' THEN 'image/png'
           WHEN 'jpeg' THEN 'image/jpeg'
           WHEN 'webp' THEN 'image/webp'
         END
       )
       OR (v_watermark ->> 'byteSize')::bigint
         IS DISTINCT FROM pg_catalog.octet_length(v_inline_bytes)::bigint
       OR v_watermark ->> 'sha256' IS DISTINCT FROM pg_catalog.encode(
         extensions.digest(v_inline_bytes, 'sha256'),
         'hex'
       )
    THEN
      RETURN false;
    END IF;
  ELSE
    RETURN false;
  END IF;

  IF v_watermark <> 'null'::jsonb AND (
    v_watermark ->> 'mimeType' NOT IN ('image/png', 'image/jpeg', 'image/webp')
    OR jsonb_typeof(v_watermark -> 'byteSize') <> 'number'
    OR v_watermark ->> 'byteSize' !~ '^[0-9]+$'
    OR (v_watermark ->> 'byteSize')::bigint NOT BETWEEN 1 AND 1048576
    OR jsonb_typeof(v_watermark -> 'width') <> 'number'
    OR v_watermark ->> 'width' !~ '^[0-9]+$'
    OR (v_watermark ->> 'width')::integer NOT BETWEEN 1 AND 4096
    OR jsonb_typeof(v_watermark -> 'height') <> 'number'
    OR v_watermark ->> 'height' !~ '^[0-9]+$'
    OR (v_watermark ->> 'height')::integer NOT BETWEEN 1 AND 4096
    OR (v_watermark ->> 'width')::bigint * (v_watermark ->> 'height')::bigint > 12000000
    OR jsonb_typeof(v_watermark -> 'sha256') <> 'string'
    OR v_watermark ->> 'sha256' !~ '^[0-9a-f]{64}$'
  ) THEN
    RETURN false;
  END IF;

  IF jsonb_typeof(v_qr) <> 'object'
     OR NOT (v_qr ?& ARRAY[
       'sourceKind', 'payload', 'mimeType', 'byteSize', 'width', 'height', 'sha256'
     ]::text[])
     OR v_qr - ARRAY[
       'sourceKind', 'payload', 'mimeType', 'byteSize', 'width', 'height', 'sha256'
     ]::text[] <> '{}'::jsonb
     OR v_qr ->> 'sourceKind' <> 'GENERATED_QR'
     OR v_qr ->> 'payload' IS DISTINCT FROM v_validation_url
     OR v_qr ->> 'mimeType' <> 'image/png'
     OR jsonb_typeof(v_qr -> 'byteSize') <> 'number'
     OR v_qr ->> 'byteSize' !~ '^[0-9]+$'
     OR (v_qr ->> 'byteSize')::bigint NOT BETWEEN 1 AND 1048576
     OR v_qr -> 'width' IS DISTINCT FROM '240'::jsonb
     OR v_qr -> 'height' IS DISTINCT FROM '240'::jsonb
     OR jsonb_typeof(v_qr -> 'sha256') <> 'string'
     OR v_qr ->> 'sha256' !~ '^[0-9a-f]{64}$'
  THEN
    RETURN false;
  END IF;

  RETURN true;
EXCEPTION WHEN others THEN
  RETURN false;
END;
$function$;

DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.assinatura_eletronica_envelopes AS envelope
    WHERE envelope.documento_original_sha256 IS NOT NULL
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_DIARIO_MANIFEST_BACKFILL_OBRIGATORIO';
  END IF;
END;
$migration$;

ALTER TABLE public.assinatura_eletronica_envelopes
  ADD COLUMN pdf_asset_manifest_snapshot jsonb;

ALTER TABLE public.assinatura_eletronica_envelopes
  DROP CONSTRAINT assinatura_eletronica_envelopes_snapshot_diario_check,
  DROP CONSTRAINT assinatura_eletronica_envelopes_original_shape,
  ADD CONSTRAINT assinatura_eletronica_envelopes_snapshot_diario_check
    CHECK (
      public.assinatura_eletronica_snapshot_academico_diario_valido(documento_snapshot)
      AND academico_snapshot_sha256 = public.assinatura_eletronica_sha256_json(documento_snapshot)
      AND documento_snapshot -> 'source' ->> 'turmaId' = turma_id::text
      AND documento_snapshot -> 'source' ->> 'disciplinaId' = disciplina_id::text
      AND documento_snapshot -> 'template' -> 'imprimirValidacaoContracapa' = 'true'::jsonb
      AND jsonb_typeof(geometria_snapshot) = 'object'
      AND geometria_snapshot ->> 'schemaVersion' = '1'
      AND geometria_snapshot ->> 'coordinateSpace' = 'PAGE_TOP_LEFT_BP_V1'
      AND jsonb_typeof(geometria_snapshot -> 'slots') = 'array'
      AND jsonb_array_length(geometria_snapshot -> 'slots') = 2
    ) NOT VALID,
  ADD CONSTRAINT assinatura_eletronica_envelopes_original_shape
    CHECK (
      (
        documento_original_sha256 IS NULL
        AND original_congelado_em IS NULL
        AND publicado_em IS NULL
        AND pdf_asset_manifest_snapshot IS NULL
        AND pdf_semantic_manifest_snapshot IS NULL
        AND pdf_signature_target_snapshot IS NULL
      )
      OR
      (
        documento_original_sha256 IS NOT NULL
        AND original_congelado_em IS NOT NULL
        AND publicado_em IS NOT NULL
        AND pdf_asset_manifest_snapshot IS NOT NULL
        AND pdf_semantic_manifest_snapshot IS NOT NULL
        AND pdf_signature_target_snapshot IS NOT NULL
      )
    ),
  ADD CONSTRAINT assinatura_eletronica_envelopes_pdf_asset_manifest_check
    CHECK (
      pdf_asset_manifest_snapshot IS NULL
      OR public.assinatura_eletronica_pdf_asset_manifest_diario_valido(
        pdf_asset_manifest_snapshot,
        documento_snapshot,
        academico_snapshot_sha256
      )
    );

ALTER TABLE public.assinatura_eletronica_envelopes
  VALIDATE CONSTRAINT assinatura_eletronica_envelopes_snapshot_diario_check;

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

CREATE TRIGGER assinatura_eletronica_envelopes_15_proteger_pdf_asset_manifest
  BEFORE UPDATE ON public.assinatura_eletronica_envelopes
  FOR EACH ROW
  EXECUTE FUNCTION public.assinatura_eletronica_proteger_pdf_asset_manifest();

-- ---------------------------------------------------------------------------
-- 3. Gates privados: service role nunca substitui identidade de usuário.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_autorizar_original_diario_seguro(
  p_envelope_id uuid,
  p_actor_auth_user_id uuid,
  p_auth_session_id uuid
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_envelope public.assinatura_eletronica_envelopes%ROWTYPE;
BEGIN
  PERFORM public.assinatura_eletronica_exigir_service_role();
  PERFORM public.assinatura_eletronica_exigir_sessao_ativa(
    p_actor_auth_user_id,
    p_auth_session_id
  );

  SELECT envelope.* INTO v_envelope
  FROM public.assinatura_eletronica_envelopes AS envelope
  WHERE envelope.id = p_envelope_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'ASSINATURA_ENVELOPE_NAO_ENCONTRADO';
  END IF;
  IF v_envelope.documento <> 'diario_classe'
     OR v_envelope.origem_tipo <> 'DIARIO'
     OR v_envelope.criado_por IS DISTINCT FROM p_actor_auth_user_id
     OR v_envelope.criado_contexto_tipo <> 'GESTOR'
     OR NOT public.assinatura_eletronica_gestor_pode_gerir_diario(
       p_actor_auth_user_id,
       v_envelope.criado_contexto_id,
       v_envelope.turma_id,
       v_envelope.polo_id
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'ASSINATURA_ORIGINAL_ATOR_NAO_AUTORIZADO';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_autorizar_finalizacao_diario_segura(
  p_envelope_id uuid,
  p_actor_auth_user_id uuid,
  p_auth_session_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_envelope public.assinatura_eletronica_envelopes%ROWTYPE;
  v_participante public.assinatura_eletronica_participantes%ROWTYPE;
BEGIN
  PERFORM public.assinatura_eletronica_exigir_service_role();
  PERFORM public.assinatura_eletronica_exigir_sessao_ativa(
    p_actor_auth_user_id,
    p_auth_session_id
  );

  SELECT envelope.* INTO v_envelope
  FROM public.assinatura_eletronica_envelopes AS envelope
  WHERE envelope.id = p_envelope_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'ASSINATURA_ENVELOPE_NAO_ENCONTRADO';
  END IF;
  IF v_envelope.documento <> 'diario_classe' OR v_envelope.origem_tipo <> 'DIARIO' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'ASSINATURA_FINALIZACAO_ATOR_NAO_AUTORIZADO';
  END IF;

  SELECT participante.* INTO v_participante
  FROM public.assinatura_eletronica_participantes AS participante
  JOIN public.assinatura_eletronica_eventos AS evento
    ON evento.envelope_id = participante.envelope_id
   AND evento.participante_id = participante.id
   AND evento.tipo = 'ASSINATURA_CONCLUIDA'
  JOIN public.assinatura_eletronica_desafios AS desafio
    ON desafio.id::text = evento.dados ->> 'challengeId'
   AND desafio.envelope_id = participante.envelope_id
   AND desafio.participante_id = participante.id
  WHERE participante.envelope_id = v_envelope.id
    AND participante.papel = 'COORDENADOR'
    AND participante.ordem = 2
    AND participante.status = 'ASSINADO'
    AND participante.assinado_por_auth_user_id = p_actor_auth_user_id
    AND evento.ator_auth_user_id = p_actor_auth_user_id
    AND (evento.dados ->> 'signedAt')::timestamptz = participante.assinado_em
    AND desafio.metodo = 'SENHA_REAUTENTICADA'
    AND desafio.estado = 'CONSUMIDO'
    AND desafio.consumido_em = participante.assinado_em
    AND desafio.actor_auth_user_id = p_actor_auth_user_id
    AND desafio.auth_session_id = p_auth_session_id
    AND desafio.perfil = 'COORDENADOR'
    AND desafio.contexto_id = participante.contexto_id;
  IF NOT FOUND
     OR NOT public.assinatura_eletronica_perfil_contexto_valido(
       p_actor_auth_user_id,
       'COORDENADOR',
       v_participante.contexto_id
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.professores_coordenacoes AS coordenacao
       JOIN public.turmas AS turma ON turma.id = v_envelope.turma_id
       WHERE coordenacao.id = v_participante.coordenacao_id
         AND coordenacao.professor_id = v_participante.parceiro_id
         AND coordenacao.curso_id = turma.curso_id
         AND coordenacao.polo_id = v_envelope.polo_id
         AND coordenacao.status = 'ATIVA'
         AND coordenacao.vigente_de <= statement_timestamp()
         AND (coordenacao.vigente_ate IS NULL OR coordenacao.vigente_ate > statement_timestamp())
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'ASSINATURA_FINALIZACAO_ATOR_NAO_AUTORIZADO';
  END IF;
  RETURN v_participante.id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. PREPARE_ORIGINAL e publicação, ambos vinculados a ator/sessão.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_internal_preparar_original_diario_seguro(
  p_envelope_id uuid,
  p_actor_auth_user_id uuid,
  p_auth_session_id uuid,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_envelope public.assinatura_eletronica_envelopes%ROWTYPE;
  v_actor_scope text;
  v_document_snapshot_sha256 text;
  v_payload_sha256 text;
  v_replay public.assinatura_eletronica_operacoes%ROWTYPE;
  v_participantes jsonb;
  v_resultado jsonb;
  v_ledger_resultado jsonb;
BEGIN
  PERFORM public.assinatura_eletronica_exigir_service_role();
  IF p_envelope_id IS NULL OR p_actor_auth_user_id IS NULL
     OR p_auth_session_id IS NULL OR p_request_id IS NULL
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSINATURA_PREPARAR_ORIGINAL_PAYLOAD_INVALIDO';
  END IF;

  -- Autorização corrente sempre acontece antes da consulta de replay.
  PERFORM public.assinatura_eletronica_autorizar_original_diario_seguro(
    p_envelope_id,
    p_actor_auth_user_id,
    p_auth_session_id
  );
  v_actor_scope := 'service:user:' || p_actor_auth_user_id::text
    || ':session:' || p_auth_session_id::text;

  SELECT envelope.* INTO v_envelope
  FROM public.assinatura_eletronica_envelopes AS envelope
  WHERE envelope.id = p_envelope_id
  FOR UPDATE;
  PERFORM public.assinatura_eletronica_autorizar_original_diario_seguro(
    p_envelope_id,
    p_actor_auth_user_id,
    p_auth_session_id
  );
  v_document_snapshot_sha256 := public.assinatura_eletronica_sha256_json(
    v_envelope.documento_snapshot
  );

  IF NOT public.assinatura_eletronica_snapshot_academico_diario_valido(
       v_envelope.documento_snapshot
     )
     OR v_envelope.documento_snapshot -> 'template' -> 'imprimirValidacaoContracapa'
       IS DISTINCT FROM 'true'::jsonb
     OR v_envelope.academico_snapshot_sha256 IS DISTINCT FROM v_document_snapshot_sha256
     OR NOT EXISTS (
       SELECT 1
       FROM public.assinatura_eletronica_politicas AS politica
       WHERE politica.id = v_envelope.politica_id
         AND politica.arquivada_em IS NULL
         AND politica.habilitada
         AND politica.status_juridico = 'APROVADA'
         AND politica.versao = v_envelope.politica_versao
         AND politica.politica = v_envelope.politica_snapshot
         AND politica.certificado = v_envelope.certificado_snapshot
     )
     OR (SELECT count(*) FROM public.assinatura_eletronica_participantes AS participante
         WHERE participante.envelope_id = v_envelope.id) <> 2
     OR NOT EXISTS (
       SELECT 1 FROM public.assinatura_eletronica_participantes AS participante
       WHERE participante.envelope_id = v_envelope.id
         AND participante.papel = 'PROFESSOR' AND participante.ordem = 1
         AND participante.obrigatorio
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.assinatura_eletronica_participantes AS participante
       WHERE participante.envelope_id = v_envelope.id
         AND participante.papel = 'COORDENADOR' AND participante.ordem = 2
         AND participante.obrigatorio
     )
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_PREPARAR_ORIGINAL_CONTRATO_INVALIDO';
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'participantId', participante.id,
    'role', participante.papel,
    'order', participante.ordem,
    'identitySnapshot', participante.identidade_snapshot,
    'linkSnapshot', participante.vinculo_snapshot
  ) ORDER BY participante.ordem)
  INTO v_participantes
  FROM public.assinatura_eletronica_participantes AS participante
  WHERE participante.envelope_id = v_envelope.id;

  -- O payload rico é sempre reconstruído do snapshot sob lock. O ledger não
  -- recebe canonicalJson (nem a data URI que ele possa conter).
  v_resultado := jsonb_build_object(
    'envelopeId', v_envelope.id,
    'documentType', v_envelope.documento,
    'originVersion', v_envelope.origem_versao,
    'status', 'RASCUNHO',
    'composerSchemaVersion', (v_envelope.documento_snapshot ->> 'composerSchemaVersion')::integer,
    'documentSnapshotSha256', v_document_snapshot_sha256,
    'documentSnapshotIntegrity', jsonb_build_object(
      'schemaVersion', 1,
      'canonicalization', 'POSTGRES_JSONB_TEXT_UTF8_V1',
      'hashAlgorithm', 'SHA-256',
      'encoding', 'UTF-8',
      'canonicalJson', v_envelope.documento_snapshot::text,
      'documentSnapshotSha256', v_document_snapshot_sha256,
      'academicRevisionSha256', v_envelope.documento_snapshot -> 'source' ->> 'academicRevisionSha256',
      'templateSourceSha256', v_envelope.documento_snapshot -> 'templateSource' ->> 'sha256'
    ),
    'geometrySnapshot', v_envelope.geometria_snapshot,
    'policyVersion', v_envelope.politica_versao,
    'policySnapshot', v_envelope.politica_snapshot,
    'certificateSnapshot', v_envelope.certificado_snapshot,
    'participants', v_participantes,
    'originalDestination', jsonb_build_object(
      'bucketId', 'documentos-assinatura-eletronica',
      'storagePath', 'envelopes/' || v_envelope.id::text || '/documento-original.pdf'
    ),
    'verification', jsonb_build_object(
      'code', v_envelope.documento_snapshot ->> 'validationCode',
      'basePath', '/validador',
      'path', '/validador?code=' || (v_envelope.documento_snapshot ->> 'validationCode')
    )
  );
  v_ledger_resultado := jsonb_build_object(
    'envelopeId', v_envelope.id,
    'status', 'RASCUNHO',
    'documentSnapshotSha256', v_document_snapshot_sha256
  );

  v_payload_sha256 := public.assinatura_eletronica_sha256_json(jsonb_build_object(
    'envelopeId', v_envelope.id,
    'actorAuthUserId', p_actor_auth_user_id,
    'authSessionId', p_auth_session_id,
    'documentSnapshotSha256', v_document_snapshot_sha256,
    'geometrySnapshot', v_envelope.geometria_snapshot,
    'policyVersion', v_envelope.politica_versao
  ));
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'assinatura:original:preparar:' || v_actor_scope || ':' || p_request_id::text,
      0
    )
  );
  SELECT operacao.* INTO v_replay
  FROM public.assinatura_eletronica_operacoes AS operacao
  WHERE operacao.actor_scope = v_actor_scope
    AND operacao.operacao = 'PREPARAR_ORIGINAL_DIARIO'
    AND operacao.request_id = p_request_id;
  IF FOUND THEN
    IF v_replay.actor_auth_user_id IS DISTINCT FROM p_actor_auth_user_id
       OR v_replay.payload_sha256 IS DISTINCT FROM v_payload_sha256
       OR v_replay.resultado ->> 'envelopeId' IS DISTINCT FROM v_envelope.id::text
       OR v_replay.resultado ->> 'status' IS DISTINCT FROM 'RASCUNHO'
       OR v_replay.resultado ->> 'documentSnapshotSha256'
         IS DISTINCT FROM v_document_snapshot_sha256
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSINATURA_IDEMPOTENCIA_DIVERGENTE';
    END IF;
    RETURN v_resultado;
  END IF;

  -- Somente uma nova preparação exige RASCUNHO. O replay acima continua
  -- convergente depois que a publicação mudou o estado para PENDENTE.
  IF v_envelope.status <> 'RASCUNHO'
     OR v_envelope.documento_original_sha256 IS NOT NULL
     OR v_envelope.pdf_asset_manifest_snapshot IS NOT NULL
     OR v_envelope.pdf_semantic_manifest_snapshot IS NOT NULL
     OR v_envelope.pdf_signature_target_snapshot IS NOT NULL
     OR EXISTS (
       SELECT 1
       FROM public.assinatura_eletronica_participantes AS participante
       WHERE participante.envelope_id = v_envelope.id
         AND participante.status <> 'AGUARDANDO_ORDEM'
     )
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_PREPARAR_ORIGINAL_ESTADO_INVALIDO';
  END IF;

  INSERT INTO public.assinatura_eletronica_operacoes (
    actor_scope, actor_auth_user_id, operacao, request_id, payload_sha256, resultado
  ) VALUES (
    v_actor_scope, p_actor_auth_user_id, 'PREPARAR_ORIGINAL_DIARIO', p_request_id,
    v_payload_sha256, v_ledger_resultado
  );
  RETURN v_resultado;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_internal_registrar_original_publicar_seguro(
  p_envelope_id uuid,
  p_actor_auth_user_id uuid,
  p_auth_session_id uuid,
  p_bucket_id text,
  p_storage_path text,
  p_tamanho_bytes bigint,
  p_sha256 text,
  p_document_snapshot_sha256 text,
  p_pdf_asset_manifest jsonb,
  p_semantic_manifest jsonb,
  p_frozen_signature_target jsonb,
  p_geometry_snapshot jsonb,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_envelope public.assinatura_eletronica_envelopes%ROWTYPE;
  v_actor_scope text;
  v_payload_sha256 text;
  v_replay public.assinatura_eletronica_operacoes%ROWTYPE;
  v_original_artifact public.assinatura_eletronica_artefatos%ROWTYPE;
  v_professor_id uuid;
  v_resultado jsonb;
  v_ledger_resultado jsonb;
  v_sha256 text := lower(btrim(coalesce(p_sha256, '')));
  v_document_snapshot_sha256 text := lower(btrim(coalesce(p_document_snapshot_sha256, '')));
  v_pdf_asset_manifest_sha256 text;
  v_semantic_manifest_sha256 text;
  v_frozen_target_sha256 text;
  v_published_at timestamptz := statement_timestamp();
BEGIN
  PERFORM public.assinatura_eletronica_exigir_service_role();
  IF p_envelope_id IS NULL OR p_actor_auth_user_id IS NULL
     OR p_auth_session_id IS NULL OR p_request_id IS NULL
     OR p_bucket_id <> 'documentos-assinatura-eletronica'
     OR p_storage_path IS DISTINCT FROM 'envelopes/' || p_envelope_id::text || '/documento-original.pdf'
     OR p_tamanho_bytes IS NULL OR p_tamanho_bytes NOT BETWEEN 1 AND 52428800
     OR v_sha256 !~ '^[0-9a-f]{64}$'
     OR v_document_snapshot_sha256 !~ '^[0-9a-f]{64}$'
     OR NOT public.assinatura_eletronica_manifesto_diario_valido(p_semantic_manifest)
     OR NOT public.assinatura_eletronica_target_diario_valido(
       p_frozen_signature_target, p_semantic_manifest, v_sha256
     )
     OR jsonb_typeof(p_geometry_snapshot) <> 'object'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSINATURA_ORIGINAL_PAYLOAD_INVALIDO';
  END IF;

  -- Autorização corrente sempre acontece antes da consulta de replay.
  PERFORM public.assinatura_eletronica_autorizar_original_diario_seguro(
    p_envelope_id,
    p_actor_auth_user_id,
    p_auth_session_id
  );
  v_actor_scope := 'service:user:' || p_actor_auth_user_id::text
    || ':session:' || p_auth_session_id::text;

  SELECT envelope.* INTO v_envelope
  FROM public.assinatura_eletronica_envelopes AS envelope
  WHERE envelope.id = p_envelope_id
  FOR UPDATE;
  PERFORM public.assinatura_eletronica_autorizar_original_diario_seguro(
    p_envelope_id,
    p_actor_auth_user_id,
    p_auth_session_id
  );
  IF p_geometry_snapshot IS DISTINCT FROM v_envelope.geometria_snapshot THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASSINATURA_GEOMETRIA_SNAPSHOT_DIVERGENTE';
  END IF;
  IF v_document_snapshot_sha256 IS DISTINCT FROM v_envelope.academico_snapshot_sha256
     OR v_envelope.academico_snapshot_sha256 IS DISTINCT FROM
       public.assinatura_eletronica_sha256_json(v_envelope.documento_snapshot)
     OR v_envelope.documento_snapshot -> 'template' -> 'imprimirValidacaoContracapa'
       IS DISTINCT FROM 'true'::jsonb
     OR NOT public.assinatura_eletronica_pdf_asset_manifest_diario_valido(
       p_pdf_asset_manifest,
       v_envelope.documento_snapshot,
       v_document_snapshot_sha256
     )
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASSINATURA_DOCUMENTO_SNAPSHOT_OU_ASSETS_DIVERGENTES';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.assinatura_eletronica_politicas AS politica
    WHERE politica.id = v_envelope.politica_id
      AND politica.arquivada_em IS NULL
      AND politica.habilitada
      AND politica.status_juridico = 'APROVADA'
      AND politica.versao = v_envelope.politica_versao
      AND politica.politica = v_envelope.politica_snapshot
      AND politica.certificado = v_envelope.certificado_snapshot
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_POLITICA_NAO_HABILITADA';
  END IF;

  SELECT participante.id INTO v_professor_id
  FROM public.assinatura_eletronica_participantes AS participante
  WHERE participante.envelope_id = v_envelope.id
    AND participante.papel = 'PROFESSOR'
    AND participante.ordem = 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_PROFESSOR_INDISPONIVEL';
  END IF;
  IF v_envelope.publicado_em IS NOT NULL THEN
    v_published_at := v_envelope.publicado_em;
  END IF;
  v_pdf_asset_manifest_sha256 := public.assinatura_eletronica_sha256_json(
    p_pdf_asset_manifest
  );
  v_semantic_manifest_sha256 := public.assinatura_eletronica_sha256_json(
    p_semantic_manifest
  );
  v_frozen_target_sha256 := public.assinatura_eletronica_sha256_json(
    p_frozen_signature_target
  );

  v_payload_sha256 := public.assinatura_eletronica_sha256_json(jsonb_build_object(
    'envelopeId', p_envelope_id,
    'actorAuthUserId', p_actor_auth_user_id,
    'authSessionId', p_auth_session_id,
    'bucketId', p_bucket_id,
    'storagePath', p_storage_path,
    'byteSize', p_tamanho_bytes,
    'sha256', v_sha256,
    'documentSnapshotSha256', v_document_snapshot_sha256,
    'pdfAssetManifest', p_pdf_asset_manifest,
    'semanticManifest', p_semantic_manifest,
    'frozenSignatureTarget', p_frozen_signature_target,
    'geometrySnapshot', p_geometry_snapshot
  ));
  v_resultado := jsonb_build_object(
    'envelopeId', v_envelope.id,
    'status', 'PENDENTE',
    'statusLabel', public.assinatura_eletronica_envelope_status_label('PENDENTE'),
    'original', jsonb_build_object(
      'bucketId', p_bucket_id,
      'storagePath', p_storage_path,
      'byteSize', p_tamanho_bytes,
      'sha256', v_sha256,
      'immutableAt', v_published_at
    ),
    'documentSnapshotSha256', v_document_snapshot_sha256,
    'pdfAssetManifestSnapshot', p_pdf_asset_manifest,
    'semanticManifestSnapshot', p_semantic_manifest,
    'frozenSignatureTargetSnapshot', p_frozen_signature_target,
    'firstParticipantId', v_professor_id,
    'firstParticipantRole', 'PROFESSOR'
  );
  v_ledger_resultado := jsonb_build_object(
    'envelopeId', v_envelope.id,
    'status', 'PENDENTE',
    'documentSnapshotSha256', v_document_snapshot_sha256,
    'originalSha256', v_sha256,
    'pdfAssetManifestSha256', v_pdf_asset_manifest_sha256,
    'semanticManifestSha256', v_semantic_manifest_sha256,
    'frozenSignatureTargetSha256', v_frozen_target_sha256,
    'publishedAt', v_published_at
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'assinatura:original:registrar:' || v_actor_scope || ':' || p_request_id::text,
      0
    )
  );
  SELECT operacao.* INTO v_replay
  FROM public.assinatura_eletronica_operacoes AS operacao
  WHERE operacao.actor_scope = v_actor_scope
    AND operacao.operacao = 'REGISTRAR_ORIGINAL_PUBLICAR'
    AND operacao.request_id = p_request_id;
  IF FOUND THEN
    IF v_replay.actor_auth_user_id IS DISTINCT FROM p_actor_auth_user_id
       OR v_replay.payload_sha256 IS DISTINCT FROM v_payload_sha256
       OR v_replay.resultado ->> 'envelopeId' IS DISTINCT FROM v_envelope.id::text
       OR v_replay.resultado ->> 'status' IS DISTINCT FROM 'PENDENTE'
       OR v_replay.resultado ->> 'documentSnapshotSha256'
         IS DISTINCT FROM v_document_snapshot_sha256
       OR v_replay.resultado ->> 'originalSha256' IS DISTINCT FROM v_sha256
       OR v_replay.resultado ->> 'pdfAssetManifestSha256'
         IS DISTINCT FROM v_pdf_asset_manifest_sha256
       OR v_replay.resultado ->> 'semanticManifestSha256'
         IS DISTINCT FROM v_semantic_manifest_sha256
       OR v_replay.resultado ->> 'frozenSignatureTargetSha256'
         IS DISTINCT FROM v_frozen_target_sha256
       OR v_envelope.documento_original_sha256 IS DISTINCT FROM v_sha256
       OR v_envelope.pdf_asset_manifest_snapshot IS DISTINCT FROM p_pdf_asset_manifest
       OR v_envelope.pdf_semantic_manifest_snapshot IS DISTINCT FROM p_semantic_manifest
       OR v_envelope.pdf_signature_target_snapshot IS DISTINCT FROM p_frozen_signature_target
       OR v_envelope.publicado_em IS NULL
       OR (v_replay.resultado ->> 'publishedAt')::timestamptz
         IS DISTINCT FROM v_envelope.publicado_em
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSINATURA_IDEMPOTENCIA_DIVERGENTE';
    END IF;
    SELECT artefato.* INTO v_original_artifact
    FROM public.assinatura_eletronica_artefatos AS artefato
    WHERE artefato.envelope_id = v_envelope.id
      AND artefato.classe = 'DOCUMENTO_ORIGINAL'
    FOR SHARE;
    IF NOT FOUND
       OR v_original_artifact.bucket_id IS DISTINCT FROM p_bucket_id
       OR v_original_artifact.storage_path IS DISTINCT FROM p_storage_path
       OR v_original_artifact.tamanho_bytes IS DISTINCT FROM p_tamanho_bytes
       OR v_original_artifact.sha256 IS DISTINCT FROM v_sha256
       OR NOT EXISTS (
         SELECT 1 FROM storage.objects AS objeto
         WHERE objeto.bucket_id = v_original_artifact.bucket_id
           AND objeto.name = v_original_artifact.storage_path
       )
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'ASSINATURA_REPLAY_ORIGINAL_DIVERGENTE';
    END IF;
    v_resultado := pg_catalog.jsonb_set(
      v_resultado,
      ARRAY['original'],
      jsonb_build_object(
        'bucketId', v_original_artifact.bucket_id,
        'storagePath', v_original_artifact.storage_path,
        'byteSize', v_original_artifact.tamanho_bytes,
        'sha256', v_original_artifact.sha256,
        'immutableAt', v_envelope.publicado_em
      ),
      false
    );
    RETURN v_resultado;
  END IF;

  IF NOT EXISTS (
       SELECT 1
       FROM public.assinatura_eletronica_operacoes AS preparo
       WHERE preparo.actor_scope = v_actor_scope
         AND preparo.actor_auth_user_id = p_actor_auth_user_id
         AND preparo.operacao = 'PREPARAR_ORIGINAL_DIARIO'
         AND preparo.request_id = p_request_id
         AND preparo.resultado ->> 'envelopeId' = p_envelope_id::text
         AND preparo.resultado ->> 'documentSnapshotSha256' = v_document_snapshot_sha256
     )
     OR v_envelope.status <> 'RASCUNHO'
     OR v_envelope.documento_original_sha256 IS NOT NULL
     OR v_envelope.pdf_asset_manifest_snapshot IS NOT NULL
     OR v_envelope.pdf_semantic_manifest_snapshot IS NOT NULL
     OR v_envelope.pdf_signature_target_snapshot IS NOT NULL
     OR (SELECT count(*) FROM public.assinatura_eletronica_participantes AS participante
         WHERE participante.envelope_id = v_envelope.id) <> 2
     OR NOT EXISTS (
       SELECT 1 FROM public.assinatura_eletronica_participantes AS participante
       WHERE participante.envelope_id = v_envelope.id
         AND participante.papel = 'PROFESSOR' AND participante.ordem = 1
         AND participante.obrigatorio AND participante.status = 'AGUARDANDO_ORDEM'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.assinatura_eletronica_participantes AS participante
       WHERE participante.envelope_id = v_envelope.id
         AND participante.papel = 'COORDENADOR' AND participante.ordem = 2
         AND participante.obrigatorio AND participante.status = 'AGUARDANDO_ORDEM'
     )
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_ORIGINAL_ESTADO_OU_PREFLIGHT_INVALIDO';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects AS objeto
    WHERE objeto.bucket_id = p_bucket_id AND objeto.name = p_storage_path
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_ORIGINAL_STORAGE_AUSENTE';
  END IF;

  UPDATE public.assinatura_eletronica_envelopes AS envelope
  SET documento_original_sha256 = v_sha256,
      pdf_asset_manifest_snapshot = p_pdf_asset_manifest,
      pdf_semantic_manifest_snapshot = p_semantic_manifest,
      pdf_signature_target_snapshot = p_frozen_signature_target,
      original_congelado_em = v_published_at,
      publicado_em = v_published_at,
      status = 'PENDENTE'
  WHERE envelope.id = v_envelope.id;

  INSERT INTO public.assinatura_eletronica_artefatos (
    envelope_id, classe, bucket_id, storage_path, tamanho_bytes, sha256
  ) VALUES (
    v_envelope.id, 'DOCUMENTO_ORIGINAL', p_bucket_id, p_storage_path,
    p_tamanho_bytes, v_sha256
  );

  UPDATE public.assinatura_eletronica_participantes AS participante
  SET status = 'PENDENTE'
  WHERE participante.envelope_id = v_envelope.id
    AND participante.papel = 'PROFESSOR'
    AND participante.ordem = 1
    AND participante.status = 'AGUARDANDO_ORDEM'
  RETURNING participante.id INTO v_professor_id;

  PERFORM public.assinatura_eletronica_adicionar_evento(
    v_envelope.id, NULL, 'DOCUMENTO_ORIGINAL_CONGELADO', p_actor_auth_user_id,
    jsonb_build_object(
      'sha256', v_sha256,
      'byteSize', p_tamanho_bytes,
      'documentSnapshotSha256', v_document_snapshot_sha256,
      'pdfAssetManifestSha256', v_pdf_asset_manifest_sha256,
      'semanticManifestSha256', v_semantic_manifest_sha256,
      'frozenSignatureTargetSha256', v_frozen_target_sha256
    )
  );
  PERFORM public.assinatura_eletronica_adicionar_evento(
    v_envelope.id, NULL, 'ENVELOPE_PUBLICADO', p_actor_auth_user_id,
    jsonb_build_object('requestId', p_request_id)
  );
  PERFORM public.assinatura_eletronica_adicionar_evento(
    v_envelope.id, v_professor_id, 'PARTICIPANTE_LIBERADO', p_actor_auth_user_id,
    jsonb_build_object('role', 'PROFESSOR', 'order', 1)
  );

  INSERT INTO public.assinatura_eletronica_operacoes (
    actor_scope, actor_auth_user_id, operacao, request_id, payload_sha256, resultado
  ) VALUES (
    v_actor_scope, p_actor_auth_user_id, 'REGISTRAR_ORIGINAL_PUBLICAR', p_request_id,
    v_payload_sha256, v_ledger_resultado
  );
  RETURN v_resultado;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5. A prova do método vem do desafio realmente consumido por cada assinatura.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_eventos_assinatura_diario_validados(
  p_envelope_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_event_count integer;
  v_valid_count integer;
  v_valid_participant_count integer;
  v_result jsonb;
BEGIN
  SELECT count(*) INTO v_event_count
  FROM public.assinatura_eletronica_eventos AS evento
  WHERE evento.envelope_id = p_envelope_id
    AND evento.tipo = 'ASSINATURA_CONCLUIDA';

  SELECT count(*), count(DISTINCT participante.id)
  INTO v_valid_count, v_valid_participant_count
  FROM public.assinatura_eletronica_eventos AS evento
  JOIN public.assinatura_eletronica_participantes AS participante
    ON participante.id = evento.participante_id
   AND participante.envelope_id = evento.envelope_id
  JOIN public.assinatura_eletronica_desafios AS desafio
    ON desafio.id::text = evento.dados ->> 'challengeId'
   AND desafio.envelope_id = evento.envelope_id
   AND desafio.participante_id = evento.participante_id
  WHERE evento.envelope_id = p_envelope_id
    AND evento.tipo = 'ASSINATURA_CONCLUIDA'
    AND evento.ator_auth_user_id IS NOT NULL
    AND participante.status = 'ASSINADO'
    AND participante.assinado_em IS NOT NULL
    AND participante.assinado_por_auth_user_id = evento.ator_auth_user_id
    AND (evento.dados ->> 'signedAt')::timestamptz = participante.assinado_em
    AND desafio.metodo = 'SENHA_REAUTENTICADA'
    AND desafio.estado = 'CONSUMIDO'
    AND desafio.consumido_em = participante.assinado_em
    AND desafio.actor_auth_user_id = evento.ator_auth_user_id
    AND desafio.auth_session_id IS NOT NULL
    AND desafio.perfil = participante.papel
    AND desafio.contexto_id = participante.contexto_id;

  IF v_event_count <> 2 OR v_valid_count <> 2
     OR v_valid_participant_count <> 2
     OR (SELECT count(*) FROM public.assinatura_eletronica_participantes AS participante
         WHERE participante.envelope_id = p_envelope_id
           AND participante.status = 'ASSINADO') <> 2
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_EVENTOS_OU_DESAFIOS_CONCLUSAO_INVALIDOS';
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'type', 'ASSINATURA_CONCLUIDA',
    'occurredAt', evento.ocorrido_em,
    'participantId', evento.participante_id,
    'challengeId', desafio.id,
    'method', CASE desafio.metodo
      WHEN 'SENHA_REAUTENTICADA' THEN 'SENHA_REAUTENTICADA'
      ELSE NULL
    END
  ) ORDER BY evento.sequencia)
  INTO v_result
  FROM public.assinatura_eletronica_eventos AS evento
  JOIN public.assinatura_eletronica_participantes AS participante
    ON participante.id = evento.participante_id
   AND participante.envelope_id = evento.envelope_id
  JOIN public.assinatura_eletronica_desafios AS desafio
    ON desafio.id::text = evento.dados ->> 'challengeId'
   AND desafio.envelope_id = evento.envelope_id
   AND desafio.participante_id = evento.participante_id
  WHERE evento.envelope_id = p_envelope_id
    AND evento.tipo = 'ASSINATURA_CONCLUIDA'
    AND desafio.metodo = 'SENHA_REAUTENTICADA'
    AND desafio.estado = 'CONSUMIDO';
  RETURN v_result;
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'ASSINATURA_EVENTOS_OU_DESAFIOS_CONCLUSAO_INVALIDOS';
END;
$function$;

ALTER TABLE public.assinatura_eletronica_operacoes
  ADD CONSTRAINT assinatura_eletronica_operacoes_diario_sem_pin_check
    CHECK (
      operacao <> 'INICIAR_FINALIZACAO'
      OR resultado::text !~ 'CONTA_E_PIN'
    ) NOT VALID;

ALTER TABLE public.assinatura_eletronica_operacoes
  VALIDATE CONSTRAINT assinatura_eletronica_operacoes_diario_sem_pin_check;

-- ---------------------------------------------------------------------------
-- 6. FINALIZE seguro devolve o mesmo manifesto congelado e recibos verdadeiros.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_internal_iniciar_finalizacao_diario_seguro(
  p_envelope_id uuid,
  p_actor_auth_user_id uuid,
  p_auth_session_id uuid,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_envelope public.assinatura_eletronica_envelopes%ROWTYPE;
  v_original public.assinatura_eletronica_artefatos%ROWTYPE;
  v_actor_scope text;
  v_payload_sha256 text;
  v_replay public.assinatura_eletronica_operacoes%ROWTYPE;
  v_participantes jsonb;
  v_eventos_assinatura jsonb;
  v_receipt_events jsonb;
  v_receipt_participantes jsonb;
  v_receipt_payload jsonb;
  v_receipt_asset_references jsonb;
  v_watermark_asset_references jsonb;
  v_stamp_link public.assinatura_eletronica_politica_carimbo_assets%ROWTYPE;
  v_stamp_asset public.assinatura_eletronica_modelo_assets%ROWTYPE;
  v_stamp_asset_payload jsonb;
  v_document_snapshot_sha256 text;
  v_pdf_asset_manifest_sha256 text;
  v_signature_events_sha256 text;
  v_resultado jsonb;
  v_ledger_resultado jsonb;
BEGIN
  PERFORM public.assinatura_eletronica_exigir_service_role();
  IF p_envelope_id IS NULL OR p_actor_auth_user_id IS NULL
     OR p_auth_session_id IS NULL OR p_request_id IS NULL
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSINATURA_FINALIZACAO_PAYLOAD_INVALIDO';
  END IF;

  -- A sessão do coordenador que consumiu o desafio é revalidada antes do replay.
  PERFORM public.assinatura_eletronica_autorizar_finalizacao_diario_segura(
    p_envelope_id,
    p_actor_auth_user_id,
    p_auth_session_id
  );
  v_actor_scope := 'service:user:' || p_actor_auth_user_id::text
    || ':session:' || p_auth_session_id::text;

  SELECT envelope.* INTO v_envelope
  FROM public.assinatura_eletronica_envelopes AS envelope
  WHERE envelope.id = p_envelope_id
  FOR UPDATE;
  PERFORM public.assinatura_eletronica_autorizar_finalizacao_diario_segura(
    p_envelope_id,
    p_actor_auth_user_id,
    p_auth_session_id
  );
  IF v_envelope.status NOT IN ('FINALIZANDO', 'ASSINADO')
     OR NOT EXISTS (
       SELECT 1 FROM public.assinatura_eletronica_politicas AS politica
       WHERE politica.id = v_envelope.politica_id
         AND politica.arquivada_em IS NULL
         AND politica.habilitada
         AND politica.status_juridico = 'APROVADA'
         AND politica.versao = v_envelope.politica_versao
         AND politica.politica = v_envelope.politica_snapshot
         AND politica.certificado = v_envelope.certificado_snapshot
     )
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_FINALIZACAO_ESTADO_OU_POLITICA_INVALIDA';
  END IF;

  SELECT artefato.* INTO v_original
  FROM public.assinatura_eletronica_artefatos AS artefato
  WHERE artefato.envelope_id = v_envelope.id
    AND artefato.classe = 'DOCUMENTO_ORIGINAL'
  FOR SHARE;
  v_document_snapshot_sha256 := public.assinatura_eletronica_sha256_json(
    v_envelope.documento_snapshot
  );
  IF NOT FOUND
     OR v_original.sha256 IS DISTINCT FROM v_envelope.documento_original_sha256
     OR v_original.bucket_id <> 'documentos-assinatura-eletronica'
     OR v_original.storage_path IS DISTINCT FROM
       'envelopes/' || v_envelope.id::text || '/documento-original.pdf'
     OR NOT EXISTS (
       SELECT 1 FROM storage.objects AS objeto
       WHERE objeto.bucket_id = v_original.bucket_id
         AND objeto.name = v_original.storage_path
     )
     OR v_envelope.documento_snapshot -> 'template' -> 'imprimirValidacaoContracapa'
       IS DISTINCT FROM 'true'::jsonb
     OR v_envelope.academico_snapshot_sha256 IS DISTINCT FROM v_document_snapshot_sha256
     OR NOT public.assinatura_eletronica_pdf_asset_manifest_diario_valido(
       v_envelope.pdf_asset_manifest_snapshot,
       v_envelope.documento_snapshot,
       v_document_snapshot_sha256
     )
     OR NOT public.assinatura_eletronica_manifesto_diario_valido(
       v_envelope.pdf_semantic_manifest_snapshot
     )
     OR NOT public.assinatura_eletronica_target_diario_valido(
       v_envelope.pdf_signature_target_snapshot,
       v_envelope.pdf_semantic_manifest_snapshot,
       v_envelope.documento_original_sha256
     )
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_ORIGINAL_CONTRATO_SEMANTICO_INVALIDO';
  END IF;

  -- Esta função falha se qualquer evento não provar um desafio de senha
  -- consumido e coerente com envelope, participante, ator e instante.
  v_eventos_assinatura := public.assinatura_eletronica_eventos_assinatura_diario_validados(
    v_envelope.id
  );
  SELECT jsonb_agg(jsonb_build_object(
    'type', evento ->> 'type',
    'occurredAt', evento -> 'occurredAt',
    'participantId', evento -> 'participantId',
    'challengeId', evento -> 'challengeId',
    'method', CASE evento ->> 'method'
      WHEN 'SENHA_REAUTENTICADA' THEN 'SENHA_REAUTENTICADA'
      ELSE NULL
    END
  ) ORDER BY ordinalidade)
  INTO v_receipt_events
  FROM jsonb_array_elements(v_eventos_assinatura) WITH ORDINALITY AS item(evento, ordinalidade);

  SELECT carimbo.* INTO v_stamp_link
  FROM public.assinatura_eletronica_politica_carimbo_assets AS carimbo
  WHERE carimbo.politica_id = v_envelope.politica_id
  FOR SHARE;
  IF NOT FOUND
     OR v_envelope.geometria_snapshot ->> 'assetId' IS DISTINCT FROM v_stamp_link.asset_id::text
     OR v_envelope.geometria_snapshot -> 'assetSnapshot' IS DISTINCT FROM v_stamp_link.asset_snapshot
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_CARIMBO_SNAPSHOT_INDISPONIVEL';
  END IF;
  SELECT asset.* INTO v_stamp_asset
  FROM public.assinatura_eletronica_modelo_assets AS asset
  WHERE asset.id = v_stamp_link.asset_id
    AND asset.status = 'PRONTO'
  FOR SHARE;
  IF NOT FOUND
     OR v_stamp_asset.sha256 IS DISTINCT FROM v_stamp_link.asset_sha256
     OR v_stamp_asset.sha256 IS DISTINCT FROM v_stamp_link.asset_snapshot ->> 'sha256'
     OR v_stamp_asset.mime_type IS DISTINCT FROM v_stamp_link.asset_snapshot ->> 'mimeType'
     OR v_stamp_asset.tamanho_bytes IS DISTINCT FROM (v_stamp_link.asset_snapshot ->> 'sizeBytes')::integer
     OR v_stamp_asset.largura IS DISTINCT FROM (v_stamp_link.asset_snapshot ->> 'width')::integer
     OR v_stamp_asset.altura IS DISTINCT FROM (v_stamp_link.asset_snapshot ->> 'height')::integer
     OR NOT EXISTS (
       SELECT 1 FROM storage.objects AS objeto
       WHERE objeto.bucket_id = v_stamp_asset.bucket_id
         AND objeto.name = v_stamp_asset.storage_path
     )
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_CARIMBO_ASSET_DIVERGENTE';
  END IF;
  v_stamp_asset_payload := jsonb_build_object(
    'assetId', v_stamp_asset.id,
    'bucketId', v_stamp_asset.bucket_id,
    'storagePath', v_stamp_asset.storage_path,
    'mimeType', v_stamp_asset.mime_type,
    'byteSize', v_stamp_asset.tamanho_bytes,
    'width', v_stamp_asset.largura,
    'height', v_stamp_asset.altura,
    'sha256', v_stamp_asset.sha256
  );

  IF EXISTS (
    SELECT 1
    FROM public.assinatura_eletronica_politica_assets AS vinculo
    LEFT JOIN public.assinatura_eletronica_modelo_assets AS asset
      ON asset.id = vinculo.asset_id
     AND asset.status = 'PRONTO'
    LEFT JOIN storage.objects AS objeto
      ON objeto.bucket_id = asset.bucket_id
     AND objeto.name = asset.storage_path
    WHERE vinculo.politica_id = v_envelope.politica_id
      AND (
        asset.id IS NULL
        OR objeto.id IS NULL
        OR vinculo.asset_sha256 IS DISTINCT FROM asset.sha256
        OR vinculo.asset_snapshot ->> 'assetId' IS DISTINCT FROM asset.id::text
        OR vinculo.asset_snapshot ->> 'sha256' IS DISTINCT FROM asset.sha256
        OR vinculo.asset_snapshot ->> 'mimeType' IS DISTINCT FROM asset.mime_type
        OR (vinculo.asset_snapshot ->> 'sizeBytes')::integer IS DISTINCT FROM asset.tamanho_bytes
        OR (vinculo.asset_snapshot ->> 'width')::integer IS DISTINCT FROM asset.largura
        OR (vinculo.asset_snapshot ->> 'height')::integer IS DISTINCT FROM asset.altura
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_MARCA_DAGUA_ASSET_DIVERGENTE';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'page', vinculo.pagina,
    'assetId', asset.id,
    'bucketId', asset.bucket_id,
    'storagePath', asset.storage_path,
    'mimeType', asset.mime_type,
    'byteSize', asset.tamanho_bytes,
    'width', asset.largura,
    'height', asset.altura,
    'sha256', asset.sha256
  ) ORDER BY vinculo.pagina), '[]'::jsonb)
  INTO v_watermark_asset_references
  FROM public.assinatura_eletronica_politica_assets AS vinculo
  JOIN public.assinatura_eletronica_modelo_assets AS asset ON asset.id = vinculo.asset_id
  WHERE vinculo.politica_id = v_envelope.politica_id;

  v_payload_sha256 := public.assinatura_eletronica_sha256_json(jsonb_build_object(
    'envelopeId', p_envelope_id,
    'actorAuthUserId', p_actor_auth_user_id,
    'authSessionId', p_auth_session_id,
    'originalSha256', v_envelope.documento_original_sha256,
    'documentSnapshotSha256', v_document_snapshot_sha256,
    'pdfAssetManifestSnapshot', v_envelope.pdf_asset_manifest_snapshot,
    'geometrySnapshot', v_envelope.geometria_snapshot,
    'semanticManifestSnapshot', v_envelope.pdf_semantic_manifest_snapshot,
    'frozenSignatureTargetSnapshot', v_envelope.pdf_signature_target_snapshot,
    'signatureEvents', v_eventos_assinatura,
    'stampAsset', v_stamp_asset_payload
  ));
  v_pdf_asset_manifest_sha256 := public.assinatura_eletronica_sha256_json(
    v_envelope.pdf_asset_manifest_snapshot
  );
  v_signature_events_sha256 := public.assinatura_eletronica_sha256_json(
    v_eventos_assinatura
  );

  SELECT jsonb_agg(jsonb_build_object(
    'participantId', participante.id,
    'role', participante.papel,
    'roleLabel', public.assinatura_eletronica_papel_label(participante.papel),
    'order', participante.ordem,
    'status', participante.status,
    'statusLabel', public.assinatura_eletronica_participante_status_label(participante.status),
    'contextId', participante.contexto_id,
    'canAct', false,
    'signerName', participante.identidade_snapshot ->> 'name',
    'signedAt', participante.assinado_em
  ) ORDER BY participante.ordem)
  INTO v_participantes
  FROM public.assinatura_eletronica_participantes AS participante
  WHERE participante.envelope_id = v_envelope.id;

  SELECT jsonb_agg(jsonb_build_object(
    'id', participante.id,
    'name', participante.identidade_snapshot ->> 'name',
    'role', CASE participante.papel
      WHEN 'PROFESSOR' THEN 'Professor'
      WHEN 'COORDENADOR' THEN 'Coordenador de curso'
    END
  ) ORDER BY participante.ordem)
  INTO v_receipt_participantes
  FROM public.assinatura_eletronica_participantes AS participante
  WHERE participante.envelope_id = v_envelope.id;

  v_receipt_payload := jsonb_build_object(
    'institution', v_envelope.documento_snapshot -> 'institutionalIdentity' -> 'institution',
    'logo', NULL,
    'watermarkAssets', '{}'::jsonb,
    'presentation', jsonb_build_object(
      'policyName', coalesce(v_envelope.politica_snapshot ->> 'name', 'Diário de Classe'),
      'policyVersionLabel', coalesce(
        v_envelope.politica_snapshot ->> 'versionLabel',
        'Versão ' || v_envelope.politica_versao::text
      ),
      'confirmationMessage', coalesce(
        v_envelope.politica_snapshot ->> 'confirmationMessage',
        'A assinatura foi confirmada mediante reautenticação da conta institucional.'
      ),
      'receiptTitle', coalesce(
        v_envelope.politica_snapshot ->> 'receiptTitle',
        'Comprovante de Assinatura Eletrônica'
      ),
      'receiptMessage', coalesce(
        v_envelope.politica_snapshot ->> 'receiptMessage',
        'A autenticidade deve ser conferida pelo código de validação.'
      ),
      'editor', v_envelope.politica_snapshot -> 'editor'
    ),
    'document', jsonb_build_object(
      'type', 'Diário de Classe',
      'reference', v_envelope.id::text,
      'version', v_envelope.revisao_rotulo
    ),
    'status', 'ASSINADO',
    'participants', v_receipt_participantes,
    'events', v_receipt_events,
    'validation', jsonb_build_object(
      'code', v_envelope.documento_snapshot ->> 'validationCode'
    )
  );
  v_receipt_asset_references := jsonb_build_object(
    'logo', jsonb_build_object(
      'sourceKind', 'HTTPS_URL',
      'sourceUrl', v_envelope.pdf_asset_manifest_snapshot -> 'assets' -> 'headerLogo' ->> 'sourceUrl'
    ),
    'institutionalWatermark', CASE
      WHEN v_envelope.pdf_asset_manifest_snapshot -> 'assets' -> 'watermark' = 'null'::jsonb
        THEN 'null'::jsonb
      WHEN v_envelope.pdf_asset_manifest_snapshot -> 'assets' -> 'watermark' ->> 'sourceKind'
        = 'INLINE_DATA_URI'
        THEN jsonb_build_object(
          'sourceKind', 'INLINE_DATA_URI',
          'sourceRef', 'documentSnapshot.assetSources.watermarkUrl'
        )
      ELSE jsonb_build_object(
        'sourceKind', 'HTTPS_URL',
        'sourceUrl', v_envelope.pdf_asset_manifest_snapshot -> 'assets' -> 'watermark' ->> 'sourceUrl'
      )
    END,
    'customWatermarks', v_watermark_asset_references
  );

  v_resultado := jsonb_build_object(
    'envelopeId', v_envelope.id,
    'status', 'FINALIZANDO',
    'documentType', v_envelope.documento,
    'documentSnapshotIntegrity', jsonb_build_object(
      'schemaVersion', 1,
      'canonicalization', 'POSTGRES_JSONB_TEXT_UTF8_V1',
      'hashAlgorithm', 'SHA-256',
      'encoding', 'UTF-8',
      'canonicalJson', v_envelope.documento_snapshot::text,
      'documentSnapshotSha256', v_document_snapshot_sha256,
      'academicRevisionSha256', v_envelope.documento_snapshot -> 'source' ->> 'academicRevisionSha256',
      'templateSourceSha256', v_envelope.documento_snapshot -> 'templateSource' ->> 'sha256'
    ),
    'documentSnapshotSha256', v_document_snapshot_sha256,
    'geometrySnapshot', v_envelope.geometria_snapshot,
    'pdfAssetManifestSnapshot', v_envelope.pdf_asset_manifest_snapshot,
    'semanticManifestSnapshot', v_envelope.pdf_semantic_manifest_snapshot,
    'frozenSignatureTargetSnapshot', v_envelope.pdf_signature_target_snapshot,
    'policyVersion', v_envelope.politica_versao,
    'policySnapshot', v_envelope.politica_snapshot,
    'certificateSnapshot', v_envelope.certificado_snapshot,
    'originalArtifact', jsonb_build_object(
      'artifactId', v_original.id,
      'bucketId', v_original.bucket_id,
      'storagePath', v_original.storage_path,
      'byteSize', v_original.tamanho_bytes,
      'sha256', v_original.sha256
    ),
    'participants', v_participantes,
    'signatureEvents', v_eventos_assinatura,
    'receiptPayload', v_receipt_payload,
    'receiptAssetReferences', v_receipt_asset_references,
    'stampAsset', v_stamp_asset_payload,
    'verification', jsonb_build_object(
      'code', v_envelope.documento_snapshot ->> 'validationCode',
      'basePath', '/validador',
      'path', '/validador?code=' || (v_envelope.documento_snapshot ->> 'validationCode')
    ),
    'verificationPath', '/validador?code=' || (v_envelope.documento_snapshot ->> 'validationCode')
  );
  v_ledger_resultado := jsonb_build_object(
    'envelopeId', v_envelope.id,
    'status', 'FINALIZANDO',
    'documentSnapshotSha256', v_document_snapshot_sha256,
    'originalSha256', v_original.sha256,
    'pdfAssetManifestSha256', v_pdf_asset_manifest_sha256,
    'signatureEventsSha256', v_signature_events_sha256
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'assinatura:finalizar:iniciar:' || v_actor_scope || ':' || p_request_id::text,
      0
    )
  );
  SELECT operacao.* INTO v_replay
  FROM public.assinatura_eletronica_operacoes AS operacao
  WHERE operacao.actor_scope = v_actor_scope
    AND operacao.operacao = 'INICIAR_FINALIZACAO'
    AND operacao.request_id = p_request_id;
  IF FOUND THEN
    IF v_replay.actor_auth_user_id IS DISTINCT FROM p_actor_auth_user_id
       OR v_replay.payload_sha256 IS DISTINCT FROM v_payload_sha256
       OR v_replay.resultado ->> 'envelopeId' IS DISTINCT FROM v_envelope.id::text
       OR v_replay.resultado ->> 'status' IS DISTINCT FROM 'FINALIZANDO'
       OR v_replay.resultado ->> 'documentSnapshotSha256'
         IS DISTINCT FROM v_document_snapshot_sha256
       OR v_replay.resultado ->> 'originalSha256' IS DISTINCT FROM v_original.sha256
       OR v_replay.resultado ->> 'pdfAssetManifestSha256'
         IS DISTINCT FROM v_pdf_asset_manifest_sha256
       OR v_replay.resultado ->> 'signatureEventsSha256'
         IS DISTINCT FROM v_signature_events_sha256
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSINATURA_IDEMPOTENCIA_DIVERGENTE';
    END IF;
    RETURN v_resultado;
  END IF;
  IF v_envelope.status <> 'FINALIZANDO' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_FINALIZACAO_ESTADO_INVALIDO';
  END IF;

  INSERT INTO public.assinatura_eletronica_operacoes (
    actor_scope, actor_auth_user_id, operacao, request_id, payload_sha256, resultado
  ) VALUES (
    v_actor_scope, p_actor_auth_user_id, 'INICIAR_FINALIZACAO', p_request_id,
    v_payload_sha256, v_ledger_resultado
  );
  PERFORM public.assinatura_eletronica_adicionar_evento(
    v_envelope.id, NULL, 'FINALIZACAO_INICIADA', p_actor_auth_user_id,
    jsonb_build_object(
      'requestId', p_request_id,
      'originalSha256', v_original.sha256
    )
  );
  RETURN v_resultado;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_internal_registrar_artefato_finalizar_diario_seguro(
  p_envelope_id uuid,
  p_actor_auth_user_id uuid,
  p_auth_session_id uuid,
  p_final_bucket_id text,
  p_final_storage_path text,
  p_final_tamanho_bytes bigint,
  p_final_sha256 text,
  p_receipt_bucket_id text,
  p_receipt_storage_path text,
  p_receipt_tamanho_bytes bigint,
  p_receipt_sha256 text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_envelope public.assinatura_eletronica_envelopes%ROWTYPE;
  v_actor_scope text;
  v_final_sha256 text := lower(btrim(coalesce(p_final_sha256, '')));
  v_receipt_sha256 text := lower(btrim(coalesce(p_receipt_sha256, '')));
  v_payload_sha256 text;
  v_replay public.assinatura_eletronica_operacoes%ROWTYPE;
  v_final_artifact public.assinatura_eletronica_artefatos%ROWTYPE;
  v_receipt_artifact public.assinatura_eletronica_artefatos%ROWTYPE;
  v_final_artifact_id uuid := gen_random_uuid();
  v_receipt_artifact_id uuid := gen_random_uuid();
  v_finalized_at timestamptz := statement_timestamp();
  v_signature_events jsonb;
  v_pdf_asset_manifest_sha256 text;
  v_resultado jsonb;
  v_ledger_resultado jsonb;
BEGIN
  PERFORM public.assinatura_eletronica_exigir_service_role();
  IF p_envelope_id IS NULL OR p_actor_auth_user_id IS NULL
     OR p_auth_session_id IS NULL OR p_request_id IS NULL
     OR p_final_bucket_id <> 'documentos-assinatura-eletronica'
     OR p_receipt_bucket_id <> 'documentos-assinatura-eletronica'
     OR p_final_storage_path IS DISTINCT FROM 'envelopes/' || p_envelope_id::text || '/documento-final.pdf'
     OR p_receipt_storage_path IS DISTINCT FROM 'envelopes/' || p_envelope_id::text || '/comprovante-evidencia.pdf'
     OR p_final_tamanho_bytes IS NULL OR p_final_tamanho_bytes NOT BETWEEN 1 AND 52428800
     OR p_receipt_tamanho_bytes IS NULL OR p_receipt_tamanho_bytes NOT BETWEEN 1 AND 52428800
     OR v_final_sha256 !~ '^[0-9a-f]{64}$'
     OR v_receipt_sha256 !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSINATURA_ARTEFATOS_FINAIS_PAYLOAD_INVALIDO';
  END IF;

  -- A autorização corrente e a sessão do coordenador precedem o replay.
  PERFORM public.assinatura_eletronica_autorizar_finalizacao_diario_segura(
    p_envelope_id,
    p_actor_auth_user_id,
    p_auth_session_id
  );
  v_actor_scope := 'service:user:' || p_actor_auth_user_id::text
    || ':session:' || p_auth_session_id::text;

  SELECT envelope.* INTO v_envelope
  FROM public.assinatura_eletronica_envelopes AS envelope
  WHERE envelope.id = p_envelope_id
  FOR UPDATE;
  PERFORM public.assinatura_eletronica_autorizar_finalizacao_diario_segura(
    p_envelope_id,
    p_actor_auth_user_id,
    p_auth_session_id
  );
  IF NOT public.assinatura_eletronica_pdf_asset_manifest_diario_valido(
       v_envelope.pdf_asset_manifest_snapshot,
       v_envelope.documento_snapshot,
       v_envelope.academico_snapshot_sha256
     )
     OR v_envelope.documento_snapshot -> 'template' -> 'imprimirValidacaoContracapa'
       IS DISTINCT FROM 'true'::jsonb
     OR NOT EXISTS (
       SELECT 1 FROM public.assinatura_eletronica_politicas AS politica
       WHERE politica.id = v_envelope.politica_id
         AND politica.arquivada_em IS NULL
         AND politica.habilitada
         AND politica.status_juridico = 'APROVADA'
         AND politica.versao = v_envelope.politica_versao
         AND politica.politica = v_envelope.politica_snapshot
         AND politica.certificado = v_envelope.certificado_snapshot
     )
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_FINALIZACAO_CONTRATO_OU_POLITICA_INVALIDA';
  END IF;
  v_signature_events := public.assinatura_eletronica_eventos_assinatura_diario_validados(
    v_envelope.id
  );
  v_pdf_asset_manifest_sha256 := public.assinatura_eletronica_sha256_json(
    v_envelope.pdf_asset_manifest_snapshot
  );

  v_payload_sha256 := public.assinatura_eletronica_sha256_json(jsonb_build_object(
    'envelopeId', p_envelope_id,
    'actorAuthUserId', p_actor_auth_user_id,
    'authSessionId', p_auth_session_id,
    'pdfAssetManifestSnapshot', v_envelope.pdf_asset_manifest_snapshot,
    'signatureEvents', v_signature_events,
    'final', jsonb_build_object(
      'bucketId', p_final_bucket_id,
      'storagePath', p_final_storage_path,
      'byteSize', p_final_tamanho_bytes,
      'sha256', v_final_sha256
    ),
    'receipt', jsonb_build_object(
      'bucketId', p_receipt_bucket_id,
      'storagePath', p_receipt_storage_path,
      'byteSize', p_receipt_tamanho_bytes,
      'sha256', v_receipt_sha256
    )
  ));
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'assinatura:finalizar:registrar:' || v_actor_scope || ':' || p_request_id::text,
      0
    )
  );
  SELECT operacao.* INTO v_replay
  FROM public.assinatura_eletronica_operacoes AS operacao
  WHERE operacao.actor_scope = v_actor_scope
    AND operacao.operacao = 'REGISTRAR_ARTEFATO_FINALIZAR'
    AND operacao.request_id = p_request_id;
  IF FOUND THEN
    IF v_replay.actor_auth_user_id IS DISTINCT FROM p_actor_auth_user_id
       OR v_replay.payload_sha256 IS DISTINCT FROM v_payload_sha256
       OR v_replay.resultado ->> 'envelopeId' IS DISTINCT FROM v_envelope.id::text
       OR v_replay.resultado ->> 'status' IS DISTINCT FROM 'ASSINADO'
       OR v_replay.resultado ->> 'originalSha256'
         IS DISTINCT FROM v_envelope.documento_original_sha256
       OR v_replay.resultado ->> 'finalSha256' IS DISTINCT FROM v_final_sha256
       OR v_replay.resultado ->> 'receiptSha256' IS DISTINCT FROM v_receipt_sha256
       OR v_replay.resultado ->> 'pdfAssetManifestSha256'
         IS DISTINCT FROM v_pdf_asset_manifest_sha256
       OR v_envelope.status <> 'ASSINADO'
       OR v_envelope.documento_final_sha256 IS DISTINCT FROM v_final_sha256
       OR v_envelope.finalizado_em IS NULL
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSINATURA_IDEMPOTENCIA_DIVERGENTE';
    END IF;

    SELECT artefato.* INTO v_final_artifact
    FROM public.assinatura_eletronica_artefatos AS artefato
    WHERE artefato.envelope_id = v_envelope.id
      AND artefato.classe = 'DOCUMENTO_FINAL'
    FOR SHARE;
    SELECT artefato.* INTO v_receipt_artifact
    FROM public.assinatura_eletronica_artefatos AS artefato
    WHERE artefato.envelope_id = v_envelope.id
      AND artefato.classe = 'COMPROVANTE_EVIDENCIA'
    FOR SHARE;
    IF v_final_artifact.id IS NULL
       OR v_receipt_artifact.id IS NULL
       OR v_replay.resultado ->> 'finalArtifactId'
         IS DISTINCT FROM v_final_artifact.id::text
       OR v_replay.resultado ->> 'receiptArtifactId'
         IS DISTINCT FROM v_receipt_artifact.id::text
       OR (v_replay.resultado ->> 'finalizedAt')::timestamptz
         IS DISTINCT FROM v_envelope.finalizado_em
       OR v_final_artifact.bucket_id IS DISTINCT FROM p_final_bucket_id
       OR v_final_artifact.storage_path IS DISTINCT FROM p_final_storage_path
       OR v_final_artifact.tamanho_bytes IS DISTINCT FROM p_final_tamanho_bytes
       OR v_final_artifact.sha256 IS DISTINCT FROM v_final_sha256
       OR v_receipt_artifact.bucket_id IS DISTINCT FROM p_receipt_bucket_id
       OR v_receipt_artifact.storage_path IS DISTINCT FROM p_receipt_storage_path
       OR v_receipt_artifact.tamanho_bytes IS DISTINCT FROM p_receipt_tamanho_bytes
       OR v_receipt_artifact.sha256 IS DISTINCT FROM v_receipt_sha256
       OR NOT EXISTS (
         SELECT 1 FROM storage.objects AS objeto
         WHERE objeto.bucket_id = v_final_artifact.bucket_id
           AND objeto.name = v_final_artifact.storage_path
       )
       OR NOT EXISTS (
         SELECT 1 FROM storage.objects AS objeto
         WHERE objeto.bucket_id = v_receipt_artifact.bucket_id
           AND objeto.name = v_receipt_artifact.storage_path
       )
    THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_REPLAY_ARTEFATOS_DIVERGENTES';
    END IF;
    v_final_artifact_id := v_final_artifact.id;
    v_receipt_artifact_id := v_receipt_artifact.id;
    v_finalized_at := v_envelope.finalizado_em;
    v_resultado := jsonb_build_object(
      'envelopeId', v_envelope.id,
      'status', 'ASSINADO',
      'statusLabel', public.assinatura_eletronica_envelope_status_label('ASSINADO'),
      'finalizedAt', v_finalized_at,
      'originalSha256', v_envelope.documento_original_sha256,
      'finalSha256', v_final_sha256,
      'pdfAssetManifestSnapshot', v_envelope.pdf_asset_manifest_snapshot,
      'artifacts', jsonb_build_array(
        jsonb_build_object(
          'artifactId', v_final_artifact_id,
          'class', 'DOCUMENTO_FINAL',
          'bucketId', p_final_bucket_id,
          'storagePath', p_final_storage_path,
          'byteSize', p_final_tamanho_bytes,
          'sha256', v_final_sha256,
          'immutableAt', v_finalized_at
        ),
        jsonb_build_object(
          'artifactId', v_receipt_artifact_id,
          'class', 'COMPROVANTE_EVIDENCIA',
          'bucketId', p_receipt_bucket_id,
          'storagePath', p_receipt_storage_path,
          'byteSize', p_receipt_tamanho_bytes,
          'sha256', v_receipt_sha256,
          'immutableAt', v_finalized_at
        )
      )
    );
    RETURN v_resultado;
  END IF;

  IF NOT EXISTS (
       SELECT 1
       FROM public.assinatura_eletronica_operacoes AS inicio
       WHERE inicio.actor_scope = v_actor_scope
         AND inicio.actor_auth_user_id = p_actor_auth_user_id
         AND inicio.operacao = 'INICIAR_FINALIZACAO'
         AND inicio.request_id = p_request_id
         AND inicio.resultado ->> 'envelopeId' = p_envelope_id::text
         AND inicio.resultado ->> 'documentSnapshotSha256'
           = v_envelope.academico_snapshot_sha256
         AND inicio.resultado ->> 'pdfAssetManifestSha256'
           = v_pdf_asset_manifest_sha256
     )
     OR v_envelope.status <> 'FINALIZANDO'
     OR v_envelope.documento_original_sha256 IS NULL
     OR v_final_sha256 = v_envelope.documento_original_sha256
     OR (SELECT count(*) FROM public.assinatura_eletronica_participantes AS participante
         WHERE participante.envelope_id = v_envelope.id
           AND participante.status = 'ASSINADO') <> 2
     OR EXISTS (
       SELECT 1 FROM public.assinatura_eletronica_artefatos AS artefato
       WHERE artefato.envelope_id = v_envelope.id
         AND artefato.classe IN ('DOCUMENTO_FINAL', 'COMPROVANTE_EVIDENCIA')
     )
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_FINALIZACAO_ESTADO_OU_PREFLIGHT_INVALIDO';
  END IF;
  IF NOT EXISTS (
       SELECT 1 FROM storage.objects AS objeto
       WHERE objeto.bucket_id = p_final_bucket_id AND objeto.name = p_final_storage_path
     ) OR NOT EXISTS (
       SELECT 1 FROM storage.objects AS objeto
       WHERE objeto.bucket_id = p_receipt_bucket_id AND objeto.name = p_receipt_storage_path
     )
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ASSINATURA_ARTEFATOS_FINAIS_STORAGE_AUSENTE';
  END IF;

  UPDATE public.assinatura_eletronica_envelopes AS envelope
  SET documento_final_sha256 = v_final_sha256,
      finalizado_em = v_finalized_at,
      status = 'ASSINADO'
  WHERE envelope.id = v_envelope.id;

  INSERT INTO public.assinatura_eletronica_artefatos (
    id, envelope_id, classe, bucket_id, storage_path, tamanho_bytes, sha256, imutavel_em
  ) VALUES
  (
    v_final_artifact_id, v_envelope.id, 'DOCUMENTO_FINAL', p_final_bucket_id,
    p_final_storage_path, p_final_tamanho_bytes, v_final_sha256, v_finalized_at
  ),
  (
    v_receipt_artifact_id, v_envelope.id, 'COMPROVANTE_EVIDENCIA', p_receipt_bucket_id,
    p_receipt_storage_path, p_receipt_tamanho_bytes, v_receipt_sha256, v_finalized_at
  );

  PERFORM public.assinatura_eletronica_adicionar_evento(
    v_envelope.id, NULL, 'DOCUMENTO_FINAL_REGISTRADO', p_actor_auth_user_id,
    jsonb_build_object('artifactId', v_final_artifact_id, 'sha256', v_final_sha256)
  );
  PERFORM public.assinatura_eletronica_adicionar_evento(
    v_envelope.id, NULL, 'COMPROVANTE_REGISTRADO', p_actor_auth_user_id,
    jsonb_build_object('artifactId', v_receipt_artifact_id, 'sha256', v_receipt_sha256)
  );
  PERFORM public.assinatura_eletronica_adicionar_evento(
    v_envelope.id, NULL, 'ENVELOPE_ASSINADO', p_actor_auth_user_id,
    jsonb_build_object('requestId', p_request_id, 'finalizedAt', v_finalized_at)
  );

  v_resultado := jsonb_build_object(
    'envelopeId', v_envelope.id,
    'status', 'ASSINADO',
    'statusLabel', public.assinatura_eletronica_envelope_status_label('ASSINADO'),
    'finalizedAt', v_finalized_at,
    'originalSha256', v_envelope.documento_original_sha256,
    'finalSha256', v_final_sha256,
    'pdfAssetManifestSnapshot', v_envelope.pdf_asset_manifest_snapshot,
    'artifacts', jsonb_build_array(
      jsonb_build_object(
        'artifactId', v_final_artifact_id,
        'class', 'DOCUMENTO_FINAL',
        'bucketId', p_final_bucket_id,
        'storagePath', p_final_storage_path,
        'byteSize', p_final_tamanho_bytes,
        'sha256', v_final_sha256,
        'immutableAt', v_finalized_at
      ),
      jsonb_build_object(
        'artifactId', v_receipt_artifact_id,
        'class', 'COMPROVANTE_EVIDENCIA',
        'bucketId', p_receipt_bucket_id,
        'storagePath', p_receipt_storage_path,
        'byteSize', p_receipt_tamanho_bytes,
        'sha256', v_receipt_sha256,
        'immutableAt', v_finalized_at
      )
    )
  );
  v_ledger_resultado := jsonb_build_object(
    'envelopeId', v_envelope.id,
    'status', 'ASSINADO',
    'finalizedAt', v_finalized_at,
    'originalSha256', v_envelope.documento_original_sha256,
    'finalSha256', v_final_sha256,
    'receiptSha256', v_receipt_sha256,
    'pdfAssetManifestSha256', v_pdf_asset_manifest_sha256,
    'finalArtifactId', v_final_artifact_id,
    'receiptArtifactId', v_receipt_artifact_id
  );
  INSERT INTO public.assinatura_eletronica_operacoes (
    actor_scope, actor_auth_user_id, operacao, request_id, payload_sha256, resultado
  ) VALUES (
    v_actor_scope, p_actor_auth_user_id, 'REGISTRAR_ARTEFATO_FINALIZAR', p_request_id,
    v_payload_sha256, v_ledger_resultado
  );
  RETURN v_resultado;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 7. ACL: overloads antigos fechados; somente wrappers seguros no service role.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.assinatura_eletronica_internal_preparar_original_diario(
  uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_internal_registrar_original_publicar(
  uuid, text, text, bigint, text, text, jsonb, jsonb, jsonb, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_internal_iniciar_finalizacao(
  uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_internal_registrar_artefato_finalizar(
  uuid, text, text, bigint, text, text, text, bigint, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.assinatura_eletronica_watermark_source_diario_valido(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_snapshot_academico_diario_valido_v1_https(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_snapshot_academico_diario_valido(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_pdf_asset_manifest_diario_valido(jsonb, jsonb, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_proteger_pdf_asset_manifest()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_autorizar_original_diario_seguro(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_autorizar_finalizacao_diario_segura(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_eventos_assinatura_diario_validados(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.assinatura_eletronica_internal_preparar_original_diario_seguro(
  uuid, uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_internal_registrar_original_publicar_seguro(
  uuid, uuid, uuid, text, text, bigint, text, text, jsonb, jsonb, jsonb, jsonb, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_internal_iniciar_finalizacao_diario_seguro(
  uuid, uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_internal_registrar_artefato_finalizar_diario_seguro(
  uuid, uuid, uuid, text, text, bigint, text, text, text, bigint, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_internal_preparar_original_diario_seguro(
  uuid, uuid, uuid, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_internal_registrar_original_publicar_seguro(
  uuid, uuid, uuid, text, text, bigint, text, text, jsonb, jsonb, jsonb, jsonb, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_internal_iniciar_finalizacao_diario_seguro(
  uuid, uuid, uuid, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_internal_registrar_artefato_finalizar_diario_seguro(
  uuid, uuid, uuid, text, text, bigint, text, text, text, bigint, text, uuid
) TO service_role;

ALTER TABLE public.assinatura_eletronica_envelopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assinatura_eletronica_operacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assinatura_eletronica_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assinatura_eletronica_artefatos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assinatura_eletronica_desafios ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.assinatura_eletronica_envelopes,
  public.assinatura_eletronica_operacoes,
  public.assinatura_eletronica_eventos,
  public.assinatura_eletronica_artefatos,
  public.assinatura_eletronica_desafios
FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
