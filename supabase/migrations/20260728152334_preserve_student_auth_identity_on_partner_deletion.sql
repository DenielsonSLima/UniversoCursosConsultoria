-- Versão registrada pelo MCP Supabase: 20260728152334.
begin;

create or replace function public.delete_partner_auth_user_on_partner_delete()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_email text := lower(nullif(btrim(coalesce(
    old.auth_login_email,
    old.email,
    ''
  )), ''));
begin
  if old.tipo not in ('Aluno', 'Professor') or v_email is null then
    return old;
  end if;

  if exists (
    select 1
    from public.usuarios_sistema u
    where lower(coalesce(u.email, '')) = v_email
      and public.is_active_status(u.status)
  ) then
    return old;
  end if;

  if exists (
    select 1
    from public.parceiros p
    where p.id <> old.id
      and p.tipo in ('Aluno', 'Professor')
      and lower(coalesce(nullif(p.auth_login_email, ''), p.email, '')) = v_email
  ) then
    return old;
  end if;

  delete from auth.users u
  where lower(coalesce(u.email, '')) = v_email;

  return old;
end;
$$;

revoke execute on function public.delete_partner_auth_user_on_partner_delete()
  from public, anon, authenticated;
grant execute on function public.delete_partner_auth_user_on_partner_delete()
  to service_role;

commit;
