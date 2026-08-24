-- Corrige a resolução PL/pgSQL dos escopos de coordenação mesclados no
-- único perfil Professor. A versão anterior qualificava todas as referências
-- externas, exceto a coluna contextId dentro da subconsulta correlacionada.

BEGIN;

CREATE OR REPLACE FUNCTION public.portal_listar_perfis()
RETURNS TABLE (
  role text,
  "contextId" uuid,
  label text,
  "homeRoute" text,
  capabilities text[],
  "poloIds" uuid[],
  "allPolos" boolean,
  "requiresPoloSelection" boolean,
  scopes jsonb,
  "firstAccess" jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_termos_versao_vigente text :=
    public.portal_identidade_termos_versao_vigente();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'AUTENTICACAO_OBRIGATORIA';
  END IF;

  RETURN QUERY
  WITH perfis_base AS MATERIALIZED (
    SELECT perfil.*
    FROM public.portal_listar_perfis_base_20260821234000() AS perfil
  ), coordenacao_polos AS (
    SELECT
      coordenacao."contextId",
      polo.polo_id
    FROM perfis_base AS coordenacao
    CROSS JOIN LATERAL unnest(
      coalesce(coordenacao."poloIds", ARRAY[]::uuid[])
    ) AS polo(polo_id)
    WHERE upper(coordenacao.role) = 'COORDENADOR'
  ), coordenacao_scopes AS (
    SELECT
      coordenacao."contextId",
      item.scope
    FROM perfis_base AS coordenacao
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(coordenacao.scopes) = 'array'
          THEN coordenacao.scopes
        ELSE '[]'::jsonb
      END
    ) AS item(scope)
    WHERE upper(coordenacao.role) = 'COORDENADOR'
  ), coordenacoes AS (
    SELECT DISTINCT coordenacao."contextId"
    FROM perfis_base AS coordenacao
    WHERE upper(coordenacao.role) = 'COORDENADOR'
  ), perfis_mesclados AS (
    SELECT
      perfil.role,
      perfil."contextId",
      perfil.label,
      perfil."homeRoute",
      CASE
        WHEN upper(perfil.role) = 'PROFESSOR'
             AND coordenacao."contextId" IS NOT NULL
          THEN ARRAY(
            SELECT DISTINCT capability
            FROM unnest(
              coalesce(perfil.capabilities, ARRAY[]::text[])
              || ARRAY[
                'ASSINATURAS_COORDENADOR',
                'DIARIO_REVISAR_COORDENACAO'
              ]::text[]
            ) AS item(capability)
            ORDER BY capability
          )
        ELSE perfil.capabilities
      END AS capabilities,
      CASE
        WHEN upper(perfil.role) = 'PROFESSOR'
             AND coordenacao."contextId" IS NOT NULL
          THEN ARRAY(
            SELECT DISTINCT polo_id
            FROM (
              SELECT unnest(
                coalesce(perfil."poloIds", ARRAY[]::uuid[])
              ) AS polo_id
              UNION ALL
              SELECT polo.polo_id
              FROM coordenacao_polos AS polo
              WHERE polo."contextId" = perfil."contextId"
            ) AS polos
            ORDER BY polo_id
          )
        ELSE perfil."poloIds"
      END AS "poloIds",
      perfil."allPolos",
      coalesce(perfil.scopes, '[]'::jsonb) || coalesce((
        SELECT jsonb_agg(escopo.scope ORDER BY escopo.scope::text)
        FROM (
          SELECT DISTINCT coordenacao_scope.scope
          FROM coordenacao_scopes AS coordenacao_scope
          WHERE coordenacao_scope."contextId" = perfil."contextId"
        ) AS escopo
      ), '[]'::jsonb) AS scopes,
      perfil."firstAccess"
    FROM perfis_base AS perfil
    LEFT JOIN coordenacoes AS coordenacao
      ON coordenacao."contextId" = perfil."contextId"
      AND upper(perfil.role) = 'PROFESSOR'
    WHERE upper(perfil.role) <> 'COORDENADOR'
  ), perfis_apresentados AS (
    SELECT
      perfil.*,
      cardinality(coalesce(perfil."poloIds", ARRAY[]::uuid[])) > 1
        AS "requiresPoloSelection"
    FROM perfis_mesclados AS perfil
  )
  SELECT
    perfil.role,
    perfil."contextId",
    perfil.label,
    perfil."homeRoute",
    perfil.capabilities,
    perfil."poloIds",
    perfil."allPolos",
    perfil."requiresPoloSelection",
    perfil.scopes,
    CASE
      WHEN perfil.role = 'RESPONSAVEL_LEGAL' THEN (
        SELECT jsonb_build_object(
          'acceptedTermsAt', CASE
            WHEN coalesce(responsavel.aceitou_termos_uso, false)
              AND responsavel.termos_uso_versao = v_termos_versao_vigente
              THEN responsavel.aceitou_termos_uso_em
            ELSE NULL
          END,
          'acceptedTermsVersion', CASE
            WHEN coalesce(responsavel.aceitou_termos_uso, false)
              AND responsavel.termos_uso_versao = v_termos_versao_vigente
              THEN responsavel.termos_uso_versao
            ELSE NULL
          END,
          'requiresPasswordReset', (
            responsavel.senha_atualizada_em IS NULL
            OR coalesce(responsavel.troca_senha_obrigatoria, false)
            OR (
              coalesce(responsavel.senha_temporaria_pendente, false)
              AND (
                responsavel.senha_temporaria_emitida_em IS NULL
                OR responsavel.senha_atualizada_em IS NULL
                OR responsavel.senha_atualizada_em <=
                  responsavel.senha_temporaria_emitida_em
              )
            )
          )
        )
        FROM public.responsaveis_legais AS responsavel
        WHERE responsavel.id = perfil."contextId"
          AND responsavel.auth_user_id = v_actor
      )
      ELSE perfil."firstAccess"
    END
  FROM perfis_apresentados AS perfil
  WHERE CASE upper(perfil.role)
    WHEN 'GESTOR' THEN coalesce(
      public.portal_identidade_institucional_acesso_liberado(
        v_actor, 'GESTOR'
      ), false
    )
    WHEN 'PROFESSOR' THEN coalesce(
      public.portal_identidade_institucional_acesso_liberado(
        v_actor, 'PROFESSOR'
      ), false
    )
    ELSE true
  END;
END;
$function$;

REVOKE ALL ON FUNCTION public.portal_listar_perfis()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_listar_perfis()
  TO authenticated;

COMMENT ON FUNCTION public.portal_listar_perfis() IS
  'Lista um único perfil Professor e incorpora nele os escopos ativos de coordenação de curso; não expõe portal Coordenador.';

COMMIT;
