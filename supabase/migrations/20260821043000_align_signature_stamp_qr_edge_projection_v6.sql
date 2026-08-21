-- Alinha a colisão SQL do QR ao percurso visual usado pelo editor e pelos
-- compositores PDF. A geometria persistida continua no contrato v1 quadrado;
-- somente a projeção entre o quadro lógico e as bordas visíveis é corrigida.
-- A migration v3 aplicada permanece imutável.

BEGIN;

DO $migration$
DECLARE
  v_target_signature constant text :=
    'public.assinatura_eletronica_template_carimbo_v5_valido(jsonb)';
  v_target regprocedure;
  v_definition text;
  v_patched text;
  v_old constant text := $old$  -- A quiet zone do QR é o quadrado físico de `contain` no canvas
  -- 19:7. As margens laterais ou verticais do quadro lógico não bloqueiam
  -- elementos; somente a área efetivamente desenhada, centralizada, reserva
  -- espaço. A ordem e a regra de visibilidade opcional v2 permanecem iguais.
  v_qr := p_template -> 'elements' -> 9;$old$;
  v_new constant text := $new$  -- A quiet zone do QR é o quadrado físico de `contain` no canvas
  -- 19:7. A posição lógica é projetada entre os extremos do percurso
  -- visual: 0 toca a borda inicial e o limite lógico toca a borda final.
  -- A ordem e a regra de visibilidade opcional v2 permanecem iguais.
  v_qr := p_template -> 'elements' -> 9;$new$;
  v_left_old constant text := $old$    v_qr_visual_left := v_qr_x * 19
      + (v_qr_physical_width - v_qr_physical_side) / 2;
    v_qr_visual_top := v_qr_y * 7
      + (v_qr_physical_height - v_qr_physical_side) / 2;$old$;
  v_left_new constant text := $new$    v_qr_visual_left := CASE
      WHEN v_qr_width = 100000 THEN
        (100000 * 19 - v_qr_physical_side) / 2
      ELSE v_qr_x
        * (100000 * 19 - v_qr_physical_side)
        / (100000 - v_qr_width)
    END;
    v_qr_visual_top := CASE
      WHEN v_qr_height = 100000 THEN
        (100000 * 7 - v_qr_physical_side) / 2
      ELSE v_qr_y
        * (100000 * 7 - v_qr_physical_side)
        / (100000 - v_qr_height)
    END;$new$;
  v_geometry_old constant text := $old$        IF v_width IS DISTINCT FROM v_height
           OR v_width NOT BETWEEN 29000 AND 40000
        THEN$old$;
  v_geometry_new constant text := $new$        IF v_width IS DISTINCT FROM v_height
           OR v_width < 29000
        THEN$new$;
  v_comment_occurrences integer;
  v_projection_occurrences integer;
  v_geometry_occurrences integer;
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
      MESSAGE = 'ASSINATURA_CARIMBO_QR_EDGE_V6_ALVO_AUSENTE';
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
     OR pg_catalog.strpos(
       v_definition,
       '100000 * 19 - v_qr_physical_side'
     ) > 0
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_CARIMBO_QR_EDGE_V6_DEFINICAO_DRIFT';
  END IF;

  v_comment_occurrences := (
    pg_catalog.length(v_definition)
    - pg_catalog.length(pg_catalog.replace(v_definition, v_old, ''))
  ) / pg_catalog.length(v_old);
  v_projection_occurrences := (
    pg_catalog.length(v_definition)
    - pg_catalog.length(pg_catalog.replace(v_definition, v_left_old, ''))
  ) / pg_catalog.length(v_left_old);
  v_geometry_occurrences := (
    pg_catalog.length(v_definition)
    - pg_catalog.length(pg_catalog.replace(v_definition, v_geometry_old, ''))
  ) / pg_catalog.length(v_geometry_old);
  IF v_comment_occurrences <> 1
     OR v_projection_occurrences <> 1
     OR v_geometry_occurrences <> 1
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_CARIMBO_QR_EDGE_V6_PROJECAO_DRIFT';
  END IF;

  v_patched := pg_catalog.replace(v_definition, v_old, v_new);
  v_patched := pg_catalog.replace(v_patched, v_left_old, v_left_new);
  v_patched := pg_catalog.replace(
    v_patched,
    v_geometry_old,
    v_geometry_new
  );
  IF v_patched IS NOT DISTINCT FROM v_definition
     OR pg_catalog.strpos(v_patched, v_old) > 0
     OR pg_catalog.strpos(v_patched, v_left_old) > 0
     OR pg_catalog.strpos(v_patched, v_geometry_old) > 0
     OR pg_catalog.strpos(
       v_patched,
       '100000 * 19 - v_qr_physical_side'
     ) = 0
     OR pg_catalog.strpos(
       v_patched,
       '100000 * 7 - v_qr_physical_side'
     ) = 0
     OR pg_catalog.strpos(v_patched, 'OR v_width < 29000') = 0
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_CARIMBO_QR_EDGE_V6_PATCH_INCOMPLETO';
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
      MESSAGE = 'ASSINATURA_CARIMBO_QR_EDGE_V6_ATRIBUTOS_ALTERADOS';
  END IF;
END;
$migration$;

DO $migration$
DECLARE
  v_edge_template jsonb;
  v_large_template jsonb;
  v_full_template jsonb;
BEGIN
  v_edge_template := public.assinatura_eletronica_template_carimbo_v5_padrao();

  -- Todos os dados probatórios continuam presentes. Código e URL ficam à
  -- esquerda apenas neste teste, enquanto o QR lógico de 30% encosta nas
  -- bordas direita e inferior. A linha ocupa somente a antiga margem invisível.
  v_edge_template := pg_catalog.jsonb_set(
    v_edge_template,
    '{elements,7,xBp}',
    '23000'::jsonb
  );
  v_edge_template := pg_catalog.jsonb_set(
    v_edge_template,
    '{elements,7,widthBp}',
    '48000'::jsonb
  );
  v_edge_template := pg_catalog.jsonb_set(
    v_edge_template,
    '{elements,8,xBp}',
    '23000'::jsonb
  );
  v_edge_template := pg_catalog.jsonb_set(
    v_edge_template,
    '{elements,8,widthBp}',
    '48000'::jsonb
  );
  v_edge_template := pg_catalog.jsonb_set(
    v_edge_template,
    '{elements,9,xBp}',
    '70000'::jsonb
  );
  v_edge_template := pg_catalog.jsonb_set(
    v_edge_template,
    '{elements,9,yBp}',
    '70000'::jsonb
  );
  v_edge_template := pg_catalog.jsonb_set(
    v_edge_template,
    '{elements,9,widthBp}',
    '30000'::jsonb
  );
  v_edge_template := pg_catalog.jsonb_set(
    v_edge_template,
    '{elements,9,heightBp}',
    '30000'::jsonb
  );
  v_edge_template := pg_catalog.jsonb_set(
    v_edge_template,
    '{elements,10,xBp}',
    '72000'::jsonb
  );
  v_edge_template := pg_catalog.jsonb_set(
    v_edge_template,
    '{elements,10,yBp}',
    '80000'::jsonb
  );
  v_edge_template := pg_catalog.jsonb_set(
    v_edge_template,
    '{elements,10,widthBp}',
    '8000'::jsonb
  );

  IF NOT public.assinatura_eletronica_template_carimbo_v5_valido(
    v_edge_template
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_CARIMBO_QR_EDGE_V6_FRAME_30_INVALIDO';
  END IF;

  -- O QR não possui teto artificial de 40%. Neste cenário de 50%, código e
  -- URL continuam abaixo do quadrado visível e nenhuma colisão real ocorre.
  v_large_template := public.assinatura_eletronica_template_carimbo_v5_padrao();
  v_large_template := pg_catalog.jsonb_set(
    v_large_template,
    '{elements,9,xBp}',
    '50000'::jsonb
  );
  v_large_template := pg_catalog.jsonb_set(
    v_large_template,
    '{elements,9,yBp}',
    '0'::jsonb
  );
  v_large_template := pg_catalog.jsonb_set(
    v_large_template,
    '{elements,9,widthBp}',
    '50000'::jsonb
  );
  v_large_template := pg_catalog.jsonb_set(
    v_large_template,
    '{elements,9,heightBp}',
    '50000'::jsonb
  );
  v_large_template := pg_catalog.jsonb_set(
    v_large_template,
    '{elements,7,yBp}',
    '52000'::jsonb
  );
  v_large_template := pg_catalog.jsonb_set(
    v_large_template,
    '{elements,8,yBp}',
    '72000'::jsonb
  );

  IF NOT public.assinatura_eletronica_template_carimbo_v5_valido(
    v_large_template
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_CARIMBO_QR_EDGE_V6_FRAME_50_INVALIDO';
  END IF;

  -- Em 100% não existe percurso lógico. A projeção central definida acima
  -- evita divisão por zero; o template deve ser recusado somente porque o QR
  -- realmente cobre os demais itens obrigatórios.
  v_full_template := public.assinatura_eletronica_template_carimbo_v5_padrao();
  v_full_template := pg_catalog.jsonb_set(
    v_full_template,
    '{elements,9,xBp}',
    '0'::jsonb
  );
  v_full_template := pg_catalog.jsonb_set(
    v_full_template,
    '{elements,9,yBp}',
    '0'::jsonb
  );
  v_full_template := pg_catalog.jsonb_set(
    v_full_template,
    '{elements,9,widthBp}',
    '100000'::jsonb
  );
  v_full_template := pg_catalog.jsonb_set(
    v_full_template,
    '{elements,9,heightBp}',
    '100000'::jsonb
  );

  IF public.assinatura_eletronica_template_carimbo_v5_valido(v_full_template)
     IS DISTINCT FROM false
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_CARIMBO_QR_EDGE_V6_FRAME_100_INESPERADO';
  END IF;
END;
$migration$;

COMMIT;
