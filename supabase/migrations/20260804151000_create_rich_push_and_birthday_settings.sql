begin;

-- Rich notification images are immutable public objects so FCM/APNs can fetch
-- them without exposing any write capability to the browser or mobile app.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'push-notification-images',
  'push-notification-images',
  true,
  1048576,
  array['image/jpeg', 'image/png']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.push_notification_assets (
  id uuid primary key default gen_random_uuid(),
  purpose text not null,
  bucket_id text not null default 'push-notification-images',
  object_path text not null unique,
  mime_type text not null,
  size_bytes integer not null,
  width integer not null,
  height integer not null,
  sha256 text not null,
  status text not null default 'ready',
  created_by uuid not null,
  created_at timestamptz not null default now(),
  constraint push_notification_assets_purpose_check
    check (purpose in ('campaign', 'birthday')),
  constraint push_notification_assets_bucket_check
    check (bucket_id = 'push-notification-images'),
  constraint push_notification_assets_path_check
    check (object_path ~ '^(campaigns|birthday)/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.(jpg|jpeg|png)$'),
  constraint push_notification_assets_mime_check
    check (mime_type in ('image/jpeg', 'image/png')),
  constraint push_notification_assets_size_check
    check (size_bytes between 1 and 1048576),
  constraint push_notification_assets_dimensions_check
    check (width between 1 and 4096 and height between 1 and 4096 and width::bigint * height::bigint <= 12000000),
  constraint push_notification_assets_sha256_check
    check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint push_notification_assets_status_check
    check (status in ('ready', 'quarantined'))
);

comment on table public.push_notification_assets is
  'Metadados validados de imagens imutáveis usadas em push. Escrita ocorre somente pela Edge Function com service role.';

create index if not exists idx_push_notification_assets_created
  on public.push_notification_assets (created_at desc);

alter table public.push_notification_assets enable row level security;
revoke all on table public.push_notification_assets from public, anon, authenticated;
grant select, insert, update on table public.push_notification_assets to service_role;

drop policy if exists push_notification_assets_client_deny
on public.push_notification_assets;
create policy push_notification_assets_client_deny
on public.push_notification_assets
for all to anon, authenticated
using (false)
with check (false);

alter table public.comunicacao_push_campanhas
  add column if not exists image_asset_id uuid
    references public.push_notification_assets(id) on delete restrict;

alter table public.push_notification_jobs
  add column if not exists image_asset_id uuid
    references public.push_notification_assets(id) on delete restrict;

alter table public.aluno_notificacoes
  add column if not exists image_asset_id uuid
    references public.push_notification_assets(id) on delete restrict,
  add column if not exists image_path text;

alter table public.aluno_notificacoes
  drop constraint if exists aluno_notificacoes_image_path_check;
alter table public.aluno_notificacoes
  add constraint aluno_notificacoes_image_path_check
  check (
    image_path is null
    or image_path ~ '^(campaigns|birthday)/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.(jpg|jpeg|png)$'
  );

create or replace function public.comunicacao_push_asset_upload_autorizar(
  p_purpose text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_purpose not in ('campaign', 'birthday') then
    raise exception 'INVALID_PUSH_ASSET_PURPOSE' using errcode = '22023';
  end if;

  if not public.can_manage_push_campaigns()
     or (p_purpose = 'birthday' and not public.is_gestor_global()) then
    raise exception 'INSUFFICIENT_PERMISSION' using errcode = '42501';
  end if;

  return true;
end;
$$;

revoke all on function public.comunicacao_push_asset_upload_autorizar(text)
from public, anon;
grant execute on function public.comunicacao_push_asset_upload_autorizar(text)
to authenticated;

create or replace function public.push_marketing_consent_allowed(
  p_aluno_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.comunicacao_preferencias preference
    where preference.aluno_id = p_aluno_id
      and preference.canal = 'push'
      and preference.finalidade = 'marketing'
      and preference.permitida
      and preference.consentida_em is not null
      and preference.revogada_em is null
      and preference.politica_versao = 'push-marketing-v1'
  );
$$;

revoke all on function public.push_marketing_consent_allowed(uuid)
from public, anon, authenticated;
grant execute on function public.push_marketing_consent_allowed(uuid)
to service_role;

create or replace function public.aluno_push_marketing_preferencia_obter()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_aluno_id uuid := public.current_aluno_id();
  v_preference public.comunicacao_preferencias%rowtype;
begin
  if v_aluno_id is null then
    raise exception 'ALUNO_IDENTITY_REQUIRED' using errcode = '42501';
  end if;

  select * into v_preference
  from public.comunicacao_preferencias
  where aluno_id = v_aluno_id
    and canal = 'push'
    and finalidade = 'marketing';

  return jsonb_build_object(
    'allowed', coalesce(
      v_preference.permitida
      and v_preference.consentida_em is not null
      and v_preference.revogada_em is null
      and v_preference.politica_versao = 'push-marketing-v1',
      false
    ),
    'updatedAt', v_preference.updated_at,
    'policyVersion', 'push-marketing-v1'
  );
end;
$$;

create or replace function public.aluno_push_marketing_preferencia_atualizar(
  p_allowed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_aluno_id uuid := public.current_aluno_id();
begin
  if v_aluno_id is null then
    raise exception 'ALUNO_IDENTITY_REQUIRED' using errcode = '42501';
  end if;

  if p_allowed is null then
    raise exception 'INVALID_MARKETING_PREFERENCE' using errcode = '22023';
  end if;

  insert into public.comunicacao_preferencias (
    aluno_id,
    canal,
    finalidade,
    permitida,
    origem,
    base_legal,
    politica_versao,
    evidencia,
    consentida_em,
    revogada_em,
    metadata
  ) values (
    v_aluno_id,
    'push',
    'marketing',
    p_allowed,
    'app',
    case when p_allowed then 'consentimento' else null end,
    'push-marketing-v1',
    jsonb_build_object('surface', 'student_notification_center', 'actorAuthUserId', auth.uid()),
    case when p_allowed then now() else null end,
    case when p_allowed then null else now() end,
    '{}'::jsonb
  )
  on conflict (aluno_id, canal, finalidade) do update
  set permitida = excluded.permitida,
      origem = excluded.origem,
      base_legal = excluded.base_legal,
      politica_versao = excluded.politica_versao,
      evidencia = excluded.evidencia,
      consentida_em = excluded.consentida_em,
      revogada_em = excluded.revogada_em,
      metadata = excluded.metadata;

  return public.aluno_push_marketing_preferencia_obter();
end;
$$;

revoke all on function public.aluno_push_marketing_preferencia_obter()
from public, anon;
revoke all on function public.aluno_push_marketing_preferencia_atualizar(boolean)
from public, anon;
grant execute on function public.aluno_push_marketing_preferencia_obter()
to authenticated;
grant execute on function public.aluno_push_marketing_preferencia_atualizar(boolean)
to authenticated;

create or replace function public.push_notification_resolve_campaign_audience(
  p_category text,
  p_audience_type text,
  p_polo_id uuid default null,
  p_turma_id uuid default null
)
returns table (aluno_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select audience.aluno_id
  from public.push_notification_resolve_audience(
    p_audience_type,
    p_polo_id,
    p_turma_id
  ) audience
  where p_category <> 'marketing'
     or public.push_marketing_consent_allowed(audience.aluno_id);
$$;

revoke all on function public.push_notification_resolve_campaign_audience(text, text, uuid, uuid)
from public, anon, authenticated;

create or replace function public.sync_aluno_notificacao_from_push_job()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_image_path text;
begin
  if new.source_type = 'chat' or new.category = 'chat' then
    return new;
  end if;

  select asset.object_path into v_image_path
  from public.push_notification_assets asset
  where asset.id = new.image_asset_id
    and asset.status = 'ready';

  insert into public.aluno_notificacoes (
    aluno_id,
    source_job_id,
    source_type,
    category,
    title,
    body,
    deep_link,
    image_asset_id,
    image_path,
    visible_at,
    created_at
  )
  values (
    new.aluno_id,
    new.id,
    new.source_type,
    new.category,
    new.title,
    new.body,
    new.deep_link,
    new.image_asset_id,
    v_image_path,
    greatest(new.available_at, new.created_at),
    new.created_at
  )
  on conflict (source_job_id) do update
  set image_asset_id = excluded.image_asset_id,
      image_path = excluded.image_path;

  return new;
end;
$$;

update public.aluno_notificacoes inbox
set image_asset_id = job.image_asset_id,
    image_path = asset.object_path
from public.push_notification_jobs job
left join public.push_notification_assets asset
  on asset.id = job.image_asset_id and asset.status = 'ready'
where inbox.source_job_id = job.id
  and (inbox.image_asset_id is distinct from job.image_asset_id
    or inbox.image_path is distinct from asset.object_path);

create or replace function public.aluno_notificacoes_listar_pagina(
  p_filter text default 'all',
  p_limit integer default 20,
  p_snapshot_at timestamptz default null,
  p_cursor_visible_at timestamptz default null,
  p_cursor_id uuid default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_aluno_id uuid := public.current_aluno_id();
  v_filter text := lower(btrim(coalesce(p_filter, 'all')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
  v_snapshot_at timestamptz;
  v_rows jsonb := '[]'::jsonb;
  v_items jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_last jsonb;
begin
  if v_aluno_id is null then
    raise exception 'ALUNO_IDENTITY_REQUIRED' using errcode = '42501';
  end if;

  if v_filter not in ('all', 'unread', 'financial', 'academic', 'institutional') then
    raise exception 'INVALID_NOTIFICATION_FILTER' using errcode = '22023';
  end if;

  if (p_cursor_visible_at is null) <> (p_cursor_id is null)
     or (p_cursor_visible_at is not null and p_snapshot_at is null)
     or (p_cursor_visible_at is null and p_snapshot_at is not null) then
    raise exception 'INVALID_NOTIFICATION_CURSOR' using errcode = '22023';
  end if;

  v_snapshot_at := least(coalesce(p_snapshot_at, now()), now());

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', page.id,
        'aluno_id', page.aluno_id,
        'source_job_id', page.source_job_id,
        'source_type', page.source_type,
        'category', page.category,
        'title', page.title,
        'body', page.body,
        'deep_link', page.deep_link,
        'image_asset_id', page.image_asset_id,
        'image_path', page.image_path,
        'visible_at', page.visible_at,
        'read_at', page.read_at,
        'created_at', page.created_at
      )
      order by page.visible_at desc, page.id desc
    ),
    '[]'::jsonb
  )
  into v_rows
  from (
    select notification.*
    from public.aluno_notificacoes notification
    where notification.aluno_id = v_aluno_id
      and notification.archived_at is null
      and notification.visible_at <= v_snapshot_at
      and (
        p_cursor_visible_at is null
        or (notification.visible_at, notification.id) < (p_cursor_visible_at, p_cursor_id)
      )
      and case v_filter
        when 'unread' then notification.read_at is null
        when 'financial' then notification.category = 'financial'
        when 'academic' then notification.category in ('academic', 'calendar')
        when 'institutional' then notification.category in ('institutional', 'service', 'marketing')
        else true
      end
    order by notification.visible_at desc, notification.id desc
    limit v_limit + 1
  ) page;

  v_has_more := jsonb_array_length(v_rows) > v_limit;

  select coalesce(jsonb_agg(entry.value order by entry.ordinality), '[]'::jsonb)
  into v_items
  from jsonb_array_elements(v_rows) with ordinality as entry(value, ordinality)
  where entry.ordinality <= v_limit;

  if jsonb_array_length(v_items) > 0 then
    v_last := v_items -> (jsonb_array_length(v_items) - 1);
  end if;

  return jsonb_build_object(
    'items', v_items,
    'snapshotAt', v_snapshot_at,
    'nextCursor', case
      when v_has_more and v_last is not null then jsonb_build_object(
        'snapshotAt', v_snapshot_at,
        'visibleAt', v_last ->> 'visible_at',
        'id', v_last ->> 'id'
      )
      else null
    end
  );
end;
$$;

create or replace function public.comunicacao_push_campanha_previsualizar_v2(
  p_title text,
  p_body text,
  p_category text,
  p_deep_link text,
  p_audience_type text,
  p_polo_id uuid default null,
  p_turma_id uuid default null,
  p_scheduled_at timestamptz default null,
  p_image_asset_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_users integer;
  v_base_users integer;
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
  if p_category not in ('institutional', 'academic', 'service', 'financial', 'marketing')
     or p_audience_type not in ('all', 'polo', 'turma')
     or coalesce(p_deep_link, '') !~ '^/aluno(?:/|$)' then
    raise exception 'INVALID_CAMPAIGN' using errcode = '22023';
  end if;
  if (p_audience_type = 'all' and (p_polo_id is not null or p_turma_id is not null))
     or (p_audience_type = 'polo' and (p_polo_id is null or p_turma_id is not null))
     or (p_audience_type = 'turma' and p_turma_id is null) then
    raise exception 'INVALID_AUDIENCE_SCOPE' using errcode = '22023';
  end if;
  if p_image_asset_id is not null and not exists (
    select 1 from public.push_notification_assets asset
    where asset.id = p_image_asset_id
      and asset.purpose = 'campaign'
      and asset.status = 'ready'
  ) then
    raise exception 'INVALID_PUSH_IMAGE' using errcode = '22023';
  end if;

  v_blocked := public.push_notification_sensitive_content_reason(p_title, p_body);
  if v_blocked is null and not public.push_notification_campaign_category_allowed(p_category) then
    v_blocked := 'A política de push, a categoria ou os envios manuais em lote estão desativados.';
  end if;

  select count(*) into v_base_users
  from public.push_notification_resolve_audience(p_audience_type, p_polo_id, p_turma_id);

  select count(*) into v_users
  from public.push_notification_resolve_campaign_audience(
    p_category, p_audience_type, p_polo_id, p_turma_id
  );

  select count(*),
         count(*) filter (where device.plataforma = 'android'),
         count(*) filter (where device.plataforma = 'ios')
  into v_devices, v_android, v_ios
  from public.aluno_app_dispositivos device
  where device.aluno_id in (
    select aluno_id
    from public.push_notification_resolve_campaign_audience(
      p_category, p_audience_type, p_polo_id, p_turma_id
    )
  )
    and device.active
    and device.session_active
    and device.notifications_enabled
    and device.permission_status in ('granted', 'provisional')
    and device.push_token is not null;

  if p_audience_type = 'all' then
    v_label := 'Todos os dispositivos elegíveis';
  elsif p_audience_type = 'polo' then
    select 'Polo ' || nome into v_label from public.polos where id = p_polo_id;
  else
    select 'Turma ' || nome into v_label from public.turmas where id = p_turma_id;
  end if;

  if p_category = 'marketing' and coalesce(v_users, 0) < coalesce(v_base_users, 0) then
    v_warnings := v_warnings || jsonb_build_array(
      'Alunos sem consentimento de novidades e felicitações foram excluídos da audiência.'
    );
  end if;
  if coalesce(v_devices, 0) = 0 and v_blocked is null then
    v_blocked := 'Nenhum dispositivo elegível nesta audiência.';
  end if;
  if coalesce(v_devices, 0) < coalesce(v_users, 0) then
    v_warnings := v_warnings || jsonb_build_array(
      'Parte dos alunos elegíveis ainda não ativou notificações no aplicativo.'
    );
  end if;

  v_payload := jsonb_build_object(
    'title', btrim(p_title),
    'body', btrim(p_body),
    'category', p_category,
    'deepLink', p_deep_link,
    'audienceType', p_audience_type,
    'poloId', p_polo_id,
    'turmaId', p_turma_id,
    'scheduledAt', p_scheduled_at,
    'imageAssetId', p_image_asset_id
  );

  insert into public.comunicacao_push_previews (
    created_by,
    payload,
    eligible_users,
    eligible_devices,
    android_devices,
    ios_devices,
    audience_label,
    blocked_reason
  ) values (
    auth.uid(),
    v_payload,
    v_users,
    v_devices,
    v_android,
    v_ios,
    coalesce(v_label, 'Audiência selecionada'),
    v_blocked
  ) returning token into v_token;

  delete from public.comunicacao_push_previews
  where expires_at < now() - interval '1 day';

  return jsonb_build_object(
    'eligibleUsers', v_users,
    'eligibleDevices', v_devices,
    'androidDevices', v_android,
    'iosDevices', v_ios,
    'audienceLabel', coalesce(v_label, 'Audiência selecionada'),
    'blockedReason', v_blocked,
    'warnings', v_warnings,
    'validationToken', v_token
  );
end;
$$;

create or replace function public.comunicacao_push_campanha_criar_v2(
  p_title text,
  p_body text,
  p_category text,
  p_deep_link text,
  p_audience_type text,
  p_polo_id uuid default null,
  p_turma_id uuid default null,
  p_scheduled_at timestamptz default null,
  p_image_asset_id uuid default null,
  p_preview_token uuid default null,
  p_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_preview public.comunicacao_push_previews%rowtype;
  v_campaign public.comunicacao_push_campanhas%rowtype;
  v_payload jsonb;
begin
  if not public.can_target_push_scope(p_audience_type, p_polo_id, p_turma_id) then
    raise exception 'INSUFFICIENT_PERMISSION' using errcode = '42501';
  end if;
  if p_request_id is null or p_preview_token is null then
    raise exception 'IDEMPOTENCY_REQUIRED' using errcode = '22023';
  end if;

  select * into v_campaign
  from public.comunicacao_push_campanhas
  where created_by = auth.uid() and request_id = p_request_id;
  if found then
    return jsonb_build_object(
      'id', v_campaign.id,
      'status', v_campaign.status,
      'requestId', p_request_id,
      'replayed', true
    );
  end if;

  select * into v_preview
  from public.comunicacao_push_previews
  where token = p_preview_token
    and created_by = auth.uid()
    and consumed_at is null
    and expires_at > now()
  for update;
  if not found or v_preview.blocked_reason is not null then
    raise exception 'VALID_PREVIEW_REQUIRED' using errcode = '22023';
  end if;

  v_payload := jsonb_build_object(
    'title', btrim(p_title),
    'body', btrim(p_body),
    'category', p_category,
    'deepLink', p_deep_link,
    'audienceType', p_audience_type,
    'poloId', p_polo_id,
    'turmaId', p_turma_id,
    'scheduledAt', p_scheduled_at,
    'imageAssetId', p_image_asset_id
  );
  if v_preview.payload <> v_payload then
    raise exception 'PREVIEW_MISMATCH' using errcode = '22023';
  end if;

  insert into public.comunicacao_push_campanhas (
    title,
    body,
    category,
    deep_link,
    audience_type,
    polo_id,
    turma_id,
    audience_label,
    eligible_users,
    eligible_devices,
    android_devices,
    ios_devices,
    status,
    scheduled_at,
    image_asset_id,
    request_id,
    created_by
  ) values (
    btrim(p_title),
    btrim(p_body),
    p_category,
    p_deep_link,
    p_audience_type,
    p_polo_id,
    p_turma_id,
    v_preview.audience_label,
    v_preview.eligible_users,
    v_preview.eligible_devices,
    v_preview.android_devices,
    v_preview.ios_devices,
    case when p_scheduled_at is not null and p_scheduled_at > now() then 'scheduled' else 'draft' end,
    p_scheduled_at,
    p_image_asset_id,
    p_request_id,
    auth.uid()
  ) returning * into v_campaign;

  update public.comunicacao_push_previews
  set consumed_at = now()
  where token = p_preview_token;

  return jsonb_build_object(
    'id', v_campaign.id,
    'status', v_campaign.status,
    'requestId', p_request_id,
    'replayed', false
  );
end;
$$;

create or replace function public.comunicacao_push_campanha_enfileirar_v2(
  p_campaign_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_campaign public.comunicacao_push_campanhas%rowtype;
  v_inserted integer;
  v_image_path text;
begin
  if not public.can_manage_push_campaigns() then
    raise exception 'INSUFFICIENT_PERMISSION' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'IDEMPOTENCY_REQUIRED' using errcode = '22023';
  end if;

  select * into v_campaign
  from public.comunicacao_push_campanhas
  where id = p_campaign_id
  for update;
  if not found then
    raise exception 'CAMPAIGN_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not public.can_target_push_scope(v_campaign.audience_type, v_campaign.polo_id, v_campaign.turma_id) then
    raise exception 'INSUFFICIENT_PERMISSION' using errcode = '42501';
  end if;
  if v_campaign.status in ('queued', 'processing', 'completed', 'partial', 'failed') then
    return jsonb_build_object(
      'id', v_campaign.id,
      'status', v_campaign.status,
      'requestId', p_request_id,
      'replayed', true
    );
  end if;
  if v_campaign.status = 'cancelled' then
    raise exception 'CAMPAIGN_CANCELLED' using errcode = '22023';
  end if;
  if not public.push_notification_campaign_category_allowed(v_campaign.category) then
    raise exception 'PUSH_POLICY_BLOCKED' using errcode = '42501';
  end if;

  select asset.object_path into v_image_path
  from public.push_notification_assets asset
  where asset.id = v_campaign.image_asset_id
    and asset.purpose = 'campaign'
    and asset.status = 'ready';

  if v_campaign.image_asset_id is not null and v_image_path is null then
    raise exception 'INVALID_PUSH_IMAGE' using errcode = '22023';
  end if;

  insert into public.push_notification_jobs (
    campaign_id,
    source_type,
    source_id,
    category,
    aluno_id,
    title,
    body,
    deep_link,
    image_asset_id,
    data,
    available_at,
    idempotency_key
  )
  select
    v_campaign.id,
    'campaign',
    v_campaign.id,
    case v_campaign.category
      when 'financial' then 'financial'
      when 'academic' then 'academic'
      when 'service' then 'service'
      when 'marketing' then 'marketing'
      else 'institutional'
    end,
    audience.aluno_id,
    v_campaign.title,
    v_campaign.body,
    v_campaign.deep_link,
    v_campaign.image_asset_id,
    jsonb_strip_nulls(jsonb_build_object(
      'campaignId', v_campaign.id,
      'category', v_campaign.category,
      'imagePath', v_image_path
    )),
    greatest(coalesce(v_campaign.scheduled_at, now()), now()),
    'campaign:' || v_campaign.id || ':student:' || audience.aluno_id
  from public.push_notification_resolve_campaign_audience(
    v_campaign.category,
    v_campaign.audience_type,
    v_campaign.polo_id,
    v_campaign.turma_id
  ) audience
  on conflict (idempotency_key) do nothing;
  get diagnostics v_inserted = row_count;

  update public.comunicacao_push_campanhas
  set status = case
        when scheduled_at is not null and scheduled_at > now() then 'scheduled'
        else 'queued'
      end,
      queued_at = now()
  where id = v_campaign.id
  returning * into v_campaign;

  return jsonb_build_object(
    'id', v_campaign.id,
    'status', v_campaign.status,
    'requestId', p_request_id,
    'replayed', v_inserted = 0
  );
end;
$$;

create or replace function public.comunicacao_push_campanhas_listar_v2(
  p_status text default null,
  p_search text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  title text,
  body text,
  category text,
  audience_type text,
  polo_id uuid,
  polo_name text,
  turma_id uuid,
  turma_name text,
  audience_label text,
  eligible_users integer,
  eligible_devices integer,
  status text,
  scheduled_at timestamptz,
  created_at timestamptz,
  queued_at timestamptz,
  completed_at timestamptz,
  sent_count integer,
  failed_count integer,
  skipped_count integer,
  total_count bigint,
  created_by_name text,
  image_asset_id uuid,
  image_path text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.can_manage_push_campaigns() then
    raise exception 'INSUFFICIENT_PERMISSION' using errcode = '42501';
  end if;

  return query
  select
    campaign.id,
    campaign.title,
    campaign.body,
    campaign.category,
    campaign.audience_type,
    campaign.polo_id,
    polo.nome,
    campaign.turma_id,
    turma.nome,
    campaign.audience_label,
    campaign.eligible_users,
    campaign.eligible_devices,
    campaign.status,
    campaign.scheduled_at,
    campaign.created_at,
    campaign.queued_at,
    campaign.completed_at,
    campaign.sent_count,
    campaign.failed_count,
    campaign.skipped_count,
    count(*) over(),
    coalesce(manager.nome, 'Administrador'),
    campaign.image_asset_id,
    asset.object_path
  from public.comunicacao_push_campanhas campaign
  left join public.polos polo on polo.id = campaign.polo_id
  left join public.turmas turma on turma.id = campaign.turma_id
  left join public.usuarios_sistema manager on manager.auth_user_id = campaign.created_by
  left join public.push_notification_assets asset
    on asset.id = campaign.image_asset_id and asset.status = 'ready'
  where public.can_target_push_scope(
      campaign.audience_type,
      campaign.polo_id,
      campaign.turma_id
    )
    and (p_status is null or campaign.status = p_status)
    and (
      nullif(btrim(coalesce(p_search, '')), '') is null
      or campaign.title ilike '%' || btrim(p_search) || '%'
      or campaign.body ilike '%' || btrim(p_search) || '%'
      or campaign.audience_label ilike '%' || btrim(p_search) || '%'
    )
  order by campaign.created_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 100))
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.comunicacao_push_campanha_previsualizar_v2(text, text, text, text, text, uuid, uuid, timestamptz, uuid)
from public, anon;
revoke all on function public.comunicacao_push_campanha_criar_v2(text, text, text, text, text, uuid, uuid, timestamptz, uuid, uuid, uuid)
from public, anon;
revoke all on function public.comunicacao_push_campanha_enfileirar_v2(uuid, uuid)
from public, anon;
revoke all on function public.comunicacao_push_campanhas_listar_v2(text, text, integer, integer)
from public, anon;

grant execute on function public.comunicacao_push_campanha_previsualizar_v2(text, text, text, text, text, uuid, uuid, timestamptz, uuid)
to authenticated;
grant execute on function public.comunicacao_push_campanha_criar_v2(text, text, text, text, text, uuid, uuid, timestamptz, uuid, uuid, uuid)
to authenticated;
grant execute on function public.comunicacao_push_campanha_enfileirar_v2(uuid, uuid)
to authenticated;
grant execute on function public.comunicacao_push_campanhas_listar_v2(text, text, integer, integer)
to authenticated;

create table if not exists public.push_birthday_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  title text not null default '🎉 Feliz aniversário!',
  body text not null default 'A Universo deseja a você um dia muito especial e um novo ciclo de muitas conquistas.',
  send_time time not null default '08:00',
  timezone text not null default 'America/Maceio',
  image_asset_id uuid references public.push_notification_assets(id) on delete restrict,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_birthday_settings_title_check
    check (char_length(btrim(title)) between 1 and 80),
  constraint push_birthday_settings_body_check
    check (char_length(btrim(body)) between 1 and 180),
  constraint push_birthday_settings_timezone_check
    check (timezone = 'America/Maceio')
);

insert into public.push_birthday_settings (id)
values (true)
on conflict (id) do nothing;

alter table public.push_birthday_settings enable row level security;
revoke all on table public.push_birthday_settings from public, anon, authenticated;
grant select, insert, update on table public.push_birthday_settings to service_role;

drop policy if exists push_birthday_settings_client_deny
on public.push_birthday_settings;
create policy push_birthday_settings_client_deny
on public.push_birthday_settings
for all to anon, authenticated
using (false)
with check (false);

drop trigger if exists push_birthday_settings_touch
on public.push_birthday_settings;
create trigger push_birthday_settings_touch
before update on public.push_birthday_settings
for each row execute function public.push_notification_touch_updated_at();

create or replace function public.comunicacao_push_aniversario_config_obter()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_settings public.push_birthday_settings%rowtype;
  v_image_path text;
begin
  if not public.can_manage_push_campaigns() then
    raise exception 'INSUFFICIENT_PERMISSION' using errcode = '42501';
  end if;

  select * into v_settings
  from public.push_birthday_settings
  where id is true;

  select asset.object_path into v_image_path
  from public.push_notification_assets asset
  where asset.id = v_settings.image_asset_id
    and asset.purpose = 'birthday'
    and asset.status = 'ready';

  return jsonb_build_object(
    'enabled', v_settings.enabled,
    'title', v_settings.title,
    'body', v_settings.body,
    'sendTime', to_char(v_settings.send_time, 'HH24:MI'),
    'timezone', v_settings.timezone,
    'imageAssetId', v_settings.image_asset_id,
    'imagePath', v_image_path,
    'updatedAt', v_settings.updated_at
  );
end;
$$;

create or replace function public.comunicacao_push_aniversario_config_atualizar(
  p_enabled boolean,
  p_title text,
  p_body text,
  p_send_time text,
  p_image_asset_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_send_time time;
begin
  if not public.is_gestor_global() or not public.can_manage_push_campaigns() then
    raise exception 'INSUFFICIENT_PERMISSION' using errcode = '42501';
  end if;
  if p_enabled is null
     or char_length(btrim(coalesce(p_title, ''))) not between 1 and 80
     or char_length(btrim(coalesce(p_body, ''))) not between 1 and 180
     or coalesce(p_send_time, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'INVALID_BIRTHDAY_PUSH_SETTINGS' using errcode = '22023';
  end if;

  v_send_time := p_send_time::time;

  if p_image_asset_id is not null and not exists (
    select 1 from public.push_notification_assets asset
    where asset.id = p_image_asset_id
      and asset.purpose = 'birthday'
      and asset.status = 'ready'
  ) then
    raise exception 'INVALID_BIRTHDAY_PUSH_IMAGE' using errcode = '22023';
  end if;
  if p_enabled and p_image_asset_id is null then
    raise exception 'BIRTHDAY_PUSH_IMAGE_REQUIRED' using errcode = '22023';
  end if;

  update public.push_birthday_settings
  set enabled = p_enabled,
      title = btrim(p_title),
      body = btrim(p_body),
      send_time = v_send_time,
      image_asset_id = p_image_asset_id,
      updated_by = auth.uid()
  where id is true;

  return public.comunicacao_push_aniversario_config_obter();
end;
$$;

revoke all on function public.comunicacao_push_aniversario_config_obter()
from public, anon;
revoke all on function public.comunicacao_push_aniversario_config_atualizar(boolean, text, text, text, uuid)
from public, anon;
grant execute on function public.comunicacao_push_aniversario_config_obter()
to authenticated;
grant execute on function public.comunicacao_push_aniversario_config_atualizar(boolean, text, text, text, uuid)
to authenticated;

create or replace function public.guard_and_configure_birthday_push_job()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_settings public.push_birthday_settings%rowtype;
  v_policy public.push_notification_policies%rowtype;
  v_local_now timestamp := timezone('America/Maceio', now());
  v_image_path text;
  v_is_birthday boolean := false;
begin
  if coalesce(new.data ->> 'event', '') <> 'birthday' then
    return new;
  end if;

  select * into v_settings
  from public.push_birthday_settings
  where id is true;
  select * into v_policy
  from public.push_notification_policies
  where id is true;

  if not found
     or not coalesce(v_settings.enabled, false)
     or not coalesce(v_policy.enabled, false)
     or not coalesce((v_policy.categories ->> 'marketing')::boolean, false)
     or v_local_now::time < v_settings.send_time
     or not public.push_marketing_consent_allowed(new.aluno_id) then
    return null;
  end if;

  select (
    student.tipo = 'Aluno'
    and student.status = 'ATIVO'
    and student.data_nascimento is not null
    and (
      (
        extract(month from student.data_nascimento) = extract(month from v_local_now::date)
        and extract(day from student.data_nascimento) = extract(day from v_local_now::date)
      )
      or (
        extract(month from student.data_nascimento) = 2
        and extract(day from student.data_nascimento) = 29
        and extract(month from v_local_now::date) = 2
        and extract(day from v_local_now::date) = 28
        and extract(day from (make_date(extract(year from v_local_now)::integer, 3, 1) - interval '1 day')) = 28
      )
    )
    and exists (
      select 1
      from public.matriculas enrollment
      where enrollment.aluno_id = student.id
        and enrollment.status in ('ATIVO', 'EM_DEPENDENCIA')
    )
  ) into v_is_birthday
  from public.parceiros student
  where student.id = new.aluno_id;

  if not coalesce(v_is_birthday, false) then
    return null;
  end if;

  select asset.object_path into v_image_path
  from public.push_notification_assets asset
  where asset.id = v_settings.image_asset_id
    and asset.purpose = 'birthday'
    and asset.status = 'ready';
  if v_image_path is null then
    return null;
  end if;

  new.source_type := 'institutional';
  new.source_id := null;
  new.category := 'marketing';
  new.title := v_settings.title;
  new.body := v_settings.body;
  new.deep_link := '/aluno/?module=notificacoes';
  new.image_asset_id := v_settings.image_asset_id;
  new.available_at := greatest(new.available_at, now());
  new.data := jsonb_build_object(
    'event', 'birthday',
    'birthdayDate', v_local_now::date,
    'imagePath', v_image_path,
    'collapse_key', 'birthday:' || new.aluno_id::text || ':' || extract(year from v_local_now)::integer
  );
  new.idempotency_key := format(
    'marketing:birthday:%s:%s',
    new.aluno_id,
    extract(year from v_local_now)::integer
  );

  return new;
end;
$$;

revoke all on function public.guard_and_configure_birthday_push_job()
from public, anon, authenticated;

drop trigger if exists push_notification_jobs_guard_birthday
on public.push_notification_jobs;
create trigger push_notification_jobs_guard_birthday
before insert on public.push_notification_jobs
for each row execute function public.guard_and_configure_birthday_push_job();

create or replace function public.enqueue_birthday_push_notifications()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_settings public.push_birthday_settings%rowtype;
  v_policy public.push_notification_policies%rowtype;
  v_local_now timestamp := timezone('America/Maceio', now());
  v_inserted integer := 0;
begin
  select * into v_settings
  from public.push_birthday_settings
  where id is true;
  select * into v_policy
  from public.push_notification_policies
  where id is true;

  if not coalesce(v_settings.enabled, false)
     or not coalesce(v_policy.enabled, false)
     or not coalesce((v_policy.categories ->> 'marketing')::boolean, false)
     or v_local_now::time < v_settings.send_time then
    return jsonb_build_object('enabled', coalesce(v_settings.enabled, false), 'queued', 0);
  end if;

  insert into public.push_notification_jobs (
    source_type,
    source_id,
    category,
    aluno_id,
    title,
    body,
    deep_link,
    image_asset_id,
    data,
    idempotency_key
  )
  select
    'institutional',
    null,
    'marketing',
    student.id,
    v_settings.title,
    v_settings.body,
    '/aluno/?module=notificacoes',
    v_settings.image_asset_id,
    jsonb_build_object('event', 'birthday'),
    format(
      'marketing:birthday:%s:%s',
      student.id,
      extract(year from v_local_now)::integer
    )
  from public.parceiros student
  where student.tipo = 'Aluno'
    and student.status = 'ATIVO'
    and student.data_nascimento is not null
    and (
      (
        extract(month from student.data_nascimento) = extract(month from v_local_now::date)
        and extract(day from student.data_nascimento) = extract(day from v_local_now::date)
      )
      or (
        extract(month from student.data_nascimento) = 2
        and extract(day from student.data_nascimento) = 29
        and extract(month from v_local_now::date) = 2
        and extract(day from v_local_now::date) = 28
        and extract(day from (make_date(extract(year from v_local_now)::integer, 3, 1) - interval '1 day')) = 28
      )
    )
    and exists (
      select 1
      from public.matriculas enrollment
      where enrollment.aluno_id = student.id
        and enrollment.status in ('ATIVO', 'EM_DEPENDENCIA')
    )
    and public.push_marketing_consent_allowed(student.id)
  on conflict (idempotency_key) do nothing;

  get diagnostics v_inserted = row_count;
  return jsonb_build_object('enabled', true, 'queued', v_inserted);
end;
$$;

revoke all on function public.enqueue_birthday_push_notifications()
from public, anon, authenticated;
grant execute on function public.enqueue_birthday_push_notifications()
to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'enqueue-birthday-push-notifications') then
      perform cron.unschedule('enqueue-birthday-push-notifications');
    end if;
    perform cron.schedule(
      'enqueue-birthday-push-notifications',
      '*/5 * * * *',
      'select public.enqueue_birthday_push_notifications()'
    );
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
