-- Reconcilia a tipografia segura do template global do carimbo com o
-- contrato v5 ja existente. Conteudo, bindings, cores e provas individuais
-- permanecem imutaveis. Esta migration tambem aceita bancos nos quais a
-- reconciliacao tipografica anterior ja tenha sido executada localmente.

BEGIN;

DO $migration$
BEGIN
  IF pg_catalog.to_regprocedure(
    'public.assinatura_eletronica_template_carimbo_v5_valido(jsonb)'
  ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.assinatura_eletronica_template_carimbo_v5_padrao()'
     ) IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_CARIMBO_TIPOGRAFIA_V6_CONTRATO_AUSENTE';
  END IF;
END;
$migration$;

CREATE OR REPLACE FUNCTION public.assinatura_eletronica_template_carimbo_v5_estilo_valido(
  p_element jsonb,
  p_expected_style jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_style jsonb;
  v_font text;
  v_font_size integer;
  v_expected_font text;
  v_label text;
BEGIN
  IF jsonb_typeof(p_element) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_expected_style) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_element -> 'style') IS DISTINCT FROM 'object'
  THEN
    RETURN false;
  END IF;

  v_style := p_element -> 'style';
  IF p_element ->> 'kind' IS DISTINCT FROM 'TEXT' THEN
    RETURN v_style IS NOT DISTINCT FROM p_expected_style;
  END IF;

  IF (
    SELECT array_agg(entry.key ORDER BY entry.key)
    FROM jsonb_object_keys(v_style) AS entry(key)
  ) IS DISTINCT FROM ARRAY[
    'align', 'color', 'font', 'fontSizeBp', 'label'
  ]::text[]
     OR jsonb_typeof(v_style -> 'font') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_style -> 'fontSizeBp') IS DISTINCT FROM 'number'
     OR jsonb_typeof(v_style -> 'color') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_style -> 'align') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_style -> 'label') IS DISTINCT FROM 'string'
     OR v_style ->> 'fontSizeBp' !~ '^[0-9]+$'
  THEN
    RETURN false;
  END IF;

  v_font := v_style ->> 'font';
  v_font_size := (v_style ->> 'fontSizeBp')::integer;
  v_expected_font := p_expected_style ->> 'font';
  v_label := v_style ->> 'label';

  IF v_font_size NOT BETWEEN 4000 AND 16000
     OR v_font_size % 500 <> 0
     OR v_style ->> 'align' NOT IN ('LEFT', 'CENTER', 'RIGHT')
     OR v_style ->> 'color' IS DISTINCT FROM p_expected_style ->> 'color'
     OR (
       p_element ->> 'id' = 'signerName'
       AND v_label NOT IN ('', 'Assinante: ')
     )
     OR (
       p_element ->> 'id' <> 'signerName'
       AND v_label IS DISTINCT FROM p_expected_style ->> 'label'
     )
  THEN
    RETURN false;
  END IF;

  IF v_expected_font LIKE 'HELVETICA%'
     AND v_font NOT IN (
       'HELVETICA',
       'HELVETICA_BOLD',
       'HELVETICA_OBLIQUE',
       'HELVETICA_BOLD_OBLIQUE'
     )
  THEN
    RETURN false;
  END IF;
  IF v_expected_font LIKE 'COURIER%'
     AND v_font NOT IN (
       'COURIER',
       'COURIER_BOLD',
       'COURIER_OBLIQUE',
       'COURIER_BOLD_OBLIQUE'
     )
  THEN
    RETURN false;
  END IF;
  IF v_expected_font NOT LIKE 'HELVETICA%'
     AND v_expected_font NOT LIKE 'COURIER%'
  THEN
    RETURN false;
  END IF;

  RETURN true;
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RETURN false;
END;
$function$;

REVOKE ALL ON FUNCTION
  public.assinatura_eletronica_template_carimbo_v5_estilo_valido(jsonb, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.assinatura_eletronica_template_carimbo_v5_estilo_valido(jsonb, jsonb)
  TO anon, authenticated, service_role;

DO $migration$
DECLARE
  v_target_signature constant text :=
    'public.assinatura_eletronica_template_carimbo_v5_valido(jsonb)';
  v_target regprocedure;
  v_definition text;
  v_patched text;
  v_old constant text :=
    $old$       OR v_element -> 'style' IS DISTINCT FROM v_expected_styles -> v_index$old$;
  v_new constant text :=
    $new$       OR NOT public.assinatura_eletronica_template_carimbo_v5_estilo_valido(
         v_element,
         v_expected_styles -> v_index
       )$new$;
  v_old_occurrences integer;
  v_helper_occurrences integer;
  v_security_definer_before boolean;
  v_security_definer_after boolean;
  v_provolatile_before "char";
  v_provolatile_after "char";
  v_proconfig_before text[];
  v_proconfig_after text[];
  v_acl_before aclitem[];
  v_acl_after aclitem[];
BEGIN
  v_target := pg_catalog.to_regprocedure(v_target_signature);
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
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_CARIMBO_TIPOGRAFIA_V6_VALIDADOR_DRIFT';
  END IF;

  v_old_occurrences := (
    pg_catalog.length(v_definition)
    - pg_catalog.length(pg_catalog.replace(v_definition, v_old, ''))
  ) / pg_catalog.length(v_old);
  v_helper_occurrences := (
    pg_catalog.length(v_definition)
    - pg_catalog.length(pg_catalog.replace(
      v_definition,
      'assinatura_eletronica_template_carimbo_v5_estilo_valido',
      ''
    ))
  ) / pg_catalog.length(
    'assinatura_eletronica_template_carimbo_v5_estilo_valido'
  );

  IF v_helper_occurrences = 0 THEN
    IF v_old_occurrences <> 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'ASSINATURA_CARIMBO_TIPOGRAFIA_V6_SENTINELA_INVALIDO';
    END IF;

    v_patched := pg_catalog.replace(v_definition, v_old, v_new);
    IF v_patched IS NOT DISTINCT FROM v_definition
       OR pg_catalog.strpos(v_patched, v_old) > 0
       OR pg_catalog.strpos(
         v_patched,
         'assinatura_eletronica_template_carimbo_v5_estilo_valido'
       ) = 0
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'ASSINATURA_CARIMBO_TIPOGRAFIA_V6_PATCH_INCOMPLETO';
    END IF;
    EXECUTE v_patched;
  ELSIF v_helper_occurrences <> 1 OR v_old_occurrences <> 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_CARIMBO_TIPOGRAFIA_V6_RECONCILIACAO_AMBIGUA';
  END IF;

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
      MESSAGE = 'ASSINATURA_CARIMBO_TIPOGRAFIA_V6_ATRIBUTOS_ALTERADOS';
  END IF;
END;
$migration$;

DO $migration$
DECLARE
  v_target_signature constant text :=
    'public.assinatura_eletronica_template_carimbo_v5_padrao()';
  v_target regprocedure;
  v_definition text;
  v_patched text;
  v_old constant text := $old$'label', 'Assinante: '$old$;
  v_new constant text := $new$'label', ''$new$;
  v_old_occurrences integer;
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
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_CARIMBO_TIPOGRAFIA_V6_DEFAULT_DRIFT';
  END IF;

  v_old_occurrences := (
    pg_catalog.length(v_definition)
    - pg_catalog.length(pg_catalog.replace(v_definition, v_old, ''))
  ) / pg_catalog.length(v_old);

  IF v_old_occurrences > 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_CARIMBO_TIPOGRAFIA_V6_LABEL_DRIFT';
  ELSIF v_old_occurrences = 1 THEN
    v_patched := pg_catalog.replace(v_definition, v_old, v_new);

    IF v_patched IS NOT DISTINCT FROM v_definition
       OR pg_catalog.strpos(v_patched, v_old) > 0
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'ASSINATURA_CARIMBO_TIPOGRAFIA_V6_LABEL_DRIFT';
    END IF;

    EXECUTE v_patched;
  END IF;

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

  v_default_template := public.assinatura_eletronica_template_carimbo_v5_padrao();
  IF v_security_definer_after IS DISTINCT FROM v_security_definer_before
     OR v_provolatile_after IS DISTINCT FROM v_provolatile_before
     OR v_proconfig_after IS DISTINCT FROM v_proconfig_before
     OR v_acl_after IS DISTINCT FROM v_acl_before
     OR v_default_template -> 'elements' -> 3 ->> 'id'
       IS DISTINCT FROM 'signerName'
     OR v_default_template -> 'elements' -> 3 -> 'style' ->> 'label'
       IS DISTINCT FROM ''
     OR NOT public.assinatura_eletronica_template_carimbo_v5_valido(
       v_default_template
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_CARIMBO_TIPOGRAFIA_V6_DEFAULT_INVALIDO';
  END IF;
END;
$migration$;

COMMIT;
