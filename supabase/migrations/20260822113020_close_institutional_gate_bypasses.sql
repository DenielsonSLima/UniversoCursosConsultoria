-- Fecha RPCs SECURITY DEFINER e leituras próprias sem alterar seus OIDs.

BEGIN;

CREATE OR REPLACE FUNCTION public.portal_identidade_actor_gestor_contexto(
  p_actor_auth_user_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH base AS (
    SELECT
      usuario.auth_user_id,
      usuario.context,
      coalesce(usuario.polo_ids, ARRAY[]::uuid[]) AS polo_ids,
      CASE
        WHEN usuario.perfil_acesso_id IS NOT NULL
          AND NOT coalesce(usuario.personalizar_permissoes, false)
          AND perfil.id IS NOT NULL
          THEN coalesce(perfil.permissoes, '{}'::jsonb)
        ELSE coalesce(usuario.permissoes, '{}'::jsonb)
      END AS permissoes_base,
      coalesce(usuario.permissoes, '{}'::jsonb) AS permissoes_usuario,
      coalesce(
        usuario.restricao_horario,
        CASE
          WHEN usuario.perfil_acesso_id IS NOT NULL
            THEN perfil.restricao_horario
          ELSE NULL
        END,
        '{"ativo":false,"dias":[1,2,3,4,5,6],"horario_inicio":"00:00","horario_fim":"23:59"}'::jsonb
      ) AS horario
    FROM public.usuarios_sistema AS usuario
    LEFT JOIN public.perfis_acesso AS perfil
      ON perfil.id = usuario.perfil_acesso_id
    WHERE usuario.auth_user_id = p_actor_auth_user_id
      AND public.is_active_status(usuario.status)
      AND coalesce(
        public.portal_identidade_institucional_acesso_liberado(
          p_actor_auth_user_id, 'GESTOR'
        ), false
      )
    LIMIT 1
  ), efetivo AS (
    SELECT
      base.*,
      pg_catalog.jsonb_set(
        base.permissoes_base,
        '{allPolos}',
        pg_catalog.to_jsonb(
          CASE
            WHEN pg_catalog.jsonb_typeof(
              base.permissoes_usuario -> 'allPolos'
            ) = 'boolean'
              THEN (base.permissoes_usuario ->> 'allPolos')::boolean
            ELSE false
          END
        ),
        true
      ) AS permissoes,
      pg_catalog.date_part(
        'dow',
        pg_catalog.statement_timestamp() AT TIME ZONE 'America/Maceio'
      )::integer AS dia_atual,
      pg_catalog.to_char(
        pg_catalog.statement_timestamp() AT TIME ZONE 'America/Maceio',
        'HH24:MI'
      ) AS hora_atual
    FROM base
  ), autorizado AS (
    SELECT
      efetivo.*,
      CASE
        WHEN pg_catalog.jsonb_typeof(efetivo.horario -> 'ativo') <> 'boolean'
          THEN false
        WHEN NOT (efetivo.horario ->> 'ativo')::boolean THEN true
        WHEN pg_catalog.jsonb_typeof(efetivo.horario -> 'dias') <> 'array'
          THEN false
        WHEN (efetivo.horario ->> 'horario_inicio')
          !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN false
        WHEN (efetivo.horario ->> 'horario_fim')
          !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN false
        WHEN (efetivo.horario ->> 'horario_inicio') =
          (efetivo.horario ->> 'horario_fim') THEN false
        WHEN (efetivo.horario ->> 'horario_inicio') <
          (efetivo.horario ->> 'horario_fim') THEN
          efetivo.hora_atual BETWEEN
            (efetivo.horario ->> 'horario_inicio')
            AND (efetivo.horario ->> 'horario_fim')
          AND EXISTS (
            SELECT 1
            FROM pg_catalog.jsonb_array_elements_text(
              efetivo.horario -> 'dias'
            ) AS dia_permitido(valor)
            WHERE dia_permitido.valor::integer = efetivo.dia_atual
          )
        WHEN efetivo.hora_atual >=
          (efetivo.horario ->> 'horario_inicio') THEN EXISTS (
            SELECT 1
            FROM pg_catalog.jsonb_array_elements_text(
              efetivo.horario -> 'dias'
            ) AS dia_permitido(valor)
            WHERE dia_permitido.valor::integer = efetivo.dia_atual
          )
        WHEN efetivo.hora_atual <=
          (efetivo.horario ->> 'horario_fim') THEN EXISTS (
            SELECT 1
            FROM pg_catalog.jsonb_array_elements_text(
              efetivo.horario -> 'dias'
            ) AS dia_permitido(valor)
            WHERE dia_permitido.valor::integer =
              ((efetivo.dia_atual + 6) % 7)
          )
        ELSE false
      END AS horario_permitido
    FROM efetivo
  )
  SELECT pg_catalog.jsonb_build_object(
    'actorAuthUserId', autorizado.auth_user_id,
    'allPolos',
      coalesce((autorizado.permissoes ->> 'allPolos')::boolean, false)
      AND pg_catalog.cardinality(autorizado.polo_ids) = 0
      AND (
        nullif(lower(btrim(coalesce(autorizado.context, ''))), '') IS NULL
        OR lower(btrim(autorizado.context)) = 'global'
        OR (
          autorizado.context ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND EXISTS (
            SELECT 1
            FROM public.polos AS matriz
            WHERE matriz.id = autorizado.context::uuid
              AND coalesce(matriz.is_matriz, false)
              AND coalesce(public.is_active_status(matriz.status), false)
          )
        )
      ),
    'poloIds', CASE
      WHEN pg_catalog.cardinality(autorizado.polo_ids) > 0
        THEN pg_catalog.to_jsonb(autorizado.polo_ids)
      WHEN autorizado.context ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN pg_catalog.jsonb_build_array(autorizado.context::uuid)
      ELSE pg_catalog.jsonb_build_array()
    END
  )
  FROM autorizado
  WHERE autorizado.horario_permitido
    AND pg_catalog.jsonb_typeof(autorizado.permissoes -> 'modules') = 'array'
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_array_elements_text(
        autorizado.permissoes -> 'modules'
      ) AS modulo(valor)
      WHERE modulo.valor = 'parceiros'
    );
$function$;

REVOKE ALL ON FUNCTION public.portal_identidade_actor_gestor_contexto(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_identidade_actor_gestor_contexto(uuid)
  TO service_role;

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
        SELECT pg_catalog.jsonb_build_object(
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
  FROM public.portal_listar_perfis_base_20260821234000() AS perfil
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
    WHEN 'COORDENADOR' THEN coalesce(
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

CREATE OR REPLACE FUNCTION public.salvar_meu_perfil_gestor(
  p_nome text,
  p_telefone text,
  p_foto_path text
)
RETURNS TABLE (
  id uuid,
  nome text,
  email text,
  telefone text,
  foto_path text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_nome text := btrim(coalesce(p_nome, ''));
  v_telefone text := nullif(btrim(coalesce(p_telefone, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida. Entre novamente para alterar seu perfil.'
      USING ERRCODE = '42501';
  END IF;
  IF NOT coalesce(
    public.portal_identidade_institucional_acesso_liberado(
      auth.uid(), 'GESTOR'
    ), false
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'PRIMEIRO_ACESSO_INSTITUCIONAL_PENDENTE';
  END IF;
  IF char_length(v_nome) < 3 OR char_length(v_nome) > 120 THEN
    RAISE EXCEPTION 'Informe um nome entre 3 e 120 caracteres.'
      USING ERRCODE = '22023';
  END IF;
  IF v_telefone IS NULL
     OR v_telefone !~ '^\([0-9]{2}\) [0-9]{5}-[0-9]{4}$' THEN
    RAISE EXCEPTION 'Informe um celular válido com DDD.'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  UPDATE public.usuarios_sistema AS usuario
  SET nome = v_nome, telefone = v_telefone
  WHERE usuario.auth_user_id = auth.uid()
    AND lower(usuario.status) = 'ativo'
  RETURNING
    usuario.id, usuario.nome, usuario.email, usuario.telefone,
    usuario.foto_path;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil de gestor ativo não localizado para esta sessão.'
      USING ERRCODE = '42501';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.salvar_meu_perfil_gestor(text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.salvar_meu_perfil_gestor(text, text, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.salvar_meu_avatar_gestor(p_foto_path text)
RETURNS TABLE (
  id uuid,
  nome text,
  email text,
  telefone text,
  foto_path text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida. Entre novamente para alterar sua foto.'
      USING ERRCODE = '42501';
  END IF;
  IF NOT coalesce(
    public.portal_identidade_institucional_acesso_liberado(
      auth.uid(), 'GESTOR'
    ), false
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'PRIMEIRO_ACESSO_INSTITUCIONAL_PENDENTE';
  END IF;
  IF p_foto_path IS NOT NULL
     AND p_foto_path NOT LIKE (auth.uid()::text || '/avatar/%') THEN
    RAISE EXCEPTION 'O caminho da foto não pertence ao usuário autenticado.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  UPDATE public.usuarios_sistema AS usuario
  SET foto_path = p_foto_path
  WHERE usuario.auth_user_id = auth.uid()
    AND lower(usuario.status) = 'ativo'
  RETURNING
    usuario.id, usuario.nome, usuario.email, usuario.telefone,
    usuario.foto_path;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil de gestor ativo não localizado para esta sessão.'
      USING ERRCODE = '42501';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.salvar_meu_avatar_gestor(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.salvar_meu_avatar_gestor(text)
  TO authenticated;

DROP POLICY IF EXISTS portal_usuarios_sistema_select
  ON public.usuarios_sistema;
CREATE POLICY portal_usuarios_sistema_select
ON public.usuarios_sistema
FOR SELECT
TO authenticated
USING (
  (auth_user_id = (SELECT auth.uid()) AND public.is_gestor())
  OR (
    public.is_gestor_global()
    AND public.gestor_has_module('configuracoes')
  )
);

DROP POLICY IF EXISTS portal_perfis_acesso_select
  ON public.perfis_acesso;
CREATE POLICY portal_perfis_acesso_select
ON public.perfis_acesso
FOR SELECT
TO authenticated
USING (
  (
    public.is_gestor()
    AND EXISTS (
      SELECT 1
      FROM public.usuarios_sistema AS usuario
      WHERE usuario.auth_user_id = (SELECT auth.uid())
        AND public.is_active_status(usuario.status)
        AND usuario.perfil_acesso_id = perfis_acesso.id
    )
  )
  OR (
    public.is_gestor_global()
    AND public.gestor_has_module('configuracoes')
  )
);

COMMIT;
