begin;

create table if not exists public.push_notification_policies (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  categories jsonb not null default '{"chat":true,"financial":true,"academic":true,"calendar":true,"institutional":true,"marketing":false}'::jsonb,
  quiet_hours jsonb not null default '{"enabled":true,"start":"22:00","end":"07:00","timezone":"America/Maceio"}'::jsonb,
  privacy jsonb not null default '{"hideSensitiveContent":true}'::jsonb,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_notification_policies_categories_object check (jsonb_typeof(categories) = 'object'),
  constraint push_notification_policies_quiet_hours_object check (jsonb_typeof(quiet_hours) = 'object'),
  constraint push_notification_policies_privacy_object check (jsonb_typeof(privacy) = 'object'),
  constraint push_notification_policies_privacy_required check (privacy ->> 'hideSensitiveContent' = 'true')
);

insert into public.push_notification_policies (id) values (true)
on conflict (id) do nothing;

create table if not exists public.comunicacao_push_campanhas (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  category text not null,
  deep_link text not null,
  audience_type text not null,
  polo_id uuid references public.polos(id) on delete restrict,
  turma_id uuid references public.turmas(id) on delete restrict,
  audience_label text not null,
  eligible_users integer not null default 0,
  eligible_devices integer not null default 0,
  android_devices integer not null default 0,
  ios_devices integer not null default 0,
  status text not null default 'draft',
  scheduled_at timestamptz,
  queued_at timestamptz,
  completed_at timestamptz,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  skipped_count integer not null default 0,
  request_id uuid not null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comunicacao_push_campanhas_title_length check (char_length(btrim(title)) between 1 and 80),
  constraint comunicacao_push_campanhas_body_length check (char_length(btrim(body)) between 1 and 180),
  constraint comunicacao_push_campanhas_category check (category in ('institutional', 'academic', 'service', 'financial')),
  constraint comunicacao_push_campanhas_deep_link check (deep_link ~ '^/aluno(?:/|$)'),
  constraint comunicacao_push_campanhas_audience check (audience_type in ('all', 'polo', 'turma')),
  constraint comunicacao_push_campanhas_scope check (
    (audience_type = 'all' and polo_id is null and turma_id is null)
    or (audience_type = 'polo' and polo_id is not null and turma_id is null)
    or (audience_type = 'turma' and turma_id is not null)
  ),
  constraint comunicacao_push_campanhas_status check (status in ('draft', 'scheduled', 'queued', 'processing', 'completed', 'partial', 'failed', 'cancelled')),
  constraint comunicacao_push_campanhas_counts check (
    eligible_users >= 0 and eligible_devices >= 0 and android_devices >= 0 and ios_devices >= 0
    and sent_count >= 0 and failed_count >= 0 and skipped_count >= 0
  ),
  constraint comunicacao_push_campanhas_request_unique unique (created_by, request_id)
);

create table if not exists public.comunicacao_push_previews (
  token uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid(),
  payload jsonb not null,
  eligible_users integer not null,
  eligible_devices integer not null,
  android_devices integer not null,
  ios_devices integer not null,
  audience_label text not null,
  blocked_reason text,
  expires_at timestamptz not null default now() + interval '15 minutes',
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint comunicacao_push_previews_payload_object check (jsonb_typeof(payload) = 'object')
);

create table if not exists public.comunicacao_push_campanha_eventos (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.comunicacao_push_campanhas(id) on delete cascade,
  status text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.push_notification_jobs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.comunicacao_push_campanhas(id) on delete cascade,
  source_type text not null,
  source_id uuid,
  category text not null,
  aluno_id uuid not null references public.parceiros(id) on delete cascade,
  title text not null,
  body text not null,
  deep_link text not null,
  data jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  attempts integer not null default 0,
  last_error text,
  processed_at timestamptz,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_notification_jobs_source check (source_type in ('campaign', 'chat', 'financial', 'academic', 'calendar', 'institutional')),
  constraint push_notification_jobs_category check (category in ('chat', 'service', 'financial', 'academic', 'calendar', 'institutional', 'marketing')),
  constraint push_notification_jobs_status check (status in ('pending', 'processing', 'completed', 'partial', 'failed', 'skipped', 'cancelled')),
  constraint push_notification_jobs_title_length check (char_length(btrim(title)) between 1 and 80),
  constraint push_notification_jobs_body_length check (char_length(btrim(body)) between 1 and 180),
  constraint push_notification_jobs_deep_link check (deep_link ~ '^/aluno(?:/|$)'),
  constraint push_notification_jobs_data_object check (jsonb_typeof(data) = 'object'),
  constraint push_notification_jobs_attempts check (attempts >= 0)
);

create table if not exists public.push_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.push_notification_jobs(id) on delete cascade,
  campaign_id uuid references public.comunicacao_push_campanhas(id) on delete cascade,
  aluno_id uuid not null references public.parceiros(id) on delete cascade,
  device_id uuid not null references public.aluno_app_dispositivos(id) on delete cascade,
  platform text not null,
  status text not null default 'pending',
  provider_message_id text,
  attempts integer not null default 0,
  last_error text,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_notification_deliveries_platform check (platform in ('android', 'ios')),
  constraint push_notification_deliveries_status check (status in ('pending', 'processing', 'sent', 'delivered', 'opened', 'failed', 'skipped')),
  constraint push_notification_deliveries_attempts check (attempts >= 0),
  constraint push_notification_deliveries_job_device_unique unique (job_id, device_id)
);

create index if not exists idx_push_notification_jobs_dispatch
  on public.push_notification_jobs (status, available_at, created_at)
  where status in ('pending', 'failed');
create index if not exists idx_push_notification_jobs_campaign on public.push_notification_jobs (campaign_id);
create index if not exists idx_push_notification_jobs_aluno on public.push_notification_jobs (aluno_id, created_at desc);
create index if not exists idx_push_notification_deliveries_campaign on public.push_notification_deliveries (campaign_id, status);
create index if not exists idx_push_notification_deliveries_job on public.push_notification_deliveries (job_id, status);
create index if not exists idx_comunicacao_push_campanhas_history on public.comunicacao_push_campanhas (created_at desc, status);
create index if not exists idx_comunicacao_push_previews_expiration on public.comunicacao_push_previews (expires_at) where consumed_at is null;
create index if not exists idx_comunicacao_push_campanha_eventos_created on public.comunicacao_push_campanha_eventos (created_at desc);

alter table public.push_notification_policies enable row level security;
alter table public.comunicacao_push_campanhas enable row level security;
alter table public.comunicacao_push_previews enable row level security;
alter table public.comunicacao_push_campanha_eventos enable row level security;
alter table public.push_notification_jobs enable row level security;
alter table public.push_notification_deliveries enable row level security;

revoke all on public.push_notification_policies from public, anon, authenticated;
revoke all on public.comunicacao_push_campanhas from public, anon, authenticated;
revoke all on public.comunicacao_push_previews from public, anon, authenticated;
revoke all on public.comunicacao_push_campanha_eventos from public, anon, authenticated;
revoke all on public.push_notification_jobs from public, anon, authenticated;
revoke all on public.push_notification_deliveries from public, anon, authenticated;
grant select on public.push_notification_policies to authenticated;
grant select on public.comunicacao_push_campanha_eventos to authenticated;

drop policy if exists push_notification_policies_config_select on public.push_notification_policies;
create policy push_notification_policies_config_select on public.push_notification_policies
for select to authenticated
using (public.is_gestor_global() and public.gestor_has_module('configuracoes'));

drop policy if exists comunicacao_push_campanha_eventos_select on public.comunicacao_push_campanha_eventos;
create policy comunicacao_push_campanha_eventos_select on public.comunicacao_push_campanha_eventos
for select to authenticated
using (
  public.gestor_has_module('comunicacao')
  and public.gestor_has_tab('comunicacao', 'comunicacao-mensagem')
);

create or replace function public.push_notification_touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists push_notification_policies_touch on public.push_notification_policies;
create trigger push_notification_policies_touch before update on public.push_notification_policies
for each row execute function public.push_notification_touch_updated_at();
drop trigger if exists comunicacao_push_campanhas_touch on public.comunicacao_push_campanhas;
create trigger comunicacao_push_campanhas_touch before update on public.comunicacao_push_campanhas
for each row execute function public.push_notification_touch_updated_at();
drop trigger if exists push_notification_jobs_touch on public.push_notification_jobs;
create trigger push_notification_jobs_touch before update on public.push_notification_jobs
for each row execute function public.push_notification_touch_updated_at();
drop trigger if exists push_notification_deliveries_touch on public.push_notification_deliveries;
create trigger push_notification_deliveries_touch before update on public.push_notification_deliveries
for each row execute function public.push_notification_touch_updated_at();

create or replace function public.emit_comunicacao_push_campaign_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;
  insert into public.comunicacao_push_campanha_eventos (campaign_id, status)
  values (new.id, new.status);
  return new;
end;
$$;

revoke all on function public.emit_comunicacao_push_campaign_event() from public, anon, authenticated;
drop trigger if exists comunicacao_push_campanha_event on public.comunicacao_push_campanhas;
create trigger comunicacao_push_campanha_event
after insert or update on public.comunicacao_push_campanhas
for each row execute function public.emit_comunicacao_push_campaign_event();

create or replace function public.get_push_notification_policy()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v_policy public.push_notification_policies;
begin
  if not (public.is_gestor_global() and public.gestor_has_module('configuracoes')) then
    raise exception 'INSUFFICIENT_PERMISSION' using errcode = '42501';
  end if;
  select * into v_policy from public.push_notification_policies where id = true;
  return jsonb_build_object(
    'enabled', v_policy.enabled,
    'categories', v_policy.categories,
    'quietHours', v_policy.quiet_hours,
    'privacy', v_policy.privacy,
    'updatedAt', v_policy.updated_at
  );
end;
$$;

create or replace function public.update_push_notification_policy(p_policy jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_categories jsonb;
  v_quiet jsonb;
begin
  if not (public.is_gestor_global() and public.gestor_has_module('configuracoes')) then
    raise exception 'INSUFFICIENT_PERMISSION' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_policy, '{}'::jsonb)) <> 'object' then
    raise exception 'INVALID_POLICY' using errcode = '22023';
  end if;

  v_categories := jsonb_build_object(
    'chat', coalesce((p_policy #>> '{categories,chat}')::boolean, true),
    'financial', coalesce((p_policy #>> '{categories,financial}')::boolean, true),
    'academic', coalesce((p_policy #>> '{categories,academic}')::boolean, true),
    'calendar', coalesce((p_policy #>> '{categories,calendar}')::boolean, true),
    'institutional', coalesce((p_policy #>> '{categories,institutional}')::boolean, true),
    'marketing', coalesce((p_policy #>> '{categories,marketing}')::boolean, false)
  );
  v_quiet := jsonb_build_object(
    'enabled', coalesce((p_policy #>> '{quietHours,enabled}')::boolean, true),
    'start', coalesce(nullif(p_policy #>> '{quietHours,start}', ''), '22:00'),
    'end', coalesce(nullif(p_policy #>> '{quietHours,end}', ''), '07:00'),
    'timezone', 'America/Maceio'
  );
  if (v_quiet ->> 'start') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     or (v_quiet ->> 'end') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'INVALID_QUIET_HOURS' using errcode = '22023';
  end if;

  update public.push_notification_policies
  set enabled = coalesce((p_policy ->> 'enabled')::boolean, false),
      categories = v_categories,
      quiet_hours = v_quiet,
      privacy = '{"hideSensitiveContent":true}'::jsonb,
      updated_by = auth.uid()
  where id = true;
  return public.get_push_notification_policy();
end;
$$;

create or replace function public.push_notification_resolve_audience(
  p_audience_type text,
  p_polo_id uuid default null,
  p_turma_id uuid default null
)
returns table (aluno_id uuid)
language sql stable security definer set search_path = public
as $$
  select distinct p.id
  from public.parceiros p
  where p.tipo = 'Aluno'
    and p.status = 'ATIVO'
    and (
      p_audience_type = 'all'
      or (
        p_audience_type = 'polo'
        and (
          p.polo_id = p_polo_id
          or p_polo_id = any(coalesce(p.polo_ids, array[]::uuid[]))
          or exists (
            select 1 from public.matriculas m
            join public.turmas t on t.id = m.turma_id
            where m.aluno_id = p.id and t.polo_id = p_polo_id
              and m.status in ('ATIVO', 'EM_DEPENDENCIA')
          )
        )
      )
      or (
        p_audience_type = 'turma'
        and exists (
          select 1 from public.matriculas m
          where m.aluno_id = p.id and m.turma_id = p_turma_id
            and m.status in ('ATIVO', 'EM_DEPENDENCIA')
        )
      )
    );
$$;

revoke all on function public.push_notification_resolve_audience(text, uuid, uuid) from public, anon, authenticated;

create or replace function public.can_manage_push_campaigns()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.gestor_has_module('comunicacao')
    and public.gestor_has_tab('comunicacao', 'comunicacao-mensagem');
$$;

create or replace function public.can_target_push_scope(
  p_audience_type text,
  p_polo_id uuid default null,
  p_turma_id uuid default null
)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.can_manage_push_campaigns()
    and case
      when p_audience_type = 'all' then public.is_gestor_global()
      when p_audience_type = 'polo' then p_polo_id is not null and public.is_gestor_for_polo(p_polo_id)
      when p_audience_type = 'turma' then exists (
        select 1 from public.turmas t
        where t.id = p_turma_id and public.is_gestor_for_polo(t.polo_id)
      )
      else false
    end;
$$;

revoke all on function public.can_manage_push_campaigns() from public, anon, authenticated;
revoke all on function public.can_target_push_scope(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.can_target_push_scope(text, uuid, uuid) to authenticated;

drop policy if exists comunicacao_push_campanha_eventos_select on public.comunicacao_push_campanha_eventos;
create policy comunicacao_push_campanha_eventos_select on public.comunicacao_push_campanha_eventos
for select to authenticated
using (
  exists (
    select 1 from public.comunicacao_push_campanhas c
    where c.id = campaign_id
      and public.can_target_push_scope(c.audience_type, c.polo_id, c.turma_id)
  )
);

create or replace function public.comunicacao_push_segmentos_listar(p_search text default null)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if not public.can_manage_push_campaigns() then
    raise exception 'INSUFFICIENT_PERMISSION' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'polos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', po.id, 'nome', po.nome,
        'eligibleUsers', (select count(*) from public.push_notification_resolve_audience('polo', po.id, null)),
        'eligibleDevices', (
          select count(*) from public.aluno_app_dispositivos d
          where d.aluno_id in (select aluno_id from public.push_notification_resolve_audience('polo', po.id, null))
            and d.active and d.session_active and d.notifications_enabled
            and d.permission_status in ('granted', 'provisional') and d.push_token is not null
        )
      ) order by po.nome)
      from public.polos po
      where po.status = 'ATIVO'
        and public.is_gestor_for_polo(po.id)
        and (v_search is null or po.nome ilike '%' || v_search || '%')
    ), '[]'::jsonb),
    'turmas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'nome', t.nome, 'poloId', t.polo_id, 'poloNome', po.nome,
        'eligibleUsers', (select count(*) from public.push_notification_resolve_audience('turma', null, t.id)),
        'eligibleDevices', (
          select count(*) from public.aluno_app_dispositivos d
          where d.aluno_id in (select aluno_id from public.push_notification_resolve_audience('turma', null, t.id))
            and d.active and d.session_active and d.notifications_enabled
            and d.permission_status in ('granted', 'provisional') and d.push_token is not null
        )
      ) order by t.nome)
      from public.turmas t left join public.polos po on po.id = t.polo_id
      where t.status = 'ATIVO'
        and public.is_gestor_for_polo(t.polo_id)
        and (v_search is null or t.nome ilike '%' || v_search || '%' or t.codigo ilike '%' || v_search || '%')
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.push_notification_campaign_category_allowed(p_category text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(enabled, false)
    and case p_category
      when 'financial' then coalesce((categories ->> 'financial')::boolean, false)
      when 'academic' then coalesce((categories ->> 'academic')::boolean, false)
      when 'service' then coalesce((categories ->> 'chat')::boolean, false)
      else coalesce((categories ->> 'institutional')::boolean, false)
    end
  from public.push_notification_policies where id = true;
$$;

revoke all on function public.push_notification_campaign_category_allowed(text) from public, anon, authenticated;

create or replace function public.push_notification_quiet_hours_active()
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  v_policy public.push_notification_policies;
  v_now time;
  v_start time;
  v_end time;
begin
  select * into v_policy from public.push_notification_policies where id = true;
  if not coalesce((v_policy.quiet_hours ->> 'enabled')::boolean, false) then return false; end if;
  v_now := (now() at time zone 'America/Maceio')::time;
  v_start := (v_policy.quiet_hours ->> 'start')::time;
  v_end := (v_policy.quiet_hours ->> 'end')::time;
  if v_start = v_end then return false; end if;
  if v_start < v_end then return v_now >= v_start and v_now < v_end; end if;
  return v_now >= v_start or v_now < v_end;
end;
$$;

revoke all on function public.push_notification_quiet_hours_active() from public, anon, authenticated;

create or replace function public.comunicacao_push_campanha_previsualizar(
  p_title text,
  p_body text,
  p_category text,
  p_deep_link text,
  p_audience_type text,
  p_polo_id uuid default null,
  p_turma_id uuid default null,
  p_scheduled_at timestamptz default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_users integer;
  v_devices integer;
  v_android integer;
  v_ios integer;
  v_label text;
  v_blocked text;
  v_warnings jsonb := '[]'::jsonb;
  v_token uuid;
  v_payload jsonb;
begin
  if not public.can_target_push_scope(p_audience_type, p_polo_id, p_turma_id) then
    raise exception 'INSUFFICIENT_PERMISSION' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 80
     or char_length(btrim(coalesce(p_body, ''))) not between 1 and 180 then
    raise exception 'INVALID_MESSAGE_LENGTH' using errcode = '22023';
  end if;
  if p_category not in ('institutional', 'academic', 'service', 'financial')
     or p_audience_type not in ('all', 'polo', 'turma')
     or coalesce(p_deep_link, '') !~ '^/aluno(?:/|$)' then
    raise exception 'INVALID_CAMPAIGN' using errcode = '22023';
  end if;
  if (p_audience_type = 'all' and (p_polo_id is not null or p_turma_id is not null))
     or (p_audience_type = 'polo' and (p_polo_id is null or p_turma_id is not null))
     or (p_audience_type = 'turma' and p_turma_id is null) then
    raise exception 'INVALID_AUDIENCE_SCOPE' using errcode = '22023';
  end if;
  if p_title ~* '(cpf|cnpj|matr[ií]cula|e-?mail|telefone|boleto|pix|parcela|vencid|atras|inadimpl|valor|r\$|mensalidade|pagamento|\{\{)'
     or p_body ~* '(cpf|cnpj|matr[ií]cula|e-?mail|telefone|boleto|pix|parcela|vencid|atras|inadimpl|valor|r\$|mensalidade|pagamento|\{\{)' then
    v_blocked := 'A prévia contém informação financeira ou identificadora inadequada para a tela bloqueada.';
  elsif not public.push_notification_campaign_category_allowed(p_category) then
    v_blocked := 'A política de push ou a categoria deste envio está desativada.';
  end if;

  select count(*) into v_users from public.push_notification_resolve_audience(p_audience_type, p_polo_id, p_turma_id);
  select count(*), count(*) filter (where d.plataforma = 'android'), count(*) filter (where d.plataforma = 'ios')
  into v_devices, v_android, v_ios
  from public.aluno_app_dispositivos d
  where d.aluno_id in (select aluno_id from public.push_notification_resolve_audience(p_audience_type, p_polo_id, p_turma_id))
    and d.active and d.session_active and d.notifications_enabled
    and d.permission_status in ('granted', 'provisional') and d.push_token is not null;

  if p_audience_type = 'all' then v_label := 'Todos os dispositivos elegíveis';
  elsif p_audience_type = 'polo' then select 'Polo ' || nome into v_label from public.polos where id = p_polo_id;
  else select 'Turma ' || nome into v_label from public.turmas where id = p_turma_id;
  end if;
  if coalesce(v_devices, 0) = 0 and v_blocked is null then v_blocked := 'Nenhum dispositivo elegível nesta audiência.'; end if;
  if coalesce(v_devices, 0) < coalesce(v_users, 0) then
    v_warnings := v_warnings || jsonb_build_array('Parte dos alunos ainda não ativou notificações no aplicativo.');
  end if;

  v_payload := jsonb_build_object(
    'title', btrim(p_title), 'body', btrim(p_body), 'category', p_category,
    'deepLink', p_deep_link, 'audienceType', p_audience_type,
    'poloId', p_polo_id, 'turmaId', p_turma_id, 'scheduledAt', p_scheduled_at
  );
  insert into public.comunicacao_push_previews (
    created_by, payload, eligible_users, eligible_devices, android_devices, ios_devices, audience_label, blocked_reason
  ) values (
    auth.uid(), v_payload, v_users, v_devices, v_android, v_ios, coalesce(v_label, 'Audiência selecionada'), v_blocked
  ) returning token into v_token;

  delete from public.comunicacao_push_previews where expires_at < now() - interval '1 day';
  return jsonb_build_object(
    'eligibleUsers', v_users, 'eligibleDevices', v_devices,
    'androidDevices', v_android, 'iosDevices', v_ios,
    'audienceLabel', coalesce(v_label, 'Audiência selecionada'),
    'blockedReason', v_blocked, 'warnings', v_warnings,
    'validationToken', v_token
  );
end;
$$;

create or replace function public.comunicacao_push_campanha_criar(
  p_title text,
  p_body text,
  p_category text,
  p_deep_link text,
  p_audience_type text,
  p_polo_id uuid default null,
  p_turma_id uuid default null,
  p_scheduled_at timestamptz default null,
  p_preview_token uuid default null,
  p_request_id uuid default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_preview public.comunicacao_push_previews;
  v_campaign public.comunicacao_push_campanhas;
  v_payload jsonb;
begin
  if not public.can_target_push_scope(p_audience_type, p_polo_id, p_turma_id) then
    raise exception 'INSUFFICIENT_PERMISSION' using errcode = '42501';
  end if;
  if p_request_id is null or p_preview_token is null then raise exception 'IDEMPOTENCY_REQUIRED' using errcode = '22023'; end if;
  select * into v_campaign from public.comunicacao_push_campanhas where created_by = auth.uid() and request_id = p_request_id;
  if found then return jsonb_build_object('id', v_campaign.id, 'status', v_campaign.status, 'requestId', p_request_id, 'replayed', true); end if;

  select * into v_preview from public.comunicacao_push_previews
  where token = p_preview_token and created_by = auth.uid() and consumed_at is null and expires_at > now()
  for update;
  if not found or v_preview.blocked_reason is not null then raise exception 'VALID_PREVIEW_REQUIRED' using errcode = '22023'; end if;
  v_payload := jsonb_build_object(
    'title', btrim(p_title), 'body', btrim(p_body), 'category', p_category,
    'deepLink', p_deep_link, 'audienceType', p_audience_type,
    'poloId', p_polo_id, 'turmaId', p_turma_id, 'scheduledAt', p_scheduled_at
  );
  if v_preview.payload <> v_payload then raise exception 'PREVIEW_MISMATCH' using errcode = '22023'; end if;

  insert into public.comunicacao_push_campanhas (
    title, body, category, deep_link, audience_type, polo_id, turma_id, audience_label,
    eligible_users, eligible_devices, android_devices, ios_devices, status, scheduled_at, request_id, created_by
  ) values (
    btrim(p_title), btrim(p_body), p_category, p_deep_link, p_audience_type, p_polo_id, p_turma_id, v_preview.audience_label,
    v_preview.eligible_users, v_preview.eligible_devices, v_preview.android_devices, v_preview.ios_devices,
    case when p_scheduled_at is not null and p_scheduled_at > now() then 'scheduled' else 'draft' end,
    p_scheduled_at, p_request_id, auth.uid()
  ) returning * into v_campaign;
  update public.comunicacao_push_previews set consumed_at = now() where token = p_preview_token;
  return jsonb_build_object('id', v_campaign.id, 'status', v_campaign.status, 'requestId', p_request_id, 'replayed', false);
end;
$$;

create or replace function public.comunicacao_push_campanha_enfileirar(p_campaign_id uuid, p_request_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_campaign public.comunicacao_push_campanhas; v_inserted integer;
begin
  if not public.can_manage_push_campaigns() then
    raise exception 'INSUFFICIENT_PERMISSION' using errcode = '42501';
  end if;
  select * into v_campaign from public.comunicacao_push_campanhas where id = p_campaign_id for update;
  if not found then raise exception 'CAMPAIGN_NOT_FOUND' using errcode = 'P0002'; end if;
  if not public.can_target_push_scope(v_campaign.audience_type, v_campaign.polo_id, v_campaign.turma_id) then
    raise exception 'INSUFFICIENT_PERMISSION' using errcode = '42501';
  end if;
  if v_campaign.status in ('queued', 'processing', 'completed', 'partial', 'failed') then
    return jsonb_build_object('id', v_campaign.id, 'status', v_campaign.status, 'requestId', p_request_id, 'replayed', true);
  end if;
  if v_campaign.status = 'cancelled' then raise exception 'CAMPAIGN_CANCELLED' using errcode = '22023'; end if;
  if not public.push_notification_campaign_category_allowed(v_campaign.category) then raise exception 'PUSH_POLICY_BLOCKED' using errcode = '42501'; end if;

  insert into public.push_notification_jobs (
    campaign_id, source_type, source_id, category, aluno_id, title, body, deep_link, data,
    available_at, idempotency_key
  )
  select v_campaign.id, 'campaign', v_campaign.id,
    case v_campaign.category
      when 'financial' then 'financial'
      when 'academic' then 'academic'
      when 'service' then 'service'
      else 'institutional'
    end,
    audience.aluno_id, v_campaign.title, v_campaign.body, v_campaign.deep_link,
    jsonb_build_object('campaignId', v_campaign.id, 'category', v_campaign.category),
    greatest(coalesce(v_campaign.scheduled_at, now()), now()),
    'campaign:' || v_campaign.id || ':student:' || audience.aluno_id
  from public.push_notification_resolve_audience(v_campaign.audience_type, v_campaign.polo_id, v_campaign.turma_id) audience
  on conflict (idempotency_key) do nothing;
  get diagnostics v_inserted = row_count;

  update public.comunicacao_push_campanhas
  set status = case when scheduled_at is not null and scheduled_at > now() then 'scheduled' else 'queued' end,
      queued_at = now()
  where id = v_campaign.id returning * into v_campaign;
  return jsonb_build_object('id', v_campaign.id, 'status', v_campaign.status, 'requestId', p_request_id, 'replayed', v_inserted = 0);
end;
$$;

create or replace function public.comunicacao_push_campanhas_listar(
  p_status text default null,
  p_search text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid, title text, body text, category text, audience_type text,
  polo_id uuid, polo_name text, turma_id uuid, turma_name text, audience_label text,
  eligible_users integer, eligible_devices integer, status text, scheduled_at timestamptz,
  created_at timestamptz, queued_at timestamptz, completed_at timestamptz,
  sent_count integer, failed_count integer, skipped_count integer,
  total_count bigint, created_by_name text
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.can_manage_push_campaigns() then
    raise exception 'INSUFFICIENT_PERMISSION' using errcode = '42501';
  end if;
  return query
  select c.id, c.title, c.body, c.category, c.audience_type,
    c.polo_id, po.nome, c.turma_id, t.nome, c.audience_label,
    c.eligible_users, c.eligible_devices, c.status, c.scheduled_at,
    c.created_at, c.queued_at, c.completed_at,
    c.sent_count, c.failed_count, c.skipped_count,
    count(*) over(), coalesce(u.nome, 'Administrador')
  from public.comunicacao_push_campanhas c
  left join public.polos po on po.id = c.polo_id
  left join public.turmas t on t.id = c.turma_id
  left join public.usuarios_sistema u on u.auth_user_id = c.created_by
  where public.can_target_push_scope(c.audience_type, c.polo_id, c.turma_id)
    and (p_status is null or c.status = p_status)
    and (nullif(btrim(coalesce(p_search, '')), '') is null
      or c.title ilike '%' || btrim(p_search) || '%'
      or c.body ilike '%' || btrim(p_search) || '%'
      or c.audience_label ilike '%' || btrim(p_search) || '%')
  order by c.created_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 100))
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.enqueue_chat_push_notification()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_chat public.comunicacao_chats; v_allowed boolean;
begin
  if new.remetente_tipo not in ('gestor', 'sistema') then return new; end if;
  select * into v_chat from public.comunicacao_chats where id = new.chat_id;
  if not found or v_chat.remetente_tipo <> 'Aluno' or not coalesce(v_chat.notificar_resposta, false) then return new; end if;
  select enabled and coalesce((categories ->> 'chat')::boolean, false) into v_allowed
  from public.push_notification_policies where id = true;
  if not coalesce(v_allowed, false) then return new; end if;
  insert into public.push_notification_jobs (
    source_type, source_id, category, aluno_id, title, body, deep_link, data, idempotency_key
  ) values (
    'chat', new.id, 'chat', v_chat.remetente_id,
    'Nova mensagem da Universo', 'Você recebeu uma nova mensagem no atendimento.',
    '/aluno/comunicacao?chatId=' || v_chat.id,
    jsonb_build_object('chatId', v_chat.id, 'messageId', new.id, 'collapseKey', 'chat:' || v_chat.id),
    'chat-message:' || new.id
  ) on conflict (idempotency_key) do nothing;
  return new;
end;
$$;

drop trigger if exists comunicacao_mensagens_enqueue_push on public.comunicacao_mensagens;
create trigger comunicacao_mensagens_enqueue_push
after insert on public.comunicacao_mensagens
for each row execute function public.enqueue_chat_push_notification();

create or replace function public.refresh_push_notification_campaign(p_campaign_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_sent integer;
  v_failed integer;
  v_skipped integer;
  v_open integer;
begin
  select
    (select count(*)::integer from public.push_notification_deliveries d
      where d.campaign_id = p_campaign_id and d.status = 'sent'),
    (select count(*)::integer from public.push_notification_deliveries d
      where d.campaign_id = p_campaign_id and d.status = 'failed'),
    (select count(*)::integer from public.push_notification_jobs j
      where j.campaign_id = p_campaign_id and j.status in ('skipped', 'cancelled')),
    (select count(*)::integer from public.push_notification_jobs j
      where j.campaign_id = p_campaign_id
        and (j.status in ('pending', 'processing') or (j.status = 'failed' and j.attempts < 5)))
  into v_sent, v_failed, v_skipped, v_open;

  update public.comunicacao_push_campanhas
  set sent_count = coalesce(v_sent, 0),
      failed_count = coalesce(v_failed, 0),
      skipped_count = coalesce(v_skipped, 0),
      status = case
        when coalesce(v_open, 0) > 0 then 'processing'
        when coalesce(v_sent, 0) > 0 and coalesce(v_failed, 0) > 0 then 'partial'
        when coalesce(v_sent, 0) > 0 then 'completed'
        else 'failed'
      end,
      completed_at = case when coalesce(v_open, 0) = 0 then now() else null end
  where id = p_campaign_id;
end;
$$;

revoke all on function public.refresh_push_notification_campaign(uuid) from public, anon, authenticated;

create or replace function public.claim_push_notification_deliveries(p_worker text, p_limit integer default 100)
returns table (
  delivery_id uuid, job_id uuid, campaign_id uuid, device_id uuid,
  push_token text, platform text, category text, title text, body text, deep_link text, data jsonb
)
language plpgsql security definer set search_path = public
as $$
declare v_campaign_id uuid;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  update public.comunicacao_push_campanhas c
  set status = 'queued'
  where c.status = 'scheduled' and c.scheduled_at <= now();

  update public.push_notification_jobs j
  set status = 'failed',
      available_at = now(),
      locked_at = null,
      locked_by = null,
      last_error = 'WORKER_LEASE_EXPIRED'
  where j.status = 'processing'
    and j.locked_at < now() - interval '3 minutes'
    and j.attempts < 5;

  update public.push_notification_deliveries d
  set status = 'failed', last_error = 'WORKER_LEASE_EXPIRED'
  where d.status = 'processing'
    and exists (
      select 1 from public.push_notification_jobs j
      where j.id = d.job_id and j.status = 'failed' and j.last_error = 'WORKER_LEASE_EXPIRED'
    );

  update public.push_notification_jobs j
  set status = 'cancelled', processed_at = now(), last_error = 'PUSH_POLICY_DISABLED'
  where j.status in ('pending', 'failed', 'partial')
    and not exists (
      select 1 from public.push_notification_policies p
      where p.id = true and p.enabled
        and case j.category
          when 'chat' then coalesce((p.categories ->> 'chat')::boolean, false)
          when 'service' then coalesce((p.categories ->> 'chat')::boolean, false)
          when 'financial' then coalesce((p.categories ->> 'financial')::boolean, false)
          when 'academic' then coalesce((p.categories ->> 'academic')::boolean, false)
          when 'calendar' then coalesce((p.categories ->> 'calendar')::boolean, false)
          when 'marketing' then coalesce((p.categories ->> 'marketing')::boolean, false)
          else coalesce((p.categories ->> 'institutional')::boolean, false)
        end
    );

  with claimed as (
    select j.id from public.push_notification_jobs j
    where j.status in ('pending', 'failed', 'partial') and j.available_at <= now() and j.attempts < 5
      and (j.category = 'chat' or not public.push_notification_quiet_hours_active())
    order by j.available_at, j.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  )
  update public.push_notification_jobs j
  set status = 'processing', locked_at = now(), locked_by = left(p_worker, 120), attempts = j.attempts + 1
  from claimed where j.id = claimed.id;

  insert into public.push_notification_deliveries as delivery (job_id, campaign_id, aluno_id, device_id, platform)
  select j.id, j.campaign_id, j.aluno_id, d.id, d.plataforma
  from public.push_notification_jobs j
  join public.aluno_app_dispositivos d on d.aluno_id = j.aluno_id
  where j.status = 'processing' and j.locked_by = left(p_worker, 120)
    and d.active and d.session_active and d.notifications_enabled
    and d.permission_status in ('granted', 'provisional') and d.push_token is not null
    and not exists (
      select 1 from public.push_notification_deliveries prior
      where prior.job_id = j.id and prior.device_id = d.id and prior.status = 'sent'
    )
  on conflict (job_id, device_id) do update set status = 'processing', updated_at = now();

  update public.push_notification_jobs j set status = 'skipped', processed_at = now(), last_error = 'NO_ELIGIBLE_DEVICE'
  where j.status = 'processing' and j.locked_by = left(p_worker, 120)
    and not exists (select 1 from public.push_notification_deliveries d where d.job_id = j.id);

  update public.comunicacao_push_campanhas c set status = 'processing'
  where exists (
    select 1 from public.push_notification_jobs j
    where j.campaign_id = c.id and j.status = 'processing' and j.locked_by = left(p_worker, 120)
  );

  for v_campaign_id in
    select c.id from public.comunicacao_push_campanhas c
    where c.status in ('queued', 'processing', 'scheduled')
      and exists (select 1 from public.push_notification_jobs j where j.campaign_id = c.id)
      and not exists (
        select 1 from public.push_notification_jobs j
        where j.campaign_id = c.id
          and (j.status in ('pending', 'processing') or (j.status = 'failed' and j.attempts < 5))
      )
  loop
    perform public.refresh_push_notification_campaign(v_campaign_id);
  end loop;

  return query
  select d.id, j.id, j.campaign_id, d.device_id, device.push_token, d.platform,
    j.category, j.title, j.body, j.deep_link, j.data
  from public.push_notification_deliveries d
  join public.push_notification_jobs j on j.id = d.job_id
  join public.aluno_app_dispositivos device on device.id = d.device_id
  where j.status = 'processing' and j.locked_by = left(p_worker, 120)
    and d.status in ('pending', 'processing', 'failed');
end;
$$;

create or replace function public.complete_push_notification_delivery(
  p_delivery_id uuid,
  p_success boolean,
  p_provider_message_id text default null,
  p_error text default null,
  p_disable_device boolean default false
)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_delivery public.push_notification_deliveries; v_job public.push_notification_jobs;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  update public.push_notification_deliveries
  set status = case when p_success then 'sent' else 'failed' end,
      provider_message_id = left(p_provider_message_id, 500),
      last_error = case when p_success then null else left(p_error, 1000) end,
      attempts = attempts + 1,
      sent_at = case when p_success then now() else sent_at end
  where id = p_delivery_id returning * into v_delivery;
  if not found then return false; end if;
  if p_disable_device then
    update public.aluno_app_dispositivos set active = false, notifications_enabled = false,
      push_token = null, consent_revoked_at = now()
    where id = v_delivery.device_id;
  end if;
  select * into v_job from public.push_notification_jobs where id = v_delivery.job_id for update;
  if not exists (select 1 from public.push_notification_deliveries where job_id = v_job.id and status in ('pending', 'processing')) then
    update public.push_notification_jobs
    set status = case
      when exists (select 1 from public.push_notification_deliveries where job_id = v_job.id and status = 'sent')
       and exists (select 1 from public.push_notification_deliveries where job_id = v_job.id and status = 'failed') then 'partial'
      when exists (select 1 from public.push_notification_deliveries where job_id = v_job.id and status = 'sent') then 'completed'
      else 'failed' end,
      processed_at = now(), last_error = case when p_success then last_error else left(p_error, 1000) end
    where id = v_job.id;
  end if;
  if v_job.campaign_id is not null then
    perform public.refresh_push_notification_campaign(v_job.campaign_id);
  end if;
  return true;
end;
$$;

revoke all on function public.get_push_notification_policy() from public, anon;
revoke all on function public.update_push_notification_policy(jsonb) from public, anon;
revoke all on function public.comunicacao_push_segmentos_listar(text) from public, anon;
revoke all on function public.comunicacao_push_campanha_previsualizar(text,text,text,text,text,uuid,uuid,timestamptz) from public, anon;
revoke all on function public.comunicacao_push_campanha_criar(text,text,text,text,text,uuid,uuid,timestamptz,uuid,uuid) from public, anon;
revoke all on function public.comunicacao_push_campanha_enfileirar(uuid,uuid) from public, anon;
revoke all on function public.comunicacao_push_campanhas_listar(text,text,integer,integer) from public, anon;
revoke all on function public.claim_push_notification_deliveries(text,integer) from public, anon, authenticated;
revoke all on function public.complete_push_notification_delivery(uuid,boolean,text,text,boolean) from public, anon, authenticated;
grant execute on function public.get_push_notification_policy() to authenticated;
grant execute on function public.update_push_notification_policy(jsonb) to authenticated;
grant execute on function public.comunicacao_push_segmentos_listar(text) to authenticated;
grant execute on function public.comunicacao_push_campanha_previsualizar(text,text,text,text,text,uuid,uuid,timestamptz) to authenticated;
grant execute on function public.comunicacao_push_campanha_criar(text,text,text,text,text,uuid,uuid,timestamptz,uuid,uuid) to authenticated;
grant execute on function public.comunicacao_push_campanha_enfileirar(uuid,uuid) to authenticated;
grant execute on function public.comunicacao_push_campanhas_listar(text,text,integer,integer) to authenticated;
grant execute on function public.claim_push_notification_deliveries(text,integer) to service_role;
grant execute on function public.complete_push_notification_delivery(uuid,boolean,text,text,boolean) to service_role;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'push_notification_worker_secret') then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'push_notification_worker_secret',
      'Autenticacao interna do executor de notificacoes push'
    );
  end if;
end;
$$;

create or replace function public.get_push_notification_worker_secret()
returns text
language sql security definer set search_path = pg_catalog, public, vault
as $$
  select decrypted_secret from vault.decrypted_secrets
  where name = 'push_notification_worker_secret' limit 1;
$$;

revoke all on function public.get_push_notification_worker_secret() from public, anon, authenticated;
grant execute on function public.get_push_notification_worker_secret() to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'push_notification_policies'
  ) then alter publication supabase_realtime add table public.push_notification_policies; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'aluno_app_dispositivo_eventos'
  ) then alter publication supabase_realtime add table public.aluno_app_dispositivo_eventos; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comunicacao_push_campanha_eventos'
  ) then alter publication supabase_realtime add table public.comunicacao_push_campanha_eventos; end if;
end $$;

commit;
