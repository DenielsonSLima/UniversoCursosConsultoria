-- A tabela continua privada, inclusive para service_role. A Edge consulta
-- somente os campos necessários à titularidade e somente para um UID exato.
CREATE OR REPLACE FUNCTION public.portal_identidade_listar_responsaveis_vinculados(
  p_auth_user_id uuid
)
RETURNS TABLE (id uuid, cpf_normalizado text, email text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'PORTAL_IDENTIDADE_SERVICE_ROLE_OBRIGATORIO';
  END IF;
  IF p_auth_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'PORTAL_IDENTIDADE_AUTH_USER_ID_OBRIGATORIO';
  END IF;
  RETURN QUERY
    SELECT r.id, r.cpf_normalizado, r.email
    FROM public.responsaveis_legais AS r
    WHERE r.auth_user_id = p_auth_user_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.portal_identidade_listar_responsaveis_vinculados(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_identidade_listar_responsaveis_vinculados(uuid)
  TO service_role;

COMMENT ON FUNCTION public.portal_identidade_listar_responsaveis_vinculados(uuid)
  IS 'Consulta interna de titularidade por UID; sem acesso direto à tabela privada.';
