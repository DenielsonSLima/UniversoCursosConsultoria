-- Versao registrada pelo MCP Supabase: 20260805175217.
-- Corrige a falsa duplicidade de CPF observada quando o GoTrue atualiza
-- raw_user_meta_data depois do INSERT inicial em auth.users.
begin;

create or replace function public.enforce_public_aluno_cpf_before_auth_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_old_metadata jsonb;
  v_origin text := coalesce(v_metadata ->> 'origem', '');
  v_tipo text := coalesce(v_metadata ->> 'tipo', '');
  v_cpf text := regexp_replace(
    coalesce(v_metadata ->> 'cpf', ''),
    '\D',
    '',
    'g'
  );
begin
  if v_origin <> 'cadastro_publico_ead' and v_tipo <> 'Aluno' then
    return new;
  end if;

  -- O GoTrue pode executar UPDATE de raw_user_meta_data na mesma transacao do
  -- signup. Revalidar uma identidade que nao mudou faria o parceiro criado pelo
  -- trigger AFTER INSERT parecer um concorrente do proprio usuario.
  if tg_op = 'UPDATE' then
    v_old_metadata := coalesce(old.raw_user_meta_data, '{}'::jsonb);

    if regexp_replace(
         coalesce(v_old_metadata ->> 'cpf', ''),
         '\D',
         '',
         'g'
       ) = v_cpf
       and coalesce(v_old_metadata ->> 'origem', '') = v_origin
       and coalesce(v_old_metadata ->> 'tipo', '') = v_tipo
    then
      return new;
    end if;
  end if;

  if length(v_cpf) <> 11 or v_cpf ~ '^([0-9])\1{10}$' then
    raise exception 'Informe um CPF valido para concluir o cadastro.'
      using errcode = '22023';
  end if;

  -- Mantem a trava ate o fim da transacao. Duas requisicoes que passaram pela
  -- prechecagem da Edge Function continuam serializadas pelo CPF canonico.
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
  'Bloqueia CPF publico duplicado no INSERT ou em mudanca real da identidade, sem revalidar UPDATE interno inalterado do GoTrue.';

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

create or replace function public.link_public_aluno_auth_partner_after_profile_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_origin text := coalesce(v_metadata ->> 'origem', '');
  v_tipo text := coalesce(v_metadata ->> 'tipo', '');
  v_cpf text := regexp_replace(
    coalesce(v_metadata ->> 'cpf', ''),
    '\D',
    '',
    'g'
  );
  v_email text := lower(nullif(btrim(new.email), ''));
  v_partner_id uuid;
  v_partner_auth_user_id uuid;
  v_linked_partner_id uuid;
  v_auth_ready boolean :=
    coalesce(new.encrypted_password, '') <> ''
    and coalesce(new.email_confirmed_at, new.confirmed_at) is not null;
begin
  if v_origin <> 'cadastro_publico_ead' and v_tipo <> 'Aluno' then
    return new;
  end if;

  if v_email is null then
    raise exception 'O cadastro publico do aluno exige um e-mail de acesso.'
      using errcode = '22023';
  end if;

  -- O caminho normal encontra o perfil que sync_public_aluno_auth_profile
  -- acabou de criar. A trava de CPF adquirida no BEFORE INSERT ainda pertence a
  -- esta transacao, portanto nenhum cadastro concorrente pode tomar o perfil.
  -- Um perfil ainda sem vinculo precisa coincidir por CPF e e-mail. Em UPDATE,
  -- o UUID canonico ja vinculado permite acompanhar uma troca legitima do e-mail
  -- de login sem procurar outro aluno por e-mail.
  select parceiro.id, parceiro.auth_user_id
  into v_partner_id, v_partner_auth_user_id
  from public.parceiros as parceiro
  where parceiro.tipo = 'Aluno'
    and regexp_replace(
      coalesce(parceiro.cpf_cnpj, ''),
      '\D',
      '',
      'g'
    ) = v_cpf
    and (
      lower(
        btrim(
          coalesce(
            nullif(parceiro.auth_login_email, ''),
            nullif(parceiro.email, ''),
            ''
          )
        )
      ) = v_email
      or (
        tg_op = 'UPDATE'
        and parceiro.auth_user_id = new.id
      )
    )
  order by
    (parceiro.auth_user_id = new.id) desc,
    parceiro.created_at desc nulls last,
    parceiro.id
  limit 1
  for update;

  if v_partner_id is null then
    raise exception 'O perfil canonico do aluno nao foi criado durante o cadastro.'
      using errcode = '23514';
  end if;

  if v_partner_auth_user_id is not null
     and v_partner_auth_user_id <> new.id
  then
    raise exception 'O perfil canonico do aluno ja possui outra identidade de acesso.'
      using errcode = '23505';
  end if;

  update public.parceiros as parceiro
  set
    auth_user_id = new.id,
    auth_login_email = v_email,
    troca_senha_obrigatoria = false,
    acesso_status = case
      when v_auth_ready then 'ativo'
      else 'pendente'
    end,
    acesso_erro = null,
    acesso_ativado_em = case
      when v_auth_ready then coalesce(
        parceiro.acesso_ativado_em,
        new.email_confirmed_at,
        new.confirmed_at,
        now()
      )
      else parceiro.acesso_ativado_em
    end,
    updated_at = now()
  where parceiro.id = v_partner_id
    and (
      parceiro.auth_user_id is null
      or parceiro.auth_user_id = new.id
    )
  returning parceiro.id into v_linked_partner_id;

  if v_linked_partner_id is null then
    raise exception 'Nao foi possivel vincular o perfil canonico a identidade de acesso.'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

comment on function public.link_public_aluno_auth_partner_after_profile_sync() is
  'Vincula atomicamente o parceiro criado no signup publico ao UUID do Auth e registra o estado tecnico do acesso.';

revoke all on function public.link_public_aluno_auth_partner_after_profile_sync()
  from public, anon, authenticated;
grant execute on function public.link_public_aluno_auth_partner_after_profile_sync()
  to service_role;

-- Triggers AFTER do mesmo evento executam por nome. Este nome preserva a ordem:
-- trg_sync_public_aluno_auth_profile
-- trg_sync_public_aluno_auth_profile_zz_link
-- trg_zz_capture_public_signup_relationship_preference
drop trigger if exists trg_sync_public_aluno_auth_profile_zz_link
  on auth.users;
create trigger trg_sync_public_aluno_auth_profile_zz_link
after insert or update of email, raw_user_meta_data
on auth.users
for each row
execute function public.link_public_aluno_auth_partner_after_profile_sync();

commit;
