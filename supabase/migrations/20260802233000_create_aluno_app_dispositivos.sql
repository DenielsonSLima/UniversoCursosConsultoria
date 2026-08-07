begin;

create table if not exists public.aluno_app_dispositivos (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references public.parceiros(id) on delete cascade,
  auth_user_id uuid not null,
  polo_id uuid references public.polos(id) on delete set null,
  provider text not null default 'fcm' check (provider = 'fcm'),
  plataforma text not null check (plataforma in ('android', 'ios')),
  installation_id text not null,
  push_token text,
  permission_status text not null default 'not_determined'
    check (permission_status in ('not_determined', 'granted', 'denied', 'provisional')),
  notifications_enabled boolean not null default false,
  session_active boolean not null default true,
  app_version text,
  os_version text,
  device_model text,
  browser text,
  user_agent text,
  installed_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_authenticated_at timestamptz not null default now(),
  consent_at timestamptz,
  consent_revoked_at timestamptz,
  logged_out_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint aluno_app_dispositivos_installation_unique unique (provider, installation_id),
  constraint aluno_app_dispositivos_installation_length check (char_length(installation_id) between 8 and 255),
  constraint aluno_app_dispositivos_token_length check (push_token is null or char_length(push_token) between 8 and 4096),
  constraint aluno_app_dispositivos_notification_state check (
    notifications_enabled = false
    or (permission_status in ('granted', 'provisional') and push_token is not null)
  )
);

comment on table public.aluno_app_dispositivos is
  'Registro privado das instalacoes do aplicativo do aluno. O token FCM nunca e exposto ao painel administrativo.';
comment on column public.aluno_app_dispositivos.installation_id is
  'Identificador aleatorio e persistente gerado pelo aplicativo nativo; nao usar identificadores de hardware.';
comment on column public.aluno_app_dispositivos.push_token is
  'Credencial sensivel do FCM, acessivel somente por funcoes controladas e pelo backend de envio.';

create index if not exists aluno_app_dispositivos_aluno_idx
  on public.aluno_app_dispositivos (aluno_id, active, last_seen_at desc);
create index if not exists aluno_app_dispositivos_polo_idx
  on public.aluno_app_dispositivos (polo_id, active, last_seen_at desc);
create index if not exists aluno_app_dispositivos_auth_idx
  on public.aluno_app_dispositivos (auth_user_id, active);
create unique index if not exists aluno_app_dispositivos_push_token_idx
  on public.aluno_app_dispositivos (push_token)
  where push_token is not null and active;

alter table public.aluno_app_dispositivos enable row level security;
revoke all on table public.aluno_app_dispositivos from anon, authenticated;

drop policy if exists "acesso direto a dispositivos bloqueado" on public.aluno_app_dispositivos;
create policy "acesso direto a dispositivos bloqueado"
on public.aluno_app_dispositivos
as restrictive
for all to authenticated
using (false)
with check (false);

create or replace function public.aluno_app_dispositivos_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists aluno_app_dispositivos_updated_at on public.aluno_app_dispositivos;
create trigger aluno_app_dispositivos_updated_at
before update on public.aluno_app_dispositivos
for each row execute function public.aluno_app_dispositivos_set_updated_at();

create table if not exists public.aluno_app_dispositivo_eventos (
  id bigint generated always as identity primary key,
  dispositivo_id uuid not null references public.aluno_app_dispositivos(id) on delete cascade,
  aluno_id uuid not null references public.parceiros(id) on delete cascade,
  polo_id uuid references public.polos(id) on delete cascade,
  evento text not null check (evento in ('installed', 'session', 'permission', 'device')),
  created_at timestamptz not null default now()
);

create index if not exists aluno_app_dispositivo_eventos_polo_idx
  on public.aluno_app_dispositivo_eventos (polo_id, created_at desc);

alter table public.aluno_app_dispositivo_eventos enable row level security;
revoke all on table public.aluno_app_dispositivo_eventos from anon, authenticated;
grant select on table public.aluno_app_dispositivo_eventos to authenticated;

drop policy if exists "gestores configuracoes leem eventos de dispositivos" on public.aluno_app_dispositivo_eventos;
create policy "gestores configuracoes leem eventos de dispositivos"
on public.aluno_app_dispositivo_eventos
for select to authenticated
using (public.is_gestor_global() and public.gestor_has_module('configuracoes'));

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

  insert into public.aluno_app_dispositivo_eventos (dispositivo_id, aluno_id, polo_id, evento)
  values (new.id, new.aluno_id, new.polo_id, v_event);
  return new;
end;
$$;

revoke all on function public.aluno_app_dispositivos_emit_event() from public, anon, authenticated;

drop trigger if exists aluno_app_dispositivos_event on public.aluno_app_dispositivos;
create trigger aluno_app_dispositivos_event
after insert or update on public.aluno_app_dispositivos
for each row execute function public.aluno_app_dispositivos_emit_event();

create or replace function public.current_aluno_app_identity()
returns table (aluno_id uuid, polo_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.polo_id
  from public.parceiros p
  where p.auth_user_id = auth.uid()
    and p.tipo = 'Aluno'
    and p.status = 'ATIVO'
  order by p.created_at desc
  limit 1;
$$;

revoke all on function public.current_aluno_app_identity() from public, anon, authenticated;

create or replace function public.register_aluno_app_device(
  p_installation_id text,
  p_plataforma text,
  p_permission_status text default 'not_determined',
  p_push_token text default null,
  p_app_version text default null,
  p_os_version text default null,
  p_device_model text default null,
  p_browser text default null,
  p_user_agent text default null
)
returns table (
  device_id uuid,
  permission_status text,
  notifications_enabled boolean,
  session_active boolean,
  last_seen_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aluno_id uuid;
  v_polo_id uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  select identity.aluno_id, identity.polo_id
  into v_aluno_id, v_polo_id
  from public.current_aluno_app_identity() identity;

  if v_aluno_id is null then
    raise exception 'ACTIVE_STUDENT_REQUIRED' using errcode = '42501';
  end if;
  if p_plataforma not in ('android', 'ios') then
    raise exception 'INVALID_PLATFORM' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_installation_id, ''))) not between 8 and 255 then
    raise exception 'INVALID_INSTALLATION_ID' using errcode = '22023';
  end if;
  if p_permission_status not in ('not_determined', 'granted', 'denied', 'provisional') then
    raise exception 'INVALID_PERMISSION_STATUS' using errcode = '22023';
  end if;
  if p_push_token is not null and char_length(p_push_token) not between 8 and 4096 then
    raise exception 'INVALID_PUSH_TOKEN' using errcode = '22023';
  end if;

  if p_push_token is not null then
    update public.aluno_app_dispositivos
       set push_token = null,
           notifications_enabled = false,
           consent_revoked_at = now()
     where push_token = p_push_token
       and installation_id <> trim(p_installation_id);
  end if;

  return query
  insert into public.aluno_app_dispositivos as device (
    aluno_id, auth_user_id, polo_id, plataforma, installation_id, push_token,
    permission_status, notifications_enabled, session_active, app_version,
    os_version, device_model, browser, user_agent
  ) values (
    v_aluno_id, auth.uid(), v_polo_id, p_plataforma, trim(p_installation_id), p_push_token,
    p_permission_status, false, true, left(p_app_version, 80),
    left(p_os_version, 80), left(p_device_model, 120), left(p_browser, 120), left(p_user_agent, 500)
  )
  on conflict (provider, installation_id) do update
    set aluno_id = excluded.aluno_id,
        auth_user_id = excluded.auth_user_id,
        polo_id = excluded.polo_id,
        plataforma = excluded.plataforma,
        push_token = coalesce(excluded.push_token, device.push_token),
        permission_status = excluded.permission_status,
        notifications_enabled = case
          when device.auth_user_id is distinct from excluded.auth_user_id then false
          when excluded.permission_status not in ('granted', 'provisional') then false
          else device.notifications_enabled
        end,
        session_active = true,
        app_version = excluded.app_version,
        os_version = excluded.os_version,
        device_model = excluded.device_model,
        browser = excluded.browser,
        user_agent = excluded.user_agent,
        last_seen_at = now(),
        last_authenticated_at = now(),
        logged_out_at = null,
        active = true
  returning device.id, device.permission_status, device.notifications_enabled,
            device.session_active, device.last_seen_at;
end;
$$;

create or replace function public.get_aluno_app_device_status(p_installation_id text)
returns table (
  device_id uuid,
  plataforma text,
  permission_status text,
  notifications_enabled boolean,
  session_active boolean,
  app_version text,
  installed_at timestamptz,
  last_seen_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.plataforma, d.permission_status, d.notifications_enabled,
         d.session_active, d.app_version, d.installed_at, d.last_seen_at
  from public.aluno_app_dispositivos d
  where d.auth_user_id = auth.uid()
    and d.installation_id = trim(p_installation_id)
    and d.active
  limit 1;
$$;

create or replace function public.touch_aluno_app_device(p_installation_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.aluno_app_dispositivos
     set last_seen_at = now(), session_active = true, logged_out_at = null
   where auth_user_id = auth.uid()
     and installation_id = trim(p_installation_id)
     and active;
  return found;
end;
$$;

create or replace function public.set_aluno_app_notification_consent(
  p_installation_id text,
  p_permission_status text,
  p_enabled boolean,
  p_push_token text default null
)
returns table (
  device_id uuid,
  permission_status text,
  notifications_enabled boolean,
  session_active boolean,
  last_seen_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_permission_status not in ('not_determined', 'granted', 'denied', 'provisional') then
    raise exception 'INVALID_PERMISSION_STATUS' using errcode = '22023';
  end if;
  if p_enabled and (p_permission_status not in ('granted', 'provisional') or p_push_token is null) then
    raise exception 'GRANTED_PERMISSION_AND_TOKEN_REQUIRED' using errcode = '22023';
  end if;
  if p_push_token is not null and char_length(p_push_token) not between 8 and 4096 then
    raise exception 'INVALID_PUSH_TOKEN' using errcode = '22023';
  end if;

  if p_push_token is not null then
    update public.aluno_app_dispositivos
       set push_token = null,
           notifications_enabled = false,
           consent_revoked_at = now()
     where push_token = p_push_token
       and installation_id <> trim(p_installation_id);
  end if;

  return query
  update public.aluno_app_dispositivos d
     set permission_status = p_permission_status,
         notifications_enabled = p_enabled,
         push_token = case when p_enabled then p_push_token else coalesce(p_push_token, d.push_token) end,
         consent_at = case when p_enabled then now() else d.consent_at end,
         consent_revoked_at = case when p_enabled then null else now() end,
         last_seen_at = now()
   where d.auth_user_id = auth.uid()
     and d.installation_id = trim(p_installation_id)
     and d.active
  returning d.id, d.permission_status, d.notifications_enabled, d.session_active, d.last_seen_at;

  if not found then
    raise exception 'DEVICE_NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.logout_aluno_app_device(p_installation_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.aluno_app_dispositivos
     set session_active = false, logged_out_at = now(), last_seen_at = now()
   where auth_user_id = auth.uid()
     and installation_id = trim(p_installation_id)
     and active;
  return found;
end;
$$;

create or replace function public.list_aluno_app_users(
  p_polo_id uuid default null,
  p_search text default null,
  p_status text default 'all',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  aluno_id uuid,
  nome text,
  matricula text,
  email text,
  polo_id uuid,
  polo_nome text,
  app_installed boolean,
  session_active boolean,
  online_now boolean,
  notification_active boolean,
  plataformas text[],
  device_count bigint,
  permission_status text,
  installed_at timestamptz,
  last_seen_at timestamptz,
  app_version text,
  total_count bigint
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
  if p_status not in ('all', 'installed', 'not_installed', 'online', 'offline', 'notifications', 'no_notifications') then
    raise exception 'INVALID_STATUS_FILTER' using errcode = '22023';
  end if;

  return query
  with dataset as (
    select
      p.id as aluno_id,
      p.nome,
      p.matricula_acesso as matricula,
      p.email,
      p.polo_id,
      po.nome as polo_nome,
      coalesce(d.app_installed, false) as app_installed,
      coalesce(d.session_active, false) as session_active,
      coalesce(d.online_now, false) as online_now,
      coalesce(d.notification_active, false) as notification_active,
      coalesce(d.plataformas, array[]::text[]) as plataformas,
      coalesce(d.device_count, 0::bigint) as device_count,
      coalesce(d.permission_status, 'not_determined') as permission_status,
      d.installed_at,
      d.last_seen_at,
      d.app_version
    from public.parceiros p
    left join public.polos po on po.id = p.polo_id
    left join lateral (
      select
        bool_or(ad.active) as app_installed,
        bool_or(ad.active and ad.session_active) as session_active,
        bool_or(ad.active and ad.session_active and ad.last_seen_at >= now() - interval '5 minutes') as online_now,
        bool_or(ad.active and ad.session_active and ad.notifications_enabled
          and ad.permission_status in ('granted', 'provisional') and ad.push_token is not null) as notification_active,
        array_agg(distinct ad.plataforma) filter (where ad.active) as plataformas,
        count(*) filter (where ad.active) as device_count,
        (array_agg(ad.permission_status order by ad.last_seen_at desc) filter (where ad.active))[1] as permission_status,
        min(ad.installed_at) filter (where ad.active) as installed_at,
        max(ad.last_seen_at) filter (where ad.active) as last_seen_at,
        (array_agg(ad.app_version order by ad.last_seen_at desc) filter (where ad.active and ad.app_version is not null))[1] as app_version
      from public.aluno_app_dispositivos ad
      where ad.aluno_id = p.id
    ) d on true
    where p.tipo = 'Aluno'
      and p.status = 'ATIVO'
      and (p_polo_id is null or p.polo_id = p_polo_id)
      and (
        nullif(trim(coalesce(p_search, '')), '') is null
        or p.nome ilike '%' || trim(left(p_search, 100)) || '%'
        or p.email ilike '%' || trim(left(p_search, 100)) || '%'
        or p.matricula_acesso ilike '%' || trim(left(p_search, 100)) || '%'
      )
  ), filtered as (
    select * from dataset d
    where p_status = 'all'
       or (p_status = 'installed' and d.app_installed)
       or (p_status = 'not_installed' and not d.app_installed)
       or (p_status = 'online' and d.online_now)
       or (p_status = 'offline' and d.app_installed and not d.online_now)
       or (p_status = 'notifications' and d.notification_active)
       or (p_status = 'no_notifications' and d.app_installed and not d.notification_active)
  )
  select f.*, count(*) over() as total_count
  from filtered f
  order by f.app_installed desc, f.last_seen_at desc nulls last, f.nome
  limit greatest(1, least(coalesce(p_limit, 50), 100))
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.get_aluno_app_devices_summary(p_polo_id uuid default null)
returns table (
  total_alunos bigint,
  app_instalado bigint,
  online_agora bigint,
  notificacoes_ativas bigint
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
    count(*)::bigint,
    count(*) filter (where coalesce(d.app_installed, false))::bigint,
    count(*) filter (where coalesce(d.online_now, false))::bigint,
    count(*) filter (where coalesce(d.notification_active, false))::bigint
  from public.parceiros p
  left join lateral (
    select
      bool_or(ad.active) as app_installed,
      bool_or(ad.active and ad.session_active and ad.last_seen_at >= now() - interval '5 minutes') as online_now,
      bool_or(ad.active and ad.session_active and ad.notifications_enabled
        and ad.permission_status in ('granted', 'provisional') and ad.push_token is not null) as notification_active
    from public.aluno_app_dispositivos ad
    where ad.aluno_id = p.id
  ) d on true
  where p.tipo = 'Aluno'
    and p.status = 'ATIVO'
    and (p_polo_id is null or p.polo_id = p_polo_id);
end;
$$;

revoke all on function public.register_aluno_app_device(text, text, text, text, text, text, text, text, text) from public, anon;
revoke all on function public.get_aluno_app_device_status(text) from public, anon;
revoke all on function public.touch_aluno_app_device(text) from public, anon;
revoke all on function public.set_aluno_app_notification_consent(text, text, boolean, text) from public, anon;
revoke all on function public.logout_aluno_app_device(text) from public, anon;
revoke all on function public.list_aluno_app_users(uuid, text, text, integer, integer) from public, anon;
revoke all on function public.get_aluno_app_devices_summary(uuid) from public, anon;

grant execute on function public.register_aluno_app_device(text, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.get_aluno_app_device_status(text) to authenticated;
grant execute on function public.touch_aluno_app_device(text) to authenticated;
grant execute on function public.set_aluno_app_notification_consent(text, text, boolean, text) to authenticated;
grant execute on function public.logout_aluno_app_device(text) to authenticated;
grant execute on function public.list_aluno_app_users(uuid, text, text, integer, integer) to authenticated;
grant execute on function public.get_aluno_app_devices_summary(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'aluno_app_dispositivo_eventos'
  ) then
    alter publication supabase_realtime add table public.aluno_app_dispositivo_eventos;
  end if;
end;
$$;

commit;
