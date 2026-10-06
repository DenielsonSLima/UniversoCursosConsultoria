-- Contrato do trecho de cadastro da RPC instalada, com fixtures somente em memória.
-- Não cria aluno, turma, matrícula ou cobrança; toda estrutura temporária é revertida.
begin;

do $setup$
declare
  v_definition text;
  v_start integer;
  v_end integer;
  v_validation text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.pre_vincular_aluno_tecnico_secure(uuid,uuid,uuid,date,integer,text)'::regprocedure
  ) into v_definition;
  v_start := pg_catalog.strpos(v_definition, '  if nullif(pg_catalog.btrim(v_aluno.nome),');
  v_end := pg_catalog.strpos(v_definition, '  perform internal_academic.authorize_enrollment_upsert(');
  if v_start = 0 or v_end <= v_start then
    raise exception 'Não foi possível localizar o contrato de cadastro instalado.';
  end if;
  v_validation := pg_catalog.substr(v_definition, v_start, v_end - v_start);
  execute pg_catalog.format(
    'create function pg_temp.assert_technical_profile(p_profile jsonb) returns void
     language plpgsql as %L',
    'declare
       v_aluno public.parceiros%rowtype;
       v_missing_fields text[] := array[]::text[];
     begin
       v_aluno := pg_catalog.jsonb_populate_record(null::public.parceiros, p_profile);
     ' || v_validation || ' end;'
  );
end;
$setup$;

do $profile_cases$
declare
  v_profile jsonb := jsonb_build_object(
    'nome', 'ALUNA SINTETICA',
    'cpf_cnpj', '52998224725',
    'nome_mae', 'MAE SINTETICA',
    'endereco', 'RUA SINTETICA',
    'cep', '49950000',
    'bairro', 'CENTRO',
    'cidade', 'CIDADE SINTETICA',
    'uf', 'SE'
  );
  v_father jsonb;
  v_mother jsonb;
begin
  -- Campo pai ausente, null, vazio e somente espaços são opcionais.
  perform pg_temp.assert_technical_profile(v_profile);
  for v_father in select value from jsonb_array_elements('[null,"","   ","PAI SINTETICO"]'::jsonb)
  loop
    perform pg_temp.assert_technical_profile(v_profile || jsonb_build_object('nome_pai', v_father));
  end loop;

  -- A filiação materna segue obrigatória, mesmo com pai informado.
  for v_mother in select value from jsonb_array_elements('[null,"","   "]'::jsonb)
  loop
    begin
      perform pg_temp.assert_technical_profile(
        v_profile || jsonb_build_object('nome_mae', v_mother, 'nome_pai', 'PAI SINTETICO')
      );
      raise exception 'Nome da mãe vazio foi aceito indevidamente.';
    exception when sqlstate '22023' then
      if sqlerrm not like '%nome da mãe%' then
        raise exception 'Falha materna não identificada: %', sqlerrm;
      end if;
    end;
  end loop;

  -- Os demais requisitos continuam ativos.
  begin
    perform pg_temp.assert_technical_profile(v_profile || '{"cpf_cnpj":"11111111111"}'::jsonb);
    raise exception 'CPF inválido foi aceito indevidamente.';
  exception when sqlstate '22023' then
    if sqlerrm not like '%CPF válido%' then raise; end if;
  end;
end;
$profile_cases$;

-- Exercita as guardas da RPC original antes de qualquer consulta de aluno/turma.
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', '', true);

do $rpc_guards$
begin
  begin
    perform public.pre_vincular_aluno_tecnico_secure(
      gen_random_uuid(), gen_random_uuid(), null
    );
    raise exception 'RPC aceitou requestId ausente.';
  exception when sqlstate '22023' then
    if sqlerrm not like '%requestId%' then raise; end if;
  end;

  begin
    perform public.pre_vincular_aluno_tecnico_secure(
      gen_random_uuid(), gen_random_uuid(), gen_random_uuid()
    );
    raise exception 'RPC aceitou identidade sem autorização.';
  exception when sqlstate '42501' then
    if sqlerrm not like '%Sem permissão%' then raise; end if;
  end;
end;
$rpc_guards$;

select 'Contrato instalado: pai opcional, mãe obrigatória e guardas preservadas.' as result;
rollback;
