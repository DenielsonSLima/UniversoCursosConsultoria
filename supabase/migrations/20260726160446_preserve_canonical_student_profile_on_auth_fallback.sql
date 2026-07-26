-- Versao registrada pelo MCP Supabase: 20260726160446.
begin;

-- O fallback de cadastro existe para criar o perfil que ainda nao existe.
-- Quando o aluno ja possui cadastro canonico, metadados do Auth podem estar
-- antigos e nunca devem sobrescrever telefone, CPF, nome ou data de nascimento.
create or replace function public.finalizar_cadastro_publico_aluno(
  p_nome text,
  p_email text,
  p_telefone text,
  p_cpf text,
  p_data_nascimento date,
  p_aceitou_termos boolean,
  p_termos_versao text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_matriz_polo_id uuid := '44444444-4444-4444-4444-444444444444'::uuid;
  v_auth_email text := public.auth_email();
  v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
  v_email text := lower(nullif(btrim(coalesce(p_email, '')), ''));
  v_phone text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_cpf text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  v_existing_by_email public.parceiros%rowtype;
  v_existing_by_cpf public.parceiros%rowtype;
  v_target_id uuid;
  v_sum int;
  v_digit int;
  v_expected int;
  i int;
begin
  if auth.uid() is null then
    raise exception 'Sessao autenticada obrigatoria para concluir o cadastro do aluno.';
  end if;

  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Informe um e-mail valido para concluir o cadastro.';
  end if;

  if v_auth_email is null or v_email <> v_auth_email then
    raise exception 'O e-mail do cadastro nao confere com o usuario autenticado.';
  end if;

  select *
    into v_existing_by_email
  from public.parceiros p
  where lower(coalesce(p.email, '')) = v_email
    and p.tipo = 'Aluno'
  order by p.created_at desc nulls last
  limit 1;

  -- Sessao e e-mail bastam para reconhecer o perfil existente. Metadados
  -- pessoais antigos ou incompletos nao podem impedir o login nem alterar a
  -- fonte canonica mantida pela secretaria.
  if v_existing_by_email.id is not null then
    update public.parceiros
      set polo_id = coalesce(polo_id, v_matriz_polo_id),
          polo_ids = case
            when coalesce(array_length(polo_ids, 1), 0) = 0
              then array[coalesce(polo_id, v_matriz_polo_id)]
            else polo_ids
          end,
          aceitou_termos_uso = coalesce(aceitou_termos_uso, false)
            or coalesce(p_aceitou_termos, false),
          aceitou_termos_uso_em = case
            when coalesce(aceitou_termos_uso, false) then aceitou_termos_uso_em
            when coalesce(p_aceitou_termos, false) then coalesce(aceitou_termos_uso_em, now())
            else aceitou_termos_uso_em
          end,
          termos_uso_versao = case
            when coalesce(aceitou_termos_uso, false) then termos_uso_versao
            when coalesce(p_aceitou_termos, false)
              then nullif(btrim(coalesce(p_termos_versao, '')), '')
            else termos_uso_versao
          end,
          updated_at = now()
    where id = v_existing_by_email.id;

    return v_existing_by_email.id;
  end if;

  if v_nome is null or length(v_nome) < 3 then
    raise exception 'Informe o nome completo para concluir o cadastro.';
  end if;

  if not coalesce(p_aceitou_termos, false) then
    raise exception 'Voce precisa aceitar os Termos de Uso para concluir o cadastro.';
  end if;

  if p_data_nascimento is null or p_data_nascimento > current_date then
    raise exception 'Informe uma data de nascimento valida.';
  end if;

  if length(v_phone) > 11 and left(v_phone, 2) = '55' then
    v_phone := substr(v_phone, 3);
  end if;

  if length(v_phone) not in (10, 11) then
    raise exception 'Informe um telefone/WhatsApp valido.';
  end if;

  if length(v_cpf) <> 11 or v_cpf ~ '^([0-9])\1{10}$' then
    raise exception 'Informe um CPF valido para concluir o cadastro.';
  end if;

  v_sum := 0;
  for i in 1..9 loop
    v_sum := v_sum + substr(v_cpf, i, 1)::int * (11 - i);
  end loop;
  v_expected := (v_sum * 10) % 11;
  if v_expected = 10 then
    v_expected := 0;
  end if;
  v_digit := substr(v_cpf, 10, 1)::int;
  if v_digit <> v_expected then
    raise exception 'Informe um CPF valido para concluir o cadastro.';
  end if;

  v_sum := 0;
  for i in 1..10 loop
    v_sum := v_sum + substr(v_cpf, i, 1)::int * (12 - i);
  end loop;
  v_expected := (v_sum * 10) % 11;
  if v_expected = 10 then
    v_expected := 0;
  end if;
  v_digit := substr(v_cpf, 11, 1)::int;
  if v_digit <> v_expected then
    raise exception 'Informe um CPF valido para concluir o cadastro.';
  end if;

  select *
    into v_existing_by_cpf
  from public.parceiros p
  where regexp_replace(coalesce(p.cpf_cnpj, ''), '\D', '', 'g') = v_cpf
    and p.tipo = 'Aluno'
  order by p.created_at desc nulls last
  limit 1;

  if v_existing_by_cpf.id is not null
    and lower(coalesce(v_existing_by_cpf.email, '')) <> v_email
  then
    raise exception 'Este CPF ja esta cadastrado com outro e-mail. Entre com o e-mail correto ou fale com a secretaria.';
  end if;

  v_target_id := v_existing_by_cpf.id;

  if v_target_id is null then
    insert into public.parceiros (
      tipo,
      nome,
      email,
      telefone,
      cpf_cnpj,
      data_nascimento,
      polo_id,
      polo_ids,
      status,
      observacao,
      aceitou_termos_uso,
      aceitou_termos_uso_em,
      termos_uso_versao,
      troca_senha_obrigatoria
    )
    values (
      'Aluno',
      v_nome,
      v_email,
      v_phone,
      v_cpf,
      p_data_nascimento,
      v_matriz_polo_id,
      array[v_matriz_polo_id],
      'ATIVO',
      'Cadastro publico criado pelo fluxo de compra online EAD.',
      true,
      now(),
      nullif(btrim(coalesce(p_termos_versao, '')), ''),
      false
    )
    returning id into v_target_id;
  else
    -- Perfil existente e fonte canonica. O fallback pode apenas completar
    -- escopo/termos ausentes; nunca reaplica dados pessoais do Auth.
    update public.parceiros
      set polo_id = coalesce(polo_id, v_matriz_polo_id),
          polo_ids = case
            when coalesce(array_length(polo_ids, 1), 0) = 0
              then array[coalesce(polo_id, v_matriz_polo_id)]
            else polo_ids
          end,
          aceitou_termos_uso = coalesce(aceitou_termos_uso, false)
            or coalesce(p_aceitou_termos, false),
          aceitou_termos_uso_em = case
            when coalesce(aceitou_termos_uso, false) then aceitou_termos_uso_em
            when coalesce(p_aceitou_termos, false) then coalesce(aceitou_termos_uso_em, now())
            else aceitou_termos_uso_em
          end,
          termos_uso_versao = case
            when coalesce(aceitou_termos_uso, false) then termos_uso_versao
            when coalesce(p_aceitou_termos, false)
              then nullif(btrim(coalesce(p_termos_versao, '')), '')
            else termos_uso_versao
          end,
          updated_at = now()
    where id = v_target_id;
  end if;

  return v_target_id;
end;
$$;

create or replace function public.finalizar_cadastro_publico_aluno(
  p_nome text,
  p_email text,
  p_telefone text,
  p_cpf text,
  p_data_nascimento date,
  p_aceitou_termos boolean,
  p_termos_versao text,
  p_cep text,
  p_endereco text,
  p_numero text,
  p_complemento text,
  p_bairro text,
  p_cidade text,
  p_uf text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target_id uuid;
  v_cep text := regexp_replace(coalesce(p_cep, ''), '\D', '', 'g');
  v_endereco text := nullif(upper(btrim(coalesce(p_endereco, ''))), '');
  v_numero text := nullif(upper(btrim(coalesce(p_numero, ''))), '');
  v_complemento text := nullif(upper(btrim(coalesce(p_complemento, ''))), '');
  v_bairro text := nullif(upper(btrim(coalesce(p_bairro, ''))), '');
  v_cidade text := nullif(upper(btrim(coalesce(p_cidade, ''))), '');
  v_uf text := upper(btrim(coalesce(p_uf, '')));
begin
  if length(v_cep) <> 8 then
    raise exception 'Informe um CEP valido para concluir o cadastro.';
  end if;

  if v_endereco is null or v_numero is null or v_bairro is null or v_cidade is null then
    raise exception 'Complete endereco, numero, bairro e cidade para concluir o cadastro.';
  end if;

  if v_uf !~ '^[A-Z]{2}$' then
    raise exception 'Informe uma UF valida para concluir o cadastro.';
  end if;

  v_target_id := public.finalizar_cadastro_publico_aluno(
    p_nome,
    p_email,
    p_telefone,
    p_cpf,
    p_data_nascimento,
    p_aceitou_termos,
    p_termos_versao
  );

  -- Endereco do cadastro existente tambem e canonico. O fallback preenche
  -- somente campos vazios, como ocorre logo apos a criacao pelo trigger Auth.
  update public.parceiros
    set cep = coalesce(nullif(btrim(cep), ''), substr(v_cep, 1, 5) || '-' || substr(v_cep, 6, 3)),
        endereco = coalesce(nullif(btrim(endereco), ''), v_endereco),
        numero = coalesce(nullif(btrim(numero), ''), v_numero),
        complemento = coalesce(nullif(btrim(complemento), ''), v_complemento),
        bairro = coalesce(nullif(btrim(bairro), ''), v_bairro),
        cidade = coalesce(nullif(btrim(cidade), ''), v_cidade),
        uf = coalesce(nullif(btrim(uf), ''), v_uf),
        updated_at = now()
  where id = v_target_id
    and tipo = 'Aluno';

  return v_target_id;
end;
$$;

-- O trigger do Auth tambem e somente criador. Depois que o perfil existe,
-- alteracoes em raw_user_meta_data nao podem reativar, desbloquear ou
-- sobrescrever dados pessoais mantidos em parceiros.
create or replace function public.sync_public_aluno_auth_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_matriz_polo_id uuid := '44444444-4444-4444-4444-444444444444'::uuid;
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_origin text := coalesce(v_meta->>'origem', '');
  v_tipo text := coalesce(v_meta->>'tipo', '');
  v_nome text := nullif(btrim(coalesce(v_meta->>'nome', '')), '');
  v_email text := lower(nullif(btrim(coalesce(new.email, v_meta->>'email', '')), ''));
  v_phone text := regexp_replace(coalesce(v_meta->>'telefone', ''), '\D', '', 'g');
  v_cpf text := regexp_replace(coalesce(v_meta->>'cpf', ''), '\D', '', 'g');
  v_cep text := regexp_replace(coalesce(v_meta->>'cep', ''), '\D', '', 'g');
  v_endereco text := nullif(upper(btrim(coalesce(v_meta->>'endereco', ''))), '');
  v_numero text := nullif(upper(btrim(coalesce(v_meta->>'numero', ''))), '');
  v_complemento text := nullif(upper(btrim(coalesce(v_meta->>'complemento', ''))), '');
  v_bairro text := nullif(upper(btrim(coalesce(v_meta->>'bairro', ''))), '');
  v_cidade text := nullif(upper(btrim(coalesce(v_meta->>'cidade', ''))), '');
  v_uf text := upper(btrim(coalesce(v_meta->>'uf', '')));
  v_has_complete_address boolean := false;
  v_data_nascimento date;
  v_aceitou_termos boolean := false;
  v_termos_versao text := nullif(btrim(coalesce(v_meta->>'termsVersion', '2026-06-25')), '');
  v_existing_by_email public.parceiros%rowtype;
  v_existing_by_cpf public.parceiros%rowtype;
  v_sum int;
  v_digit int;
  v_expected int;
  i int;
begin
  if v_origin <> 'cadastro_publico_ead' and v_tipo <> 'Aluno' then
    return new;
  end if;

  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return new;
  end if;

  select *
    into v_existing_by_email
  from public.parceiros p
  where lower(coalesce(p.email, '')) = v_email
    and p.tipo = 'Aluno'
  order by p.created_at desc nulls last
  limit 1;

  if v_existing_by_email.id is not null then
    begin
      v_aceitou_termos := coalesce((v_meta->>'acceptedTerms')::boolean, false);
    exception when others then
      v_aceitou_termos := false;
    end;

    v_has_complete_address := (
      length(v_cep) = 8
      and v_endereco is not null
      and v_numero is not null
      and v_bairro is not null
      and v_cidade is not null
      and v_uf ~ '^[A-Z]{2}$'
    );

    -- O Auth pode estar sendo confirmado depois que a secretaria ja criou o
    -- aluno. Complete apenas onboarding e lacunas de endereco, sem tocar nos
    -- dados pessoais, status ou bloqueios mantidos no perfil canonico.
    update public.parceiros
      set polo_id = coalesce(polo_id, v_matriz_polo_id),
          polo_ids = case
            when coalesce(array_length(polo_ids, 1), 0) = 0
              then array[coalesce(polo_id, v_matriz_polo_id)]
            else polo_ids
          end,
          aceitou_termos_uso = coalesce(aceitou_termos_uso, false)
            or v_aceitou_termos,
          aceitou_termos_uso_em = case
            when coalesce(aceitou_termos_uso, false) then aceitou_termos_uso_em
            when v_aceitou_termos then coalesce(aceitou_termos_uso_em, now())
            else aceitou_termos_uso_em
          end,
          termos_uso_versao = case
            when coalesce(aceitou_termos_uso, false) then termos_uso_versao
            when v_aceitou_termos then v_termos_versao
            else termos_uso_versao
          end,
          cep = case
            when v_has_complete_address
              then coalesce(nullif(btrim(cep), ''), substr(v_cep, 1, 5) || '-' || substr(v_cep, 6, 3))
            else cep
          end,
          endereco = case
            when v_has_complete_address then coalesce(nullif(btrim(endereco), ''), v_endereco)
            else endereco
          end,
          numero = case
            when v_has_complete_address then coalesce(nullif(btrim(numero), ''), v_numero)
            else numero
          end,
          complemento = case
            when v_has_complete_address then coalesce(nullif(btrim(complemento), ''), v_complemento)
            else complemento
          end,
          bairro = case
            when v_has_complete_address then coalesce(nullif(btrim(bairro), ''), v_bairro)
            else bairro
          end,
          cidade = case
            when v_has_complete_address then coalesce(nullif(btrim(cidade), ''), v_cidade)
            else cidade
          end,
          uf = case
            when v_has_complete_address then coalesce(nullif(btrim(uf), ''), v_uf)
            else uf
          end,
          updated_at = now()
    where id = v_existing_by_email.id;

    return new;
  end if;

  if v_nome is null or length(v_nome) < 3 then
    return new;
  end if;

  begin
    v_aceitou_termos := coalesce((v_meta->>'acceptedTerms')::boolean, false);
  exception when others then
    v_aceitou_termos := false;
  end;

  if not v_aceitou_termos then
    return new;
  end if;

  begin
    v_data_nascimento := nullif(v_meta->>'dataNascimento', '')::date;
  exception when others then
    return new;
  end;

  if v_data_nascimento is null or v_data_nascimento > current_date then
    return new;
  end if;

  v_has_complete_address := (
    length(v_cep) = 8
    and v_endereco is not null
    and v_numero is not null
    and v_bairro is not null
    and v_cidade is not null
    and v_uf ~ '^[A-Z]{2}$'
  );

  if not v_has_complete_address then
    return new;
  end if;

  if length(v_phone) > 11 and left(v_phone, 2) = '55' then
    v_phone := substr(v_phone, 3);
  end if;

  if length(v_phone) not in (10, 11) then
    return new;
  end if;

  if length(v_cpf) <> 11 or v_cpf ~ '^([0-9])\1{10}$' then
    return new;
  end if;

  v_sum := 0;
  for i in 1..9 loop
    v_sum := v_sum + substr(v_cpf, i, 1)::int * (11 - i);
  end loop;
  v_expected := (v_sum * 10) % 11;
  if v_expected = 10 then
    v_expected := 0;
  end if;
  v_digit := substr(v_cpf, 10, 1)::int;
  if v_digit <> v_expected then
    return new;
  end if;

  v_sum := 0;
  for i in 1..10 loop
    v_sum := v_sum + substr(v_cpf, i, 1)::int * (12 - i);
  end loop;
  v_expected := (v_sum * 10) % 11;
  if v_expected = 10 then
    v_expected := 0;
  end if;
  v_digit := substr(v_cpf, 11, 1)::int;
  if v_digit <> v_expected then
    return new;
  end if;

  select *
    into v_existing_by_cpf
  from public.parceiros p
  where regexp_replace(coalesce(p.cpf_cnpj, ''), '\D', '', 'g') = v_cpf
    and p.tipo = 'Aluno'
  order by p.created_at desc nulls last
  limit 1;

  if v_existing_by_cpf.id is not null then
    return new;
  end if;

  insert into public.parceiros (
    tipo,
    nome,
    email,
    telefone,
    cpf_cnpj,
    data_nascimento,
    cep,
    endereco,
    numero,
    complemento,
    bairro,
    cidade,
    uf,
    polo_id,
    polo_ids,
    status,
    observacao,
    aceitou_termos_uso,
    aceitou_termos_uso_em,
    termos_uso_versao,
    troca_senha_obrigatoria
  )
  values (
    'Aluno',
    v_nome,
    v_email,
    v_phone,
    v_cpf,
    v_data_nascimento,
    substr(v_cep, 1, 5) || '-' || substr(v_cep, 6, 3),
    v_endereco,
    v_numero,
    v_complemento,
    v_bairro,
    v_cidade,
    v_uf,
    v_matriz_polo_id,
    array[v_matriz_polo_id],
    'ATIVO',
    'Cadastro publico criado automaticamente pelo Auth do fluxo de compra online EAD.',
    true,
    now(),
    v_termos_versao,
    false
  );

  return new;
exception when others then
  raise warning 'Falha ao criar cadastro publico de aluno para %: %', coalesce(new.email, '<sem email>'), sqlerrm;
  return new;
end;
$$;

-- Uma mudanca real no hash da senha conclui a exigencia de primeiro acesso.
-- A decisao ocorre no banco, a partir do evento do Auth, e nao pode ser
-- simulada por uma chamada RPC do navegador.
create or replace function public.sync_aluno_password_reset_completion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target_id uuid;
begin
  if old.encrypted_password is not distinct from new.encrypted_password
    or new.email is null
  then
    return new;
  end if;

  select p.id
    into v_target_id
  from public.parceiros p
  where p.tipo = 'Aluno'
    and lower(coalesce(p.email, '')) = lower(new.email)
  order by p.created_at desc nulls last
  limit 1;

  update public.parceiros
    set troca_senha_obrigatoria = false,
        updated_at = now()
  where id = v_target_id
    and coalesce(troca_senha_obrigatoria, false);

  return new;
end;
$$;

drop trigger if exists trg_sync_aluno_password_reset_completion on auth.users;
create trigger trg_sync_aluno_password_reset_completion
after update of encrypted_password
on auth.users
for each row
execute function public.sync_aluno_password_reset_completion();

revoke all on function public.finalizar_cadastro_publico_aluno(
  text, text, text, text, date, boolean, text
) from public, anon;
revoke all on function public.finalizar_cadastro_publico_aluno(
  text, text, text, text, date, boolean, text, text, text, text, text, text, text, text
) from public, anon;

grant execute on function public.finalizar_cadastro_publico_aluno(
  text, text, text, text, date, boolean, text
) to authenticated, service_role;
grant execute on function public.finalizar_cadastro_publico_aluno(
  text, text, text, text, date, boolean, text, text, text, text, text, text, text, text
) to authenticated, service_role;

revoke all on function public.sync_aluno_password_reset_completion()
  from public, anon, authenticated;
grant execute on function public.sync_aluno_password_reset_completion()
  to service_role;

revoke all on function public.sync_public_aluno_auth_profile()
  from public, anon, authenticated;
grant execute on function public.sync_public_aluno_auth_profile()
  to service_role;

commit;
