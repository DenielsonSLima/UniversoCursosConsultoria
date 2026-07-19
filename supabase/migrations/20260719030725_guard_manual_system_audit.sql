-- The only browser call site records a successful password change. Keep that
-- case, stamp fixed values and reject arbitrary client-authored audit events.

alter function public.registrar_sistema_evento_manual(
  text, text, text, text, uuid, text, uuid, jsonb
) set schema internal_academic;
alter function internal_academic.registrar_sistema_evento_manual(
  text, text, text, text, uuid, text, uuid, jsonb
) rename to p1_registrar_sistema_evento_manual_20260719;

revoke all on function internal_academic.p1_registrar_sistema_evento_manual_20260719(
  text, text, text, text, uuid, text, uuid, jsonb
) from public, anon, authenticated, service_role;

create or replace function public.registrar_sistema_evento_manual(
  p_modulo text,
  p_entidade text,
  p_acao text,
  p_descricao text,
  p_pessoa_id uuid default null,
  p_pessoa_tipo text default null,
  p_polo_id uuid default null,
  p_detalhes jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_auth_id uuid := auth.uid();
  v_auth_email text := nullif(auth.jwt() ->> 'email', '');
  v_existing_id uuid;
begin
  if coalesce((select auth.role()), '') = 'service_role' then
    return internal_academic.p1_registrar_sistema_evento_manual_20260719(
      p_modulo, p_entidade, p_acao, p_descricao,
      p_pessoa_id, p_pessoa_tipo, p_polo_id, p_detalhes
    );
  end if;

  if v_auth_id is null
    or lower(btrim(coalesce(p_modulo, ''))) <> 'sistema'
    or lower(btrim(coalesce(p_entidade, ''))) <> 'auth.users'
    or lower(btrim(coalesce(p_acao, ''))) <> 'alterou senha'
    or lower(btrim(coalesce(p_descricao, ''))) <>
      'usuário alterou a senha de acesso'
    or p_pessoa_id is not null
    or p_pessoa_tipo is not null
    or p_polo_id is not null
    or coalesce(p_detalhes, '{}'::jsonb) <>
      jsonb_build_object('origem', 'updatePassword')
    or not exists (
      select 1
      from auth.users au
      where au.id = v_auth_id
        and au.updated_at >= now() - interval '2 minutes'
    ) then
    raise exception 'Evento manual não autorizado.' using errcode = '42501';
  end if;

  select se.id into v_existing_id
  from public.sistema_eventos se
  where lower(coalesce(se.actor_email, '')) = lower(v_auth_email)
    and se.entidade = 'auth.users'
    and se.acao = 'Alterou senha'
    and se.detalhes ->> 'origem' = 'updatePassword'
    and se.created_at >= now() - interval '10 minutes'
  order by se.created_at desc
  limit 1;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  return internal_academic.p1_registrar_sistema_evento_manual_20260719(
    'Sistema',
    'auth.users',
    'Alterou senha',
    'Usuário alterou a senha de acesso',
    null,
    null,
    null,
    jsonb_build_object('origem', 'updatePassword')
  );
end;
$function$;

revoke all on function public.registrar_sistema_evento_manual(
  text, text, text, text, uuid, text, uuid, jsonb
) from public, anon;
grant execute on function public.registrar_sistema_evento_manual(
  text, text, text, text, uuid, text, uuid, jsonb
) to authenticated, service_role;
