-- Vincula Responsavel somente quando todos os perfis ja associados ao Auth
-- comprovam a mesma identidade civil. O CPF aceita dados legados formatados,
-- mas a comparacao continua canonicamente numerica e fail-closed.

BEGIN;

CREATE OR REPLACE FUNCTION public.responsavel_legal_acesso_vincular(
  p_responsavel_legal_id uuid,
  p_auth_user_id uuid,
  p_actor_auth_user_id uuid,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_contexto jsonb;
  v_preparacao jsonb;
  v_payload_sha256 text;
  v_replay jsonb;
  v_responsavel public.responsaveis_legais%ROWTYPE;
  v_auth_email text;
  v_resultado jsonb;
BEGIN
  -- A autorizacao humana e revalidada antes de qualquer replay idempotente.
  v_contexto := public.portal_identidade_exigir_service_role_actor(
    p_actor_auth_user_id
  );

  IF p_responsavel_legal_id IS NULL OR p_auth_user_id IS NULL
     OR p_request_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PORTAL_IDENTIDADE_PARAMETROS_OBRIGATORIOS';
  END IF;

  v_preparacao := public.responsavel_legal_acesso_preparar(
    p_responsavel_legal_id,
    p_actor_auth_user_id
  );
  IF NOT coalesce((v_preparacao ->> 'eligible')::boolean, false) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'RESPONSAVEL_ACESSO_BLOQUEADO: ' ||
        coalesce(v_preparacao ->> 'accessBlockReason', 'REQUISITOS_INCOMPLETOS');
  END IF;

  v_payload_sha256 := public.portal_identidade_payload_sha256(
    pg_catalog.jsonb_build_object(
      'responsavelLegalId', p_responsavel_legal_id,
      'authUserId', p_auth_user_id
    )
  );
  v_replay := public.portal_identidade_obter_replay(
    p_actor_auth_user_id,
    p_request_id,
    'RESPONSAVEL_ACESSO_VINCULAR',
    v_payload_sha256
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  SELECT responsavel.*
  INTO v_responsavel
  FROM public.responsaveis_legais AS responsavel
  WHERE responsavel.id = p_responsavel_legal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'RESPONSAVEL_NAO_ENCONTRADO';
  END IF;

  -- A linha ja esta travada. Nao espere outra transacao que possa precisar
  -- dela: falhe com serializacao e permita retry integral da operacao.
  IF NOT pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'portal-temporary-password-auth:' || p_auth_user_id::text,
      0
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'PORTAL_IDENTIDADE_CREDENCIAL_COMPARTILHADA_OCUPADA';
  END IF;
  IF NOT pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'portal-auth-identity:' || p_auth_user_id::text,
      0
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'PORTAL_IDENTIDADE_VINCULO_CONCORRENTE';
  END IF;

  -- Repete elegibilidade e escopo depois do lock para impedir TOCTOU.
  v_preparacao := public.responsavel_legal_acesso_preparar(
    p_responsavel_legal_id,
    p_actor_auth_user_id
  );
  IF NOT coalesce((v_preparacao ->> 'eligible')::boolean, false) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'RESPONSAVEL_ACESSO_BLOQUEADO: ' ||
        coalesce(v_preparacao ->> 'accessBlockReason', 'REQUISITOS_INCOMPLETOS');
  END IF;

  SELECT lower(btrim(usuario_auth.email))
  INTO v_auth_email
  FROM auth.users AS usuario_auth
  WHERE usuario_auth.id = p_auth_user_id;

  IF v_auth_email IS NULL OR v_auth_email IS DISTINCT FROM v_responsavel.email THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'RESPONSAVEL_AUTH_EMAIL_DIVERGENTE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.responsaveis_legais AS outro_responsavel
    WHERE outro_responsavel.auth_user_id = p_auth_user_id
      AND outro_responsavel.id <> v_responsavel.id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'AUTH_USER_JA_VINCULADO_A_OUTRO_RESPONSAVEL';
  END IF;

  -- Qualquer perfil divergente invalida o vinculo. Uma correspondencia valida
  -- nao encobre outra linha antiga com CPF ou e-mail incompatível no mesmo UID.
  IF EXISTS (
    SELECT 1
    FROM public.parceiros AS parceiro
    WHERE parceiro.auth_user_id = p_auth_user_id
      AND (
        pg_catalog.regexp_replace(
          coalesce(parceiro.cpf_cnpj, ''),
          '[^0-9]',
          '',
          'g'
        ) IS DISTINCT FROM v_responsavel.cpf_normalizado
        OR lower(coalesce(
          nullif(btrim(parceiro.auth_login_email), ''),
          nullif(btrim(parceiro.email), '')
        )) IS DISTINCT FROM v_responsavel.email
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.usuarios_sistema AS gestor
    WHERE gestor.auth_user_id = p_auth_user_id
      AND (
        pg_catalog.regexp_replace(
          coalesce(gestor.cpf, ''),
          '[^0-9]',
          '',
          'g'
        ) IS DISTINCT FROM v_responsavel.cpf_normalizado
        OR lower(nullif(btrim(gestor.email), '')) IS DISTINCT FROM
          v_responsavel.email
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'RESPONSAVEL_IDENTIDADE_MULTIPERFIL_DIVERGENTE';
  END IF;

  IF v_responsavel.auth_user_id IS NOT NULL
     AND v_responsavel.auth_user_id IS DISTINCT FROM p_auth_user_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'RESPONSAVEL_ACESSO_JA_VINCULADO';
  END IF;

  IF v_responsavel.auth_user_id IS NULL THEN
    UPDATE public.responsaveis_legais
    SET
      auth_user_id = p_auth_user_id,
      atualizado_por = p_actor_auth_user_id
    WHERE id = p_responsavel_legal_id
    RETURNING * INTO v_responsavel;
  END IF;

  v_resultado := pg_catalog.jsonb_build_object(
    'responsavelLegalId', v_responsavel.id,
    'authUserId', v_responsavel.auth_user_id,
    'linked', true
  );

  RETURN public.portal_identidade_registrar_operacao(
    p_actor_auth_user_id,
    p_request_id,
    'RESPONSAVEL_ACESSO_VINCULAR',
    v_payload_sha256,
    v_resultado
  );
END;
$function$;

REVOKE ALL ON FUNCTION
  public.responsavel_legal_acesso_vincular(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.responsavel_legal_acesso_vincular(uuid, uuid, uuid, uuid)
  TO service_role;

COMMENT ON FUNCTION
  public.responsavel_legal_acesso_vincular(uuid, uuid, uuid, uuid) IS
  'Vincula Auth ao Responsavel sob lock quando todos os perfis provam CPF e e-mail canonicos.';

COMMIT;
