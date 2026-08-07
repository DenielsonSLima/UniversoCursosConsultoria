drop policy if exists portal_usuarios_sistema_select on public.usuarios_sistema;

create policy portal_usuarios_sistema_select
on public.usuarios_sistema
for select
to authenticated
using (
  auth_user_id = (select auth.uid())
  or (
    public.is_gestor_global()
    and public.gestor_has_module('configuracoes')
  )
);

drop policy if exists portal_perfis_acesso_select on public.perfis_acesso;

create policy portal_perfis_acesso_select
on public.perfis_acesso
for select
to authenticated
using (
  exists (
    select 1
    from public.usuarios_sistema as u
    where u.auth_user_id = (select auth.uid())
      and public.is_active_status(u.status)
      and u.perfil_acesso_id = perfis_acesso.id
  )
  or (
    public.is_gestor_global()
    and public.gestor_has_module('configuracoes')
  )
);
