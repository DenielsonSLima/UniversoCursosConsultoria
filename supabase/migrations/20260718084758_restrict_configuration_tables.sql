BEGIN;

DROP POLICY IF EXISTS portal_usuarios_sistema_select ON public.usuarios_sistema;
CREATE POLICY portal_usuarios_sistema_select
ON public.usuarios_sistema
FOR SELECT
TO authenticated
USING (
  lower(email) = public.auth_email()
  OR (
    public.is_gestor_global()
    AND public.gestor_has_module('configuracoes')
  )
);

DROP POLICY IF EXISTS portal_empresas_global_insert ON public.empresas;
DROP POLICY IF EXISTS portal_empresas_global_update ON public.empresas;
DROP POLICY IF EXISTS portal_empresas_global_delete ON public.empresas;
CREATE POLICY portal_empresas_global_insert
ON public.empresas FOR INSERT TO authenticated
WITH CHECK (public.is_gestor_global() AND public.gestor_has_module('configuracoes'));
CREATE POLICY portal_empresas_global_update
ON public.empresas FOR UPDATE TO authenticated
USING (public.is_gestor_global() AND public.gestor_has_module('configuracoes'))
WITH CHECK (public.is_gestor_global() AND public.gestor_has_module('configuracoes'));
CREATE POLICY portal_empresas_global_delete
ON public.empresas FOR DELETE TO authenticated
USING (public.is_gestor_global() AND public.gestor_has_module('configuracoes'));

DROP POLICY IF EXISTS portal_polos_write_global ON public.polos;
CREATE POLICY portal_polos_write_global
ON public.polos
FOR ALL
TO authenticated
USING (public.is_gestor_global() AND public.gestor_has_module('configuracoes'))
WITH CHECK (public.is_gestor_global() AND public.gestor_has_module('configuracoes'));

COMMIT;
