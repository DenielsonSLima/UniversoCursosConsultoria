begin;

alter table public.aluno_app_dispositivo_eventos
  add column if not exists plataforma text,
  add column if not exists permission_status text,
  add column if not exists notifications_enabled boolean,
  add column if not exists session_active boolean,
  add column if not exists device_active boolean,
  add column if not exists app_version text;

alter table public.aluno_app_dispositivo_eventos
  drop constraint if exists aluno_app_dispositivo_eventos_plataforma_check,
  add constraint aluno_app_dispositivo_eventos_plataforma_check
    check (plataforma is null or plataforma in ('android', 'ios')),
  drop constraint if exists aluno_app_dispositivo_eventos_permission_status_check,
  add constraint aluno_app_dispositivo_eventos_permission_status_check
    check (permission_status is null or permission_status in ('not_determined', 'granted', 'denied', 'provisional'));

comment on table public.aluno_app_dispositivo_eventos is
  'Trilha de auditoria de instalacao, sessao e consentimento push. Nao armazena nem expoe o token do dispositivo.';

create index if not exists aluno_app_dispositivo_eventos_aluno_created_idx
  on public.aluno_app_dispositivo_eventos (aluno_id, created_at desc);

create or replace function public.aluno_app_dispositivos_emit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text;
begin
  if tg_op = 'INSERT' then
    v_event := 'installed';
  elsif old.session_active is distinct from new.session_active then
    v_event := 'session';
  elsif old.permission_status is distinct from new.permission_status
     or old.notifications_enabled is distinct from new.notifications_enabled then
    v_event := 'permission';
  elsif old.plataforma is distinct from new.plataforma
     or old.app_version is distinct from new.app_version
     or old.active is distinct from new.active then
    v_event := 'device';
  else
    return new;
  end if;

  insert into public.aluno_app_dispositivo_eventos (
    dispositivo_id,
    aluno_id,
    polo_id,
    evento,
    plataforma,
    permission_status,
    notifications_enabled,
    session_active,
    device_active,
    app_version
  ) values (
    new.id,
    new.aluno_id,
    new.polo_id,
    v_event,
    new.plataforma,
    new.permission_status,
    new.notifications_enabled,
    new.session_active,
    new.active,
    new.app_version
  );
  return new;
end;
$$;

revoke all on function public.aluno_app_dispositivos_emit_event() from public, anon, authenticated;

create or replace function public.get_aluno_app_user_detail(p_aluno_id uuid)
returns table (
  aluno_id uuid,
  nome text,
  matricula text,
  email text,
  polo_id uuid,
  polo_nome text,
  dispositivos jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.is_gestor_global() and public.gestor_has_module('configuracoes')) then
    raise exception 'INSUFFICIENT_PERMISSION' using errcode = '42501';
  end if;

  return query
  select
    p.id,
    p.nome,
    p.matricula_acesso,
    p.email,
    p.polo_id,
    po.nome,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', d.id,
          'platform', d.plataforma,
          'permissionStatus', d.permission_status,
          'notificationsEnabled', d.notifications_enabled,
          'sessionActive', d.session_active,
          'active', d.active,
          'appVersion', d.app_version,
          'osVersion', d.os_version,
          'deviceModel', d.device_model,
          'installedAt', d.installed_at,
          'lastSeenAt', d.last_seen_at,
          'lastAuthenticatedAt', d.last_authenticated_at,
          'consentAt', d.consent_at,
          'consentRevokedAt', d.consent_revoked_at,
          'loggedOutAt', d.logged_out_at
        ) order by d.last_seen_at desc
      )
      from public.aluno_app_dispositivos d
      where d.aluno_id = p.id
    ), '[]'::jsonb)
  from public.parceiros p
  left join public.polos po on po.id = p.polo_id
  where p.id = p_aluno_id
    and p.tipo = 'Aluno'
  limit 1;
end;
$$;

create or replace function public.list_aluno_app_device_events(
  p_aluno_id uuid,
  p_limit integer default 100
)
returns table (
  id bigint,
  dispositivo_id uuid,
  evento text,
  plataforma text,
  permission_status text,
  notifications_enabled boolean,
  session_active boolean,
  device_active boolean,
  app_version text,
  device_model text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.is_gestor_global() and public.gestor_has_module('configuracoes')) then
    raise exception 'INSUFFICIENT_PERMISSION' using errcode = '42501';
  end if;

  return query
  select
    e.id,
    e.dispositivo_id,
    e.evento,
    coalesce(e.plataforma, d.plataforma),
    e.permission_status,
    e.notifications_enabled,
    e.session_active,
    e.device_active,
    e.app_version,
    d.device_model,
    e.created_at
  from public.aluno_app_dispositivo_eventos e
  join public.aluno_app_dispositivos d on d.id = e.dispositivo_id
  where e.aluno_id = p_aluno_id
  order by e.created_at desc, e.id desc
  limit greatest(1, least(coalesce(p_limit, 100), 250));
end;
$$;

revoke all on function public.get_aluno_app_user_detail(uuid) from public, anon;
revoke all on function public.list_aluno_app_device_events(uuid, integer) from public, anon;
grant execute on function public.get_aluno_app_user_detail(uuid) to authenticated;
grant execute on function public.list_aluno_app_device_events(uuid, integer) to authenticated;

commit;
