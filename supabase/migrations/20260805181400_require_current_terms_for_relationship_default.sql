begin;

-- A Terms default is valid only for the version that actually discloses it.
-- This also makes first-access acceptance and preference creation atomic in
-- the database, so a transient client RPC failure cannot report a false
-- signup/activation failure.

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
  v_terms_version text := nullif(btrim(coalesce(p_terms_version, '')), '');
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

  if v_terms_version <> '2026-08-05' then
    return;
  end if;

  if not exists (
    select 1
    from public.parceiros student
    where student.id = p_aluno_id
      and student.tipo = 'Aluno'
      and student.auth_user_id = p_actor_auth_user_id
      and coalesce(student.aceitou_termos_uso, false)
      and student.aceitou_termos_uso_em is not null
      and student.termos_uso_versao = v_terms_version
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
      'termsVersion', v_terms_version,
      'legalBasis', 'legitimo_interesse',
      'liaVersion', 'lia-relationship-birthday-v1',
      'includesCommercialAdvertising', false,
      'osPushPermissionRequested', false
    ),
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
  on conflict (aluno_id, canal, finalidade) do nothing;
end;
$$;

revoke all on function comunicacao_private.ensure_relationship_birthday_terms_default(uuid, text, uuid, text)
from public, anon, authenticated;

create or replace function comunicacao_private.capture_current_terms_relationship_default()
returns trigger
language plpgsql
security definer
set search_path = public, comunicacao_private, pg_temp
as $$
begin
  if new.tipo <> 'Aluno'
     or new.auth_user_id is null
     or not coalesce(new.aceitou_termos_uso, false)
     or new.aceitou_termos_uso_em is null
     or coalesce(new.termos_uso_versao, '') <> '2026-08-05' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and coalesce(old.aceitou_termos_uso, false)
     and old.aceitou_termos_uso_em is not null
     and coalesce(old.termos_uso_versao, '') = '2026-08-05'
     and old.auth_user_id is not distinct from new.auth_user_id then
    return new;
  end if;

  perform comunicacao_private.ensure_relationship_birthday_terms_default(
    new.id,
    'student_first_access',
    new.auth_user_id,
    new.termos_uso_versao
  );
  return new;
end;
$$;

revoke all on function comunicacao_private.capture_current_terms_relationship_default()
from public, anon, authenticated;

drop trigger if exists parceiros_capture_current_terms_relationship_default
on public.parceiros;
create trigger parceiros_capture_current_terms_relationship_default
after insert or update of
  auth_user_id,
  aceitou_termos_uso,
  aceitou_termos_uso_em,
  termos_uso_versao
on public.parceiros
for each row execute function comunicacao_private.capture_current_terms_relationship_default();

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
    and student.aceitou_termos_uso_em is not null
    and student.termos_uso_versao = '2026-08-05';

  if not found then
    raise exception 'CURRENT_TERMS_ACCEPTANCE_REQUIRED' using errcode = '42501';
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

commit;
