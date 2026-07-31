-- Versao registrada pelo MCP Supabase: 20260730033844.
begin;

create or replace function public.is_public_aluno_cpf_available(
  p_cpf text,
  p_exclude_auth_user_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cpf text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
begin
  if length(v_cpf) <> 11 or v_cpf ~ '^([0-9])\1{10}$' then
    return false;
  end if;

  return not exists (
    select 1
    from public.parceiros as parceiro
    where parceiro.tipo = 'Aluno'
      and regexp_replace(coalesce(parceiro.cpf_cnpj, ''), '\D', '', 'g') = v_cpf
      and (
        p_exclude_auth_user_id is null
        or parceiro.auth_user_id is distinct from p_exclude_auth_user_id
      )
  )
  and not exists (
    select 1
    from auth.users as auth_user
    where auth_user.deleted_at is null
      and regexp_replace(
        coalesce(auth_user.raw_user_meta_data ->> 'cpf', ''),
        '\D',
        '',
        'g'
      ) = v_cpf
      and (
        coalesce(auth_user.raw_user_meta_data ->> 'origem', '') = 'cadastro_publico_ead'
        or coalesce(auth_user.raw_user_meta_data ->> 'tipo', '') = 'Aluno'
      )
      and (
        p_exclude_auth_user_id is null
        or auth_user.id <> p_exclude_auth_user_id
      )
  );
end;
$$;

comment on function public.is_public_aluno_cpf_available(text, uuid) is
  'Consulta privada usada pelo cadastro publico e pelo gatilho Auth para impedir mais de uma identidade de aluno por CPF.';

revoke all on function public.is_public_aluno_cpf_available(text, uuid)
  from public, anon, authenticated;
grant execute on function public.is_public_aluno_cpf_available(text, uuid)
  to service_role;

create or replace function public.enforce_public_aluno_cpf_before_auth_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_origin text := coalesce(v_metadata ->> 'origem', '');
  v_tipo text := coalesce(v_metadata ->> 'tipo', '');
  v_cpf text := regexp_replace(coalesce(v_metadata ->> 'cpf', ''), '\D', '', 'g');
begin
  if v_origin <> 'cadastro_publico_ead' and v_tipo <> 'Aluno' then
    return new;
  end if;

  if length(v_cpf) <> 11 or v_cpf ~ '^([0-9])\1{10}$' then
    raise exception 'Informe um CPF valido para concluir o cadastro.'
      using errcode = '22023';
  end if;

  -- Serializa cadastros simultaneos do mesmo CPF. A trava dura somente ate o
  -- fim da transacao do Auth e evita a janela entre a consulta e a gravacao.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('public-aluno-cpf:' || v_cpf, 0)
  );

  if not public.is_public_aluno_cpf_available(v_cpf, new.id) then
    raise exception 'Este CPF ja esta cadastrado como aluno.'
      using
        errcode = '23505',
        constraint = 'public_aluno_cpf_unique';
  end if;

  return new;
end;
$$;

comment on function public.enforce_public_aluno_cpf_before_auth_write() is
  'Bloqueia CPF de aluno duplicado antes que o Auth persista o usuario e envie o e-mail de confirmacao.';

revoke all on function public.enforce_public_aluno_cpf_before_auth_write()
  from public, anon, authenticated;
grant execute on function public.enforce_public_aluno_cpf_before_auth_write()
  to service_role;

drop trigger if exists trg_enforce_public_aluno_cpf_before_auth_write
  on auth.users;
create trigger trg_enforce_public_aluno_cpf_before_auth_write
before insert or update of raw_user_meta_data
on auth.users
for each row
execute function public.enforce_public_aluno_cpf_before_auth_write();

commit;
