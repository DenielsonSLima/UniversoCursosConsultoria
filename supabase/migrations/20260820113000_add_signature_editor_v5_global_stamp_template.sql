-- Um unico template visual de carimbo, reutilizado por todas as assinaturas.
--
-- Os papeis e os valores probatorios nao definem layout: eles apenas
-- preenchem bindings canonicos. Somente a geometria vive em um canvas
-- normalizado do carimbo; uma regra automatica posiciona o mesmo
-- template na ultima pagina. A marca institucional do Diario vem somente do
-- registro watermark_landscape_<polo_id> de Modelos Documentos.

BEGIN;

-- A v5 aceita somente a cópia inline canônica já materializada em Modelos de
-- Documentos. Não há URL/Storage nem leitura de polo/empresa neste contrato.
CREATE OR REPLACE FUNCTION public.assinatura_eletronica_marca_landscape_data_uri_valida(
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
  v_bytes bytea;
BEGIN
  IF p_source IS NULL OR p_source IS DISTINCT FROM btrim(p_source) THEN
    RETURN false;
  END IF;
  v_match := pg_catalog.regexp_match(
    p_source,
    '^data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$'
  );
  IF v_match IS NULL
     OR pg_catalog.char_length(v_match[2]) % 4 <> 0
     OR pg_catalog.char_length(v_match[2]) > 1398104
  THEN
    RETURN false;
  END IF;
  v_bytes := pg_catalog.decode(v_match[2], 'base64');
  IF pg_catalog.octet_length(v_bytes) NOT BETWEEN 1 AND 1048576
     OR pg_catalog.replace(pg_catalog.encode(v_bytes, 'base64'), E'\n', '')
        IS DISTINCT FROM v_match[2]
  THEN
    RETURN false;
  END IF;
  RETURN CASE v_match[1]
    WHEN 'png' THEN pg_catalog.substring(v_bytes, 1, 8)
      = pg_catalog.decode('89504e470d0a1a0a', 'hex')
    WHEN 'jpeg' THEN pg_catalog.substring(v_bytes, 1, 3)
      = pg_catalog.decode('ffd8ff', 'hex')
    WHEN 'webp' THEN pg_catalog.octet_length(v_bytes) >= 12
      AND pg_catalog.substring(v_bytes, 1, 4)
        = pg_catalog.decode('52494646', 'hex')
      AND pg_catalog.substring(v_bytes, 9, 4)
        = pg_catalog.decode('57454250', 'hex')
    ELSE false
  END;
EXCEPTION WHEN others THEN
  RETURN false;
END;
$function$;

REVOKE ALL ON FUNCTION public.assinatura_eletronica_marca_landscape_data_uri_valida(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assinatura_eletronica_marca_landscape_data_uri_valida(text)
  TO authenticated, service_role;

DO $migration$
BEGIN
  -- Envelopes ja emitidos sao prova imutavel: os caminhos v1/v2 continuam
  -- legados e sua politica nao e convertida por este upgrade.
  IF EXISTS (
    SELECT 1
    FROM public.assinatura_eletronica_politicas AS politica
    WHERE politica.documento = 'diario_classe'
      AND politica.arquivada_em IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.assinatura_eletronica_envelopes AS envelope
        WHERE envelope.politica_id = politica.id
      )
      AND (
        politica.politica -> 'editor' ->> 'schemaVersion' IS DISTINCT FROM '4'
        OR politica.politica -> 'editor'
           IS DISTINCT FROM public.assinatura_eletronica_normalizar_editor(
             politica.politica -> 'editor'
           )
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_EDITOR_V5_PRECONDICAO_V4_INVALIDA';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.assinatura_eletronica_politica_assets AS vinculo
    JOIN public.assinatura_eletronica_politicas AS politica
      ON politica.id = vinculo.politica_id
    WHERE politica.documento = 'diario_classe'
      AND politica.arquivada_em IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.assinatura_eletronica_envelopes AS envelope
        WHERE envelope.politica_id = politica.id
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.assinatura_eletronica_politicas AS politica
    WHERE politica.documento = 'diario_classe'
      AND politica.arquivada_em IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.assinatura_eletronica_envelopes AS envelope
        WHERE envelope.politica_id = politica.id
      )
      AND politica.politica::text ~* 'watermarkAssetSnapshots|CUSTOM_ASSET'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_EDITOR_V5_MARCA_CUSTOM_INCOMPATIVEL',
      HINT = 'A politica ativa deve usar somente a marca landscape institucional.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.assinatura_eletronica_politicas AS politica
    LEFT JOIN public.documentos_templates AS marca
      ON marca.id = 'watermark_landscape_' || politica.polo_id::text
    WHERE politica.documento = 'diario_classe'
      AND politica.arquivada_em IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.assinatura_eletronica_envelopes AS envelope
        WHERE envelope.politica_id = politica.id
      )
      AND (
        politica.polo_id IS NULL
        OR marca.id IS NULL
        OR jsonb_typeof(marca.conteudo) IS DISTINCT FROM 'object'
        OR NOT public.assinatura_eletronica_marca_landscape_data_uri_valida(
          marca.conteudo ->> 'url'
        )
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_EDITOR_V5_MARCA_LANDSCAPE_AUSENTE',
      HINT = 'Cadastre watermark_landscape_<polo_id> em Modelos Documentos.';
  END IF;
END;
$migration$;

-- O contrato aplicado em 103000 permanece privado para leitura/conversao de
-- politicas v1-v4; nenhuma linha historica e reinterpretada como v5.
ALTER FUNCTION public.assinatura_eletronica_editor_padrao()
  RENAME TO assinatura_eletronica_editor_padrao_v4_institutional_legacy;
ALTER FUNCTION public.assinatura_eletronica_normalizar_editor(jsonb)
  RENAME TO assinatura_eletronica_normalizar_editor_v4_institutional_legacy;
ALTER FUNCTION public.assinatura_eletronica_salvar_configuracao(uuid, text, jsonb, uuid)
  RENAME TO assinatura_eletronica_salvar_configuracao_v4_institutional_legacy;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_template_carimbo_v5_valido(
  p_template jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  v_element jsonb;
  v_index integer;
  v_x integer;
  v_y integer;
  v_width integer;
  v_height integer;
  v_qr jsonb;
  v_expected_ids constant text[] := ARRAY[
    'seal', 'signerRole', 'title', 'signerName', 'signedAt',
    'signerCpfMasked', 'signatureHash', 'verificationCode',
    'verificationUrl', 'verificationQr', 'divider'
  ]::text[];
  v_expected_kinds constant text[] := ARRAY[
    'IMAGE', 'TEXT', 'TEXT', 'TEXT', 'TEXT', 'TEXT', 'TEXT', 'TEXT',
    'TEXT', 'QR', 'LINE'
  ]::text[];
  v_expected_bindings constant text[] := ARRAY[
    'STAMP_ASSET', 'SIGNER_ROLE', 'DISPLAY_TITLE', 'SIGNER_NAME',
    'SIGNED_AT', 'SIGNER_CPF_MASKED', 'SIGNATURE_HASH',
    'VERIFICATION_CODE', 'VERIFICATION_URL', 'VERIFICATION_URL',
    'DECORATIVE'
  ]::text[];
  v_expected_styles constant jsonb := jsonb_build_array(
    jsonb_build_object('fit', 'CONTAIN', 'opacityBp', 100000),
    jsonb_build_object(
      'font', 'HELVETICA_BOLD', 'fontSizeBp', 9000,
      'color', '#071A33', 'align', 'LEFT', 'label', ''
    ),
    jsonb_build_object(
      'font', 'HELVETICA_BOLD', 'fontSizeBp', 10000,
      'color', '#071A33', 'align', 'LEFT', 'label', ''
    ),
    jsonb_build_object(
      'font', 'HELVETICA', 'fontSizeBp', 7500,
      'color', '#071A33', 'align', 'LEFT', 'label', 'Assinante: '
    ),
    jsonb_build_object(
      'font', 'HELVETICA', 'fontSizeBp', 6500,
      'color', '#071A33', 'align', 'LEFT', 'label', 'Data: '
    ),
    jsonb_build_object(
      'font', 'HELVETICA', 'fontSizeBp', 6500,
      'color', '#071A33', 'align', 'LEFT', 'label', 'CPF: '
    ),
    jsonb_build_object(
      'font', 'COURIER', 'fontSizeBp', 5500,
      'color', '#071A33', 'align', 'LEFT', 'label', 'Hash SHA-256: '
    ),
    jsonb_build_object(
      'font', 'COURIER', 'fontSizeBp', 6000,
      'color', '#071A33', 'align', 'LEFT',
      'label', 'Código de verificação: '
    ),
    jsonb_build_object(
      'font', 'HELVETICA', 'fontSizeBp', 5500,
      'color', '#071A33', 'align', 'LEFT', 'label', 'Verifique em: '
    ),
    jsonb_build_object('quietZoneModules', 4),
    jsonb_build_object('color', '#071A33', 'widthBp', 500)
  );
BEGIN
  IF jsonb_typeof(p_template) IS DISTINCT FROM 'object'
     OR (
       SELECT array_agg(entry.key ORDER BY entry.key)
       FROM jsonb_object_keys(p_template) AS entry(key)
     ) IS DISTINCT FROM ARRAY[
       'coordinateSpace', 'elements', 'schemaVersion'
     ]::text[]
     OR jsonb_typeof(p_template -> 'schemaVersion') IS DISTINCT FROM 'number'
     OR p_template ->> 'schemaVersion' IS DISTINCT FROM '1'
     OR jsonb_typeof(p_template -> 'coordinateSpace') IS DISTINCT FROM 'string'
     OR p_template ->> 'coordinateSpace'
        IS DISTINCT FROM 'STAMP_TOP_LEFT_BP_V1'
     OR jsonb_typeof(p_template -> 'elements') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_template -> 'elements') <> 11
  THEN
    RETURN false;
  END IF;

  FOR v_index IN 0..10 LOOP
    v_element := p_template -> 'elements' -> v_index;
    IF jsonb_typeof(v_element) IS DISTINCT FROM 'object'
       OR (
         SELECT array_agg(entry.key ORDER BY entry.key)
         FROM jsonb_object_keys(v_element) AS entry(key)
       ) IS DISTINCT FROM ARRAY[
         'binding', 'heightBp', 'id', 'kind', 'style', 'widthBp',
         'xBp', 'yBp'
       ]::text[]
       OR jsonb_typeof(v_element -> 'id') IS DISTINCT FROM 'string'
       OR v_element ->> 'id' IS DISTINCT FROM v_expected_ids[v_index + 1]
       OR jsonb_typeof(v_element -> 'kind') IS DISTINCT FROM 'string'
       OR v_element ->> 'kind' IS DISTINCT FROM v_expected_kinds[v_index + 1]
       OR jsonb_typeof(v_element -> 'binding') IS DISTINCT FROM 'string'
       OR v_element ->> 'binding'
          IS DISTINCT FROM v_expected_bindings[v_index + 1]
       OR jsonb_typeof(v_element -> 'style') IS DISTINCT FROM 'object'
       -- Valores probatorios e aparencia sao canonicos. O editor so pode
       -- alterar a geometria dos elementos, nunca seu estilo ou rotulo.
       OR v_element -> 'style' IS DISTINCT FROM v_expected_styles -> v_index
       OR jsonb_typeof(v_element -> 'xBp') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_element -> 'yBp') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_element -> 'widthBp') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_element -> 'heightBp') IS DISTINCT FROM 'number'
       OR v_element ->> 'xBp' !~ '^[0-9]+$'
       OR v_element ->> 'yBp' !~ '^[0-9]+$'
       OR v_element ->> 'widthBp' !~ '^[0-9]+$'
       OR v_element ->> 'heightBp' !~ '^[0-9]+$'
    THEN
      RETURN false;
    END IF;

    v_x := (v_element ->> 'xBp')::integer;
    v_y := (v_element ->> 'yBp')::integer;
    v_width := (v_element ->> 'widthBp')::integer;
    v_height := (v_element ->> 'heightBp')::integer;
    IF v_width NOT BETWEEN 1000 AND 100000
       OR v_height NOT BETWEEN 1000 AND 100000
       OR v_x NOT BETWEEN 0 AND 100000 - v_width
       OR v_y NOT BETWEEN 0 AND 100000 - v_height
    THEN
      RETURN false;
    END IF;
    CASE v_element ->> 'kind'
      WHEN 'TEXT' THEN
        NULL;
      WHEN 'IMAGE' THEN
        IF v_width < 5000
           OR v_height < 5000
        THEN
          RETURN false;
        END IF;
      WHEN 'QR' THEN
        IF v_width IS DISTINCT FROM v_height
           OR v_width NOT BETWEEN 29000 AND 40000
        THEN
          RETURN false;
        END IF;
      WHEN 'LINE' THEN
        IF v_width < 5000
        THEN
          RETURN false;
        END IF;
      ELSE
        RETURN false;
    END CASE;
  END LOOP;
  v_qr := p_template -> 'elements' -> 9;
  FOR v_index IN 0..10 LOOP
    IF v_index <> 9 THEN
      v_element := p_template -> 'elements' -> v_index;
      IF (v_qr ->> 'xBp')::integer
           < (v_element ->> 'xBp')::integer + (v_element ->> 'widthBp')::integer
         AND (v_qr ->> 'xBp')::integer + (v_qr ->> 'widthBp')::integer
           > (v_element ->> 'xBp')::integer
         AND (v_qr ->> 'yBp')::integer
           < (v_element ->> 'yBp')::integer + (v_element ->> 'heightBp')::integer
         AND (v_qr ->> 'yBp')::integer + (v_qr ->> 'heightBp')::integer
           > (v_element ->> 'yBp')::integer
      THEN
        RETURN false;
      END IF;
    END IF;
  END LOOP;
  RETURN true;
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RETURN false;
END;
$function$;

-- Geometria v1/v2 continua legivel pelo validador legado. Novos envelopes
-- congelam o template global uma unica vez, sem papel ou slot por signatario.
CREATE OR REPLACE FUNCTION public.assinatura_eletronica_geometria_snapshot_valida(
  p_snapshot jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  v_schema integer;
  v_v2 jsonb;
BEGIN
  IF jsonb_typeof(p_snapshot) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_snapshot -> 'schemaVersion') IS DISTINCT FROM 'number'
     OR p_snapshot ->> 'schemaVersion' !~ '^[123]$'
  THEN
    RETURN false;
  END IF;
  v_schema := (p_snapshot ->> 'schemaVersion')::integer;
  IF v_schema = 1 THEN
    IF (
         SELECT array_agg(entry.key ORDER BY entry.key)
         FROM jsonb_object_keys(p_snapshot) AS entry(key)
       ) IS DISTINCT FROM ARRAY[
         'assetId', 'assetSnapshot', 'coordinateSpace', 'layout',
         'schemaVersion', 'slots'
       ]::text[]
    THEN
      RETURN false;
    END IF;
    v_v2 := (p_snapshot - 'schemaVersion') || jsonb_build_object(
      'schemaVersion', 2,
      'contentLayout', jsonb_build_object(
        'sealScalePercent', 100,
        'lineSpacingPercent', 100,
        'qrScalePercent', 100
      )
    );
    RETURN public.assinatura_eletronica_geometria_v2_valida(v_v2);
  END IF;
  IF v_schema = 2 THEN
    RETURN public.assinatura_eletronica_geometria_v2_valida(p_snapshot);
  END IF;

  IF (
       SELECT array_agg(entry.key ORDER BY entry.key)
       FROM jsonb_object_keys(p_snapshot) AS entry(key)
     ) IS DISTINCT FROM ARRAY[
       'assetId', 'assetSnapshot', 'autoLayout', 'coordinateSpace',
       'schemaVersion', 'template'
     ]::text[]
     OR p_snapshot ->> 'coordinateSpace'
        IS DISTINCT FROM 'PAGE_TOP_LEFT_BP_V1'
     OR jsonb_typeof(p_snapshot -> 'assetId') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_snapshot -> 'assetSnapshot') IS DISTINCT FROM 'object'
     OR NOT public.assinatura_eletronica_template_carimbo_v5_valido(
       p_snapshot -> 'template'
     )
     OR NOT public.assinatura_eletronica_auto_layout_carimbo_v5_valido(
       p_snapshot -> 'autoLayout'
     )
  THEN
    RETURN false;
  END IF;
  RETURN p_snapshot ->> 'assetId'
      ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND jsonb_typeof(p_snapshot -> 'assetSnapshot') = 'object'
    AND p_snapshot -> 'assetSnapshot' ->> 'assetId'
      IS NOT DISTINCT FROM p_snapshot ->> 'assetId'
    AND p_snapshot -> 'assetSnapshot' ->> 'sha256' ~ '^[0-9a-f]{64}$';
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RETURN false;
END;
$function$;

ALTER FUNCTION public.assinatura_eletronica_congelar_geometria_v2()
  RENAME TO assinatura_eletronica_congelar_geometria_v2_legacy;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_congelar_geometria_v3()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_editor jsonb;
  v_policy_editor jsonb;
  v_global_politica public.assinatura_eletronica_politicas%ROWTYPE;
  v_global_editor jsonb;
  v_global_geometry jsonb;
  v_input_schema integer;
BEGIN
  IF NEW.documento <> 'diario_classe' THEN
    RETURN NEW;
  END IF;
  v_policy_editor := NEW.politica_snapshot -> 'editor';
  IF jsonb_typeof(v_policy_editor) IS DISTINCT FROM 'object'
     OR jsonb_typeof(v_policy_editor -> 'schemaVersion')
        IS DISTINCT FROM 'number'
     OR v_policy_editor ->> 'schemaVersion' !~ '^[45]$'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'ASSINATURA_POLITICA_EDITOR_TRANSICAO_V5_INVALIDO';
  END IF;
  v_editor := public.assinatura_eletronica_normalizar_editor(v_policy_editor);
  IF v_editor ->> 'schemaVersion' IS DISTINCT FROM '5'
     OR (
       v_policy_editor ->> 'schemaVersion' = '5'
       AND v_editor IS DISTINCT FROM v_policy_editor
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'ASSINATURA_POLITICA_EDITOR_V5_INVALIDO';
  END IF;

  -- A politica do Diario continua sendo o vinculo juridico do envelope. O
  -- desenho do carimbo, contudo, e sempre lido da unica politica global para
  -- que nenhuma copia por polo/papel possa alterar a assinatura futura.
  SELECT politica.*
  INTO v_global_politica
  FROM public.assinatura_eletronica_politicas AS politica
  WHERE politica.documento = 'MODELO_PADRAO'
    AND politica.polo_id IS NULL
    AND politica.arquivada_em IS NULL
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'ASSINATURA_MODELO_PADRAO_CARIMBO_V5_INDISPONIVEL';
  END IF;
  v_global_editor := public.assinatura_eletronica_normalizar_editor(
    v_global_politica.politica -> 'editor'
  );
  v_global_geometry := jsonb_build_object(
    'schemaVersion', 3,
    'coordinateSpace', 'PAGE_TOP_LEFT_BP_V1',
    'assetId', v_global_editor -> 'signatureStamp' -> 'assetId',
    'assetSnapshot', coalesce(
      v_global_politica.politica -> 'signatureStampAssetSnapshot',
      'null'::jsonb
    ),
    'template', v_global_editor -> 'signatureStamp' -> 'template',
    'autoLayout', v_global_editor -> 'signatureStamp' -> 'autoLayout'
  );
  IF v_global_politica.politica -> 'editor' ->> 'schemaVersion'
       IS DISTINCT FROM '5'
     OR v_global_editor IS DISTINCT FROM v_global_politica.politica -> 'editor'
     OR v_global_editor ->> 'schemaVersion' IS DISTINCT FROM '5'
     OR NOT public.assinatura_eletronica_geometria_snapshot_valida(
       v_global_geometry
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'ASSINATURA_MODELO_PADRAO_CARIMBO_V5_INVALIDO';
  END IF;

  IF jsonb_typeof(NEW.geometria_snapshot) IS DISTINCT FROM 'object'
     OR jsonb_typeof(NEW.geometria_snapshot -> 'schemaVersion')
        IS DISTINCT FROM 'number'
     OR NEW.geometria_snapshot ->> 'schemaVersion' !~ '^[123]$'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'ASSINATURA_GEOMETRIA_V3_INVALIDA';
  END IF;
  v_input_schema := (NEW.geometria_snapshot ->> 'schemaVersion')::integer;

  IF v_input_schema = 3 THEN
    IF NOT public.assinatura_eletronica_geometria_snapshot_valida(
         NEW.geometria_snapshot
       )
       OR NEW.geometria_snapshot IS DISTINCT FROM v_global_geometry
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'ASSINATURA_GEOMETRIA_V3_DIVERGENTE';
    END IF;
  ELSIF v_input_schema = 1 THEN
    -- Compatibilidade transitoria com a RPC anterior. Uma politica diaria v4
    -- preservada por envelope historico ainda emite seu adaptador v1; os
    -- campos legados precisam coincidir com o snapshot da politica e sao
    -- descartados antes de o template global v3 ser congelado.
    IF (
         SELECT array_agg(entry.key ORDER BY entry.key)
         FROM jsonb_object_keys(NEW.geometria_snapshot) AS entry(key)
       ) IS DISTINCT FROM ARRAY[
         'assetId', 'assetSnapshot', 'coordinateSpace', 'layout',
         'schemaVersion', 'slots'
       ]::text[]
       OR NEW.geometria_snapshot ->> 'coordinateSpace'
          IS DISTINCT FROM 'PAGE_TOP_LEFT_BP_V1'
       OR NEW.geometria_snapshot -> 'assetId'
          IS DISTINCT FROM v_editor -> 'signatureStamp' -> 'assetId'
       OR NEW.geometria_snapshot -> 'assetSnapshot'
          IS DISTINCT FROM coalesce(
            NEW.politica_snapshot -> 'signatureStampAssetSnapshot',
            'null'::jsonb
          )
       OR (NEW.geometria_snapshot -> 'layout') IS DISTINCT FROM (
         CASE
           WHEN (v_policy_editor ->> 'schemaVersion') = '4'
             THEN (v_policy_editor -> 'signatureStamp' -> 'layout')
           ELSE 'null'::jsonb
         END
       )
       OR (NEW.geometria_snapshot -> 'slots') IS DISTINCT FROM (
         CASE
           WHEN (v_policy_editor ->> 'schemaVersion') = '4'
             THEN (v_policy_editor -> 'signatureStamp' -> 'slots')
           ELSE 'null'::jsonb
         END
       )
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'ASSINATURA_GEOMETRIA_V1_ADAPTADOR_DIVERGENTE';
    END IF;
  ELSE
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'ASSINATURA_GEOMETRIA_V2_NAO_AUTORIZADA_PARA_EDITOR_V5';
  END IF;

  -- O snapshot ja congelado e a unica copia material do desenho global: ele
  -- torna o artefato historico verificavel sem reusar a configuracao atual.
  NEW.geometria_snapshot := v_global_geometry;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS assinatura_eletronica_envelopes_00_geometry_v2_before_insert
  ON public.assinatura_eletronica_envelopes;
CREATE TRIGGER assinatura_eletronica_envelopes_00_geometry_v3_before_insert
  BEFORE INSERT ON public.assinatura_eletronica_envelopes
  FOR EACH ROW
  EXECUTE FUNCTION public.assinatura_eletronica_congelar_geometria_v3();

-- A fonte institucional e escolhida no banco, pelo id canonico de Modelos
-- Documentos. O hash do snapshot e recalculado antes da constraint.
CREATE OR REPLACE FUNCTION public.assinatura_eletronica_congelar_marca_landscape_diario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_template public.documentos_templates%ROWTYPE;
  v_source text;
BEGIN
  IF NEW.documento <> 'diario_classe' THEN
    RETURN NEW;
  END IF;
  SELECT template.*
  INTO v_template
  FROM public.documentos_templates AS template
  WHERE template.id = 'watermark_landscape_' || NEW.polo_id::text
  FOR KEY SHARE;
  v_source := v_template.conteudo ->> 'url';
  IF NOT FOUND
     OR jsonb_typeof(v_template.conteudo) IS DISTINCT FROM 'object'
     OR NOT public.assinatura_eletronica_marca_landscape_data_uri_valida(
       v_source
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'ASSINATURA_DIARIO_MARCA_LANDSCAPE_CANONICA_INDISPONIVEL';
  END IF;
  NEW.documento_snapshot := pg_catalog.jsonb_set(
    NEW.documento_snapshot,
    ARRAY['institutionalIdentity', 'watermarkUrl'],
    pg_catalog.to_jsonb(v_source),
    false
  );
  NEW.documento_snapshot := pg_catalog.jsonb_set(
    NEW.documento_snapshot,
    ARRAY['assetSources', 'watermarkUrl'],
    pg_catalog.to_jsonb(v_source),
    false
  );
  IF NOT public.assinatura_eletronica_snapshot_academico_diario_valido(
    NEW.documento_snapshot
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'ASSINATURA_DIARIO_SNAPSHOT_MARCA_LANDSCAPE_INVALIDO';
  END IF;
  NEW.academico_snapshot_sha256 :=
    public.assinatura_eletronica_sha256_json(NEW.documento_snapshot);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS assinatura_eletronica_envelopes_00_brand_v5_before_insert
  ON public.assinatura_eletronica_envelopes;
CREATE TRIGGER assinatura_eletronica_envelopes_00_brand_v5_before_insert
  BEFORE INSERT ON public.assinatura_eletronica_envelopes
  FOR EACH ROW
  EXECUTE FUNCTION public.assinatura_eletronica_congelar_marca_landscape_diario();

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
      AND public.assinatura_eletronica_geometria_snapshot_valida(
        geometria_snapshot
      )
    ) NOT VALID;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_preview_identidade_matriz()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_matrix_count integer;
  v_brand record;
  v_logo_url text;
  v_watermark_url text;
BEGIN
  SELECT count(*)
  INTO v_matrix_count
  FROM public.polos AS pole
  JOIN public.empresas AS company ON company.id = pole.company_id
  JOIN public.documentos_templates AS marca
    ON marca.id = 'watermark_landscape_' || pole.id::text
  WHERE coalesce(pole.is_matriz, false)
    AND lower(coalesce(pole.status, '')) = 'ativo'
    AND coalesce(company.ativo, false)
    AND jsonb_typeof(marca.conteudo) = 'object';
  IF v_matrix_count <> 1 THEN
    RAISE EXCEPTION
      'A previa exige uma matriz ativa com watermark_landscape_<polo_id>; foram encontradas %.',
      v_matrix_count
      USING ERRCODE = '55000';
  END IF;

  SELECT
    coalesce(nullif(btrim(pole.nome), ''), nullif(btrim(company.nome_fantasia), '')) AS name,
    coalesce(nullif(btrim(pole.cnpj), ''), nullif(btrim(company.cnpj), '')) AS cnpj,
    coalesce(nullif(btrim(pole.endereco), ''), nullif(btrim(company.endereco), '')) AS address,
    coalesce(nullif(btrim(pole.numero), ''), nullif(btrim(company.numero), '')) AS number,
    coalesce(nullif(btrim(pole.complemento), ''), nullif(btrim(company.complemento), '')) AS complement,
    coalesce(nullif(btrim(pole.bairro), ''), nullif(btrim(company.bairro), '')) AS neighborhood,
    coalesce(nullif(btrim(pole.cidade), ''), nullif(btrim(company.cidade), '')) AS city,
    coalesce(nullif(btrim(pole.estado), ''), nullif(btrim(company.uf), '')) AS state,
    coalesce(nullif(btrim(pole.cep), ''), nullif(btrim(company.cep), '')) AS postal_code,
    coalesce(nullif(btrim(pole.telefone), ''), nullif(btrim(company.telefone), '')) AS phone,
    coalesce(nullif(btrim(pole.logo_url), ''), nullif(btrim(company.logo_url), '')) AS logo_url,
    marca.conteudo ->> 'url' AS watermark_url
  INTO v_brand
  FROM public.polos AS pole
  JOIN public.empresas AS company ON company.id = pole.company_id
  JOIN public.documentos_templates AS marca
    ON marca.id = 'watermark_landscape_' || pole.id::text
  WHERE coalesce(pole.is_matriz, false)
    AND lower(coalesce(pole.status, '')) = 'ativo'
    AND coalesce(company.ativo, false)
    AND jsonb_typeof(marca.conteudo) = 'object';

  IF coalesce(v_brand.name, '') = '' THEN
    RAISE EXCEPTION 'A matriz ativa nao possui nome institucional para a previa.'
      USING ERRCODE = '22023';
  END IF;
  v_logo_url := v_brand.logo_url;
  v_watermark_url := v_brand.watermark_url;
  IF v_logo_url IS NOT NULL
     AND (
       char_length(v_logo_url) > 16777216
       OR (
         v_logo_url !~* '^https://'
         AND v_logo_url !~* '^data:image/(png|jpe?g|webp);base64,'
       )
     )
  THEN
    RAISE EXCEPTION 'O logotipo da matriz nao usa uma origem autorizada.'
      USING ERRCODE = '22023';
  END IF;
  IF NOT public.assinatura_eletronica_marca_landscape_data_uri_valida(
       v_watermark_url
     )
  THEN
    RAISE EXCEPTION 'A marca landscape da matriz nao usa uma origem autorizada.'
      USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'institution', jsonb_build_object(
      'name', v_brand.name,
      'legalName', '',
      'cnpj', coalesce(v_brand.cnpj, ''),
      'address', coalesce(v_brand.address, ''),
      'number', coalesce(v_brand.number, ''),
      'complement', coalesce(v_brand.complement, ''),
      'neighborhood', coalesce(v_brand.neighborhood, ''),
      'city', coalesce(v_brand.city, ''),
      'state', coalesce(v_brand.state, ''),
      'postalCode', coalesce(v_brand.postal_code, ''),
      'phone', coalesce(v_brand.phone, ''),
      'email', 'universo.cursoseconsultoria@gmail.com',
      'isHeadquarters', true
    ),
    'logoUrl', v_logo_url,
    'watermarkUrl', v_watermark_url
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_editor_v5_para_v2_legacy(
  p_editor_v5 jsonb
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  -- A API v2 exige um objeto watermark, mas este adaptador e sempre
  -- desabilitado e removido antes da persistencia v5. A marca renderizada vem
  -- exclusivamente de watermark_landscape_<polo_id> no snapshot do Diario.
  SELECT jsonb_build_object(
    'schemaVersion', 2,
    'pages', jsonb_build_array(
      (p_editor_v5 -> 'pages' -> 0) || jsonb_build_object(
        'watermark', jsonb_build_object(
          'enabled', false,
          'source', 'TEXT',
          'label', 'ADAPTADOR_DESABILITADO',
          'assetId', NULL,
          'opacity', 0.08,
          'scalePercent', 60,
          'rotationDegrees', -45
        )
      ),
      (p_editor_v5 -> 'pages' -> 1) || jsonb_build_object(
        'watermark', jsonb_build_object(
          'enabled', false,
          'source', 'TEXT',
          'label', 'ADAPTADOR_DESABILITADO',
          'assetId', NULL,
          'opacity', 0.08,
          'scalePercent', 60,
          'rotationDegrees', -45
        )
      )
    )
  );
$function$;

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
  v_legacy_config jsonb;
  v_stamp_asset_id uuid;
  v_stamp_asset public.assinatura_eletronica_modelo_assets%ROWTYPE;
  v_stamp_snapshot jsonb := 'null'::jsonb;
  v_replay public.assinatura_eletronica_politicas%ROWTYPE;
  v_resultado public.assinatura_eletronica_politicas%ROWTYPE;
BEGIN
  IF NOT public.assinatura_eletronica_autoriza_configuracao(p_polo_id) THEN
    RAISE EXCEPTION 'Acesso nao autorizado para configurar assinatura eletronica.'
      USING ERRCODE = '42501';
  END IF;
  IF v_documento <> 'MODELO_PADRAO' THEN
    RAISE EXCEPTION 'Politicas por documento permanecem bloqueadas nesta fundacao.'
      USING ERRCODE = '55000';
  END IF;
  IF p_polo_id IS NOT NULL THEN
    RAISE EXCEPTION 'MODELO_PADRAO e uma configuracao global.'
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
     OR jsonb_typeof(p_configuracao -> 'expectedVersion')
        IS DISTINCT FROM 'number'
     OR p_configuracao ->> 'expectedVersion' !~ '^[0-9]+$'
  THEN
    RAISE EXCEPTION 'Configuracao de assinatura invalida.'
      USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_expected_version := (p_configuracao ->> 'expectedVersion')::integer;
  EXCEPTION WHEN numeric_value_out_of_range THEN
    RAISE EXCEPTION 'A versao-base do modelo excedeu o intervalo permitido.'
      USING ERRCODE = '22023';
  END;
  IF v_expected_version < 0 OR v_expected_version = 2147483647 THEN
    RAISE EXCEPTION 'A versao-base do modelo e invalida.'
      USING ERRCODE = '22023';
  END IF;

  v_editor := public.assinatura_eletronica_normalizar_editor(
    p_configuracao -> 'editor'
  );
  IF jsonb_typeof(v_editor -> 'signatureStamp' -> 'assetId')
       IS DISTINCT FROM 'string'
  THEN
    RAISE EXCEPTION 'O modelo global exige uma imagem de carimbo pronta antes de salvar.'
      USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'assinatura-carimbo-request:' || v_request_id::text,
      0
    )
  );

  v_stamp_asset_id :=
    (v_editor -> 'signatureStamp' ->> 'assetId')::uuid;
  SELECT asset.*
  INTO v_stamp_asset
  FROM public.assinatura_eletronica_modelo_assets AS asset
  WHERE asset.id = v_stamp_asset_id
    AND asset.status = 'PRONTO'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'A imagem do carimbo nao existe ou nao esta disponivel.'
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
      RAISE EXCEPTION 'A chave de idempotencia ja foi usada com dados diferentes.'
        USING ERRCODE = '22023';
    END IF;
    RETURN public.assinatura_eletronica_apresentar_configuracao(v_replay);
  END IF;

  v_legacy_config := pg_catalog.jsonb_set(
    p_configuracao,
    '{editor}',
    public.assinatura_eletronica_editor_v5_para_v2_legacy(v_editor),
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
    RAISE EXCEPTION 'A versao visual v5 nao preservou o bloqueio juridico.'
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
  RETURN public.assinatura_eletronica_apresentar_configuracao(v_resultado);
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_auto_layout_carimbo_v5_valido(
  p_layout jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
BEGIN
  IF jsonb_typeof(p_layout) IS DISTINCT FROM 'object'
     OR (
       SELECT array_agg(entry.key ORDER BY entry.key)
       FROM jsonb_object_keys(p_layout) AS entry(key)
     ) IS DISTINCT FROM ARRAY[
       'columns', 'coordinateSpace', 'gapBp', 'heightBp', 'marginBp',
       'maxSigners', 'pageTarget', 'schemaVersion', 'widthBp'
     ]::text[]
     OR jsonb_typeof(p_layout -> 'schemaVersion') IS DISTINCT FROM 'number'
     OR jsonb_typeof(p_layout -> 'pageTarget') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_layout -> 'coordinateSpace') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_layout -> 'columns') IS DISTINCT FROM 'number'
     OR jsonb_typeof(p_layout -> 'widthBp') IS DISTINCT FROM 'number'
     OR jsonb_typeof(p_layout -> 'heightBp') IS DISTINCT FROM 'number'
     OR jsonb_typeof(p_layout -> 'gapBp') IS DISTINCT FROM 'number'
     OR jsonb_typeof(p_layout -> 'marginBp') IS DISTINCT FROM 'number'
     OR jsonb_typeof(p_layout -> 'maxSigners') IS DISTINCT FROM 'number'
  THEN
    RETURN false;
  END IF;
  RETURN p_layout ->> 'schemaVersion' = '1'
    AND p_layout ->> 'pageTarget' = 'LAST_PAGE'
    AND p_layout ->> 'coordinateSpace' = 'PAGE_TOP_LEFT_BP_V1'
    AND p_layout ->> 'columns' = '2'
    AND p_layout ->> 'widthBp' = '38000'
    AND p_layout ->> 'heightBp' = '14000'
    AND p_layout ->> 'gapBp' = '2000'
    AND p_layout ->> 'marginBp' = '2000'
    -- O comprovante atual comporta no maximo seis cartoes. A regra visual e
    -- o transporte de finalizacao compartilham este mesmo limite fechado.
    AND p_layout ->> 'maxSigners' = '6';
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RETURN false;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_template_carimbo_v5_padrao()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT jsonb_build_object(
    'schemaVersion', 1,
    'coordinateSpace', 'STAMP_TOP_LEFT_BP_V1',
    'elements', jsonb_build_array(
      jsonb_build_object(
        'id', 'seal', 'kind', 'IMAGE', 'binding', 'STAMP_ASSET',
        'xBp', 2000, 'yBp', 18000, 'widthBp', 19000, 'heightBp', 64000,
        'style', jsonb_build_object('fit', 'CONTAIN', 'opacityBp', 100000)
      ),
      jsonb_build_object(
        'id', 'signerRole', 'kind', 'TEXT', 'binding', 'SIGNER_ROLE',
        'xBp', 23000, 'yBp', 3000, 'widthBp', 48000, 'heightBp', 9000,
        'style', jsonb_build_object(
          'font', 'HELVETICA_BOLD', 'fontSizeBp', 9000,
          'color', '#071A33', 'align', 'LEFT', 'label', ''
        )
      ),
      jsonb_build_object(
        'id', 'title', 'kind', 'TEXT', 'binding', 'DISPLAY_TITLE',
        'xBp', 23000, 'yBp', 14000, 'widthBp', 48000, 'heightBp', 10000,
        'style', jsonb_build_object(
          'font', 'HELVETICA_BOLD', 'fontSizeBp', 10000,
          'color', '#071A33', 'align', 'LEFT', 'label', ''
        )
      ),
      jsonb_build_object(
        'id', 'signerName', 'kind', 'TEXT', 'binding', 'SIGNER_NAME',
        'xBp', 23000, 'yBp', 29000, 'widthBp', 48000, 'heightBp', 9000,
        'style', jsonb_build_object(
          'font', 'HELVETICA', 'fontSizeBp', 7500,
          'color', '#071A33', 'align', 'LEFT', 'label', 'Assinante: '
        )
      ),
      jsonb_build_object(
        'id', 'signedAt', 'kind', 'TEXT', 'binding', 'SIGNED_AT',
        'xBp', 23000, 'yBp', 40000, 'widthBp', 48000, 'heightBp', 8000,
        'style', jsonb_build_object(
          'font', 'HELVETICA', 'fontSizeBp', 6500,
          'color', '#071A33', 'align', 'LEFT', 'label', 'Data: '
        )
      ),
      jsonb_build_object(
        'id', 'signerCpfMasked', 'kind', 'TEXT',
        'binding', 'SIGNER_CPF_MASKED',
        'xBp', 23000, 'yBp', 50000, 'widthBp', 48000, 'heightBp', 8000,
        'style', jsonb_build_object(
          'font', 'HELVETICA', 'fontSizeBp', 6500,
          'color', '#071A33', 'align', 'LEFT', 'label', 'CPF: '
        )
      ),
      jsonb_build_object(
        'id', 'signatureHash', 'kind', 'TEXT', 'binding', 'SIGNATURE_HASH',
        'xBp', 23000, 'yBp', 59000, 'widthBp', 48000, 'heightBp', 14000,
        'style', jsonb_build_object(
          'font', 'COURIER', 'fontSizeBp', 5500,
          'color', '#071A33', 'align', 'LEFT', 'label', 'Hash SHA-256: '
        )
      ),
      jsonb_build_object(
        'id', 'verificationCode', 'kind', 'TEXT',
        'binding', 'VERIFICATION_CODE',
        'xBp', 23000, 'yBp', 74000, 'widthBp', 48000, 'heightBp', 7000,
        'style', jsonb_build_object(
          'font', 'COURIER', 'fontSizeBp', 6000,
          'color', '#071A33', 'align', 'LEFT',
          'label', 'Código de verificação: '
        )
      ),
      jsonb_build_object(
        'id', 'verificationUrl', 'kind', 'TEXT', 'binding', 'VERIFICATION_URL',
        'xBp', 23000, 'yBp', 83000, 'widthBp', 48000, 'heightBp', 14000,
        'style', jsonb_build_object(
          'font', 'HELVETICA', 'fontSizeBp', 5500,
          'color', '#071A33', 'align', 'LEFT', 'label', 'Verifique em: '
        )
      ),
      jsonb_build_object(
        'id', 'verificationQr', 'kind', 'QR', 'binding', 'VERIFICATION_URL',
        'xBp', 71000, 'yBp', 29000, 'widthBp', 29000, 'heightBp', 29000,
        'style', jsonb_build_object('quietZoneModules', 4)
      ),
      jsonb_build_object(
        'id', 'divider', 'kind', 'LINE', 'binding', 'DECORATIVE',
        'xBp', 23000, 'yBp', 26000, 'widthBp', 48000, 'heightBp', 1000,
        'style', jsonb_build_object('color', '#071A33', 'widthBp', 500)
      )
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_editor_v5_a_partir_v4(
  p_editor jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  v_v4 jsonb;
  v_auto_layout jsonb := jsonb_build_object(
    'schemaVersion', 1,
    'pageTarget', 'LAST_PAGE',
    'coordinateSpace', 'PAGE_TOP_LEFT_BP_V1',
    'columns', 2,
    'widthBp', 38000,
    'heightBp', 14000,
    'gapBp', 2000,
    'marginBp', 2000,
    'maxSigners', 6
  );
BEGIN
  v_v4 := public.assinatura_eletronica_normalizar_editor_v4_institutional_legacy(
    p_editor
  );
  RETURN jsonb_build_object(
    'schemaVersion', 5,
    'pages', v_v4 -> 'pages',
    'signatureStamp', jsonb_build_object(
      'enabled', false,
      'canonicalLabel', 'Documento assinado eletronicamente',
      'assetId', v_v4 -> 'signatureStamp' -> 'assetId',
      'template', public.assinatura_eletronica_template_carimbo_v5_padrao(),
      'autoLayout', v_auto_layout
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_editor_padrao()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT public.assinatura_eletronica_editor_v5_a_partir_v4(
    public.assinatura_eletronica_editor_padrao_v4_institutional_legacy()
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
  v_stamp jsonb;
  v_asset_id text;
  v_legacy_v4 jsonb;
  v_normalized_v4 jsonb;
BEGIN
  IF p_editor IS NULL THEN
    RETURN public.assinatura_eletronica_editor_padrao();
  END IF;
  IF jsonb_typeof(p_editor) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_editor -> 'schemaVersion') IS DISTINCT FROM 'number'
     OR p_editor ->> 'schemaVersion' !~ '^[12345]$'
  THEN
    RAISE EXCEPTION 'O editor deve usar o schema 1, 2, 3, 4 ou 5.'
      USING ERRCODE = '22023';
  END IF;
  v_schema := (p_editor ->> 'schemaVersion')::integer;
  IF v_schema <= 4 THEN
    RETURN public.assinatura_eletronica_editor_v5_a_partir_v4(p_editor);
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
    RAISE EXCEPTION 'O editor v5 nao corresponde ao contrato autorizado.'
      USING ERRCODE = '22023';
  END IF;

  v_stamp := p_editor -> 'signatureStamp';
  IF (
       SELECT array_agg(entry.key ORDER BY entry.key)
       FROM jsonb_object_keys(v_stamp) AS entry(key)
     ) IS DISTINCT FROM ARRAY[
       'assetId', 'autoLayout', 'canonicalLabel', 'enabled', 'template'
     ]::text[]
     OR jsonb_typeof(v_stamp -> 'enabled') IS DISTINCT FROM 'boolean'
     OR v_stamp -> 'enabled' IS DISTINCT FROM 'false'::jsonb
     OR v_stamp ->> 'canonicalLabel'
        IS DISTINCT FROM 'Documento assinado eletronicamente'
     OR jsonb_typeof(v_stamp -> 'assetId') NOT IN ('null', 'string')
     OR NOT public.assinatura_eletronica_template_carimbo_v5_valido(
       v_stamp -> 'template'
     )
     OR NOT public.assinatura_eletronica_auto_layout_carimbo_v5_valido(
       v_stamp -> 'autoLayout'
     )
  THEN
    RAISE EXCEPTION 'O template global do carimbo v5 e invalido.'
      USING ERRCODE = '22023';
  END IF;

  v_asset_id := CASE
    WHEN jsonb_typeof(v_stamp -> 'assetId') = 'string'
      THEN lower(btrim(v_stamp ->> 'assetId'))
    ELSE NULL
  END;
  IF v_asset_id IS NOT NULL
     AND v_asset_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION 'A imagem do carimbo exige um ativo autorizado.'
      USING ERRCODE = '22023';
  END IF;

  -- O contrato v4 e usado apenas para validar as duas paginas canonicas. O
  -- carimbo legado interno nao e persistido nem define o layout v5.
  v_legacy_v4 := jsonb_build_object(
    'schemaVersion', 4,
    'pages', p_editor -> 'pages',
    'signatureStamp', (
      public.assinatura_eletronica_editor_padrao_v4_institutional_legacy()
        -> 'signatureStamp'
    ) || jsonb_build_object(
      'assetId', CASE
        WHEN v_asset_id IS NULL THEN 'null'::jsonb
        ELSE pg_catalog.to_jsonb(v_asset_id)
      END
    )
  );
  v_normalized_v4 :=
    public.assinatura_eletronica_normalizar_editor_v4_institutional_legacy(
      v_legacy_v4
    );
  RETURN jsonb_build_object(
    'schemaVersion', 5,
    'pages', v_normalized_v4 -> 'pages',
    'signatureStamp', jsonb_build_object(
      'enabled', false,
      'canonicalLabel', 'Documento assinado eletronicamente',
      'assetId', v_normalized_v4 -> 'signatureStamp' -> 'assetId',
      'template', v_stamp -> 'template',
      'autoLayout', v_stamp -> 'autoLayout'
    )
  );
END;
$function$;

-- A RPC anterior e preservada estruturalmente, mas sua unica fonte de
-- watermark passa a ser o registro landscape do polo. Cada substituicao tem
-- cardinalidade 1; qualquer drift aborta a migration.
DO $migration$
DECLARE
  v_definition text;
  v_patched text;
  v_occurrences integer;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.assinatura_eletronica_solicitar_envelope_diario(uuid,uuid,text,uuid,uuid)'::regprocedure
  ) INTO v_definition;

  v_old := E'  v_template public.documentos_templates%ROWTYPE;\n  v_professor public.parceiros%ROWTYPE;';
  v_new := E'  v_template public.documentos_templates%ROWTYPE;\n  v_watermark_template public.documentos_templates%ROWTYPE;\n  v_professor public.parceiros%ROWTYPE;';
  v_occurrences := (
    pg_catalog.length(v_definition)
      - pg_catalog.length(pg_catalog.replace(v_definition, v_old, ''))
  ) / pg_catalog.length(v_old);
  IF v_occurrences <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_DIARIO_LANDSCAPE_DECLARACAO_DRIFT';
  END IF;
  v_patched := pg_catalog.replace(v_definition, v_old, v_new);

  v_old := E'  SELECT template.* INTO v_template\n  FROM public.documentos_templates AS template\n  WHERE template.id = \'diario_\' || upper(v_curso.modalidade)\n  FOR SHARE;\n  IF v_polo.id IS NULL OR v_empresa.id IS NULL OR v_curso.id IS NULL\n     OR v_disciplina.id IS NULL OR v_modulo.id IS NULL OR v_template.id IS NULL\n  THEN';
  v_new := E'  SELECT template.* INTO v_template\n  FROM public.documentos_templates AS template\n  WHERE template.id = \'diario_\' || upper(v_curso.modalidade)\n  FOR SHARE;\n  SELECT template.* INTO v_watermark_template\n  FROM public.documentos_templates AS template\n  WHERE template.id = \'watermark_landscape_\' || v_polo.id::text\n  FOR SHARE;\n  IF v_polo.id IS NULL OR v_empresa.id IS NULL OR v_curso.id IS NULL\n     OR v_disciplina.id IS NULL OR v_modulo.id IS NULL OR v_template.id IS NULL\n     OR v_watermark_template.id IS NULL\n     OR jsonb_typeof(v_watermark_template.conteudo) IS DISTINCT FROM \'object\'\n     OR NOT public.assinatura_eletronica_marca_landscape_data_uri_valida(\n       v_watermark_template.conteudo ->> \'url\'\n     )\n  THEN';
  v_occurrences := (
    pg_catalog.length(v_patched)
      - pg_catalog.length(pg_catalog.replace(v_patched, v_old, ''))
  ) / pg_catalog.length(v_old);
  IF v_occurrences <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_DIARIO_LANDSCAPE_LOOKUP_DRIFT';
  END IF;
  v_patched := pg_catalog.replace(v_patched, v_old, v_new);

  v_old := E'    \'watermarkUrl\', coalesce(\n      nullif(btrim(v_polo.watermark_url), \'\'),\n      nullif(btrim(v_empresa.watermark_url), \'\')\n    )';
  v_new := E'    \'watermarkUrl\', v_watermark_template.conteudo ->> \'url\'';
  v_occurrences := (
    pg_catalog.length(v_patched)
      - pg_catalog.length(pg_catalog.replace(v_patched, v_old, ''))
  ) / pg_catalog.length(v_old);
  IF v_occurrences <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_DIARIO_LANDSCAPE_SOURCE_DRIFT';
  END IF;
  v_patched := pg_catalog.replace(v_patched, v_old, v_new);

  IF v_patched IS NOT DISTINCT FROM v_definition
     OR v_patched ~ 'v_polo[.]watermark_url|v_empresa[.]watermark_url'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_DIARIO_LANDSCAPE_PATCH_INCOMPLETO';
  END IF;
  EXECUTE v_patched;
END;
$migration$;

-- Cada politica ativa do Diario recebe uma versao v5 apenas para preservar seu
-- contrato juridico e a compatibilidade da solicitacao legada. O freezer de
-- geometria busca o carimbo no MODELO_PADRAO no momento do novo envelope; a
-- politica por polo nao e autoridade visual nem cria uma copia futura.
DO $migration$
DECLARE
  v_old public.assinatura_eletronica_politicas%ROWTYPE;
  v_new_id uuid;
  v_new_policy jsonb;
  v_now timestamptz := statement_timestamp();
BEGIN
  FOR v_old IN
    SELECT politica.*
    FROM public.assinatura_eletronica_politicas AS politica
    WHERE politica.documento = 'diario_classe'
      AND politica.arquivada_em IS NULL
      -- Arquivar a politica referenciada quebraria o finalizador legado.
      -- Ela permanece intocada enquanto for suporte de qualquer snapshot.
      AND NOT EXISTS (
        SELECT 1
        FROM public.assinatura_eletronica_envelopes AS envelope
        WHERE envelope.politica_id = politica.id
      )
    ORDER BY politica.polo_id, politica.versao
    FOR UPDATE
  LOOP
    v_new_policy := (
      v_old.politica
        - 'watermarkAssetSnapshots'
        - 'institutionalWatermark'
        - 'signatureStampAssetSnapshot'
    ) || jsonb_build_object(
      'versionLabel', 'Versao ' || (v_old.versao + 1)::text,
      -- A politica diaria preserva paginas e gates juridicos, mas nao possui
      -- asset/template proprio: novos envelopes congelam o MODELO_PADRAO.
      'editor', pg_catalog.jsonb_set(
        public.assinatura_eletronica_normalizar_editor(
          v_old.politica -> 'editor'
        ),
        '{signatureStamp,assetId}',
        'null'::jsonb,
        false
      )
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
  END LOOP;
END;
$migration$;

-- A migration aplicada de provas individuais permanece restrita ao piloto de
-- dois papeis. Estes validadores v5 leem a mesma cadeia imutavel, mas levam a
-- cardinalidade do transporte ao limite do template global (1..6), sem
-- reinterpretar snapshots ou alterar as provas historicas. A autorizacao
-- juridica corrente continua no helper aplicado do Diario.
CREATE OR REPLACE FUNCTION public.assinatura_eletronica_eventos_assinatura_diario_v5_validados(
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
  v_total_participants integer;
  v_signed_participants integer;
  v_min_order integer;
  v_max_order integer;
  v_distinct_orders integer;
  v_event_count integer;
  v_valid_count integer;
  v_valid_participant_count integer;
  v_result jsonb;
BEGIN
  IF NOT public.assinatura_eletronica_cadeia_eventos_valida(p_envelope_id) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_CADEIA_EVENTOS_INVALIDA';
  END IF;

  SELECT
    count(*),
    count(*) FILTER (WHERE participante.status = 'ASSINADO'),
    min(participante.ordem),
    max(participante.ordem),
    count(DISTINCT participante.ordem)
  INTO
    v_total_participants,
    v_signed_participants,
    v_min_order,
    v_max_order,
    v_distinct_orders
  FROM public.assinatura_eletronica_participantes AS participante
  WHERE participante.envelope_id = p_envelope_id;

  SELECT count(*)
  INTO v_event_count
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
    AND evento.hash_evento ~ '^[0-9a-f]{64}$'
    AND evento.ator_auth_user_id IS NOT NULL
    AND participante.status = 'ASSINADO'
    AND participante.assinado_em IS NOT NULL
    AND participante.assinado_por_auth_user_id = evento.ator_auth_user_id
    AND nullif(btrim(participante.identidade_snapshot ->> 'name'), '') IS NOT NULL
    AND participante.identidade_snapshot ->> 'cpfMasked'
      ~ '^[*]{3}[.][*]{3}[.][*]{3}-[0-9]{2}$'
    AND evento.dados ->> 'role' = participante.papel
    AND (evento.dados ->> 'order')::integer = participante.ordem
    AND (evento.dados ->> 'signedAt')::timestamptz = participante.assinado_em
    AND evento.dados -> 'authSessionBound' = 'true'::jsonb
    AND evento.dados ->> 'termId' = participante.aceitou_versao_termo
    AND evento.dados ->> 'termSha256' = participante.aceite_termo_sha256
    AND participante.aceite_termo_em = participante.assinado_em
    AND desafio.metodo = 'SENHA_REAUTENTICADA'
    AND desafio.estado = 'CONSUMIDO'
    AND desafio.consumido_em = participante.assinado_em
    AND desafio.actor_auth_user_id = evento.ator_auth_user_id
    AND desafio.auth_session_id IS NOT NULL
    AND desafio.perfil = participante.papel
    AND desafio.contexto_id = participante.contexto_id;

  IF v_total_participants NOT BETWEEN 1 AND 6
     OR v_signed_participants IS DISTINCT FROM v_total_participants
     OR v_min_order IS DISTINCT FROM 1
     OR v_max_order IS DISTINCT FROM v_total_participants
     OR v_distinct_orders IS DISTINCT FROM v_total_participants
     OR v_event_count IS DISTINCT FROM v_total_participants
     OR v_valid_count IS DISTINCT FROM v_total_participants
     OR v_valid_participant_count IS DISTINCT FROM v_total_participants
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_EVENTOS_OU_DESAFIOS_CONCLUSAO_V5_INVALIDOS';
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'type', 'ASSINATURA_CONCLUIDA',
    'occurredAt', evento.ocorrido_em,
    'participantId', participante.id,
    'challengeId', desafio.id,
    'method', 'SENHA_REAUTENTICADA',
    'eventId', evento.id,
    'signatureHash', evento.hash_evento
  ) ORDER BY participante.ordem)
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
EXCEPTION
  WHEN invalid_text_representation OR datetime_field_overflow THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_EVENTOS_OU_DESAFIOS_CONCLUSAO_V5_INVALIDOS';
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_provas_individuais_diario_v5(
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
  v_eventos jsonb;
  v_provas jsonb;
BEGIN
  v_eventos := public.assinatura_eletronica_eventos_assinatura_diario_v5_validados(
    p_envelope_id
  );
  IF jsonb_typeof(v_eventos) IS DISTINCT FROM 'array'
     OR jsonb_array_length(v_eventos) NOT BETWEEN 1 AND 6
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_PROVAS_INDIVIDUAIS_V5_INVALIDAS';
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'participantId', participante.id,
    'role', participante.papel,
    'roleLabel', public.assinatura_eletronica_papel_label(participante.papel),
    'order', participante.ordem,
    'status', participante.status,
    'statusLabel', public.assinatura_eletronica_participante_status_label(
      participante.status
    ),
    'contextId', participante.contexto_id,
    'canAct', false,
    'signerName', participante.identidade_snapshot ->> 'name',
    'signerCpfMasked', participante.identidade_snapshot ->> 'cpfMasked',
    'signedAt', participante.assinado_em,
    'signatureEventId', evento.id,
    'signatureHash', evento.hash_evento,
    'verificationCode', 'SIG-' || pg_catalog.upper(evento.id::text),
    'verificationPath', '/validador?code=SIG-'
      || pg_catalog.upper(evento.id::text)
  ) ORDER BY participante.ordem)
  INTO v_provas
  FROM public.assinatura_eletronica_participantes AS participante
  JOIN public.assinatura_eletronica_eventos AS evento
    ON evento.envelope_id = participante.envelope_id
   AND evento.participante_id = participante.id
   AND evento.tipo = 'ASSINATURA_CONCLUIDA'
  WHERE participante.envelope_id = p_envelope_id;
  RETURN v_provas;
EXCEPTION
  WHEN invalid_text_representation OR datetime_field_overflow THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_PROVAS_INDIVIDUAIS_V5_INVALIDAS';
END;
$function$;

-- A wrapper publica preserva v1/v2 historicos. Este caminho interno aceita
-- somente a geometria v3 global e nunca consulta o vinculo por-politica.
CREATE OR REPLACE FUNCTION public.assinatura_eletronica_internal_iniciar_finalizacao_diario_v5_global(
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
  v_stamp_asset public.assinatura_eletronica_modelo_assets%ROWTYPE;
  v_stamp_asset_payload jsonb;
  v_document_snapshot_sha256 text;
  v_pdf_asset_manifest_sha256 text;
  v_signature_events_sha256 text;
  v_watermark_url text;
  v_resultado jsonb;
  v_ledger_resultado jsonb;
BEGIN
  PERFORM public.assinatura_eletronica_exigir_service_role();
  IF p_envelope_id IS NULL OR p_actor_auth_user_id IS NULL
     OR p_auth_session_id IS NULL OR p_request_id IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'ASSINATURA_FINALIZACAO_PAYLOAD_INVALIDO';
  END IF;

  PERFORM public.assinatura_eletronica_autorizar_finalizacao_diario_segura(
    p_envelope_id,
    p_actor_auth_user_id,
    p_auth_session_id
  );
  v_actor_scope := 'service:user:' || p_actor_auth_user_id::text
    || ':session:' || p_auth_session_id::text;

  SELECT envelope.*
  INTO v_envelope
  FROM public.assinatura_eletronica_envelopes AS envelope
  WHERE envelope.id = p_envelope_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'ASSINATURA_ENVELOPE_NAO_ENCONTRADO';
  END IF;
  PERFORM public.assinatura_eletronica_autorizar_finalizacao_diario_segura(
    p_envelope_id,
    p_actor_auth_user_id,
    p_auth_session_id
  );
  IF v_envelope.status NOT IN ('FINALIZANDO', 'ASSINADO')
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
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_FINALIZACAO_ESTADO_OU_POLITICA_INVALIDA';
  END IF;

  SELECT artefato.*
  INTO v_original
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
       SELECT 1
       FROM storage.objects AS objeto
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
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_ORIGINAL_CONTRATO_SEMANTICO_INVALIDO';
  END IF;

  IF v_envelope.geometria_snapshot ->> 'schemaVersion' IS DISTINCT FROM '3'
     OR NOT public.assinatura_eletronica_geometria_snapshot_valida(
       v_envelope.geometria_snapshot
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_FINALIZACAO_GEOMETRIA_GLOBAL_INVALIDA';
  END IF;

  v_watermark_url := v_envelope.documento_snapshot #>> '{assetSources,watermarkUrl}';
  IF NOT public.assinatura_eletronica_marca_landscape_data_uri_valida(
       v_watermark_url
     )
     OR v_envelope.documento_snapshot
          #>> '{institutionalIdentity,watermarkUrl}'
          IS DISTINCT FROM v_watermark_url
     OR v_envelope.pdf_asset_manifest_snapshot
          -> 'assets' -> 'watermark' ->> 'sourceKind'
          IS DISTINCT FROM 'INLINE_DATA_URI'
     OR v_envelope.pdf_asset_manifest_snapshot
          -> 'assets' -> 'watermark' ->> 'sourceRef'
          IS DISTINCT FROM 'documentSnapshot.assetSources.watermarkUrl'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_FINALIZACAO_MARCA_LANDSCAPE_INVALIDA';
  END IF;

  v_eventos_assinatura :=
    public.assinatura_eletronica_eventos_assinatura_diario_v5_validados(
      v_envelope.id
    );
  SELECT jsonb_agg(jsonb_build_object(
    'type', evento ->> 'type',
    'occurredAt', evento -> 'occurredAt',
    'participantId', evento -> 'participantId',
    'challengeId', evento -> 'challengeId',
    'method', evento ->> 'method'
  ) ORDER BY ordinalidade)
  INTO v_receipt_events
  FROM jsonb_array_elements(v_eventos_assinatura)
    WITH ORDINALITY AS item(evento, ordinalidade);

  IF jsonb_typeof(v_envelope.geometria_snapshot -> 'assetSnapshot')
       IS DISTINCT FROM 'object'
     OR jsonb_typeof(v_envelope.geometria_snapshot -> 'assetSnapshot' -> 'assetId')
       IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_envelope.geometria_snapshot -> 'assetSnapshot' -> 'sha256')
       IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_envelope.geometria_snapshot -> 'assetSnapshot' -> 'mimeType')
       IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_envelope.geometria_snapshot -> 'assetSnapshot' -> 'sizeBytes')
       IS DISTINCT FROM 'number'
     OR jsonb_typeof(v_envelope.geometria_snapshot -> 'assetSnapshot' -> 'width')
       IS DISTINCT FROM 'number'
     OR jsonb_typeof(v_envelope.geometria_snapshot -> 'assetSnapshot' -> 'height')
       IS DISTINCT FROM 'number'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_CARIMBO_GLOBAL_SNAPSHOT_INVALIDO';
  END IF;
  SELECT asset.*
  INTO v_stamp_asset
  FROM public.assinatura_eletronica_modelo_assets AS asset
  WHERE asset.id = (v_envelope.geometria_snapshot ->> 'assetId')::uuid
    AND asset.status = 'PRONTO'
  FOR SHARE;
  IF NOT FOUND
     OR v_stamp_asset.id::text
        IS DISTINCT FROM v_envelope.geometria_snapshot -> 'assetSnapshot' ->> 'assetId'
     OR v_stamp_asset.sha256
        IS DISTINCT FROM v_envelope.geometria_snapshot -> 'assetSnapshot' ->> 'sha256'
     OR v_stamp_asset.mime_type
        IS DISTINCT FROM v_envelope.geometria_snapshot -> 'assetSnapshot' ->> 'mimeType'
     OR v_stamp_asset.tamanho_bytes::text
        IS DISTINCT FROM v_envelope.geometria_snapshot -> 'assetSnapshot' ->> 'sizeBytes'
     OR v_stamp_asset.largura::text
        IS DISTINCT FROM v_envelope.geometria_snapshot -> 'assetSnapshot' ->> 'width'
     OR v_stamp_asset.altura::text
        IS DISTINCT FROM v_envelope.geometria_snapshot -> 'assetSnapshot' ->> 'height'
     OR NOT EXISTS (
       SELECT 1
       FROM storage.objects AS objeto
       WHERE objeto.bucket_id = v_stamp_asset.bucket_id
         AND objeto.name = v_stamp_asset.storage_path
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_CARIMBO_GLOBAL_ASSET_DIVERGENTE';
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
    'statusLabel', public.assinatura_eletronica_participante_status_label(
      participante.status
    ),
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
    'role', public.assinatura_eletronica_papel_label(participante.papel)
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
      'editor', jsonb_build_object(
        'schemaVersion', 5,
        'pages', v_envelope.politica_snapshot -> 'editor' -> 'pages',
        'signatureStamp', jsonb_build_object(
          'enabled', false,
          'canonicalLabel', 'Documento assinado eletronicamente',
          'assetId', v_envelope.geometria_snapshot -> 'assetId',
          'template', v_envelope.geometria_snapshot -> 'template',
          'autoLayout', v_envelope.geometria_snapshot -> 'autoLayout'
        )
      )
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
      'sourceUrl', v_envelope.pdf_asset_manifest_snapshot
        -> 'assets' -> 'headerLogo' ->> 'sourceUrl'
    ),
    'institutionalWatermark', jsonb_build_object(
      'sourceKind', 'INLINE_DATA_URI',
      'sourceRef', 'documentSnapshot.assetSources.watermarkUrl'
    ),
    'customWatermarks', '[]'::jsonb
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
      'academicRevisionSha256', v_envelope.documento_snapshot
        -> 'source' ->> 'academicRevisionSha256',
      'templateSourceSha256', v_envelope.documento_snapshot
        -> 'templateSource' ->> 'sha256'
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
    'verificationPath', '/validador?code='
      || (v_envelope.documento_snapshot ->> 'validationCode')
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
  SELECT operacao.*
  INTO v_replay
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
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'ASSINATURA_IDEMPOTENCIA_DIVERGENTE';
    END IF;
    RETURN v_resultado;
  END IF;
  IF v_envelope.status <> 'FINALIZANDO' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_FINALIZACAO_ESTADO_INVALIDO';
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
  v_geometria_snapshot jsonb;
  v_resultado jsonb;
  v_schema_geometria integer;
  v_receipt_payload jsonb;
  v_receipt_asset_references jsonb;
  v_provas jsonb;
  v_watermark_url text;
BEGIN
  PERFORM public.assinatura_eletronica_exigir_service_role();
  IF p_envelope_id IS NULL OR p_actor_auth_user_id IS NULL
     OR p_auth_session_id IS NULL OR p_request_id IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'ASSINATURA_FINALIZACAO_PAYLOAD_INVALIDO';
  END IF;

  SELECT
    envelope.geometria_snapshot,
    envelope.documento_snapshot #>> '{assetSources,watermarkUrl}'
  INTO v_geometria_snapshot, v_watermark_url
  FROM public.assinatura_eletronica_envelopes AS envelope
  WHERE envelope.id = p_envelope_id
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'ASSINATURA_ENVELOPE_NAO_ENCONTRADO';
  END IF;

  IF jsonb_typeof(v_geometria_snapshot)
       IS DISTINCT FROM 'object'
     OR jsonb_typeof(v_geometria_snapshot -> 'schemaVersion')
       IS DISTINCT FROM 'number'
     OR v_geometria_snapshot ->> 'schemaVersion' !~ '^[123]$'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_FINALIZACAO_GEOMETRIA_INCOMPATIVEL';
  END IF;
  v_schema_geometria := (
    v_geometria_snapshot ->> 'schemaVersion'
  )::integer;
  -- Os envelopes anteriores continuam no finalizador aplicado, sem adaptar
  -- sua geometria, politica, marca ou recibo historico.
  IF v_schema_geometria IN (1, 2) THEN
    RETURN public.assinatura_eletronica_rpc_iniciar_finalizacao_diario_v3_legacy(
      p_envelope_id => p_envelope_id,
      p_actor_auth_user_id => p_actor_auth_user_id,
      p_auth_session_id => p_auth_session_id,
      p_request_id => p_request_id
    );
  END IF;

  IF NOT public.assinatura_eletronica_geometria_snapshot_valida(
       v_geometria_snapshot
     )
     OR v_watermark_url IS NULL
     OR NOT public.assinatura_eletronica_marca_landscape_data_uri_valida(
       v_watermark_url
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_FINALIZACAO_GEOMETRIA_OU_MARCA_V5_INVALIDA';
  END IF;

  v_resultado := public.assinatura_eletronica_internal_iniciar_finalizacao_diario_v5_global(
    p_envelope_id,
    p_actor_auth_user_id,
    p_auth_session_id,
    p_request_id
  );
  v_provas := public.assinatura_eletronica_provas_individuais_diario_v5(
    p_envelope_id
  );
  IF jsonb_typeof(v_provas) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_PROVAS_INDIVIDUAIS_V5_INVALIDAS';
  END IF;
  IF jsonb_typeof(v_resultado -> 'signatureEvents') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_TRANSPORTE_PROVAS_V5_INVALIDO';
  END IF;
  IF jsonb_array_length(v_provas) NOT BETWEEN 1 AND 6
     OR jsonb_array_length(v_resultado -> 'signatureEvents')
        IS DISTINCT FROM jsonb_array_length(v_provas)
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(v_provas) AS prova(item)
       WHERE NOT EXISTS (
         SELECT 1
         FROM jsonb_array_elements(v_resultado -> 'signatureEvents') AS evento(item)
         WHERE (evento.item ->> 'participantId')
               IS NOT DISTINCT FROM (prova.item ->> 'participantId')
           AND (evento.item ->> 'eventId')
               IS NOT DISTINCT FROM (prova.item ->> 'signatureEventId')
           AND (evento.item ->> 'signatureHash')
               IS NOT DISTINCT FROM (prova.item ->> 'signatureHash')
       )
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_TRANSPORTE_PROVAS_V5_INVALIDO';
  END IF;

  v_receipt_asset_references := v_resultado -> 'receiptAssetReferences';
  IF jsonb_typeof(v_receipt_asset_references) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_FINALIZACAO_REFERENCIAS_COMPROVANTE_INVALIDAS';
  END IF;
  IF (
       SELECT array_agg(entry.key ORDER BY entry.key)
       FROM jsonb_object_keys(v_receipt_asset_references) AS entry(key)
     ) IS DISTINCT FROM ARRAY[
       'customWatermarks', 'institutionalWatermark', 'logo'
     ]::text[]
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_FINALIZACAO_REFERENCIAS_COMPROVANTE_INVALIDAS';
  END IF;
  IF jsonb_typeof(v_receipt_asset_references -> 'customWatermarks')
       IS DISTINCT FROM 'array'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_FINALIZACAO_REFERENCIAS_COMPROVANTE_INVALIDAS';
  END IF;
  IF jsonb_array_length(
       v_receipt_asset_references -> 'customWatermarks'
     ) <> 0
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_FINALIZACAO_REFERENCIAS_COMPROVANTE_INVALIDAS';
  END IF;

  -- A referência da Edge v3 é sempre reconstruída a partir do data URI
  -- congelado no envelope; nenhum URL/Storage ou fallback atravessa a v5.
  v_receipt_asset_references := jsonb_build_object(
    'logo', v_receipt_asset_references -> 'logo',
    'institutionalWatermark', jsonb_build_object(
      'sourceKind', 'INLINE_DATA_URI',
      'sourceRef', 'documentSnapshot.assetSources.watermarkUrl'
    ),
    'customWatermarks', '[]'::jsonb
  );
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
  v_resultado := pg_catalog.jsonb_set(
    v_resultado,
    '{participants}',
    v_provas,
    false
  );
  v_resultado := pg_catalog.jsonb_set(
    v_resultado,
    '{receiptPayload}',
    v_receipt_payload,
    false
  );
  RETURN pg_catalog.jsonb_set(
    v_resultado,
    '{receiptAssetReferences}',
    v_receipt_asset_references,
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
      AND NOT EXISTS (
        SELECT 1
        FROM public.assinatura_eletronica_envelopes AS envelope
        WHERE envelope.politica_id = politica.id
      )
      AND (
        politica.politica -> 'editor' ->> 'schemaVersion' IS DISTINCT FROM '5'
        OR politica.politica -> 'editor'
           IS DISTINCT FROM public.assinatura_eletronica_normalizar_editor(
             politica.politica -> 'editor'
           )
        OR politica.politica -> 'editor' -> 'signatureStamp' ? 'slots'
        OR politica.politica -> 'editor' -> 'signatureStamp' ? 'layout'
        OR politica.politica -> 'editor' -> 'signatureStamp' ? 'contentLayout'
        OR politica.politica -> 'editor' -> 'pages' -> 0 ? 'watermark'
        OR politica.politica -> 'editor' -> 'pages' -> 1 ? 'watermark'
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_EDITOR_V5_POLITICA_DIARIO_INVALIDA';
  END IF;
END;
$migration$;

ALTER TABLE public.assinatura_eletronica_envelopes
  VALIDATE CONSTRAINT assinatura_eletronica_envelopes_snapshot_diario_check;

REVOKE ALL ON FUNCTION
  public.assinatura_eletronica_editor_padrao_v4_institutional_legacy()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.assinatura_eletronica_normalizar_editor_v4_institutional_legacy(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.assinatura_eletronica_salvar_configuracao_v4_institutional_legacy(
    uuid, text, jsonb, uuid
  ) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.assinatura_eletronica_template_carimbo_v5_valido(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.assinatura_eletronica_auto_layout_carimbo_v5_valido(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.assinatura_eletronica_template_carimbo_v5_padrao()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.assinatura_eletronica_editor_v5_a_partir_v4(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.assinatura_eletronica_editor_v5_para_v2_legacy(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_editor_padrao()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_normalizar_editor(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.assinatura_eletronica_geometria_snapshot_valida(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.assinatura_eletronica_congelar_geometria_v2_legacy()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assinatura_eletronica_congelar_geometria_v3()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.assinatura_eletronica_congelar_marca_landscape_diario()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.assinatura_eletronica_preview_identidade_matriz()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.assinatura_eletronica_salvar_configuracao(uuid, text, jsonb, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.assinatura_eletronica_eventos_assinatura_diario_v5_validados(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.assinatura_eletronica_provas_individuais_diario_v5(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.assinatura_eletronica_internal_iniciar_finalizacao_diario_v5_global(
    uuid, uuid, uuid, uuid
  ) FROM PUBLIC, anon, authenticated, service_role;
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
