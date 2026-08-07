begin;

-- Relationship/birthday messages are not the same purpose as commercial
-- advertising. Keep the student's optional choice specific, auditable and
-- independent from both the mandatory academic terms and the OS push grant.
create schema if not exists comunicacao_private;
revoke all on schema comunicacao_private from public, anon, authenticated;

-- Give relationship/birthday communication its own canonical purpose. The
-- existing `marketing` row remains reserved for a future, separately captured
-- commercial-advertising consent.
alter table public.comunicacao_preferencias
  drop constraint if exists comunicacao_preferencias_finalidade_check;
alter table public.comunicacao_preferencias
  add constraint comunicacao_preferencias_finalidade_check
  check (finalidade in ('transacional', 'marketing', 'relacionamento'));
alter table public.comunicacao_preferencias
  drop constraint if exists comunicacao_preferencias_consentimento_check;
alter table public.comunicacao_preferencias
  add constraint comunicacao_preferencias_consentimento_check
  check (
    finalidade not in ('marketing', 'relacionamento')
    or permitida = false
    or (
      consentida_em is not null
      and revogada_em is null
      and nullif(btrim(coalesce(politica_versao, '')), '') is not null
    )
  );

create table if not exists public.comunicacao_preferencias_auditoria (
  id bigint generated always as identity primary key,
  preferencia_id uuid not null,
  -- Deliberately retained as an immutable identifier instead of an FK: an
  -- audited student record must survive an authorized account deletion and
  -- must not prevent that deletion.
  aluno_id uuid not null,
  canal text not null,
  finalidade text not null,
  decisao text not null,
  permitida boolean not null,
  origem text not null,
  base_legal text,
  politica_versao text,
  evidencia jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  actor_auth_user_id uuid,
  occurred_at timestamptz not null default now(),
  constraint comunicacao_preferencias_auditoria_decisao_check
    check (decisao in ('granted', 'declined', 'revoked', 'updated')),
  constraint comunicacao_preferencias_auditoria_evidencia_check
    check (jsonb_typeof(evidencia) = 'object'),
  constraint comunicacao_preferencias_auditoria_metadata_check
    check (jsonb_typeof(metadata) = 'object')
);

create index if not exists idx_comunicacao_preferencias_auditoria_aluno_ocorrido
  on public.comunicacao_preferencias_auditoria (aluno_id, occurred_at desc, id desc);

alter table public.comunicacao_preferencias_auditoria enable row level security;
revoke all on public.comunicacao_preferencias_auditoria
from public, anon, authenticated;
grant select on public.comunicacao_preferencias_auditoria to service_role;

create or replace function comunicacao_private.audit_communication_preference()
returns trigger
language plpgsql
security definer
set search_path = public, comunicacao_private, pg_temp
as $$
declare
  v_decision text;
begin
  v_decision := nullif(btrim(coalesce(new.evidencia ->> 'decision', '')), '');
  if v_decision is null
     or v_decision not in ('granted', 'declined', 'revoked', 'updated') then
    v_decision := case
      when new.permitida then 'granted'
      when tg_op = 'UPDATE' and old.permitida and not new.permitida then 'revoked'
      when tg_op = 'INSERT' then 'declined'
      else 'updated'
    end;
  end if;

  insert into public.comunicacao_preferencias_auditoria (
    preferencia_id,
    aluno_id,
    canal,
    finalidade,
    decisao,
    permitida,
    origem,
    base_legal,
    politica_versao,
    evidencia,
    metadata,
    actor_auth_user_id
  ) values (
    new.id,
    new.aluno_id,
    new.canal,
    new.finalidade,
    v_decision,
    new.permitida,
    new.origem,
    new.base_legal,
    new.politica_versao,
    new.evidencia,
    new.metadata,
    case
      when auth.uid() is not null then auth.uid()
      when coalesce(new.evidencia ->> 'actorAuthUserId', '')
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (new.evidencia ->> 'actorAuthUserId')::uuid
      else null
    end
  );

  return new;
end;
$$;

revoke all on function comunicacao_private.audit_communication_preference()
from public, anon, authenticated;

drop trigger if exists comunicacao_preferencias_append_audit
on public.comunicacao_preferencias;
create trigger comunicacao_preferencias_append_audit
after insert or update on public.comunicacao_preferencias
for each row execute function comunicacao_private.audit_communication_preference();

create or replace function comunicacao_private.capture_initial_relationship_preference(
  p_aluno_id uuid,
  p_allowed boolean,
  p_surface text,
  p_actor_auth_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, comunicacao_private, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_decision text := case when p_allowed then 'granted' else 'declined' end;
begin
  if p_aluno_id is null or p_allowed is null or p_actor_auth_user_id is null then
    return;
  end if;

  if p_surface not in ('public_signup_web', 'public_signup_app') then
    return;
  end if;

  if not exists (
    select 1
    from public.parceiros student
    where student.id = p_aluno_id
      and student.tipo = 'Aluno'
  ) then
    return;
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
    p_aluno_id,
    'push',
    'relacionamento',
    p_allowed,
    'cadastro',
    case when p_allowed then 'consentimento' else null end,
    'push-relationship-birthday-v1',
    jsonb_build_object(
      'surface', p_surface,
      'decision', v_decision,
      'purpose', 'relationship_birthday',
      'actorAuthUserId', p_actor_auth_user_id,
      'capturedAt', v_now,
      'includesCommercialAdvertising', false,
      'osPushPermissionRequested', false
    ),
    case when p_allowed then v_now else null end,
    null,
    jsonb_build_object(
      'consentScopes', jsonb_build_array('relationship', 'birthday'),
      'excludedScopes', jsonb_build_array('commercial_campaign', 'profiling'),
      'initialDecision', true
    )
  )
  on conflict (aluno_id, canal, finalidade) do nothing;
end;
$$;

revoke all on function comunicacao_private.capture_initial_relationship_preference(uuid, boolean, text, uuid)
from public, anon, authenticated;

create or replace function comunicacao_private.capture_public_signup_relationship_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public, comunicacao_private, pg_temp
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_aluno_id uuid;
  v_surface text;
  v_allowed boolean;
begin
  if coalesce(v_meta ->> 'origem', '') <> 'cadastro_publico_ead'
     or coalesce(v_meta ->> 'tipo', '') <> 'Aluno'
     or jsonb_typeof(v_meta -> 'relationshipBirthdayChoiceMade') <> 'boolean'
     or coalesce((v_meta ->> 'relationshipBirthdayChoiceMade')::boolean, false) is not true
     or jsonb_typeof(v_meta -> 'relationshipBirthdayConsent') <> 'boolean' then
    return new;
  end if;

  v_surface := coalesce(v_meta ->> 'relationshipBirthdayConsentSurface', '');
  if v_surface not in ('public_signup_web', 'public_signup_app') then
    return new;
  end if;
  v_allowed := (v_meta ->> 'relationshipBirthdayConsent')::boolean;

  select student.id
    into v_aluno_id
  from public.parceiros student
  where student.tipo = 'Aluno'
    and (
      student.auth_user_id = new.id
      or lower(coalesce(nullif(student.auth_login_email, ''), student.email, ''))
        = lower(coalesce(new.email, ''))
    )
  order by (student.auth_user_id = new.id) desc, student.created_at desc nulls last
  limit 1;

  perform comunicacao_private.capture_initial_relationship_preference(
    v_aluno_id,
    v_allowed,
    v_surface,
    new.id
  );
  return new;
exception when others then
  raise warning 'Falha ao capturar preferencia de relacionamento do cadastro Auth %: %', new.id, sqlerrm;
  return new;
end;
$$;

revoke all on function comunicacao_private.capture_public_signup_relationship_from_auth()
from public, anon, authenticated;

drop trigger if exists trg_zz_capture_public_signup_relationship_preference
on auth.users;
create trigger trg_zz_capture_public_signup_relationship_preference
after insert on auth.users
for each row execute function comunicacao_private.capture_public_signup_relationship_from_auth();

create or replace function comunicacao_private.capture_public_signup_relationship_from_student()
returns trigger
language plpgsql
security definer
set search_path = public, comunicacao_private, pg_temp
as $$
declare
  v_auth_user auth.users%rowtype;
  v_meta jsonb;
  v_surface text;
  v_allowed boolean;
begin
  if new.tipo <> 'Aluno' then
    return new;
  end if;

  select identity.*
    into v_auth_user
  from auth.users identity
  where identity.id = new.auth_user_id
     or lower(coalesce(identity.email, ''))
       = lower(coalesce(nullif(new.auth_login_email, ''), new.email, ''))
  order by (identity.id = new.auth_user_id) desc, identity.created_at desc nulls last
  limit 1;

  if not found then
    return new;
  end if;

  v_meta := coalesce(v_auth_user.raw_user_meta_data, '{}'::jsonb);
  if coalesce(v_meta ->> 'origem', '') <> 'cadastro_publico_ead'
     or coalesce(v_meta ->> 'tipo', '') <> 'Aluno'
     or jsonb_typeof(v_meta -> 'relationshipBirthdayChoiceMade') <> 'boolean'
     or coalesce((v_meta ->> 'relationshipBirthdayChoiceMade')::boolean, false) is not true
     or jsonb_typeof(v_meta -> 'relationshipBirthdayConsent') <> 'boolean' then
    return new;
  end if;

  v_surface := coalesce(v_meta ->> 'relationshipBirthdayConsentSurface', '');
  if v_surface not in ('public_signup_web', 'public_signup_app') then
    return new;
  end if;
  v_allowed := (v_meta ->> 'relationshipBirthdayConsent')::boolean;

  perform comunicacao_private.capture_initial_relationship_preference(
    new.id,
    v_allowed,
    v_surface,
    v_auth_user.id
  );
  return new;
exception when others then
  raise warning 'Falha ao capturar preferencia de relacionamento do aluno %: %', new.id, sqlerrm;
  return new;
end;
$$;

revoke all on function comunicacao_private.capture_public_signup_relationship_from_student()
from public, anon, authenticated;

drop trigger if exists parceiros_capture_public_signup_relationship_preference
on public.parceiros;
create trigger parceiros_capture_public_signup_relationship_preference
after insert on public.parceiros
for each row execute function comunicacao_private.capture_public_signup_relationship_from_student();

create or replace function public.aluno_push_relacionamento_preferencia_obter()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_aluno_id uuid := public.current_aluno_id();
  v_preference public.comunicacao_preferencias%rowtype;
  v_decided boolean := false;
begin
  if v_aluno_id is null then
    raise exception 'ALUNO_IDENTITY_REQUIRED' using errcode = '42501';
  end if;

  select * into v_preference
  from public.comunicacao_preferencias preference
  where preference.aluno_id = v_aluno_id
    and preference.canal = 'push'
    and preference.finalidade = 'relacionamento';

  v_decided := coalesce(
    v_preference.id is not null
    and v_preference.politica_versao = 'push-relationship-birthday-v1'
    and v_preference.evidencia ->> 'purpose' = 'relationship_birthday'
    and jsonb_typeof(v_preference.metadata -> 'consentScopes') = 'array'
    and (v_preference.metadata -> 'consentScopes')
      @> '["relationship","birthday"]'::jsonb
    and not ((v_preference.metadata -> 'consentScopes') ? 'commercial_campaign'),
    false
  );

  return jsonb_build_object(
    'decided', v_decided,
    'allowed', coalesce(
      v_decided
      and v_preference.permitida
      and v_preference.consentida_em is not null
      and v_preference.revogada_em is null,
      false
    ),
    'updatedAt', case when v_decided then v_preference.updated_at else null end,
    'policyVersion', 'push-relationship-birthday-v1',
    'purpose', 'relationship_birthday',
    'includesCommercialAdvertising', false
  );
end;
$$;

revoke all on function public.aluno_push_relacionamento_preferencia_obter()
from public, anon, authenticated;
grant execute on function public.aluno_push_relacionamento_preferencia_obter()
to authenticated;

create or replace function public.aluno_push_relacionamento_preferencia_registrar(
  p_allowed boolean,
  p_surface text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_aluno_id uuid := public.current_aluno_id();
  v_existing public.comunicacao_preferencias%rowtype;
  v_now timestamptz := now();
  v_decision text;
  v_origin text;
  v_metadata jsonb := jsonb_build_object(
    'consentScopes', jsonb_build_array('relationship', 'birthday'),
    'excludedScopes', jsonb_build_array('commercial_campaign', 'profiling'),
    'initialDecision', false
  );
begin
  if v_aluno_id is null then
    raise exception 'ALUNO_IDENTITY_REQUIRED' using errcode = '42501';
  end if;
  if p_allowed is null then
    raise exception 'INVALID_RELATIONSHIP_PREFERENCE' using errcode = '22023';
  end if;
  if p_surface not in (
    'public_signup_web',
    'public_signup_app',
    'student_first_access',
    'student_notification_preferences'
  ) then
    raise exception 'INVALID_RELATIONSHIP_PREFERENCE_SURFACE' using errcode = '22023';
  end if;

  select * into v_existing
  from public.comunicacao_preferencias preference
  where preference.aluno_id = v_aluno_id
    and preference.canal = 'push'
    and preference.finalidade = 'relacionamento'
  for update;

  if v_existing.id is not null
     and v_existing.permitida = p_allowed
     and v_existing.politica_versao = 'push-relationship-birthday-v1'
     and v_existing.evidencia ->> 'purpose' = 'relationship_birthday'
     and jsonb_typeof(v_existing.metadata -> 'consentScopes') = 'array'
     and (v_existing.metadata -> 'consentScopes')
       @> '["relationship","birthday"]'::jsonb
     and not ((v_existing.metadata -> 'consentScopes') ? 'commercial_campaign') then
    return public.aluno_push_relacionamento_preferencia_obter();
  end if;

  v_decision := case
    when p_allowed then 'granted'
    when v_existing.id is not null and v_existing.permitida then 'revoked'
    else 'declined'
  end;
  v_origin := case
    when p_surface in ('public_signup_web', 'public_signup_app') then 'cadastro'
    else 'app'
  end;

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
    'relacionamento',
    p_allowed,
    v_origin,
    case when p_allowed then 'consentimento' else null end,
    'push-relationship-birthday-v1',
    jsonb_build_object(
      'surface', p_surface,
      'decision', v_decision,
      'purpose', 'relationship_birthday',
      'actorAuthUserId', auth.uid(),
      'capturedAt', v_now,
      'includesCommercialAdvertising', false,
      'osPushPermissionRequested', false
    ),
    case
      when p_allowed then v_now
      when v_decision = 'revoked' then v_existing.consentida_em
      else null
    end,
    case when v_decision = 'revoked' then v_now else null end,
    v_metadata
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

  return public.aluno_push_relacionamento_preferencia_obter();
end;
$$;

revoke all on function public.aluno_push_relacionamento_preferencia_registrar(boolean, text)
from public, anon, authenticated;
grant execute on function public.aluno_push_relacionamento_preferencia_registrar(boolean, text)
to authenticated;

-- Compatibility for the current notification settings client. The legacy
-- function names now represent only relationship/birthday messages.
create or replace function public.aluno_push_marketing_preferencia_obter()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.aluno_push_relacionamento_preferencia_obter();
$$;

create or replace function public.aluno_push_marketing_preferencia_atualizar(
  p_allowed boolean
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.aluno_push_relacionamento_preferencia_registrar(
    p_allowed,
    'student_notification_preferences'
  );
$$;

revoke all on function public.aluno_push_marketing_preferencia_obter()
from public, anon, authenticated;
revoke all on function public.aluno_push_marketing_preferencia_atualizar(boolean)
from public, anon, authenticated;
grant execute on function public.aluno_push_marketing_preferencia_obter()
to authenticated;
grant execute on function public.aluno_push_marketing_preferencia_atualizar(boolean)
to authenticated;

create or replace function public.push_relationship_birthday_consent_allowed(
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
      and preference.finalidade = 'relacionamento'
      and preference.permitida
      and preference.consentida_em is not null
      and preference.revogada_em is null
      and preference.politica_versao = 'push-relationship-birthday-v1'
      and preference.evidencia ->> 'purpose' = 'relationship_birthday'
      and coalesce((preference.evidencia ->> 'includesCommercialAdvertising')::boolean, false) is false
      and jsonb_typeof(preference.metadata -> 'consentScopes') = 'array'
      and (preference.metadata -> 'consentScopes')
        @> '["relationship","birthday"]'::jsonb
      and not ((preference.metadata -> 'consentScopes') ? 'commercial_campaign')
  );
$$;

create or replace function public.push_commercial_marketing_consent_allowed(
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
    join public.parceiros student on student.id = preference.aluno_id
    where preference.aluno_id = p_aluno_id
      and student.tipo = 'Aluno'
      and student.data_nascimento is not null
      and student.data_nascimento <= current_date - interval '18 years'
      and preference.canal = 'push'
      and preference.finalidade = 'marketing'
      and preference.permitida
      and preference.consentida_em is not null
      and preference.revogada_em is null
      and preference.politica_versao = 'push-commercial-marketing-v1'
      and coalesce((preference.evidencia ->> 'includesCommercialAdvertising')::boolean, false)
      and jsonb_typeof(preference.metadata -> 'consentScopes') = 'array'
      and (preference.metadata -> 'consentScopes')
        @> '["commercial_campaign"]'::jsonb
  );
$$;

-- Kept for older birthday functions that still call this name. Generic
-- campaigns are independently gated below and never inherit this consent.
create or replace function public.push_marketing_consent_allowed(
  p_aluno_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.push_relationship_birthday_consent_allowed(p_aluno_id);
$$;

revoke all on function public.push_relationship_birthday_consent_allowed(uuid)
from public, anon, authenticated;
revoke all on function public.push_commercial_marketing_consent_allowed(uuid)
from public, anon, authenticated;
revoke all on function public.push_marketing_consent_allowed(uuid)
from public, anon, authenticated;
grant execute on function public.push_relationship_birthday_consent_allowed(uuid)
to service_role;
grant execute on function public.push_commercial_marketing_consent_allowed(uuid)
to service_role;
grant execute on function public.push_marketing_consent_allowed(uuid)
to service_role;

-- The dispatcher performs one fail-closed, backend-owned revalidation for the
-- whole claimed batch. This keeps consent, evidence and age rules in Postgres
-- instead of duplicating them in the Edge Function.
create or replace function public.push_notification_consent_allowed_deliveries(
  p_delivery_ids uuid[]
)
returns table (delivery_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select delivery.id
  from public.push_notification_deliveries delivery
  join public.push_notification_jobs job on job.id = delivery.job_id
  where delivery.id = any(coalesce(p_delivery_ids, array[]::uuid[]))
    and case
      when coalesce(job.data ->> 'event', '') = 'birthday'
        then public.push_relationship_birthday_consent_allowed(job.aluno_id)
      when job.category = 'marketing'
        then public.push_commercial_marketing_consent_allowed(job.aluno_id)
      else true
    end;
$$;

revoke all on function public.push_notification_consent_allowed_deliveries(uuid[])
from public, anon, authenticated;
grant execute on function public.push_notification_consent_allowed_deliveries(uuid[])
to service_role;

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
     or public.push_commercial_marketing_consent_allowed(audience.aluno_id);
$$;

revoke all on function public.push_notification_resolve_campaign_audience(text, text, uuid, uuid)
from public, anon, authenticated;

create or replace function public.push_notification_job_block_reason(
  p_job_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.push_notification_jobs%rowtype;
  v_policy public.push_notification_policies%rowtype;
  v_settings public.push_birthday_settings%rowtype;
  v_local_date date := timezone('America/Maceio', now())::date;
  v_birthday_date text;
  v_allowed boolean := false;
  v_is_birthday boolean := false;
begin
  select * into v_job
  from public.push_notification_jobs job
  where job.id = p_job_id;
  if not found then
    return 'PUSH_JOB_NOT_FOUND';
  end if;

  select * into v_policy
  from public.push_notification_policies policy
  where policy.id is true;
  if not found or not coalesce(v_policy.enabled, false) then
    return 'PUSH_POLICY_DISABLED';
  end if;

  v_allowed := case
    when coalesce(v_job.data ->> 'event', '') = 'birthday'
      then coalesce((v_policy.categories ->> 'marketing')::boolean, false)
    else case v_job.category
      when 'chat' then coalesce((v_policy.categories ->> 'chat')::boolean, false)
      when 'service' then coalesce((v_policy.categories ->> 'chat')::boolean, false)
      when 'financial' then coalesce((v_policy.categories ->> 'financial')::boolean, false)
      when 'academic' then coalesce((v_policy.categories ->> 'academic')::boolean, false)
      when 'calendar' then coalesce((v_policy.categories ->> 'calendar')::boolean, false)
      when 'marketing' then coalesce((v_policy.categories ->> 'marketing')::boolean, false)
      else coalesce((v_policy.categories ->> 'institutional')::boolean, false)
    end
  end;
  if not v_allowed then
    return 'PUSH_CATEGORY_DISABLED';
  end if;

  if coalesce(v_job.data ->> 'event', '') = 'birthday' then
    if not public.push_relationship_birthday_consent_allowed(v_job.aluno_id) then
      return 'PUSH_RELATIONSHIP_BIRTHDAY_CONSENT_REQUIRED';
    end if;
  elsif v_job.category = 'marketing'
        and not public.push_commercial_marketing_consent_allowed(v_job.aluno_id) then
    return 'PUSH_COMMERCIAL_MARKETING_CONSENT_REQUIRED';
  end if;

  if coalesce(v_job.data ->> 'event', '') = 'birthday' then
    select * into v_settings
    from public.push_birthday_settings settings
    where settings.id is true;
    if not found or not coalesce(v_settings.enabled, false) then
      return 'BIRTHDAY_PUSH_DISABLED';
    end if;
    if v_settings.image_asset_id is null
       or v_settings.image_asset_id is distinct from v_job.image_asset_id
       or not exists (
         select 1
         from public.push_notification_assets asset
         where asset.id = v_settings.image_asset_id
           and asset.purpose = 'birthday'
           and asset.status = 'ready'
       ) then
      return 'BIRTHDAY_PUSH_IMAGE_CHANGED';
    end if;

    v_birthday_date := coalesce(
      v_job.data ->> 'birthdayDate',
      v_job.data ->> 'birthday_date'
    );
    if v_birthday_date is null
       or v_birthday_date !~ '^\d{4}-\d{2}-\d{2}$'
       or v_birthday_date::date <> v_local_date then
      return 'BIRTHDAY_PUSH_WINDOW_EXPIRED';
    end if;

    select (
      student.tipo = 'Aluno'
      and student.status = 'ATIVO'
      and student.data_nascimento is not null
      and (
        (
          extract(month from student.data_nascimento)::integer = extract(month from v_local_date)::integer
          and extract(day from student.data_nascimento)::integer = extract(day from v_local_date)::integer
        )
        or (
          extract(month from student.data_nascimento)::integer = 2
          and extract(day from student.data_nascimento)::integer = 29
          and extract(month from v_local_date)::integer = 2
          and extract(day from v_local_date)::integer = 28
          and extract(day from (make_date(extract(year from v_local_date)::integer, 3, 1) - interval '1 day'))::integer = 28
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
    where student.id = v_job.aluno_id;

    if not coalesce(v_is_birthday, false) then
      return 'BIRTHDAY_STUDENT_INELIGIBLE';
    end if;
  end if;

  return null;
exception
  when invalid_datetime_format or datetime_field_overflow then
    return 'BIRTHDAY_PUSH_WINDOW_INVALID';
end;
$$;

revoke all on function public.push_notification_job_block_reason(uuid)
from public, anon, authenticated;
grant execute on function public.push_notification_job_block_reason(uuid)
to service_role;

-- Revalidate pending jobs immediately after either independent preference is
-- changed. The worker repeats the block_reason check before delivery, so this
-- trigger is the eager cancellation path rather than the only safety barrier.
create or replace function public.cancel_push_jobs_after_preference_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_aluno_id uuid;
  v_channel text;
  v_purpose text;
begin
  if tg_op = 'DELETE' then
    v_aluno_id := old.aluno_id;
    v_channel := old.canal;
    v_purpose := old.finalidade;
  else
    v_aluno_id := new.aluno_id;
    v_channel := new.canal;
    v_purpose := new.finalidade;
  end if;

  if v_channel = 'push'
     and v_purpose in ('marketing', 'relacionamento') then
    perform public.cancel_invalid_push_notification_jobs(v_aluno_id, false);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.cancel_push_jobs_after_preference_change()
from public, anon, authenticated;

-- Cancel pending jobs that were created under the previous broad predicate.
do $$
begin
  if to_regprocedure('public.cancel_invalid_push_notification_jobs(uuid,boolean)') is not null then
    perform public.cancel_invalid_push_notification_jobs(null, false);
  end if;
end;
$$;

commit;
