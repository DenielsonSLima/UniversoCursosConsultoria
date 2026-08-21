-- Permite ocultar somente o texto visual do papel do signatário no template
-- global v5. Nenhum binding, valor probatório, geometria congelada existente
-- ou migration aplicada é reescrito por esta alteração incremental.

BEGIN;

DO $migration$
BEGIN
  IF pg_catalog.to_regprocedure(
    'public.assinatura_eletronica_template_carimbo_v5_valido(jsonb)'
  ) IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_TEMPLATE_CARIMBO_V5_VALIDADOR_AUSENTE';
  END IF;
END;
$migration$;

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
  -- A ausência da chave é a forma legada e continua significando visível.
  -- A única extensão autorizada é a ocultação visual do papel; campos de
  -- prova, QR e URL não entram na allowlist.
  IF jsonb_typeof(p_template) IS DISTINCT FROM 'object'
     OR NOT (
       (
         SELECT array_agg(entry.key ORDER BY entry.key)
         FROM jsonb_object_keys(p_template) AS entry(key)
       ) IS NOT DISTINCT FROM ARRAY[
         'coordinateSpace', 'elements', 'schemaVersion'
       ]::text[]
       OR (
         (
           SELECT array_agg(entry.key ORDER BY entry.key)
           FROM jsonb_object_keys(p_template) AS entry(key)
         ) IS NOT DISTINCT FROM ARRAY[
           'coordinateSpace', 'elements', 'hiddenElementIds',
           'schemaVersion'
         ]::text[]
         AND p_template -> 'hiddenElementIds'
             IS NOT DISTINCT FROM '["signerRole"]'::jsonb
       )
     )
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
       -- Valores probatórios e aparência são canônicos. O editor só pode
       -- alterar a geometria; a visibilidade visual permitida está no root.
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
  -- A quiet zone continua reservada contra todos os elementos, inclusive o
  -- papel oculto. Esta migration só amplia a representação serializada.
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

COMMIT;
