CREATE OR REPLACE FUNCTION public.get_public_aluno_auth_status(p_identifier text)
RETURNS TABLE (
  resolved_email text,
  user_exists boolean,
  email_confirmed boolean,
  is_student boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  v_email text;
BEGIN
  v_email := public.resolve_portal_login_email(p_identifier);

  IF v_email IS NULL OR length(trim(v_email)) = 0 THEN
    RETURN QUERY SELECT NULL::text, false, false, false;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    lower(au.email) AS resolved_email,
    true AS user_exists,
    (au.email_confirmed_at IS NOT NULL OR au.confirmed_at IS NOT NULL) AS email_confirmed,
    (
      au.raw_user_meta_data->>'tipo' = 'Aluno'
      OR au.raw_user_meta_data->>'origem' = 'cadastro_publico_ead'
      OR EXISTS (
        SELECT 1
        FROM public.parceiros p
        WHERE lower(p.email) = lower(au.email)
          AND p.tipo = 'Aluno'
      )
    ) AS is_student
  FROM auth.users au
  WHERE lower(au.email) = lower(v_email)
  ORDER BY au.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT lower(v_email), false, false, EXISTS (
      SELECT 1
      FROM public.parceiros p
      WHERE lower(p.email) = lower(v_email)
        AND p.tipo = 'Aluno'
    );
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_aluno_auth_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_aluno_auth_status(text) TO anon, authenticated, service_role;
