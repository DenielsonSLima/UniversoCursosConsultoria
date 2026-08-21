-- ---------------------------------------------------------------------------
-- Assinatura eletrônica de Diário v7: acervo compatível com o conjunto v6.
--
-- Incremental sobre a v6 já aplicada. Não reescreve provas individuais v1,
-- não altera envelopes históricos e não amplia a elegibilidade de artefatos.
-- O snapshot de política decide o contrato: v6 valida a cadeia 1..6; qualquer
-- outro snapshot preserva literalmente a regra histórica Professor/Coordenador
-- assinados com nome não vazio (= 2).
-- ---------------------------------------------------------------------------

BEGIN;

-- A listagem é um endpoint autenticado SECURITY DEFINER. Patchamos somente o
-- predicado que escondia envelopes v6; os filtros de perfil, polo, sessão,
-- artefato e a agregação legada de metadados permanecem intocados.
DO $migration$
DECLARE
  v_definition text;
  v_patched text;
  v_old text;
  v_new text;
  v_legacy_predicate text;
  v_occurrences integer;
  v_security_definer_before boolean;
  v_security_definer_after boolean;
  v_proconfig_before text[];
  v_proconfig_after text[];
  v_acl_before aclitem[];
  v_acl_after aclitem[];
BEGIN
  IF pg_catalog.to_regprocedure(
    'public.assinatura_eletronica_listar_acervo_gestor(uuid,uuid,text,text,text,uuid,timestamp with time zone,timestamp with time zone,integer,timestamp with time zone,uuid)'
  ) IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_ACERVO_V7_LISTAR_REGPROCEDURE_AUSENTE';
  END IF;
  IF pg_catalog.to_regprocedure(
    'public.assinatura_eletronica_politica_diario_signatarios_v6_valida(jsonb)'
  ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.assinatura_eletronica_validacao_publica_diario_v6_ou_legado_val(uuid)'
     ) IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_ACERVO_V7_HELPER_V6_AUSENTE';
  END IF;

  SELECT
    procedimento.prosecdef,
    procedimento.proconfig,
    procedimento.proacl
  INTO
    v_security_definer_before,
    v_proconfig_before,
    v_acl_before
  FROM pg_catalog.pg_proc AS procedimento
  WHERE procedimento.oid = 'public.assinatura_eletronica_listar_acervo_gestor(uuid,uuid,text,text,text,uuid,timestamp with time zone,timestamp with time zone,integer,timestamp with time zone,uuid)'::regprocedure;

  IF v_security_definer_before IS NOT TRUE
     OR v_proconfig_before IS NULL
     OR NOT (v_proconfig_before @> ARRAY['search_path=""']::text[])
     OR NOT pg_catalog.has_function_privilege(
       'authenticated',
       'public.assinatura_eletronica_listar_acervo_gestor(uuid,uuid,text,text,text,uuid,timestamp with time zone,timestamp with time zone,integer,timestamp with time zone,uuid)'::regprocedure,
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'anon',
       'public.assinatura_eletronica_listar_acervo_gestor(uuid,uuid,text,text,text,uuid,timestamp with time zone,timestamp with time zone,integer,timestamp with time zone,uuid)'::regprocedure,
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'service_role',
       'public.assinatura_eletronica_listar_acervo_gestor(uuid,uuid,text,text,text,uuid,timestamp with time zone,timestamp with time zone,integer,timestamp with time zone,uuid)'::regprocedure,
       'EXECUTE'
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_ACERVO_V7_LISTAR_ACL_DRIFT';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'public.assinatura_eletronica_listar_acervo_gestor(uuid,uuid,text,text,text,uuid,timestamp with time zone,timestamp with time zone,integer,timestamp with time zone,uuid)'::regprocedure
  ) INTO v_definition;
  IF pg_catalog.strpos(
    v_definition,
    'assinatura_eletronica_politica_diario_signatarios_v6_valida'
  ) > 0
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_ACERVO_V7_LISTAR_JA_PATCHED';
  END IF;

  v_legacy_predicate := E'(\n        SELECT count(*)\n        FROM public.assinatura_eletronica_participantes AS participante_shape\n        WHERE participante_shape.envelope_id = envelope.id\n          AND participante_shape.papel IN (\'PROFESSOR\', \'COORDENADOR\')\n          AND participante_shape.status = \'ASSINADO\'\n          AND nullif(btrim(\n            participante_shape.identidade_snapshot ->> \'name\'\n          ), \'\') IS NOT NULL\n      ) = 2';
  v_old := E'      AND ' || v_legacy_predicate;
  v_new :=
    E'      AND (\n'
    || E'        CASE\n'
    || E'          WHEN coalesce(\n'
    || E'            public.assinatura_eletronica_politica_diario_signatarios_v6_valida(\n'
    || E'              envelope.politica_snapshot\n'
    || E'            ),\n'
    || E'            false\n'
    || E'          ) THEN\n'
    || E'            public.assinatura_eletronica_validacao_publica_diario_v6_ou_legado_val(\n'
    || E'              envelope.id\n'
    || E'            )\n'
    || E'          ELSE\n'
    || E'            ' || v_legacy_predicate || E'\n'
    || E'        END\n'
    || E'      )';
  v_occurrences := (
    pg_catalog.length(v_definition)
    - pg_catalog.length(pg_catalog.replace(v_definition, v_old, ''))
  ) / pg_catalog.length(v_old);
  IF v_occurrences <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_ACERVO_V7_LISTAR_PREDICADO_DRIFT';
  END IF;
  v_patched := pg_catalog.replace(v_definition, v_old, v_new);
  IF v_patched IS NOT DISTINCT FROM v_definition
     OR pg_catalog.strpos(
       v_patched,
       'assinatura_eletronica_validacao_publica_diario_v6_ou_legado_val'
     ) = 0
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_ACERVO_V7_LISTAR_PATCH_INCOMPLETO';
  END IF;
  EXECUTE v_patched;

  SELECT
    procedimento.prosecdef,
    procedimento.proconfig,
    procedimento.proacl
  INTO
    v_security_definer_after,
    v_proconfig_after,
    v_acl_after
  FROM pg_catalog.pg_proc AS procedimento
  WHERE procedimento.oid = 'public.assinatura_eletronica_listar_acervo_gestor(uuid,uuid,text,text,text,uuid,timestamp with time zone,timestamp with time zone,integer,timestamp with time zone,uuid)'::regprocedure;
  IF v_security_definer_after IS DISTINCT FROM v_security_definer_before
     OR v_proconfig_after IS DISTINCT FROM v_proconfig_before
     OR v_acl_after IS DISTINCT FROM v_acl_before
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_ACERVO_V7_LISTAR_ACL_ALTERADA';
  END IF;
END;
$migration$;

-- As opções de turma usam o mesmo predicado de integridade. Mantemos a mesma
-- checagem transacional para que uma divergência em qualquer RPC pare o lote.
DO $migration$
DECLARE
  v_definition text;
  v_patched text;
  v_old text;
  v_new text;
  v_legacy_predicate text;
  v_occurrences integer;
  v_security_definer_before boolean;
  v_security_definer_after boolean;
  v_proconfig_before text[];
  v_proconfig_after text[];
  v_acl_before aclitem[];
  v_acl_after aclitem[];
BEGIN
  IF pg_catalog.to_regprocedure(
    'public.assinatura_eletronica_opcoes_acervo_gestor(uuid,uuid)'
  ) IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_ACERVO_V7_OPCOES_REGPROCEDURE_AUSENTE';
  END IF;
  IF pg_catalog.to_regprocedure(
    'public.assinatura_eletronica_politica_diario_signatarios_v6_valida(jsonb)'
  ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.assinatura_eletronica_validacao_publica_diario_v6_ou_legado_val(uuid)'
     ) IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_ACERVO_V7_HELPER_V6_AUSENTE';
  END IF;

  SELECT
    procedimento.prosecdef,
    procedimento.proconfig,
    procedimento.proacl
  INTO
    v_security_definer_before,
    v_proconfig_before,
    v_acl_before
  FROM pg_catalog.pg_proc AS procedimento
  WHERE procedimento.oid = 'public.assinatura_eletronica_opcoes_acervo_gestor(uuid,uuid)'::regprocedure;

  IF v_security_definer_before IS NOT TRUE
     OR v_proconfig_before IS NULL
     OR NOT (v_proconfig_before @> ARRAY['search_path=""']::text[])
     OR NOT pg_catalog.has_function_privilege(
       'authenticated',
       'public.assinatura_eletronica_opcoes_acervo_gestor(uuid,uuid)'::regprocedure,
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'anon',
       'public.assinatura_eletronica_opcoes_acervo_gestor(uuid,uuid)'::regprocedure,
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'service_role',
       'public.assinatura_eletronica_opcoes_acervo_gestor(uuid,uuid)'::regprocedure,
       'EXECUTE'
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_ACERVO_V7_OPCOES_ACL_DRIFT';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'public.assinatura_eletronica_opcoes_acervo_gestor(uuid,uuid)'::regprocedure
  ) INTO v_definition;
  IF pg_catalog.strpos(
    v_definition,
    'assinatura_eletronica_politica_diario_signatarios_v6_valida'
  ) > 0
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_ACERVO_V7_OPCOES_JA_PATCHED';
  END IF;

  v_legacy_predicate := E'(\n        SELECT count(*)\n        FROM public.assinatura_eletronica_participantes AS participante_shape\n        WHERE participante_shape.envelope_id = envelope.id\n          AND participante_shape.papel IN (\'PROFESSOR\', \'COORDENADOR\')\n          AND participante_shape.status = \'ASSINADO\'\n          AND nullif(btrim(\n            participante_shape.identidade_snapshot ->> \'name\'\n          ), \'\') IS NOT NULL\n      ) = 2';
  v_old := E'      AND ' || v_legacy_predicate;
  v_new :=
    E'      AND (\n'
    || E'        CASE\n'
    || E'          WHEN coalesce(\n'
    || E'            public.assinatura_eletronica_politica_diario_signatarios_v6_valida(\n'
    || E'              envelope.politica_snapshot\n'
    || E'            ),\n'
    || E'            false\n'
    || E'          ) THEN\n'
    || E'            public.assinatura_eletronica_validacao_publica_diario_v6_ou_legado_val(\n'
    || E'              envelope.id\n'
    || E'            )\n'
    || E'          ELSE\n'
    || E'            ' || v_legacy_predicate || E'\n'
    || E'        END\n'
    || E'      )';
  v_occurrences := (
    pg_catalog.length(v_definition)
    - pg_catalog.length(pg_catalog.replace(v_definition, v_old, ''))
  ) / pg_catalog.length(v_old);
  IF v_occurrences <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_ACERVO_V7_OPCOES_PREDICADO_DRIFT';
  END IF;
  v_patched := pg_catalog.replace(v_definition, v_old, v_new);
  IF v_patched IS NOT DISTINCT FROM v_definition
     OR pg_catalog.strpos(
       v_patched,
       'assinatura_eletronica_validacao_publica_diario_v6_ou_legado_val'
     ) = 0
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_ACERVO_V7_OPCOES_PATCH_INCOMPLETO';
  END IF;
  EXECUTE v_patched;

  SELECT
    procedimento.prosecdef,
    procedimento.proconfig,
    procedimento.proacl
  INTO
    v_security_definer_after,
    v_proconfig_after,
    v_acl_after
  FROM pg_catalog.pg_proc AS procedimento
  WHERE procedimento.oid = 'public.assinatura_eletronica_opcoes_acervo_gestor(uuid,uuid)'::regprocedure;
  IF v_security_definer_after IS DISTINCT FROM v_security_definer_before
     OR v_proconfig_after IS DISTINCT FROM v_proconfig_before
     OR v_acl_after IS DISTINCT FROM v_acl_before
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSINATURA_ACERVO_V7_OPCOES_ACL_ALTERADA';
  END IF;
END;
$migration$;

COMMIT;
