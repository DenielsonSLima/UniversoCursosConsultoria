BEGIN;

-- End the hidden initial-rollout dependency. The effective institutional
-- permission is the administrator's source of truth; no module is granted here.
-- Keep the old grant table private and unchanged as historical evidence.
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
      FROM public.usuarios_sistema AS usuario
      LEFT JOIN public.perfis_acesso AS perfil
        ON perfil.id = usuario.perfil_acesso_id
      WHERE usuario.id = p_context_id
        AND usuario.auth_user_id = auth.uid()
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

REVOKE ALL ON FUNCTION public.get_nfse_access_secure(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_nfse_access_secure(uuid) TO authenticated;
COMMENT ON FUNCTION public.get_nfse_access_secure(uuid) IS
  'NFS-e access by effective module permission, bound to active institutional identity and schedule. Fiscal actions retain their separate polo/environment guards.';

NOTIFY pgrst, 'reload schema';
COMMIT;
