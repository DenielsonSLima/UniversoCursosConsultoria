begin;

-- Relationship and birthday messages are institutional, non-commercial
-- communications. New students receive the preference after accepting the
-- Terms under legitimate interest, while any existing opt-out is preserved.

create or replace function comunicacao_private.ensure_relationship_birthday_terms_default(
  p_aluno_id uuid,
  p_surface text,
  p_actor_auth_user_id uuid,
  p_terms_version text default null
)
returns void
language plpgsql
security definer
set search_path = public, comunicacao_private, pg_temp
as $$
declare
  v_now timestamptz := now();
begin
  if p_aluno_id is null or p_actor_auth_user_id is null then
    return;
  end if;

  if p_surface not in (
    'public_signup_web',
    'public_signup_app',
    'student_first_access'
  ) then
    raise exception 'INVALID_RELATIONSHIP_PREFERENCE_SURFACE'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.parceiros student
    where student.id = p_aluno_id
      and student.tipo = 'Aluno'
      and student.auth_user_id = p_actor_auth_user_id
      and coalesce(student.aceitou_termos_uso, false)
      and student.aceitou_termos_uso_em is not null
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
    true,
    case
      when p_surface in ('public_signup_web', 'public_signup_app') then 'cadastro'
      else 'app'
    end,
    'legitimo_interesse',
    'push-relationship-birthday-legitimate-interest-v2',
    jsonb_build_object(
      'surface', p_surface,
      'decision', 'granted',
      'purpose', 'relationship_birthday',
      'actorAuthUserId', p_actor_auth_user_id,
      'activatedAt', v_now,
      'activationReason', 'terms_acceptance',
      'termsVersion', nullif(btrim(coalesce(p_terms_version, '')), ''),
      'legalBasis', 'legitimo_interesse',
      'liaVersion', 'lia-relationship-birthday-v1',
      'includesCommercialAdvertising', false,
      'osPushPermissionRequested', false
    ),
    -- Legacy column name. For this policy it records activation time, not a
    -- consent grant; the legal basis is explicit in base_legal/evidence.
    v_now,
    null,
    jsonb_build_object(
      'consentScopes', jsonb_build_array('relationship', 'birthday'),
      'excludedScopes', jsonb_build_array('commercial_campaign', 'profiling'),
      'defaultEnabled', true,
      'initialDecision', false,
      'activationReason', 'terms_acceptance',
      'liaVersion', 'lia-relationship-birthday-v1'
    )
  )
  -- Never overwrite an earlier decline or revocation.
  on conflict (aluno_id, canal, finalidade) do nothing;
end;
$$;

revoke all on function comunicacao_private.ensure_relationship_birthday_terms_default(uuid, text, uuid, text)
from public, anon, authenticated;

create or replace function comunicacao_private.capture_relationship_preference_from_metadata(
  p_aluno_id uuid,
  p_auth_user_id uuid,
  p_meta jsonb
)
returns void
language plpgsql
security definer
set search_path = public, comunicacao_private, pg_temp
as $$
declare
  v_surface text;
  v_default_enabled boolean := false;
  v_accepted_terms boolean := false;
  v_legacy_choice_made boolean := false;
  v_legacy_allowed boolean;
begin
  if p_aluno_id is null or p_auth_user_id is null then
    return;
  end if;

  if coalesce(p_meta ->> 'origem', '') <> 'cadastro_publico_ead'
     or coalesce(p_meta ->> 'tipo', '') <> 'Aluno' then
    return;
  end if;

  begin
    v_default_enabled := jsonb_typeof(p_meta -> 'relationshipBirthdayDefaultEnabled') = 'boolean'
      and (p_meta ->> 'relationshipBirthdayDefaultEnabled')::boolean;
    v_accepted_terms := jsonb_typeof(p_meta -> 'acceptedTerms') = 'boolean'
      and (p_meta ->> 'acceptedTerms')::boolean;
  exception when others then
    v_default_enabled := false;
    v_accepted_terms := false;
  end;

  v_surface := coalesce(
    p_meta ->> 'relationshipBirthdayPreferenceSurface',
    p_meta ->> 'relationshipBirthdayConsentSurface',
    ''
  );

  if v_default_enabled
     and v_accepted_terms
     and v_surface in ('public_signup_web', 'public_signup_app')
     and coalesce(p_meta ->> 'relationshipBirthdayLegalBasis', '') = 'legitimo_interesse'
     and coalesce(p_meta ->> 'relationshipBirthdayPolicyVersion', '')
       = 'push-relationship-birthday-legitimate-interest-v2'
     and coalesce(p_meta ->> 'relationshipBirthdayActivationReason', '')
       = 'terms_acceptance'
     and coalesce((p_meta ->> 'relationshipBirthdayIncludesCommercialAdvertising')::boolean, false) is false
  then
    perform comunicacao_private.ensure_relationship_birthday_terms_default(
      p_aluno_id,
      v_surface,
      p_auth_user_id,
      p_meta ->> 'termsVersion'
    );
    return;
  end if;

  -- Compatibility for clients published before this policy change. Their
  -- explicit positive/negative choice remains canonical and is not re-read as
  -- a Terms default.
  begin
    v_legacy_choice_made := jsonb_typeof(p_meta -> 'relationshipBirthdayChoiceMade') = 'boolean'
      and (p_meta ->> 'relationshipBirthdayChoiceMade')::boolean;
    if jsonb_typeof(p_meta -> 'relationshipBirthdayConsent') = 'boolean' then
      v_legacy_allowed := (p_meta ->> 'relationshipBirthdayConsent')::boolean;
    else
      v_legacy_allowed := null;
    end if;
  exception when others then
    v_legacy_choice_made := false;
    v_legacy_allowed := null;
  end;

  if v_legacy_choice_made
     and v_legacy_allowed is not null
     and v_surface in ('public_signup_web', 'public_signup_app') then
    perform comunicacao_private.capture_initial_relationship_preference(
      p_aluno_id,
      v_legacy_allowed,
      v_surface,
      p_auth_user_id
    );
  end if;
end;
$$;

revoke all on function comunicacao_private.capture_relationship_preference_from_metadata(uuid, uuid, jsonb)
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
begin
  select student.id
    into v_aluno_id
  from public.parceiros student
  where student.tipo = 'Aluno'
    and (
      student.auth_user_id = new.id
      or (
        student.auth_user_id is null
        and lower(coalesce(nullif(student.auth_login_email, ''), student.email, ''))
          = lower(coalesce(new.email, ''))
      )
    )
  order by (student.auth_user_id = new.id) desc, student.created_at desc nulls last
  limit 1;

  perform comunicacao_private.capture_relationship_preference_from_metadata(
    v_aluno_id,
    new.id,
    v_meta
  );
  return new;
exception when others then
  raise warning 'Falha ao capturar preferencia de relacionamento do cadastro Auth %: %', new.id, sqlerrm;
  return new;
end;
$$;

revoke all on function comunicacao_private.capture_public_signup_relationship_from_auth()
from public, anon, authenticated;

create or replace function comunicacao_private.capture_public_signup_relationship_from_student()
returns trigger
language plpgsql
security definer
set search_path = public, comunicacao_private, pg_temp
as $$
declare
  v_auth_user auth.users%rowtype;
begin
  if new.tipo <> 'Aluno' then
    return new;
  end if;

  select identity.*
    into v_auth_user
  from auth.users identity
  where identity.id = new.auth_user_id
     or (
       new.auth_user_id is null
       and lower(coalesce(identity.email, ''))
         = lower(coalesce(nullif(new.auth_login_email, ''), new.email, ''))
     )
  order by (identity.id = new.auth_user_id) desc, identity.created_at desc nulls last
  limit 1;

  if not found then
    return new;
  end if;

  perform comunicacao_private.capture_relationship_preference_from_metadata(
    new.id,
    v_auth_user.id,
    coalesce(v_auth_user.raw_user_meta_data, '{}'::jsonb)
  );
  return new;
exception when others then
  raise warning 'Falha ao capturar preferencia de relacionamento do aluno %: %', new.id, sqlerrm;
  return new;
end;
$$;

revoke all on function comunicacao_private.capture_public_signup_relationship_from_student()
from public, anon, authenticated;

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
  v_configured boolean := false;
begin
  if v_aluno_id is null then
    raise exception 'ALUNO_IDENTITY_REQUIRED' using errcode = '42501';
  end if;

  select * into v_preference
  from public.comunicacao_preferencias preference
  where preference.aluno_id = v_aluno_id
    and preference.canal = 'push'
    and preference.finalidade = 'relacionamento';

  v_configured := coalesce(
    v_preference.id is not null
    and v_preference.politica_versao in (
      'push-relationship-birthday-v1',
      'push-relationship-birthday-legitimate-interest-v2'
    )
    and v_preference.evidencia ->> 'purpose' = 'relationship_birthday'
    and jsonb_typeof(v_preference.metadata -> 'consentScopes') = 'array'
    and (v_preference.metadata -> 'consentScopes')
      @> '["relationship","birthday"]'::jsonb
    and not ((v_preference.metadata -> 'consentScopes') ? 'commercial_campaign'),
    false
  );

  return jsonb_build_object(
    'configured', v_configured,
    'decided', v_configured,
    'allowed', coalesce(
      v_configured
      and v_preference.permitida
      and v_preference.revogada_em is null
      and (
        v_preference.politica_versao = 'push-relationship-birthday-legitimate-interest-v2'
        or v_preference.consentida_em is not null
      ),
      false
    ),
    'updatedAt', case when v_configured then v_preference.updated_at else null end,
    'policyVersion', coalesce(
      v_preference.politica_versao,
      'push-relationship-birthday-legitimate-interest-v2'
    ),
    'legalBasis', v_preference.base_legal,
    'activationReason', v_preference.evidencia ->> 'activationReason',
    'purpose', 'relationship_birthday',
    'includesCommercialAdvertising', false,
    'canOptOut', true
  );
end;
$$;

revoke all on function public.aluno_push_relacionamento_preferencia_obter()
from public, anon, authenticated;
grant execute on function public.aluno_push_relacionamento_preferencia_obter()
to authenticated;

create or replace function public.aluno_push_relacionamento_preferencia_ativar_por_termos(
  p_surface text
)
returns jsonb
language plpgsql
security definer
set search_path = public, comunicacao_private, pg_temp
as $$
declare
  v_aluno_id uuid := public.current_aluno_id();
  v_terms_version text;
begin
  if v_aluno_id is null or auth.uid() is null then
    raise exception 'ALUNO_IDENTITY_REQUIRED' using errcode = '42501';
  end if;

  if p_surface not in (
    'public_signup_web',
    'public_signup_app',
    'student_first_access'
  ) then
    raise exception 'INVALID_RELATIONSHIP_PREFERENCE_SURFACE'
      using errcode = '22023';
  end if;

  select student.termos_uso_versao
    into v_terms_version
  from public.parceiros student
  where student.id = v_aluno_id
    and student.tipo = 'Aluno'
    and student.auth_user_id = auth.uid()
    and coalesce(student.aceitou_termos_uso, false)
    and student.aceitou_termos_uso_em is not null;

  if not found then
    raise exception 'TERMS_ACCEPTANCE_REQUIRED' using errcode = '42501';
  end if;

  perform comunicacao_private.ensure_relationship_birthday_terms_default(
    v_aluno_id,
    p_surface,
    auth.uid(),
    v_terms_version
  );

  return public.aluno_push_relacionamento_preferencia_obter();
end;
$$;

revoke all on function public.aluno_push_relacionamento_preferencia_ativar_por_termos(text)
from public, anon, authenticated;
grant execute on function public.aluno_push_relacionamento_preferencia_ativar_por_termos(text)
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
     and v_existing.politica_versao = 'push-relationship-birthday-legitimate-interest-v2'
     and v_existing.evidencia ->> 'purpose' = 'relationship_birthday'
     and jsonb_typeof(v_existing.metadata -> 'consentScopes') = 'array'
     and (v_existing.metadata -> 'consentScopes')
       @> '["relationship","birthday"]'::jsonb
     and not ((v_existing.metadata -> 'consentScopes') ? 'commercial_campaign') then
    return public.aluno_push_relacionamento_preferencia_obter();
  end if;

  v_decision := case
    when not p_allowed and v_existing.id is not null and v_existing.permitida then 'revoked'
    else 'updated'
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
    'legitimo_interesse',
    'push-relationship-birthday-legitimate-interest-v2',
    jsonb_build_object(
      'surface', p_surface,
      'decision', v_decision,
      'purpose', 'relationship_birthday',
      'actorAuthUserId', auth.uid(),
      'updatedAt', v_now,
      'activationReason', 'student_preference',
      'legalBasis', 'legitimo_interesse',
      'liaVersion', 'lia-relationship-birthday-v1',
      'includesCommercialAdvertising', false,
      'osPushPermissionRequested', false
    ),
    case
      when p_allowed then coalesce(v_existing.consentida_em, v_now)
      else v_existing.consentida_em
    end,
    case when p_allowed then null else v_now end,
    jsonb_build_object(
      'consentScopes', jsonb_build_array('relationship', 'birthday'),
      'excludedScopes', jsonb_build_array('commercial_campaign', 'profiling'),
      'defaultEnabled', false,
      'initialDecision', false,
      'activationReason', 'student_preference',
      'liaVersion', 'lia-relationship-birthday-v1'
    )
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
      and preference.revogada_em is null
      and preference.politica_versao in (
        'push-relationship-birthday-v1',
        'push-relationship-birthday-legitimate-interest-v2'
      )
      and (
        preference.politica_versao = 'push-relationship-birthday-legitimate-interest-v2'
        or preference.consentida_em is not null
      )
      and preference.evidencia ->> 'purpose' = 'relationship_birthday'
      and coalesce((preference.evidencia ->> 'includesCommercialAdvertising')::boolean, false) is false
      and jsonb_typeof(preference.metadata -> 'consentScopes') = 'array'
      and (preference.metadata -> 'consentScopes')
        @> '["relationship","birthday"]'::jsonb
      and not ((preference.metadata -> 'consentScopes') ? 'commercial_campaign')
  );
$$;

revoke all on function public.push_relationship_birthday_consent_allowed(uuid)
from public, anon, authenticated;
grant execute on function public.push_relationship_birthday_consent_allowed(uuid)
to service_role;

comment on function public.aluno_push_relacionamento_preferencia_ativar_por_termos(text)
is 'Creates the non-commercial relationship/birthday preference after Terms acceptance without overwriting an existing opt-out.';

commit;
