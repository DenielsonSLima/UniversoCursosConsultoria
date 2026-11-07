-- Initial restricted rollout. Grant rows are managed through the privileged
-- operational channel; clients cannot grant access to themselves or others.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE TABLE private.nfse_access_grants (
  usuario_id uuid PRIMARY KEY REFERENCES public.usuarios_sistema(id) ON DELETE CASCADE,
  auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

ALTER TABLE private.nfse_access_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.nfse_access_grants FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE private.nfse_access_grants IS
  'Restricted NFS-e rollout. Bound to both institutional context and auth identity.';

CREATE OR REPLACE FUNCTION public.get_nfse_access_secure(p_context_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT COALESCE(
    auth.uid() IS NOT NULL
    AND p_context_id IS NOT NULL
    AND public.gestor_schedule_allows_access()
    AND EXISTS (
      SELECT 1
      FROM private.nfse_access_grants AS grant_row
      JOIN public.usuarios_sistema AS usuario
        ON usuario.id = grant_row.usuario_id
       AND usuario.auth_user_id = grant_row.auth_user_id
      LEFT JOIN public.perfis_acesso AS perfil
        ON perfil.id = usuario.perfil_acesso_id
      WHERE usuario.id = p_context_id
        AND grant_row.auth_user_id = auth.uid()
        AND public.is_active_status(usuario.status)
        AND pg_catalog.upper(pg_catalog.btrim(usuario.perfil)) = 'GESTOR'
        AND COALESCE((
          CASE
            WHEN usuario.perfil_acesso_id IS NOT NULL
              AND NOT COALESCE(usuario.personalizar_permissoes, false)
              AND perfil.id IS NOT NULL THEN perfil.permissoes
            ELSE usuario.permissoes
          END -> 'modules'
        ) @> '["emissor-nfse"]'::jsonb, false)
    ), false
  );
$function$;

REVOKE ALL ON FUNCTION public.get_nfse_access_secure(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_nfse_access_secure(uuid) TO authenticated;
COMMENT ON FUNCTION public.get_nfse_access_secure(uuid) IS
  'Authorizes only the authenticated identity and its explicitly granted active context; returns no personal or fiscal data.';

