-- Assina convites de Aluno e Professor para distinguir uma identidade criada
-- nesta operacao de um Auth preexistente devolvido pelo GoTrue.

BEGIN;

CREATE OR REPLACE FUNCTION public.portal_identidade_assinar_convite_parceiro(
  p_current_actor_auth_user_id uuid,
  p_original_actor_auth_user_id uuid,
  p_request_id uuid,
  p_partner_id uuid,
  p_partner_tipo text,
  p_email text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_contexto jsonb;
  v_tipo text := upper(btrim(coalesce(p_partner_tipo, '')));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_parceiro public.parceiros%ROWTYPE;
  v_email_canonico text;
  v_cpf_canonico text;
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
     OR p_partner_id IS NULL
     OR v_tipo NOT IN ('ALUNO', 'PROFESSOR')
     OR char_length(v_email) NOT BETWEEN 5 AND 254
     OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PORTAL_INVITE_PARCEIRO_PAYLOAD_INVALIDO';
  END IF;

  v_contexto := public.portal_identidade_exigir_service_role_actor(
    p_current_actor_auth_user_id
  );

  SELECT parceiro.*
  INTO v_parceiro
  FROM public.parceiros AS parceiro
  WHERE parceiro.id = p_partner_id;

  IF NOT FOUND
     OR upper(btrim(coalesce(v_parceiro.tipo, ''))) IS DISTINCT FROM v_tipo
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'PORTAL_INVITE_PARCEIRO_NAO_ENCONTRADO';
  END IF;

  v_email_canonico := lower(coalesce(
    nullif(btrim(v_parceiro.auth_login_email), ''),
    nullif(btrim(v_parceiro.email), '')
  ));
  IF v_email IS DISTINCT FROM v_email_canonico THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PORTAL_INVITE_PARCEIRO_EMAIL_DIVERGENTE';
  END IF;
  v_cpf_canonico := pg_catalog.regexp_replace(
    coalesce(v_parceiro.cpf_cnpj, ''),
    '[^0-9]',
    '',
    'g'
  );

  IF NOT (
    coalesce((v_contexto ->> 'allPolos')::boolean, false)
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_array_elements_text(
        coalesce(v_contexto -> 'poloIds', pg_catalog.jsonb_build_array())
      ) AS polo_permitido(valor)
      WHERE polo_permitido.valor ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND (
          polo_permitido.valor::uuid = v_parceiro.polo_id
          OR polo_permitido.valor::uuid = ANY(
            coalesce(v_parceiro.polo_ids, ARRAY[]::uuid[])
          )
        )
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'PORTAL_INVITE_PARCEIRO_FORA_ESCOPO';
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

  v_payload := 'parceiro-v1' || E'\n'
    || p_original_actor_auth_user_id::text || E'\n'
    || p_request_id::text || E'\n'
    || p_partner_id::text || E'\n'
    || v_tipo || E'\n'
    || v_email || E'\n'
    || v_cpf_canonico;

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

REVOKE ALL ON FUNCTION public.portal_identidade_assinar_convite_parceiro(
  uuid, uuid, uuid, uuid, text, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_identidade_assinar_convite_parceiro(
  uuid, uuid, uuid, uuid, text, text
) TO service_role;

COMMENT ON FUNCTION public.portal_identidade_assinar_convite_parceiro(
  uuid, uuid, uuid, uuid, text, text
) IS
  'Assina convite de Aluno ou Professor apos revalidar gestor, parceiro, e-mail e escopo.';

COMMIT;
