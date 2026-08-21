-- Editor v4 do comprovante de assinatura eletrônica.
--
-- O cabeçalho e a marca-d'água passam a ser exclusivamente institucionais:
-- não existe mais configuração de texto/asset por página no editor. A imagem
-- institucional usada pelo artefato final continua sendo congelada pelo
-- documento_snapshot + pdf_asset_manifest_snapshot do envelope.

BEGIN;

-- Um envelope já criado é prova imutável. Este upgrade só pode ocorrer antes
-- do primeiro envelope, sem reescrever snapshot ou artefato histórico.
DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM public.assinatura_eletronica_envelopes) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_EDITOR_V4_ENVELOPES_EXISTENTES',
      HINT = 'Conclua ou recrie os envelopes antes de aplicar o editor institucional v4.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.assinatura_eletronica_politica_assets AS vinculo
    JOIN public.assinatura_eletronica_politicas AS politica
      ON politica.id = vinculo.politica_id
    WHERE politica.documento = 'diario_classe'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_EDITOR_V4_MARCA_CUSTOM_VINCULADA',
      HINT = 'Preserve a versão histórica e publique uma política institucional sem vínculo custom.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.assinatura_eletronica_politicas AS politica
    WHERE politica.documento = 'diario_classe'
      AND politica.arquivada_em IS NULL
      AND jsonb_typeof(politica.politica -> 'editor') IS DISTINCT FROM 'object'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_EDITOR_V4_POLITICA_DIARIO_SEM_EDITOR';
  END IF;
END;
$migration$;

-- Mantém os validadores v3 aplicados em 010500 como leitura legada privada.
ALTER FUNCTION public.assinatura_eletronica_editor_padrao()
  RENAME TO assinatura_eletronica_editor_padrao_v3_individual_legacy;
ALTER FUNCTION public.assinatura_eletronica_normalizar_editor(jsonb)
  RENAME TO assinatura_eletronica_normalizar_editor_v3_individual_legacy;
ALTER FUNCTION public.assinatura_eletronica_salvar_configuracao(uuid, text, jsonb, uuid)
  RENAME TO assinatura_eletronica_salvar_configuracao_v3_legacy;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_content_layout_carimbo_valido(
  p_layout jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  v_seal integer;
  v_spacing integer;
  v_qr integer;
BEGIN
  IF jsonb_typeof(p_layout) IS DISTINCT FROM 'object'
     OR (
       SELECT array_agg(entry.key ORDER BY entry.key)
       FROM jsonb_object_keys(p_layout) AS entry(key)
     ) IS DISTINCT FROM ARRAY[
       'lineSpacingPercent', 'qrScalePercent', 'sealScalePercent'
     ]::text[]
     OR jsonb_typeof(p_layout -> 'sealScalePercent') IS DISTINCT FROM 'number'
     OR jsonb_typeof(p_layout -> 'lineSpacingPercent') IS DISTINCT FROM 'number'
     OR jsonb_typeof(p_layout -> 'qrScalePercent') IS DISTINCT FROM 'number'
     OR p_layout ->> 'sealScalePercent' !~ '^[0-9]+$'
     OR p_layout ->> 'lineSpacingPercent' !~ '^[0-9]+$'
     OR p_layout ->> 'qrScalePercent' !~ '^[0-9]+$'
  THEN
    RETURN false;
  END IF;

  v_seal := (p_layout ->> 'sealScalePercent')::integer;
  v_spacing := (p_layout ->> 'lineSpacingPercent')::integer;
  v_qr := (p_layout ->> 'qrScalePercent')::integer;
  RETURN v_seal BETWEEN 70 AND 130
    AND v_spacing BETWEEN 85 AND 105
    AND v_qr BETWEEN 85 AND 115
    AND v_seal % 5 = 0
    AND v_spacing % 5 = 0
    AND v_qr % 5 = 0;
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RETURN false;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_editor_v4_a_partir_v3(
  p_editor_v3 jsonb,
  p_content_layout jsonb DEFAULT jsonb_build_object(
    'sealScalePercent', 100,
    'lineSpacingPercent', 100,
    'qrScalePercent', 100
  )
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
BEGIN
  IF p_editor_v3 ->> 'schemaVersion' IS DISTINCT FROM '3'
     OR NOT public.assinatura_eletronica_content_layout_carimbo_valido(
       p_content_layout
     )
  THEN
    RAISE EXCEPTION 'Não foi possível converter o editor legado para o schema v4.'
      USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'schemaVersion', 4,
    'pages', jsonb_build_array(
      jsonb_build_object(
        'page', 1,
        'template', 'EVIDENCE'
      ),
      jsonb_build_object(
        'page', 2,
        'template', 'LEGAL_TEXTS',
        'sections', p_editor_v3 -> 'pages' -> 1 -> 'sections'
      )
    ),
    'signatureStamp', (p_editor_v3 -> 'signatureStamp') || jsonb_build_object(
      'contentLayout', p_content_layout
    )
  );
END;
$function$;

-- Adaptador privado usado somente para delegar as validações/salvamento v2.
-- O objeto desabilitado nunca é persistido no editor v4 nem vira asset.
CREATE OR REPLACE FUNCTION public.assinatura_eletronica_editor_v4_para_v2_legacy(
  p_editor_v4 jsonb
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT jsonb_build_object(
    'schemaVersion', 2,
    'pages', jsonb_build_array(
      (p_editor_v4 -> 'pages' -> 0) || jsonb_build_object(
        'watermark', jsonb_build_object(
          'enabled', false,
          'source', 'TEXT',
          'label', 'UNIVERSO',
          'assetId', NULL,
          'opacity', 0.08,
          'scalePercent', 60,
          'rotationDegrees', -45
        )
      ),
      (p_editor_v4 -> 'pages' -> 1) || jsonb_build_object(
        'watermark', jsonb_build_object(
          'enabled', false,
          'source', 'TEXT',
          'label', 'UNIVERSO',
          'assetId', NULL,
          'opacity', 0.08,
          'scalePercent', 60,
          'rotationDegrees', -45
        )
      )
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_editor_padrao()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT public.assinatura_eletronica_editor_v4_a_partir_v3(
    public.assinatura_eletronica_editor_padrao_v3_individual_legacy(),
    jsonb_build_object(
      'sealScalePercent', 100,
      'lineSpacingPercent', 100,
      'qrScalePercent', 100
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_normalizar_editor(
  p_editor jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  v_schema integer;
  v_page_1 jsonb;
  v_page_2 jsonb;
  v_stamp jsonb;
  v_content_layout jsonb;
  v_editor_v3 jsonb;
  v_normalized_v3 jsonb;
BEGIN
  IF p_editor IS NULL THEN
    RETURN public.assinatura_eletronica_editor_padrao();
  END IF;
  IF jsonb_typeof(p_editor) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_editor -> 'schemaVersion') IS DISTINCT FROM 'number'
     OR p_editor ->> 'schemaVersion' !~ '^[1234]$'
  THEN
    RAISE EXCEPTION 'O editor deve usar o schema 1, 2, 3 ou 4.'
      USING ERRCODE = '22023';
  END IF;
  v_schema := (p_editor ->> 'schemaVersion')::integer;

  IF v_schema IN (1, 2) THEN
    -- Não delega schemas 1/2 ao wrapper v3 renomeado: aquele wrapper chama o
    -- nome público do default durante a expansão e, após este upgrade, esse
    -- nome já aponta para v4. Normalizamos as páginas pelo validador v2 estável
    -- e acrescentamos o carimbo v3 individual congelado antes da conversão.
    v_normalized_v3 := pg_catalog.jsonb_set(
      public.assinatura_eletronica_normalizar_editor_v2_legacy(p_editor),
      '{schemaVersion}',
      '3'::jsonb,
      true
    ) || jsonb_build_object(
      'signatureStamp',
      public.assinatura_eletronica_editor_padrao_v3_individual_legacy()
        -> 'signatureStamp'
    );
    RETURN public.assinatura_eletronica_editor_v4_a_partir_v3(
      v_normalized_v3
    );
  END IF;

  IF v_schema = 3 THEN
    v_normalized_v3 :=
      public.assinatura_eletronica_normalizar_editor_v3_individual_legacy(
        p_editor
      );
    RETURN public.assinatura_eletronica_editor_v4_a_partir_v3(
      v_normalized_v3
    );
  END IF;

  IF (
       SELECT array_agg(entry.key ORDER BY entry.key)
       FROM jsonb_object_keys(p_editor) AS entry(key)
     ) IS DISTINCT FROM ARRAY[
       'pages', 'schemaVersion', 'signatureStamp'
     ]::text[]
     OR jsonb_typeof(p_editor -> 'pages') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_editor -> 'pages') <> 2
     OR jsonb_typeof(p_editor -> 'signatureStamp') IS DISTINCT FROM 'object'
  THEN
    RAISE EXCEPTION 'O editor v4 não corresponde ao contrato autorizado.'
      USING ERRCODE = '22023';
  END IF;

  v_page_1 := p_editor -> 'pages' -> 0;
  v_page_2 := p_editor -> 'pages' -> 1;
  IF jsonb_typeof(v_page_1) IS DISTINCT FROM 'object'
     OR (
       SELECT array_agg(entry.key ORDER BY entry.key)
       FROM jsonb_object_keys(v_page_1) AS entry(key)
     ) IS DISTINCT FROM ARRAY['page', 'template']::text[]
     OR jsonb_typeof(v_page_1 -> 'page') IS DISTINCT FROM 'number'
     OR v_page_1 ->> 'page' IS DISTINCT FROM '1'
     OR jsonb_typeof(v_page_1 -> 'template') IS DISTINCT FROM 'string'
     OR v_page_1 ->> 'template' IS DISTINCT FROM 'EVIDENCE'
  THEN
    RAISE EXCEPTION 'A página 1 v4 deve usar somente o modelo canônico de evidências.'
      USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(v_page_2) IS DISTINCT FROM 'object'
     OR (
       SELECT array_agg(entry.key ORDER BY entry.key)
       FROM jsonb_object_keys(v_page_2) AS entry(key)
     ) IS DISTINCT FROM ARRAY['page', 'sections', 'template']::text[]
     OR jsonb_typeof(v_page_2 -> 'page') IS DISTINCT FROM 'number'
     OR v_page_2 ->> 'page' IS DISTINCT FROM '2'
     OR jsonb_typeof(v_page_2 -> 'template') IS DISTINCT FROM 'string'
     OR v_page_2 ->> 'template' IS DISTINCT FROM 'LEGAL_TEXTS'
     OR jsonb_typeof(v_page_2 -> 'sections') IS DISTINCT FROM 'array'
  THEN
    RAISE EXCEPTION 'A página 2 v4 deve usar somente os textos jurídicos canônicos.'
      USING ERRCODE = '22023';
  END IF;

  v_stamp := p_editor -> 'signatureStamp';
  IF (
       SELECT array_agg(entry.key ORDER BY entry.key)
       FROM jsonb_object_keys(v_stamp) AS entry(key)
     ) IS DISTINCT FROM ARRAY[
       'assetId', 'canonicalLabel', 'contentLayout', 'enabled', 'layout', 'slots'
     ]::text[]
     OR jsonb_typeof(v_stamp -> 'canonicalLabel') IS DISTINCT FROM 'string'
     OR v_stamp ->> 'canonicalLabel'
        IS DISTINCT FROM 'Documento assinado eletronicamente'
     OR jsonb_typeof(v_stamp -> 'enabled') IS DISTINCT FROM 'boolean'
     OR v_stamp -> 'enabled' IS DISTINCT FROM 'false'::jsonb
     OR jsonb_typeof(v_stamp -> 'layout') IS DISTINCT FROM 'string'
     OR v_stamp ->> 'layout' NOT IN ('HORIZONTAL', 'COMPACT')
     OR jsonb_typeof(v_stamp -> 'slots') IS DISTINCT FROM 'array'
     OR jsonb_typeof(v_stamp -> 'assetId') NOT IN ('null', 'string')
  THEN
    RAISE EXCEPTION 'O carimbo v4 não corresponde ao contrato autorizado.'
      USING ERRCODE = '22023';
  END IF;
  v_content_layout := v_stamp -> 'contentLayout';
  IF NOT public.assinatura_eletronica_content_layout_carimbo_valido(
    v_content_layout
  ) THEN
    RAISE EXCEPTION 'A distribuição interna do carimbo está fora dos limites autorizados.'
      USING ERRCODE = '22023';
  END IF;

  -- A autoridade v3 valida seções, textos seguros, asset do carimbo, slots,
  -- limites e colisão. A marca legada abaixo é apenas um adaptador desabilitado.
  v_editor_v3 := jsonb_build_object(
    'schemaVersion', 3,
    'pages', public.assinatura_eletronica_editor_v4_para_v2_legacy(p_editor)
      -> 'pages',
    'signatureStamp', v_stamp - 'contentLayout'
  );
  v_normalized_v3 :=
    public.assinatura_eletronica_normalizar_editor_v3_individual_legacy(
      v_editor_v3
    );
  RETURN public.assinatura_eletronica_editor_v4_a_partir_v3(
    v_normalized_v3,
    jsonb_build_object(
      'sealScalePercent', (v_content_layout ->> 'sealScalePercent')::integer,
      'lineSpacingPercent', (v_content_layout ->> 'lineSpacingPercent')::integer,
      'qrScalePercent', (v_content_layout ->> 'qrScalePercent')::integer
    )
  );
END;
$function$;

-- O saver público continua global, idempotente e juridicamente bloqueado.
-- Ele delega ao v2 com uma marca desabilitada e remove esse detalhe antes de
-- persistir o editor v4 autoritativo.
CREATE OR REPLACE FUNCTION public.assinatura_eletronica_salvar_configuracao(
  p_polo_id uuid DEFAULT NULL,
  p_documento text DEFAULT 'MODELO_PADRAO',
  p_configuracao jsonb DEFAULT '{}'::jsonb,
  p_request_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_documento text := upper(btrim(coalesce(p_documento, 'MODELO_PADRAO')));
  v_request_id uuid := coalesce(p_request_id, gen_random_uuid());
  v_expected_version integer;
  v_editor jsonb;
  v_legacy_editor jsonb;
  v_legacy_config jsonb;
  v_stamp_asset_id uuid;
  v_stamp_asset public.assinatura_eletronica_modelo_assets%ROWTYPE;
  v_stamp_snapshot jsonb := 'null'::jsonb;
  v_replay public.assinatura_eletronica_politicas%ROWTYPE;
  v_resultado public.assinatura_eletronica_politicas%ROWTYPE;
BEGIN
  IF NOT public.assinatura_eletronica_autoriza_configuracao(p_polo_id) THEN
    RAISE EXCEPTION 'Acesso não autorizado para configurar assinatura eletrônica.'
      USING ERRCODE = '42501';
  END IF;
  IF v_documento <> 'MODELO_PADRAO' THEN
    RAISE EXCEPTION 'Políticas por documento permanecem bloqueadas nesta fundação.'
      USING ERRCODE = '55000';
  END IF;
  IF p_polo_id IS NOT NULL THEN
    RAISE EXCEPTION 'MODELO_PADRAO é uma configuração global.'
      USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_configuracao) IS DISTINCT FROM 'object'
     OR (
       SELECT array_agg(entry.key ORDER BY entry.key)
       FROM jsonb_object_keys(p_configuracao) AS entry(key)
     ) IS DISTINCT FROM ARRAY[
       'confirmationMessage', 'editor', 'expectedVersion', 'name',
       'receiptMessage', 'receiptTitle'
     ]::text[]
     OR jsonb_typeof(p_configuracao -> 'expectedVersion') IS DISTINCT FROM 'number'
     OR p_configuracao ->> 'expectedVersion' !~ '^[0-9]+$'
  THEN
    RAISE EXCEPTION 'Configuração de assinatura inválida.' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_expected_version := (p_configuracao ->> 'expectedVersion')::integer;
  EXCEPTION WHEN numeric_value_out_of_range THEN
    RAISE EXCEPTION 'A versão-base do modelo excedeu o intervalo permitido.'
      USING ERRCODE = '22023';
  END;
  IF v_expected_version < 0 OR v_expected_version = 2147483647 THEN
    RAISE EXCEPTION 'A versão-base do modelo é inválida.' USING ERRCODE = '22023';
  END IF;

  v_editor := public.assinatura_eletronica_normalizar_editor(
    p_configuracao -> 'editor'
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'assinatura-carimbo-request:' || v_request_id::text,
      0
    )
  );

  IF jsonb_typeof(v_editor -> 'signatureStamp' -> 'assetId') = 'string' THEN
    v_stamp_asset_id :=
      (v_editor -> 'signatureStamp' ->> 'assetId')::uuid;
    SELECT asset.*
    INTO v_stamp_asset
    FROM public.assinatura_eletronica_modelo_assets AS asset
    WHERE asset.id = v_stamp_asset_id
      AND asset.status = 'PRONTO'
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'A imagem própria do carimbo não existe ou não está disponível.'
        USING ERRCODE = '23503';
    END IF;
    v_stamp_snapshot := jsonb_build_object(
      'assetId', v_stamp_asset.id,
      'sha256', v_stamp_asset.sha256,
      'mimeType', v_stamp_asset.mime_type,
      'sizeBytes', v_stamp_asset.tamanho_bytes,
      'width', v_stamp_asset.largura,
      'height', v_stamp_asset.altura
    );
  END IF;

  SELECT politica.*
  INTO v_replay
  FROM public.assinatura_eletronica_politicas AS politica
  WHERE politica.request_id = v_request_id;

  IF FOUND THEN
    IF v_replay.polo_id IS NOT NULL
       OR v_replay.documento IS DISTINCT FROM 'MODELO_PADRAO'
       OR v_replay.versao IS DISTINCT FROM v_expected_version + 1
       OR v_replay.habilitada IS DISTINCT FROM false
       OR v_replay.status_juridico IS DISTINCT FROM 'PENDENTE_MATRIZ_JURIDICA'
       OR v_replay.politica ->> 'name'
          IS DISTINCT FROM btrim(p_configuracao ->> 'name')
       OR v_replay.politica ->> 'confirmationMessage'
          IS DISTINCT FROM btrim(p_configuracao ->> 'confirmationMessage')
       OR v_replay.politica ->> 'receiptTitle'
          IS DISTINCT FROM btrim(p_configuracao ->> 'receiptTitle')
       OR v_replay.politica ->> 'receiptMessage'
          IS DISTINCT FROM btrim(p_configuracao ->> 'receiptMessage')
       OR public.assinatura_eletronica_normalizar_editor(
            v_replay.politica -> 'editor'
          ) IS DISTINCT FROM v_editor
       OR v_replay.politica -> 'signatureStampAssetSnapshot'
          IS DISTINCT FROM v_stamp_snapshot
    THEN
      RAISE EXCEPTION 'A chave de idempotência já foi usada com dados diferentes.'
        USING ERRCODE = '22023';
    END IF;
    RETURN public.assinatura_eletronica_apresentar_configuracao(v_replay);
  END IF;

  v_legacy_editor :=
    public.assinatura_eletronica_editor_v4_para_v2_legacy(v_editor);
  v_legacy_config := jsonb_set(
    p_configuracao,
    '{editor}',
    v_legacy_editor,
    true
  );

  PERFORM public.assinatura_eletronica_salvar_configuracao_v2_legacy(
    p_polo_id,
    v_documento,
    v_legacy_config,
    v_request_id
  );

  SELECT politica.*
  INTO v_resultado
  FROM public.assinatura_eletronica_politicas AS politica
  WHERE politica.request_id = v_request_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_resultado.habilitada IS DISTINCT FROM false
     OR v_resultado.status_juridico IS DISTINCT FROM 'PENDENTE_MATRIZ_JURIDICA'
  THEN
    RAISE EXCEPTION 'A versão visual v4 não preservou o bloqueio jurídico.'
      USING ERRCODE = '55000';
  END IF;

  UPDATE public.assinatura_eletronica_politicas AS politica
  SET politica = (
    politica.politica
      - 'watermarkAssetSnapshots'
      - 'institutionalWatermark'
  ) || jsonb_build_object(
    'editor', v_editor,
    'signatureStampAssetSnapshot', v_stamp_snapshot
  )
  WHERE politica.id = v_resultado.id
  RETURNING * INTO v_resultado;

  IF v_stamp_asset_id IS NOT NULL THEN
    INSERT INTO public.assinatura_eletronica_politica_carimbo_assets (
      politica_id,
      asset_id,
      asset_sha256,
      asset_snapshot
    ) VALUES (
      v_resultado.id,
      v_stamp_asset.id,
      v_stamp_asset.sha256,
      v_stamp_snapshot
    );
  END IF;

  RETURN public.assinatura_eletronica_apresentar_configuracao(v_resultado);
END;
$function$;

-- A função histórica que cria o envelope ainda produz geometria v1. Este
-- trigger a converte, na mesma transação e antes das guardas existentes, para
-- o snapshot v2 autoritativo derivado da política congelada.
CREATE OR REPLACE FUNCTION public.assinatura_eletronica_congelar_geometria_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_editor jsonb;
  v_geometry_keys text[];
  v_schema integer;
BEGIN
  IF NEW.documento <> 'diario_classe' THEN
    RETURN NEW;
  END IF;
  v_editor := public.assinatura_eletronica_normalizar_editor(
    NEW.politica_snapshot -> 'editor'
  );
  IF v_editor IS DISTINCT FROM NEW.politica_snapshot -> 'editor'
     OR v_editor ->> 'schemaVersion' <> '4'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'ASSINATURA_POLITICA_EDITOR_V4_INVALIDO';
  END IF;
  IF jsonb_typeof(NEW.geometria_snapshot) IS DISTINCT FROM 'object'
     OR jsonb_typeof(NEW.geometria_snapshot -> 'schemaVersion')
        IS DISTINCT FROM 'number'
     OR NEW.geometria_snapshot ->> 'schemaVersion' !~ '^[12]$'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'ASSINATURA_GEOMETRIA_V2_INVALIDA';
  END IF;
  v_schema := (NEW.geometria_snapshot ->> 'schemaVersion')::integer;
  SELECT array_agg(entry.key ORDER BY entry.key)
  INTO v_geometry_keys
  FROM jsonb_object_keys(NEW.geometria_snapshot) AS entry(key);
  IF v_geometry_keys IS DISTINCT FROM (
       CASE v_schema
         WHEN 1 THEN ARRAY[
           'assetId', 'assetSnapshot', 'coordinateSpace', 'layout',
           'schemaVersion', 'slots'
         ]::text[]
         ELSE ARRAY[
           'assetId', 'assetSnapshot', 'contentLayout', 'coordinateSpace',
           'layout', 'schemaVersion', 'slots'
         ]::text[]
       END
     )
     OR NEW.geometria_snapshot ->> 'coordinateSpace'
        IS DISTINCT FROM 'PAGE_TOP_LEFT_BP_V1'
     OR NEW.geometria_snapshot -> 'assetId'
        IS DISTINCT FROM v_editor -> 'signatureStamp' -> 'assetId'
     OR NEW.geometria_snapshot -> 'assetSnapshot'
        IS DISTINCT FROM coalesce(
          NEW.politica_snapshot -> 'signatureStampAssetSnapshot',
          'null'::jsonb
        )
     OR NEW.geometria_snapshot ->> 'layout'
        IS DISTINCT FROM v_editor -> 'signatureStamp' ->> 'layout'
     OR NEW.geometria_snapshot -> 'slots'
        IS DISTINCT FROM v_editor -> 'signatureStamp' -> 'slots'
     OR (
       v_schema = 2
       AND NEW.geometria_snapshot -> 'contentLayout'
           IS DISTINCT FROM v_editor -> 'signatureStamp' -> 'contentLayout'
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'ASSINATURA_GEOMETRIA_V2_DIVERGENTE';
  END IF;

  NEW.geometria_snapshot := jsonb_build_object(
    'schemaVersion', 2,
    'coordinateSpace', 'PAGE_TOP_LEFT_BP_V1',
    'assetId', v_editor -> 'signatureStamp' -> 'assetId',
    'assetSnapshot', coalesce(
      NEW.politica_snapshot -> 'signatureStampAssetSnapshot',
      'null'::jsonb
    ),
    'layout', v_editor -> 'signatureStamp' ->> 'layout',
    'contentLayout', v_editor -> 'signatureStamp' -> 'contentLayout',
    'slots', v_editor -> 'signatureStamp' -> 'slots'
  );
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_geometria_v2_valida(
  p_snapshot jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  v_slot jsonb;
  v_role text;
  v_x integer;
  v_y integer;
  v_width integer;
  v_height integer;
  v_first jsonb;
  v_second jsonb;
  v_index integer;
BEGIN
  IF jsonb_typeof(p_snapshot) IS DISTINCT FROM 'object'
     OR (
       SELECT array_agg(entry.key ORDER BY entry.key)
       FROM jsonb_object_keys(p_snapshot) AS entry(key)
     ) IS DISTINCT FROM ARRAY[
       'assetId', 'assetSnapshot', 'contentLayout', 'coordinateSpace',
       'layout', 'schemaVersion', 'slots'
     ]::text[]
     OR jsonb_typeof(p_snapshot -> 'schemaVersion') IS DISTINCT FROM 'number'
     OR p_snapshot ->> 'schemaVersion' IS DISTINCT FROM '2'
     OR jsonb_typeof(p_snapshot -> 'coordinateSpace') IS DISTINCT FROM 'string'
     OR p_snapshot ->> 'coordinateSpace'
        IS DISTINCT FROM 'PAGE_TOP_LEFT_BP_V1'
     OR jsonb_typeof(p_snapshot -> 'layout') IS DISTINCT FROM 'string'
     OR p_snapshot ->> 'layout' NOT IN ('HORIZONTAL', 'COMPACT')
     OR jsonb_typeof(p_snapshot -> 'assetId') NOT IN ('null', 'string')
     OR jsonb_typeof(p_snapshot -> 'assetSnapshot') NOT IN ('null', 'object')
     OR jsonb_typeof(p_snapshot -> 'slots') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_snapshot -> 'slots') <> 2
     OR NOT public.assinatura_eletronica_content_layout_carimbo_valido(
       p_snapshot -> 'contentLayout'
     )
  THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(p_snapshot -> 'assetId') = 'string'
     AND p_snapshot ->> 'assetId'
         !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN
    RETURN false;
  END IF;

  FOR v_index IN 0..1 LOOP
    v_slot := p_snapshot -> 'slots' -> v_index;
    v_role := CASE v_index WHEN 0 THEN 'PROFESSOR' ELSE 'COORDENADOR' END;
    IF jsonb_typeof(v_slot) IS DISTINCT FROM 'object'
       OR (
         SELECT array_agg(entry.key ORDER BY entry.key)
         FROM jsonb_object_keys(v_slot) AS entry(key)
       ) IS DISTINCT FROM ARRAY[
         'coordinateSpace', 'heightBp', 'pageTarget', 'role', 'widthBp',
         'xBp', 'yBp'
       ]::text[]
       OR jsonb_typeof(v_slot -> 'role') IS DISTINCT FROM 'string'
       OR v_slot ->> 'role' IS DISTINCT FROM v_role
       OR jsonb_typeof(v_slot -> 'pageTarget') IS DISTINCT FROM 'string'
       OR v_slot ->> 'pageTarget' IS DISTINCT FROM 'LAST_PAGE'
       OR jsonb_typeof(v_slot -> 'coordinateSpace') IS DISTINCT FROM 'string'
       OR v_slot ->> 'coordinateSpace'
          IS DISTINCT FROM 'PAGE_TOP_LEFT_BP_V1'
       OR jsonb_typeof(v_slot -> 'xBp') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_slot -> 'yBp') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_slot -> 'widthBp') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_slot -> 'heightBp') IS DISTINCT FROM 'number'
       OR v_slot ->> 'xBp' !~ '^[0-9]+$'
       OR v_slot ->> 'yBp' !~ '^[0-9]+$'
       OR v_slot ->> 'widthBp' !~ '^[0-9]+$'
       OR v_slot ->> 'heightBp' !~ '^[0-9]+$'
    THEN
      RETURN false;
    END IF;
    v_x := (v_slot ->> 'xBp')::integer;
    v_y := (v_slot ->> 'yBp')::integer;
    v_width := (v_slot ->> 'widthBp')::integer;
    v_height := (v_slot ->> 'heightBp')::integer;
    IF v_width NOT BETWEEN 38000 AND 90000
       OR v_height NOT BETWEEN 14000 AND 25000
       OR v_x NOT BETWEEN 0 AND 100000 - v_width
       OR v_y NOT BETWEEN 0 AND 100000 - v_height
    THEN
      RETURN false;
    END IF;
  END LOOP;

  v_first := p_snapshot -> 'slots' -> 0;
  v_second := p_snapshot -> 'slots' -> 1;
  IF (v_first ->> 'xBp')::integer
       < (v_second ->> 'xBp')::integer + (v_second ->> 'widthBp')::integer
     AND (v_first ->> 'xBp')::integer + (v_first ->> 'widthBp')::integer
       > (v_second ->> 'xBp')::integer
     AND (v_first ->> 'yBp')::integer
       < (v_second ->> 'yBp')::integer + (v_second ->> 'heightBp')::integer
     AND (v_first ->> 'yBp')::integer + (v_first ->> 'heightBp')::integer
       > (v_second ->> 'yBp')::integer
  THEN
    RETURN false;
  END IF;
  RETURN true;
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RETURN false;
END;
$function$;

DROP TRIGGER IF EXISTS assinatura_eletronica_envelopes_00_geometry_v2_before_insert
  ON public.assinatura_eletronica_envelopes;
CREATE TRIGGER assinatura_eletronica_envelopes_00_geometry_v2_before_insert
  BEFORE INSERT ON public.assinatura_eletronica_envelopes
  FOR EACH ROW
  EXECUTE FUNCTION public.assinatura_eletronica_congelar_geometria_v2();

ALTER TABLE public.assinatura_eletronica_envelopes
  DROP CONSTRAINT assinatura_eletronica_envelopes_snapshot_diario_check,
  ADD CONSTRAINT assinatura_eletronica_envelopes_snapshot_diario_check
    CHECK (
      public.assinatura_eletronica_snapshot_academico_diario_valido(
        documento_snapshot
      )
      AND academico_snapshot_sha256 =
        public.assinatura_eletronica_sha256_json(documento_snapshot)
      AND documento_snapshot -> 'source' ->> 'turmaId' = turma_id::text
      AND documento_snapshot -> 'source' ->> 'disciplinaId' = disciplina_id::text
      AND documento_snapshot -> 'template' -> 'imprimirValidacaoContracapa'
          = 'true'::jsonb
      AND public.assinatura_eletronica_geometria_v2_valida(
        geometria_snapshot
      )
    ) NOT VALID;

-- Cada política ativa do Diário ganha uma nova versão v4. A linha anterior e
-- seus vínculos imutáveis ficam arquivados; habilitação, jurídico, certificado
-- e asset do carimbo são preservados exatamente.
DO $migration$
DECLARE
  v_old public.assinatura_eletronica_politicas%ROWTYPE;
  v_new_id uuid;
  v_editor_v4 jsonb;
  v_new_policy jsonb;
  v_now timestamptz := statement_timestamp();
BEGIN
  FOR v_old IN
    SELECT politica.*
    FROM public.assinatura_eletronica_politicas AS politica
    WHERE politica.documento = 'diario_classe'
      AND politica.arquivada_em IS NULL
    ORDER BY politica.polo_id, politica.versao
    FOR UPDATE
  LOOP
    v_editor_v4 := public.assinatura_eletronica_normalizar_editor(
      v_old.politica -> 'editor'
    );
    v_new_policy := (
      v_old.politica
        - 'watermarkAssetSnapshots'
        - 'institutionalWatermark'
    ) || jsonb_build_object(
      'versionLabel', 'Versão ' || (v_old.versao + 1)::text,
      'editor', v_editor_v4
    );
    v_new_id := gen_random_uuid();

    UPDATE public.assinatura_eletronica_politicas AS politica
    SET arquivada_em = v_now
    WHERE politica.id = v_old.id;

    INSERT INTO public.assinatura_eletronica_politicas (
      id,
      company_id,
      polo_id,
      documento,
      versao,
      habilitada,
      status_juridico,
      certificado,
      politica,
      request_id,
      criada_por,
      atualizada_por,
      created_at,
      updated_at
    ) VALUES (
      v_new_id,
      v_old.company_id,
      v_old.polo_id,
      v_old.documento,
      v_old.versao + 1,
      v_old.habilitada,
      v_old.status_juridico,
      v_old.certificado,
      v_new_policy,
      NULL,
      v_old.criada_por,
      v_old.atualizada_por,
      v_now,
      v_now
    );

    INSERT INTO public.assinatura_eletronica_politica_carimbo_assets (
      politica_id,
      asset_id,
      asset_sha256,
      asset_snapshot,
      vinculada_em
    )
    SELECT
      v_new_id,
      vinculo.asset_id,
      vinculo.asset_sha256,
      vinculo.asset_snapshot,
      v_now
    FROM public.assinatura_eletronica_politica_carimbo_assets AS vinculo
    WHERE vinculo.politica_id = v_old.id;
  END LOOP;
END;
$migration$;

-- O RPC público mantém o ledger/idempotência da implementação anterior, mas
-- fecha o payload visual: a Edge recebe somente a referência institucional
-- já congelada pelo manifesto. Referências custom permanecem legíveis apenas
-- em snapshots geométricos v1 históricos e são proibidas para v2.
ALTER FUNCTION public.assinatura_eletronica_rpc_iniciar_finalizacao_diario(
  uuid, uuid, uuid, uuid
)
  RENAME TO assinatura_eletronica_rpc_iniciar_finalizacao_diario_v3_legacy;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_rpc_iniciar_finalizacao_diario(
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
  v_resultado jsonb;
  v_schema_geometria integer;
  v_receipt_payload jsonb;
  v_custom_watermarks jsonb;
BEGIN
  v_resultado :=
    public.assinatura_eletronica_rpc_iniciar_finalizacao_diario_v3_legacy(
      p_envelope_id => p_envelope_id,
      p_actor_auth_user_id => p_actor_auth_user_id,
      p_auth_session_id => p_auth_session_id,
      p_request_id => p_request_id
    );
  IF jsonb_typeof(v_resultado -> 'geometrySnapshot')
       IS DISTINCT FROM 'object'
     OR jsonb_typeof(v_resultado -> 'geometrySnapshot' -> 'schemaVersion')
       IS DISTINCT FROM 'number'
     OR v_resultado -> 'geometrySnapshot' ->> 'schemaVersion' !~ '^[12]$'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_FINALIZACAO_GEOMETRIA_INCOMPATIVEL';
  END IF;
  v_schema_geometria := (
    v_resultado -> 'geometrySnapshot' ->> 'schemaVersion'
  )::integer;
  v_custom_watermarks :=
    v_resultado -> 'receiptAssetReferences' -> 'customWatermarks';
  IF jsonb_typeof(v_custom_watermarks) IS DISTINCT FROM 'array'
     OR (
       v_schema_geometria = 2
       AND jsonb_array_length(v_custom_watermarks) <> 0
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_FINALIZACAO_MARCA_CUSTOM_INCOMPATIVEL';
  END IF;

  v_receipt_payload := v_resultado -> 'receiptPayload';
  IF jsonb_typeof(v_receipt_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_FINALIZACAO_COMPROVANTE_INVALIDO';
  END IF;
  v_receipt_payload := (
    v_receipt_payload
      - 'watermarkAssets'
      - 'institutionalWatermark'
  ) || jsonb_build_object('institutionalWatermark', 'null'::jsonb);
  RETURN pg_catalog.jsonb_set(
    v_resultado,
    '{receiptPayload}',
    v_receipt_payload,
    false
  );
END;
$function$;

DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.assinatura_eletronica_politicas AS politica
    WHERE politica.documento = 'diario_classe'
      AND politica.arquivada_em IS NULL
      AND (
        politica.politica -> 'editor' ->> 'schemaVersion' <> '4'
        OR politica.politica -> 'editor'
           IS DISTINCT FROM public.assinatura_eletronica_normalizar_editor(
             politica.politica -> 'editor'
           )
        OR politica.politica::text ~* 'watermarkAssetSnapshots|CUSTOM_ASSET'
        OR politica.politica -> 'editor' -> 'pages' -> 0 ? 'watermark'
        OR politica.politica -> 'editor' -> 'pages' -> 1 ? 'watermark'
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_EDITOR_V4_POLITICA_DIARIO_INVALIDA';
  END IF;
END;
$migration$;

ALTER TABLE public.assinatura_eletronica_envelopes
  VALIDATE CONSTRAINT assinatura_eletronica_envelopes_snapshot_diario_check;

REVOKE ALL ON FUNCTION
  public.assinatura_eletronica_editor_padrao_v3_individual_legacy()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.assinatura_eletronica_normalizar_editor_v3_individual_legacy(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.assinatura_eletronica_salvar_configuracao_v3_legacy(uuid, text, jsonb, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.assinatura_eletronica_rpc_iniciar_finalizacao_diario_v3_legacy(
    uuid, uuid, uuid, uuid
  ) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.assinatura_eletronica_content_layout_carimbo_valido(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.assinatura_eletronica_editor_v4_a_partir_v3(jsonb, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.assinatura_eletronica_editor_v4_para_v2_legacy(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_editor_padrao()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_normalizar_editor(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_congelar_geometria_v2()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_geometria_v2_valida(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.assinatura_eletronica_salvar_configuracao(uuid, text, jsonb, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.assinatura_eletronica_rpc_iniciar_finalizacao_diario(
    uuid, uuid, uuid, uuid
  ) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.assinatura_eletronica_salvar_configuracao(uuid, text, jsonb, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.assinatura_eletronica_rpc_iniciar_finalizacao_diario(
    uuid, uuid, uuid, uuid
  ) TO service_role;

COMMIT;
