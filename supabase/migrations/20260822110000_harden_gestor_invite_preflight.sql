-- Evita enviar convite de Gestor para dados que já colidem com o cadastro
-- interno e assina o marcador usado para reconciliar convites pendentes.
BEGIN;

-- O índice legado usa um escape que não remove pontuação com
-- standard_conforming_strings ativo. Este índice canônico fecha também a
-- janela de concorrência entre a pré-validação e o INSERT.
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_sistema_cpf_digits_unique_idx
  ON public.usuarios_sistema (
    pg_catalog.regexp_replace(coalesce(cpf, ''), '[^0-9]', '', 'g')
  )
  WHERE pg_catalog.regexp_replace(
    coalesce(cpf, ''),
    '[^0-9]',
    '',
    'g'
  ) <> '';

CREATE OR REPLACE FUNCTION public.portal_validar_unicidade_usuario_sistema(
  p_email text,
  p_cpf text
)
RETURNS TABLE (
  email_em_uso boolean,
  cpf_em_uso boolean,
  email_usuario_nome text,
  cpf_usuario_nome text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.usuarios_sistema AS usuario
      WHERE lower(btrim(usuario.email)) = lower(btrim(coalesce(p_email, '')))
    ) AS email_em_uso,
    EXISTS (
      SELECT 1
      FROM public.usuarios_sistema AS usuario
      WHERE pg_catalog.regexp_replace(
        coalesce(usuario.cpf, ''),
        '[^0-9]',
        '',
        'g'
      ) = pg_catalog.regexp_replace(coalesce(p_cpf, ''), '[^0-9]', '', 'g')
        AND pg_catalog.regexp_replace(coalesce(p_cpf, ''), '[^0-9]', '', 'g') <> ''
    ) AS cpf_em_uso,
    (
      SELECT usuario.nome
      FROM public.usuarios_sistema AS usuario
      WHERE lower(btrim(usuario.email)) = lower(btrim(coalesce(p_email, '')))
      ORDER BY usuario.created_at, usuario.id
      LIMIT 1
    ) AS email_usuario_nome,
    (
      SELECT usuario.nome
      FROM public.usuarios_sistema AS usuario
      WHERE pg_catalog.regexp_replace(
        coalesce(usuario.cpf, ''),
        '[^0-9]',
        '',
        'g'
      ) = pg_catalog.regexp_replace(coalesce(p_cpf, ''), '[^0-9]', '', 'g')
        AND pg_catalog.regexp_replace(coalesce(p_cpf, ''), '[^0-9]', '', 'g') <> ''
      ORDER BY usuario.created_at, usuario.id
      LIMIT 1
    ) AS cpf_usuario_nome;
$function$;

CREATE OR REPLACE FUNCTION public.portal_identidade_assinar_convite_gestor(
  p_current_actor_auth_user_id uuid,
  p_original_actor_auth_user_id uuid,
  p_request_id uuid,
  p_email text,
  p_cpf text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_cpf text := pg_catalog.regexp_replace(
    coalesce(p_cpf, ''),
    '[^0-9]',
    '',
    'g'
  );
  v_secret_count integer;
  v_secret text;
  v_payload text;
BEGIN
  IF coalesce(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'SERVICE_ROLE_OBRIGATORIO';
  END IF;

  IF p_current_actor_auth_user_id IS NULL
     OR p_original_actor_auth_user_id IS NULL
     OR p_request_id IS NULL
     OR char_length(v_email) NOT BETWEEN 5 AND 254
     OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR v_cpf !~ '^[0-9]{11}$'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PORTAL_INVITE_GESTOR_PAYLOAD_INVALIDO';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.usuarios_sistema AS gestor
    LEFT JOIN public.perfis_acesso AS perfil
      ON perfil.id = gestor.perfil_acesso_id
    WHERE gestor.auth_user_id = p_current_actor_auth_user_id
      AND upper(btrim(coalesce(gestor.status, ''))) IN ('ATIVO', 'ACTIVE')
      AND lower(btrim(coalesce(gestor.context, ''))) = 'global'
      AND coalesce((gestor.permissoes ->> 'allPolos')::boolean, false)
      AND pg_catalog.cardinality(coalesce(gestor.polo_ids, ARRAY[]::uuid[])) = 0
      AND EXISTS (
        SELECT 1
        FROM pg_catalog.jsonb_array_elements_text(
          coalesce(
            CASE
              WHEN perfil.id IS NOT NULL
                   AND NOT coalesce(gestor.personalizar_permissoes, false)
                THEN perfil.permissoes -> 'modules'
              ELSE gestor.permissoes -> 'modules'
            END,
            pg_catalog.jsonb_build_array()
          )
        ) AS modulo(valor)
        WHERE modulo.valor = 'configuracoes'
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'GESTOR_GLOBAL_CONFIGURACOES_OBRIGATORIO';
  END IF;

  SELECT
    pg_catalog.count(*)::integer,
    max(nullif(btrim(segredo.decrypted_secret), ''))
  INTO v_secret_count, v_secret
  FROM vault.decrypted_secrets AS segredo
  WHERE segredo.name = 'portal_invite_reconciliation_hmac_secret';

  IF v_secret_count <> 1
     OR v_secret IS NULL
     OR pg_catalog.octet_length(v_secret) < 32
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'PORTAL_INVITE_RECONCILIATION_SECRET_INDISPONIVEL';
  END IF;

  v_payload := 'gestor-v1' || E'\n'
    || p_original_actor_auth_user_id::text || E'\n'
    || p_request_id::text || E'\n'
    || v_email || E'\n'
    || v_cpf;

  RETURN pg_catalog.encode(
    extensions.hmac(
      pg_catalog.convert_to(v_payload, 'UTF8'),
      pg_catalog.convert_to(v_secret, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.portal_validar_unicidade_usuario_sistema(text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.portal_identidade_assinar_convite_gestor(
  uuid, uuid, uuid, text, text
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.portal_validar_unicidade_usuario_sistema(text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.portal_identidade_assinar_convite_gestor(
  uuid, uuid, uuid, text, text
) TO service_role;

COMMIT;
