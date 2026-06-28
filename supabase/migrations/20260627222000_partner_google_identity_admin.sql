-- Permite que gestores consultem e removam vinculos Google de alunos/professores.
-- A remocao e restrita ao escopo do gestor e preserva pelo menos um acesso
-- alternativo para evitar bloquear o usuario.

CREATE OR REPLACE FUNCTION public.get_partner_google_identity_status(p_partner_id uuid)
RETURNS TABLE (
  email text,
  has_auth_user boolean,
  google_linked boolean,
  google_email text,
  linked_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_partner public.parceiros%ROWTYPE;
  v_user auth.users%ROWTYPE;
BEGIN
  SELECT *
    INTO v_partner
  FROM public.parceiros p
  WHERE p.id = p_partner_id
    AND p.tipo IN ('Aluno', 'Professor');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aluno ou professor nao encontrado.';
  END IF;

  IF NOT public.is_partner_in_gestor_scope(v_partner.polo_id, v_partner.polo_ids) THEN
    RAISE EXCEPTION 'Voce nao tem permissao para gerenciar este acesso.';
  END IF;

  IF nullif(trim(coalesce(v_partner.email, '')), '') IS NULL THEN
    RETURN QUERY SELECT NULL::text, false, false, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT *
    INTO v_user
  FROM auth.users u
  WHERE lower(u.email) = lower(v_partner.email)
  ORDER BY u.created_at DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT lower(v_partner.email), false, false, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    lower(v_partner.email) AS email,
    true AS has_auth_user,
    EXISTS (
      SELECT 1
      FROM auth.identities i
      WHERE i.user_id = v_user.id
        AND i.provider = 'google'
    ) AS google_linked,
    (
      SELECT lower(coalesce(i.email, i.identity_data ->> 'email'))
      FROM auth.identities i
      WHERE i.user_id = v_user.id
        AND i.provider = 'google'
      ORDER BY i.updated_at DESC NULLS LAST
      LIMIT 1
    ) AS google_email,
    (
      SELECT i.created_at
      FROM auth.identities i
      WHERE i.user_id = v_user.id
        AND i.provider = 'google'
      ORDER BY i.updated_at DESC NULLS LAST
      LIMIT 1
    ) AS linked_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.unlink_partner_google_identity(p_partner_id uuid)
RETURNS TABLE (
  email text,
  google_unlinked boolean,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_partner public.parceiros%ROWTYPE;
  v_user auth.users%ROWTYPE;
  v_google_identity_id text;
  v_remaining_provider text;
BEGIN
  SELECT *
    INTO v_partner
  FROM public.parceiros p
  WHERE p.id = p_partner_id
    AND p.tipo IN ('Aluno', 'Professor');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aluno ou professor nao encontrado.';
  END IF;

  IF NOT public.is_partner_in_gestor_scope(v_partner.polo_id, v_partner.polo_ids) THEN
    RAISE EXCEPTION 'Voce nao tem permissao para gerenciar este acesso.';
  END IF;

  IF nullif(trim(coalesce(v_partner.email, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Este cadastro nao possui e-mail de login.';
  END IF;

  SELECT *
    INTO v_user
  FROM auth.users u
  WHERE lower(u.email) = lower(v_partner.email)
  ORDER BY u.created_at DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario de autenticacao nao encontrado para este e-mail.';
  END IF;

  SELECT i.identity_id::text
    INTO v_google_identity_id
  FROM auth.identities i
  WHERE i.user_id = v_user.id
    AND i.provider = 'google'
  ORDER BY i.updated_at DESC NULLS LAST
  LIMIT 1;

  IF v_google_identity_id IS NULL THEN
    RETURN QUERY SELECT lower(v_partner.email), false, 'Nenhum vinculo Google foi encontrado.'::text;
    RETURN;
  END IF;

  SELECT i.provider
    INTO v_remaining_provider
  FROM auth.identities i
  WHERE i.user_id = v_user.id
    AND i.provider <> 'google'
  ORDER BY CASE WHEN i.provider = 'email' THEN 0 ELSE 1 END, i.created_at ASC NULLS LAST
  LIMIT 1;

  IF v_remaining_provider IS NULL THEN
    RAISE EXCEPTION 'Nao e possivel remover o unico metodo de acesso deste usuario.';
  END IF;

  DELETE FROM auth.identities
  WHERE identity_id::text = v_google_identity_id
    AND user_id = v_user.id
    AND provider = 'google';

  UPDATE auth.users
  SET raw_app_meta_data = jsonb_set(
        jsonb_set(
          coalesce(raw_app_meta_data, '{}'::jsonb),
          '{providers}',
          coalesce(
            (
              SELECT jsonb_agg(provider_name)
              FROM (
                SELECT DISTINCT i.provider AS provider_name
                FROM auth.identities i
                WHERE i.user_id = v_user.id
                ORDER BY i.provider
              ) providers
            ),
            '[]'::jsonb
          ),
          true
        ),
        '{provider}',
        to_jsonb(v_remaining_provider),
        true
      ),
      updated_at = now()
  WHERE id = v_user.id;

  RETURN QUERY SELECT lower(v_partner.email), true, 'Conta Google desvinculada com sucesso.'::text;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_partner_google_identity_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_partner_google_identity_status(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.unlink_partner_google_identity(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlink_partner_google_identity(uuid) TO authenticated, service_role;
