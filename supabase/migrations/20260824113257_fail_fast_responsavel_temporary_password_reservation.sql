-- A reserva do Responsavel nao pode aguardar a credencial global depois de
-- travar sua linha. Antes das guardas compartilhadas, a disputa vira
-- serialization failure recuperavel.

BEGIN;

CREATE OR REPLACE FUNCTION
  public.portal_reservar_emissao_senha_temporaria_responsavel(
    p_responsavel_legal_id uuid,
    p_emissao_id uuid,
    p_actor_auth_user_id uuid
  )
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_preparacao jsonb;
  v_responsavel public.responsaveis_legais%ROWTYPE;
  v_auth_email text;
  v_auth_email_confirmado_em timestamptz;
BEGIN
  IF p_responsavel_legal_id IS NULL OR p_emissao_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE =
        'PORTAL_EMISSAO_SENHA_TEMPORARIA_RESPONSAVEL_PARAMETROS_INVALIDOS';
  END IF;

  v_preparacao := public.responsavel_legal_acesso_preparar(
    p_responsavel_legal_id,
    p_actor_auth_user_id
  );
  IF NOT coalesce((v_preparacao ->> 'eligible')::boolean, false) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'RESPONSAVEL_ACESSO_BLOQUEADO: ' || coalesce(
        v_preparacao ->> 'accessBlockReason',
        'REQUISITOS_INCOMPLETOS'
      );
  END IF;

  SELECT responsavel.*
  INTO v_responsavel
  FROM public.responsaveis_legais AS responsavel
  WHERE responsavel.id = p_responsavel_legal_id
  FOR UPDATE;

  IF NOT FOUND OR v_responsavel.auth_user_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'RESPONSAVEL_ACESSO_AUTH_OBRIGATORIO';
  END IF;

  -- A autorizacao e a elegibilidade podem mudar enquanto a linha era obtida.
  v_preparacao := public.responsavel_legal_acesso_preparar(
    p_responsavel_legal_id,
    p_actor_auth_user_id
  );
  IF NOT coalesce((v_preparacao ->> 'eligible')::boolean, false) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'RESPONSAVEL_ACESSO_BLOQUEADO: ' || coalesce(
        v_preparacao ->> 'accessBlockReason',
        'REQUISITOS_INCOMPLETOS'
      );
  END IF;

  IF NOT pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'portal-temporary-password-auth:' || v_responsavel.auth_user_id::text,
      0
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'PORTAL_IDENTIDADE_CREDENCIAL_COMPARTILHADA_OCUPADA';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.parceiros AS outro_perfil
    WHERE outro_perfil.auth_user_id = v_responsavel.auth_user_id
  ) OR EXISTS (
    SELECT 1
    FROM public.usuarios_sistema AS usuario_interno
    WHERE usuario_interno.auth_user_id = v_responsavel.auth_user_id
  ) OR EXISTS (
    SELECT 1
    FROM public.responsaveis_legais AS outro_responsavel
    WHERE outro_responsavel.auth_user_id = v_responsavel.auth_user_id
      AND outro_responsavel.id <> v_responsavel.id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE =
        'PORTAL_EMISSAO_SENHA_TEMPORARIA_RESPONSAVEL_IDENTIDADE_MULTIPERFIL';
  END IF;

  SELECT
    lower(btrim(usuario_auth.email)),
    usuario_auth.email_confirmed_at
  INTO v_auth_email, v_auth_email_confirmado_em
  FROM auth.users AS usuario_auth
  WHERE usuario_auth.id = v_responsavel.auth_user_id;

  IF v_auth_email IS NULL OR v_auth_email IS DISTINCT FROM v_responsavel.email THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'RESPONSAVEL_AUTH_EMAIL_DIVERGENTE';
  END IF;

  IF v_responsavel.email_validado_gestor_em IS NULL
     AND v_auth_email_confirmado_em IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'PORTAL_EMISSAO_SENHA_TEMPORARIA_EMAIL_NAO_VALIDADO';
  END IF;

  IF coalesce((v_preparacao ->> 'firstAccessPending')::boolean, true) = false THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'PORTAL_EMISSAO_SENHA_TEMPORARIA_PRIMEIRO_ACESSO_CONCLUIDO';
  END IF;

  IF v_responsavel.senha_temporaria_emissao_id IS NOT NULL THEN
    RETURN v_responsavel.senha_temporaria_emissao_iniciada_em IS NOT NULL
      AND v_responsavel.senha_temporaria_emissao_id = p_emissao_id;
  END IF;

  UPDATE public.responsaveis_legais AS responsavel
  SET
    troca_senha_obrigatoria = true,
    senha_temporaria_pendente = true,
    senha_temporaria_emitida_em = NULL,
    senha_atualizada_em = NULL,
    senha_temporaria_emissao_id = p_emissao_id,
    senha_temporaria_emissao_iniciada_em = pg_catalog.clock_timestamp(),
    senha_temporaria_emissao_senha_alterada_em = NULL
  WHERE responsavel.id = p_responsavel_legal_id;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION
  public.portal_reservar_emissao_senha_temporaria_responsavel(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.portal_reservar_emissao_senha_temporaria_responsavel(uuid, uuid, uuid)
  TO service_role;

COMMIT;
