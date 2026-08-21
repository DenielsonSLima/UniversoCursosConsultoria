-- Coloca código e URL de verificação na coluna canônica logo abaixo do QR.
-- A correção é incremental e só normaliza o MODELO_PADRAO ainda sem uso:
-- nenhum envelope, snapshot de prova ou vínculo de asset pode ser reescrito.

BEGIN;

DO $migration$
DECLARE
  v_target_signature constant text :=
    'public.assinatura_eletronica_template_carimbo_v5_padrao()';
  v_target regprocedure;
  v_definition text;
  v_patched text;
  v_code_old constant text :=
    $old$        'xBp', 23000, 'yBp', 74000, 'widthBp', 48000, 'heightBp', 7000,$old$;
  v_code_new constant text :=
    $new$        'xBp', 71000, 'yBp', 39000, 'widthBp', 29000, 'heightBp', 19000,$new$;
  v_url_old constant text :=
    $old$        'xBp', 23000, 'yBp', 83000, 'widthBp', 48000, 'heightBp', 14000,$old$;
  v_url_new constant text :=
    $new$        'xBp', 71000, 'yBp', 59000, 'widthBp', 29000, 'heightBp', 26000,$new$;
  v_qr_old constant text :=
    $old$        'xBp', 71000, 'yBp', 29000, 'widthBp', 29000, 'heightBp', 29000,$old$;
  v_qr_new constant text :=
    $new$        'xBp', 65000, 'yBp', 3000, 'widthBp', 35000, 'heightBp', 35000,$new$;
  v_code_occurrences integer;
  v_url_occurrences integer;
  v_qr_occurrences integer;
  v_security_definer_before boolean;
  v_security_definer_after boolean;
  v_provolatile_before "char";
  v_provolatile_after "char";
  v_proconfig_before text[];
  v_proconfig_after text[];
  v_acl_before aclitem[];
  v_acl_after aclitem[];
  v_default_template jsonb;
BEGIN
  v_target := pg_catalog.to_regprocedure(v_target_signature);
  IF v_target IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_CARIMBO_VALIDATION_COLUMN_V4_ALVO_AUSENTE';
  END IF;

  IF pg_catalog.to_regprocedure(
    'public.assinatura_eletronica_template_carimbo_v5_valido(jsonb)'
  ) IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_CARIMBO_VALIDATION_COLUMN_V4_VALIDADOR_AUSENTE';
  END IF;

  SELECT
    procedimento.prosecdef,
    procedimento.provolatile,
    procedimento.proconfig,
    procedimento.proacl,
    pg_catalog.pg_get_functiondef(procedimento.oid)
  INTO
    v_security_definer_before,
    v_provolatile_before,
    v_proconfig_before,
    v_acl_before,
    v_definition
  FROM pg_catalog.pg_proc AS procedimento
  WHERE procedimento.oid = v_target::oid;

  IF v_definition IS NULL
     OR v_security_definer_before IS TRUE
     OR v_provolatile_before IS DISTINCT FROM 'i'
     OR v_proconfig_before IS NULL
     OR NOT (v_proconfig_before @> ARRAY['search_path=""']::text[])
     OR pg_catalog.strpos(v_definition, v_code_new) > 0
     OR pg_catalog.strpos(v_definition, v_url_new) > 0
     OR pg_catalog.strpos(v_definition, v_qr_new) > 0
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_CARIMBO_VALIDATION_COLUMN_V4_DEFINICAO_DRIFT';
  END IF;

  v_code_occurrences := (
    pg_catalog.length(v_definition)
    - pg_catalog.length(pg_catalog.replace(v_definition, v_code_old, ''))
  ) / pg_catalog.length(v_code_old);
  v_url_occurrences := (
    pg_catalog.length(v_definition)
    - pg_catalog.length(pg_catalog.replace(v_definition, v_url_old, ''))
  ) / pg_catalog.length(v_url_old);
  v_qr_occurrences := (
    pg_catalog.length(v_definition)
    - pg_catalog.length(pg_catalog.replace(v_definition, v_qr_old, ''))
  ) / pg_catalog.length(v_qr_old);
  IF v_code_occurrences <> 1
     OR v_url_occurrences <> 1
     OR v_qr_occurrences <> 1
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_CARIMBO_VALIDATION_COLUMN_V4_GEOMETRIA_DRIFT';
  END IF;

  v_patched := pg_catalog.replace(v_definition, v_code_old, v_code_new);
  v_patched := pg_catalog.replace(v_patched, v_url_old, v_url_new);
  v_patched := pg_catalog.replace(v_patched, v_qr_old, v_qr_new);
  IF v_patched IS NOT DISTINCT FROM v_definition
     OR pg_catalog.strpos(v_patched, v_code_old) > 0
     OR pg_catalog.strpos(v_patched, v_url_old) > 0
     OR pg_catalog.strpos(v_patched, v_qr_old) > 0
     OR pg_catalog.strpos(v_patched, v_code_new) = 0
     OR pg_catalog.strpos(v_patched, v_url_new) = 0
     OR pg_catalog.strpos(v_patched, v_qr_new) = 0
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_CARIMBO_VALIDATION_COLUMN_V4_PATCH_INCOMPLETO';
  END IF;

  EXECUTE v_patched;

  SELECT
    procedimento.prosecdef,
    procedimento.provolatile,
    procedimento.proconfig,
    procedimento.proacl
  INTO
    v_security_definer_after,
    v_provolatile_after,
    v_proconfig_after,
    v_acl_after
  FROM pg_catalog.pg_proc AS procedimento
  WHERE procedimento.oid = v_target::oid;

  IF v_security_definer_after IS DISTINCT FROM v_security_definer_before
     OR v_provolatile_after IS DISTINCT FROM v_provolatile_before
     OR v_proconfig_after IS DISTINCT FROM v_proconfig_before
     OR v_acl_after IS DISTINCT FROM v_acl_before
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_CARIMBO_VALIDATION_COLUMN_V4_ATRIBUTOS_ALTERADOS';
  END IF;

  v_default_template := public.assinatura_eletronica_template_carimbo_v5_padrao();
  IF v_default_template -> 'elements' -> 7 ->> 'id'
       IS DISTINCT FROM 'verificationCode'
     OR v_default_template -> 'elements' -> 7 ->> 'xBp'
       IS DISTINCT FROM '71000'
     OR v_default_template -> 'elements' -> 7 ->> 'yBp'
       IS DISTINCT FROM '39000'
     OR v_default_template -> 'elements' -> 7 ->> 'widthBp'
       IS DISTINCT FROM '29000'
     OR v_default_template -> 'elements' -> 7 ->> 'heightBp'
       IS DISTINCT FROM '19000'
     OR v_default_template -> 'elements' -> 8 ->> 'id'
       IS DISTINCT FROM 'verificationUrl'
     OR v_default_template -> 'elements' -> 8 ->> 'xBp'
       IS DISTINCT FROM '71000'
     OR v_default_template -> 'elements' -> 8 ->> 'yBp'
       IS DISTINCT FROM '59000'
     OR v_default_template -> 'elements' -> 8 ->> 'widthBp'
       IS DISTINCT FROM '29000'
     OR v_default_template -> 'elements' -> 8 ->> 'heightBp'
       IS DISTINCT FROM '26000'
     OR v_default_template -> 'elements' -> 9 ->> 'id'
       IS DISTINCT FROM 'verificationQr'
     OR v_default_template -> 'elements' -> 9 ->> 'xBp'
       IS DISTINCT FROM '65000'
     OR v_default_template -> 'elements' -> 9 ->> 'yBp'
       IS DISTINCT FROM '3000'
     OR v_default_template -> 'elements' -> 9 ->> 'widthBp'
       IS DISTINCT FROM '35000'
     OR v_default_template -> 'elements' -> 9 ->> 'heightBp'
       IS DISTINCT FROM '35000'
     OR NOT public.assinatura_eletronica_template_carimbo_v5_valido(
       v_default_template
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_CARIMBO_VALIDATION_COLUMN_V4_DEFAULT_INVALIDO';
  END IF;
END;
$migration$;

DO $migration$
DECLARE
  v_policy_count integer;
  v_envelope_count bigint;
  v_policy public.assinatura_eletronica_politicas%ROWTYPE;
  v_policy_after public.assinatura_eletronica_politicas%ROWTYPE;
  v_link_count integer;
  v_link public.assinatura_eletronica_politica_carimbo_assets%ROWTYPE;
  v_link_after public.assinatura_eletronica_politica_carimbo_assets%ROWTYPE;
  v_asset_snapshot jsonb;
  v_editor_before jsonb;
  v_editor_after jsonb;
  v_template_before jsonb;
  v_template_after jsonb;
  v_code_before jsonb;
  v_code_after jsonb;
  v_url_before jsonb;
  v_url_after jsonb;
  v_qr_before jsonb;
  v_qr_after jsonb;
  v_index integer;
BEGIN
  IF pg_catalog.to_regprocedure(
    'public.assinatura_eletronica_normalizar_editor(jsonb)'
  ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.assinatura_eletronica_template_carimbo_v5_valido(jsonb)'
     ) IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_CARIMBO_VALIDATION_COLUMN_V4_CONTRATO_AUSENTE';
  END IF;

  -- As travas tornam as cardinalidades abaixo estáveis durante toda a
  -- normalização e impedem a criação concorrente do primeiro envelope.
  LOCK TABLE public.assinatura_eletronica_politicas
    IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.assinatura_eletronica_envelopes
    IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.assinatura_eletronica_politica_carimbo_assets
    IN SHARE ROW EXCLUSIVE MODE;

  SELECT count(*)
  INTO v_policy_count
  FROM public.assinatura_eletronica_politicas AS politica
  WHERE politica.documento = 'MODELO_PADRAO'
    AND politica.company_id IS NULL
    AND politica.polo_id IS NULL
    AND politica.arquivada_em IS NULL;
  IF v_policy_count <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_CARIMBO_VALIDATION_COLUMN_V4_CARDINALIDADE_INVALIDA';
  END IF;

  SELECT politica.*
  INTO v_policy
  FROM public.assinatura_eletronica_politicas AS politica
  WHERE politica.documento = 'MODELO_PADRAO'
    AND politica.company_id IS NULL
    AND politica.polo_id IS NULL
    AND politica.arquivada_em IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_CARIMBO_VALIDATION_COLUMN_V4_MODELO_AUSENTE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.assinatura_eletronica_envelopes AS envelope
    WHERE envelope.politica_id = v_policy.id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_CARIMBO_VALIDATION_COLUMN_V4_MODELO_REFERENCIADO';
  END IF;

  SELECT count(*)
  INTO v_envelope_count
  FROM public.assinatura_eletronica_envelopes;
  IF v_envelope_count <> 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_CARIMBO_VALIDATION_COLUMN_V4_ENVELOPES_EXISTENTES';
  END IF;

  v_editor_before := v_policy.politica -> 'editor';
  v_template_before := v_editor_before -> 'signatureStamp' -> 'template';
  v_asset_snapshot := v_policy.politica -> 'signatureStampAssetSnapshot';
  IF jsonb_typeof(v_policy.politica) IS DISTINCT FROM 'object'
     OR jsonb_typeof(v_editor_before) IS DISTINCT FROM 'object'
     OR v_editor_before ->> 'schemaVersion' IS DISTINCT FROM '5'
     OR v_editor_before IS DISTINCT FROM
       public.assinatura_eletronica_normalizar_editor(v_editor_before)
     OR NOT public.assinatura_eletronica_template_carimbo_v5_valido(
       v_template_before
     )
     OR jsonb_typeof(v_asset_snapshot) IS DISTINCT FROM 'object'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_CARIMBO_VALIDATION_COLUMN_V4_MODELO_ORIGEM_INVALIDO';
  END IF;

  IF jsonb_array_length(v_template_before -> 'elements') <> 11
     OR v_template_before -> 'elements' -> 7 ->> 'id'
       IS DISTINCT FROM 'verificationCode'
     OR v_template_before -> 'elements' -> 8 ->> 'id'
       IS DISTINCT FROM 'verificationUrl'
     OR v_template_before -> 'elements' -> 9 ->> 'id'
       IS DISTINCT FROM 'verificationQr'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_CARIMBO_VALIDATION_COLUMN_V4_ELEMENTOS_DRIFT';
  END IF;

  SELECT count(*)
  INTO v_link_count
  FROM public.assinatura_eletronica_politica_carimbo_assets AS vinculo
  WHERE vinculo.politica_id = v_policy.id;
  IF v_link_count <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_CARIMBO_VALIDATION_COLUMN_V4_VINCULO_INVALIDO';
  END IF;

  SELECT vinculo.*
  INTO v_link
  FROM public.assinatura_eletronica_politica_carimbo_assets AS vinculo
  WHERE vinculo.politica_id = v_policy.id
  FOR UPDATE;
  IF NOT FOUND
     OR v_link.asset_snapshot IS DISTINCT FROM v_asset_snapshot
     OR v_link.asset_id::text IS DISTINCT FROM v_asset_snapshot ->> 'assetId'
     OR v_link.asset_sha256 IS DISTINCT FROM v_asset_snapshot ->> 'sha256'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_CARIMBO_VALIDATION_COLUMN_V4_SNAPSHOT_DIVERGENTE';
  END IF;

  v_code_before := v_template_before -> 'elements' -> 7;
  v_url_before := v_template_before -> 'elements' -> 8;
  v_qr_before := v_template_before -> 'elements' -> 9;
  v_code_after := v_code_before || jsonb_build_object(
    'xBp', 71000,
    'yBp', 39000,
    'widthBp', 29000,
    'heightBp', 19000
  );
  v_url_after := v_url_before || jsonb_build_object(
    'xBp', 71000,
    'yBp', 59000,
    'widthBp', 29000,
    'heightBp', 26000
  );
  v_qr_after := v_qr_before || jsonb_build_object(
    'xBp', 65000,
    'yBp', 3000,
    'widthBp', 35000,
    'heightBp', 35000
  );
  v_template_after := pg_catalog.jsonb_set(
    pg_catalog.jsonb_set(
      pg_catalog.jsonb_set(
        v_template_before,
        ARRAY['elements', '7'],
        v_code_after,
        false
      ),
      ARRAY['elements', '8'],
      v_url_after,
      false
    ),
    ARRAY['elements', '9'],
    v_qr_after,
    false
  );
  v_editor_after := pg_catalog.jsonb_set(
    v_editor_before,
    ARRAY['signatureStamp', 'template'],
    v_template_after,
    false
  );

  IF (((v_code_after - 'xBp') - 'yBp') - 'widthBp') - 'heightBp'
       IS DISTINCT FROM
       (((v_code_before - 'xBp') - 'yBp') - 'widthBp') - 'heightBp'
     OR (((v_url_after - 'xBp') - 'yBp') - 'widthBp') - 'heightBp'
       IS DISTINCT FROM
       (((v_url_before - 'xBp') - 'yBp') - 'widthBp') - 'heightBp'
     OR (((v_qr_after - 'xBp') - 'yBp') - 'widthBp') - 'heightBp'
       IS DISTINCT FROM
       (((v_qr_before - 'xBp') - 'yBp') - 'widthBp') - 'heightBp'
     OR (v_template_after - 'elements')
       IS DISTINCT FROM (v_template_before - 'elements')
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_CARIMBO_VALIDATION_COLUMN_V4_MUTACAO_EXCEDENTE';
  END IF;

  FOR v_index IN 0..10 LOOP
    IF v_index NOT IN (7, 8, 9)
       AND v_template_after -> 'elements' -> v_index
         IS DISTINCT FROM v_template_before -> 'elements' -> v_index
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'ASSINATURA_CARIMBO_VALIDATION_COLUMN_V4_ELEMENTO_ALTERADO';
    END IF;
  END LOOP;

  IF v_editor_after ->> 'schemaVersion' IS DISTINCT FROM '5'
     OR v_editor_after IS DISTINCT FROM
       public.assinatura_eletronica_normalizar_editor(v_editor_after)
     OR NOT public.assinatura_eletronica_template_carimbo_v5_valido(
       v_template_after
     )
     OR v_code_after ->> 'xBp' IS DISTINCT FROM '71000'
     OR v_code_after ->> 'yBp' IS DISTINCT FROM '39000'
     OR v_code_after ->> 'widthBp' IS DISTINCT FROM '29000'
     OR v_code_after ->> 'heightBp' IS DISTINCT FROM '19000'
     OR v_url_after ->> 'xBp' IS DISTINCT FROM '71000'
     OR v_url_after ->> 'yBp' IS DISTINCT FROM '59000'
     OR v_url_after ->> 'widthBp' IS DISTINCT FROM '29000'
     OR v_url_after ->> 'heightBp' IS DISTINCT FROM '26000'
     OR v_qr_after ->> 'xBp' IS DISTINCT FROM '65000'
     OR v_qr_after ->> 'yBp' IS DISTINCT FROM '3000'
     OR v_qr_after ->> 'widthBp' IS DISTINCT FROM '35000'
     OR v_qr_after ->> 'heightBp' IS DISTINCT FROM '35000'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_CARIMBO_VALIDATION_COLUMN_V4_DESTINO_INVALIDO';
  END IF;

  UPDATE public.assinatura_eletronica_politicas AS politica
  SET politica = pg_catalog.jsonb_set(
    politica.politica,
    ARRAY['editor'],
    v_editor_after,
    false
  )
  WHERE politica.id = v_policy.id
    AND politica.documento = 'MODELO_PADRAO'
    AND politica.company_id IS NULL
    AND politica.polo_id IS NULL
    AND politica.arquivada_em IS NULL
  RETURNING politica.* INTO v_policy_after;
  IF NOT FOUND
     OR v_policy_after.politica -> 'editor' IS DISTINCT FROM v_editor_after
     OR (v_policy_after.politica - 'editor')
       IS DISTINCT FROM (v_policy.politica - 'editor')
     OR v_policy_after.politica -> 'signatureStampAssetSnapshot'
       IS DISTINCT FROM v_asset_snapshot
     OR v_policy_after.politica -> 'editor'
       IS DISTINCT FROM public.assinatura_eletronica_normalizar_editor(
         v_policy_after.politica -> 'editor'
       )
     OR NOT public.assinatura_eletronica_template_carimbo_v5_valido(
       v_policy_after.politica -> 'editor' -> 'signatureStamp' -> 'template'
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_CARIMBO_VALIDATION_COLUMN_V4_ATUALIZACAO_INVALIDA';
  END IF;

  SELECT vinculo.*
  INTO v_link_after
  FROM public.assinatura_eletronica_politica_carimbo_assets AS vinculo
  WHERE vinculo.politica_id = v_policy.id
  FOR UPDATE;
  IF NOT FOUND OR v_link_after IS DISTINCT FROM v_link THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_CARIMBO_VALIDATION_COLUMN_V4_VINCULO_ALTERADO';
  END IF;
END;
$migration$;

COMMIT;
