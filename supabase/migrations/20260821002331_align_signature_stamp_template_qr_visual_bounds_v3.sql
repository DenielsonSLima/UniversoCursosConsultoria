-- Alinha a validação SQL do carimbo global ao quadrado físico que o editor
-- desenha com `contain` na superfície 19:7. A alteração é incremental sobre
-- a visibilidade opcional v2: não muda bindings, estilos ou qualquer
-- geometria já congelada em envelopes existentes.

BEGIN;

DO $migration$
DECLARE
  v_target_signature constant text :=
    'public.assinatura_eletronica_template_carimbo_v5_valido(jsonb)';
  v_target regprocedure;
  v_definition text;
  v_patched text;
  v_old text := $old$  -- A quiet zone do QR continua reservada contra todos os elementos visíveis.
  -- Só os três itens visuais permitidos deixam de ocupar espaço ao ocultá-los.
  v_qr := p_template -> 'elements' -> 9;
  FOR v_index IN 0..10 LOOP
    IF v_index <> 9
       AND NOT (v_expected_ids[v_index + 1] = ANY(v_hidden_element_ids))
    THEN
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
  END LOOP;$old$;
  v_new text := $new$  -- A quiet zone do QR é o quadrado físico de `contain` no canvas
  -- 19:7. As margens laterais ou verticais do quadro lógico não bloqueiam
  -- elementos; somente a área efetivamente desenhada, centralizada, reserva
  -- espaço. A ordem e a regra de visibilidade opcional v2 permanecem iguais.
  v_qr := p_template -> 'elements' -> 9;
  <<qr_visual_bounds>>
  DECLARE
    v_qr_x integer;
    v_qr_y integer;
    v_qr_width integer;
    v_qr_height integer;
    v_qr_physical_width numeric;
    v_qr_physical_height numeric;
    v_qr_physical_side numeric;
    v_qr_visual_left numeric;
    v_qr_visual_top numeric;
    v_qr_visual_right numeric;
    v_qr_visual_bottom numeric;
    v_element_x integer;
    v_element_y integer;
    v_element_width integer;
    v_element_height integer;
  BEGIN
    v_qr_x := (v_qr ->> 'xBp')::integer;
    v_qr_y := (v_qr ->> 'yBp')::integer;
    v_qr_width := (v_qr ->> 'widthBp')::integer;
    v_qr_height := (v_qr ->> 'heightBp')::integer;
    v_qr_physical_width := v_qr_width * 19;
    v_qr_physical_height := v_qr_height * 7;
    v_qr_physical_side := least(
      v_qr_physical_width,
      v_qr_physical_height
    );
    v_qr_visual_left := v_qr_x * 19
      + (v_qr_physical_width - v_qr_physical_side) / 2;
    v_qr_visual_top := v_qr_y * 7
      + (v_qr_physical_height - v_qr_physical_side) / 2;
    v_qr_visual_right := v_qr_visual_left + v_qr_physical_side;
    v_qr_visual_bottom := v_qr_visual_top + v_qr_physical_side;
    FOR v_index IN 0..10 LOOP
      IF v_index <> 9
         AND NOT (v_expected_ids[v_index + 1] = ANY(v_hidden_element_ids))
      THEN
        v_element := p_template -> 'elements' -> v_index;
        v_element_x := (v_element ->> 'xBp')::integer;
        v_element_y := (v_element ->> 'yBp')::integer;
        v_element_width := (v_element ->> 'widthBp')::integer;
        v_element_height := (v_element ->> 'heightBp')::integer;
        IF v_qr_visual_left < (v_element_x + v_element_width) * 19
           AND v_qr_visual_right > v_element_x * 19
           AND v_qr_visual_top < (v_element_y + v_element_height) * 7
           AND v_qr_visual_bottom > v_element_y * 7
        THEN
          RETURN false;
        END IF;
      END IF;
    END LOOP;
  END qr_visual_bounds;$new$;
  v_occurrences integer;
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
  IF v_target IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_TEMPLATE_CARIMBO_V5_QR_VISUAL_V3_ALVO_AUSENTE';
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
     OR pg_catalog.strpos(v_definition, 'v_qr_physical_side') > 0
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_TEMPLATE_CARIMBO_V5_QR_VISUAL_V3_DEFINICAO_DRIFT';
  END IF;

  v_occurrences := (
    pg_catalog.length(v_definition)
    - pg_catalog.length(pg_catalog.replace(v_definition, v_old, ''))
  ) / pg_catalog.length(v_old);
  IF v_occurrences <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_TEMPLATE_CARIMBO_V5_QR_VISUAL_V3_COLISAO_DRIFT';
  END IF;

  v_patched := pg_catalog.replace(v_definition, v_old, v_new);
  IF v_patched IS NOT DISTINCT FROM v_definition
     OR pg_catalog.strpos(v_patched, 'v_qr_physical_side') = 0
     OR pg_catalog.strpos(v_patched, 'v_qr_visual_left') = 0
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_TEMPLATE_CARIMBO_V5_QR_VISUAL_V3_PATCH_INCOMPLETO';
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
      MESSAGE = 'ASSINATURA_TEMPLATE_CARIMBO_V5_QR_VISUAL_V3_ATRIBUTOS_ALTERADOS';
  END IF;
END;
$migration$;

COMMIT;
