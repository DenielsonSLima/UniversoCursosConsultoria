-- Exige os dados demográficos apenas no cadastro público EAD novo, sem alterar
-- registros legados nem os convites de aluno criados pela equipe.
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
  v_sexo text := upper(btrim(coalesce(v_metadata ->> 'sexo', '')));
  v_raca_cor text := upper(btrim(coalesce(v_metadata ->> 'racaCor', '')));
begin
  if v_origin <> 'cadastro_publico_ead' or v_tipo <> 'Aluno' then
    return new;
  end if;

  -- O contrato vale para novas contas públicas. Atualizações internas do
  -- GoTrue e cadastros legados continuam protegidos pela regra de CPF abaixo.
  if tg_op = 'INSERT' then
    if v_sexo not in (
      'FEMININO',
      'MASCULINO',
      'NÃO-BINÁRIO',
      'PREFIRO NÃO INFORMAR'
    ) then
      raise exception 'Selecione uma opção de sexo para concluir o cadastro.'
        using errcode = '22023';
    end if;

    if v_raca_cor not in (
      'BRANCA',
      'PRETA',
      'PARDA',
      'AMARELA',
      'INDÍGENA',
      'PREFIRO NÃO INFORMAR'
    ) then
      raise exception 'Selecione uma opção de raça/cor para concluir o cadastro.'
        using errcode = '22023';
    end if;
  end if;

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
  'Exige CPF, sexo e raça/cor no novo cadastro público EAD, sem interceptar convites ou legados.';

revoke all on function public.enforce_public_aluno_cpf_before_auth_write()
  from public, anon, authenticated;
grant execute on function public.enforce_public_aluno_cpf_before_auth_write()
  to service_role;

create or replace function public.sync_public_aluno_signup_demographics()
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
  v_sexo text := upper(btrim(coalesce(v_metadata ->> 'sexo', '')));
  v_raca_cor text := upper(btrim(coalesce(v_metadata ->> 'racaCor', '')));
begin
  if v_origin <> 'cadastro_publico_ead' or v_tipo <> 'Aluno' then
    return new;
  end if;

  -- A validação de INSERT acima é a autoridade. Este guard evita que uma
  -- atualização posterior de metadados altere ou apague dados canônicos.
  if v_email is null
     or v_sexo not in (
       'FEMININO',
       'MASCULINO',
       'NÃO-BINÁRIO',
       'PREFIRO NÃO INFORMAR'
     )
     or v_raca_cor not in (
       'BRANCA',
       'PRETA',
       'PARDA',
       'AMARELA',
       'INDÍGENA',
       'PREFIRO NÃO INFORMAR'
     )
  then
    return new;
  end if;

  update public.parceiros as parceiro
  set
    sexo = coalesce(nullif(btrim(coalesce(parceiro.sexo, '')), ''), v_sexo),
    raca_cor = coalesce(nullif(btrim(coalesce(parceiro.raca_cor, '')), ''), v_raca_cor),
    updated_at = now()
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
      or parceiro.auth_user_id = new.id
    )
    and (
      nullif(btrim(coalesce(parceiro.sexo, '')), '') is null
      or nullif(btrim(coalesce(parceiro.raca_cor, '')), '') is null
    );

  return new;
end;
$$;

comment on function public.sync_public_aluno_signup_demographics() is
  'Preenche sexo e raça/cor somente se ausentes no perfil canônico do novo cadastro público EAD.';

revoke all on function public.sync_public_aluno_signup_demographics()
  from public, anon, authenticated;
grant execute on function public.sync_public_aluno_signup_demographics()
  to service_role;

-- Gatilhos AFTER do mesmo evento executam em ordem alfabética: este nome o
-- mantém após a criação do perfil e antes do vínculo definitivo ao Auth.
drop trigger if exists trg_sync_public_aluno_auth_profile_zy_demographics
  on auth.users;
create trigger trg_sync_public_aluno_auth_profile_zy_demographics
after insert or update of email, raw_user_meta_data
on auth.users
for each row
execute function public.sync_public_aluno_signup_demographics();

commit;
