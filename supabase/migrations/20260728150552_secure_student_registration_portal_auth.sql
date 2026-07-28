-- Versão registrada pelo MCP Supabase: 20260728150552.
begin;

create sequence if not exists public.portal_student_access_number_seq
  as bigint start with 1 increment by 1 minvalue 1 no maxvalue cache 20;

alter table public.parceiros
  add column if not exists matricula_acesso text,
  add column if not exists auth_login_email text;

create or replace function public.format_student_access_registration(p_number bigint)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select 'UNIV-A-' || lpad(p_number::text, 8, '0');
$$;

create or replace function public.assign_student_portal_identity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.tipo = 'Aluno' then
    if nullif(btrim(coalesce(new.matricula_acesso, '')), '') is null then
      new.matricula_acesso := public.format_student_access_registration(
        nextval('public.portal_student_access_number_seq'::regclass)
      );
    else
      new.matricula_acesso := upper(btrim(new.matricula_acesso));
    end if;

    if nullif(btrim(coalesce(new.auth_login_email, '')), '') is null then
      if nullif(btrim(coalesce(new.email, '')), '') is not null then
        new.auth_login_email := lower(btrim(new.email));
      else
        new.auth_login_email := lower(regexp_replace(new.matricula_acesso, '[^A-Z0-9]', '', 'g'))
          || '@acesso.universocc.invalid';
      end if;
    else
      new.auth_login_email := lower(btrim(new.auth_login_email));
    end if;
  end if;

  return new;
end;
$$;

update public.parceiros
set matricula_acesso = public.format_student_access_registration(
  nextval('public.portal_student_access_number_seq'::regclass)
)
where tipo = 'Aluno'
  and nullif(btrim(coalesce(matricula_acesso, '')), '') is null;

update public.parceiros
set auth_login_email = coalesce(
  lower(nullif(btrim(coalesce(email, '')), '')),
  lower(regexp_replace(matricula_acesso, '[^A-Z0-9]', '', 'g'))
    || '@acesso.universocc.invalid'
)
where tipo = 'Aluno'
  and nullif(btrim(coalesce(auth_login_email, '')), '') is null;

select setval(
  'public.portal_student_access_number_seq'::regclass,
  greatest(
    coalesce((
      select max(substring(matricula_acesso from '([0-9]{8})$')::bigint)
      from public.parceiros
      where tipo = 'Aluno'
        and matricula_acesso ~ '^UNIV-A-[0-9]{8}$'
    ), 0),
    1
  ),
  true
);

drop trigger if exists assign_student_portal_identity_trigger on public.parceiros;
create trigger assign_student_portal_identity_trigger
before insert or update of tipo, matricula_acesso, auth_login_email
on public.parceiros
for each row
execute function public.assign_student_portal_identity();

alter table public.parceiros
  drop constraint if exists parceiros_aluno_matricula_acesso_format_check,
  add constraint parceiros_aluno_matricula_acesso_format_check
    check (
      tipo <> 'Aluno'
      or matricula_acesso ~ '^UNIV-A-[0-9]{8}$'
    ) not valid,
  drop constraint if exists parceiros_aluno_auth_login_email_check,
  add constraint parceiros_aluno_auth_login_email_check
    check (
      tipo <> 'Aluno'
      or auth_login_email ~ '^[^@[:space:]]+@[^@[:space:]]+$'
    ) not valid;

alter table public.parceiros
  validate constraint parceiros_aluno_matricula_acesso_format_check;
alter table public.parceiros
  validate constraint parceiros_aluno_auth_login_email_check;

create unique index if not exists parceiros_aluno_matricula_acesso_uidx
  on public.parceiros (matricula_acesso)
  where tipo = 'Aluno';

create unique index if not exists parceiros_aluno_auth_login_email_uidx
  on public.parceiros (auth_login_email)
  where tipo = 'Aluno';

comment on column public.parceiros.matricula_acesso is
  'Identificador público estável de acesso do aluno. Não deriva de CPF nem de matrícula em turma.';
comment on column public.parceiros.auth_login_email is
  'Identidade interna usada pelo Supabase Auth. Pode ser um alias técnico para aluno sem e-mail.';

create or replace function public.current_aluno_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id
  from public.parceiros p
  where lower(coalesce(nullif(p.auth_login_email, ''), p.email, '')) = public.auth_email()
    and p.tipo = 'Aluno'
    and public.is_active_status(p.status)
  order by p.created_at desc nulls last
  limit 1;
$$;

comment on function public.current_aluno_id() is
  'Resolve o aluno autenticado pela identidade interna do portal, inclusive quando não há e-mail cadastral.';

create or replace function public.resolve_portal_login_identity(p_identifier text)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_identifier text := lower(btrim(coalesce(p_identifier, '')));
  v_login_email text;
begin
  if length(v_identifier) = 0 or length(v_identifier) > 254 then
    return null;
  end if;

  if v_identifier like '%@%' then
    return v_identifier;
  end if;

  select p.auth_login_email
    into v_login_email
  from public.parceiros p
  where p.tipo = 'Aluno'
    and p.matricula_acesso = upper(v_identifier)
    and public.is_active_status(p.status)
  limit 1;

  return lower(v_login_email);
end;
$$;

comment on function public.resolve_portal_login_identity(text) is
  'Resolve matrícula/e-mail somente no backend privilegiado; nunca deve ser executada por clientes públicos.';

revoke all on function public.resolve_portal_login_identity(text)
  from public, anon, authenticated;
grant execute on function public.resolve_portal_login_identity(text)
  to service_role;

revoke execute on function public.resolve_portal_login_email(text)
  from public, anon, authenticated;
grant execute on function public.resolve_portal_login_email(text)
  to service_role;

revoke execute on function public.get_public_aluno_auth_status(text)
  from public, anon, authenticated;
grant execute on function public.get_public_aluno_auth_status(text)
  to service_role;

revoke all on function public.format_student_access_registration(bigint)
  from public, anon, authenticated;
revoke all on function public.assign_student_portal_identity()
  from public, anon, authenticated;

create table if not exists public.portal_auth_rate_limits (
  bucket_key text primary key,
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists portal_auth_rate_limits_updated_at_idx
  on public.portal_auth_rate_limits (updated_at);

alter table public.portal_auth_rate_limits enable row level security;
revoke all on table public.portal_auth_rate_limits
  from public, anon, authenticated;

create or replace function public.consume_portal_auth_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table(allowed boolean, retry_after_seconds integer)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window interval;
begin
  if p_bucket_key is null
    or length(p_bucket_key) < 16
    or length(p_bucket_key) > 200
    or p_limit < 1
    or p_limit > 1000
    or p_window_seconds < 1
    or p_window_seconds > 86400 then
    raise exception 'Parâmetros de limitação inválidos.';
  end if;

  v_window := make_interval(secs => p_window_seconds);

  if random() < 0.01 then
    delete from public.portal_auth_rate_limits
    where updated_at < v_now - interval '7 days';
  end if;

  return query
  insert into public.portal_auth_rate_limits as limits (
    bucket_key,
    window_started_at,
    attempt_count,
    updated_at
  )
  values (p_bucket_key, v_now, 1, v_now)
  on conflict (bucket_key) do update
  set window_started_at = case
        when limits.window_started_at <= v_now - v_window then v_now
        else limits.window_started_at
      end,
      attempt_count = case
        when limits.window_started_at <= v_now - v_window then 1
        else limits.attempt_count + 1
      end,
      updated_at = v_now
  returning
    portal_auth_rate_limits.attempt_count <= p_limit,
    greatest(
      0,
      ceil(extract(epoch from (
        portal_auth_rate_limits.window_started_at + v_window - v_now
      )))::integer
    );
end;
$$;

comment on function public.consume_portal_auth_rate_limit(text, integer, integer) is
  'Limitador atômico e durável do endpoint público de autenticação; aceita somente buckets previamente hashados.';

revoke all on function public.consume_portal_auth_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_portal_auth_rate_limit(text, integer, integer)
  to service_role;

commit;
