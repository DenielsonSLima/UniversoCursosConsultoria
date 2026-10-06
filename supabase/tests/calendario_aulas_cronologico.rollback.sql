-- Execute depois da migration cronológica via MCP Supabase, em transação.
-- Fixture institucional: turma T46; não grava grade, modelo ou documento.
begin;
set local statement_timeout = '30s';
set local lock_timeout = '3s';

do $test$
declare
  v_turma_id uuid;
  v_polo_id uuid;
  v_outro_polo uuid;
  v_candidate record;
  v_actor uuid;
  v_full jsonb;
  v_subset jsonb;
  v_period jsonb;
  v_empty jsonb;
  v_modulos uuid[];
  v_rotulos text[];
  v_primeira_data date;
  v_expected integer;
  v_actual integer;
  v_disorder integer;
begin
  select turma.id, turma.polo_id
  into strict v_turma_id, v_polo_id
  from public.turmas turma
  where turma.codigo = '2026.2-ENF-INT-JAP';

  -- A identidade vem do cadastro atual e só é aceita se a guarda real passar.
  for v_candidate in
    select usuario.auth_user_id
    from public.usuarios_sistema usuario
    where upper(coalesce(usuario.status, '')) = 'ATIVO'
      and usuario.auth_user_id is not null
    order by usuario.id
  loop
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    perform set_config('request.jwt.claim.sub',
      v_candidate.auth_user_id::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object(
      'role', 'authenticated', 'sub', v_candidate.auth_user_id
    )::text, true);
    if public.can_manage_calendario_aulas(v_polo_id) then
      v_actor := v_candidate.auth_user_id;
      exit;
    end if;
  end loop;
  assert v_actor is not null, 'Nenhum gestor elegível para a fixture T46';

  v_full := public.preparar_calendario_aulas_cronologico_secure(
    v_polo_id, 'TECNICO', v_turma_id, null, null, null
  );
  assert v_full ->> 'status' = 'PRONTO', 'Grade cronológica indisponível';
  assert v_full #>> '{documento,modo_exportacao}' = 'CRONOLOGICO',
    'Modo do documento divergente';
  assert v_full #>> '{documento,template_revision}' is not null,
    'Revisão do modelo não atravessou o payload';
  select array_agg(modulo.valor ->> 'modulo_rotulo' order by modulo.posicao)
  into v_rotulos
  from jsonb_array_elements(v_full #> '{documento,modulos_selecionados}')
    with ordinality modulo(valor, posicao);
  assert v_rotulos @> array['MÓDULO I', 'MÓDULO II', 'MÓDULO III']::text[],
    'Rótulos curtos dos módulos T46 não foram preservados';

  select count(*) into v_expected
  from (
    select distinct aula.disciplina_id, aula.data_aula
    from public.aulas_turma aula
    join public.turmas_disciplinas grade
      on grade.turma_id = aula.turma_id
      and grade.disciplina_id = aula.disciplina_id
    where aula.turma_id = v_turma_id
      and aula.data_aula is not null
  ) encontros;
  v_actual := jsonb_array_length(v_full -> 'linhas');
  assert v_actual = v_expected,
    'Encontros distintos foram omitidos ou agrupados por nome';

  select count(*) into v_disorder
  from (
    select
      (linha.valor ->> 'data_iso') || ' '
        || coalesce(linha.valor ->> 'hora_inicio', '99:99') as ordem,
      lag((linha.valor ->> 'data_iso') || ' '
        || coalesce(linha.valor ->> 'hora_inicio', '99:99'))
        over (order by linha.posicao) as anterior
    from jsonb_array_elements(v_full -> 'linhas')
      with ordinality linha(valor, posicao)
  ) sequencia
  where sequencia.anterior > sequencia.ordem;
  assert v_disorder = 0, 'Linhas não estão em data e hora cronológicas';

  assert (
    select count(*)
    from jsonb_array_elements(v_full -> 'linhas') linha(valor)
    where linha.valor ->> 'encontro_id' is null
      or linha.valor ->> 'disciplina_id' is null
      or linha.valor ->> 'modulo_id' is null
      or linha.valor ->> 'modulo_rotulo' is null
  ) = 0, 'Identidade ou módulo ausente em uma linha';

  select array_agg((modulo.valor ->> 'modulo_id')::uuid order by modulo.posicao)
  into v_modulos
  from jsonb_array_elements(v_full #> '{documento,modulos_selecionados}')
    with ordinality modulo(valor, posicao)
  where modulo.posicao <= 2;
  assert cardinality(v_modulos) = 2, 'Fixture precisa de dois módulos';

  v_subset := public.preparar_calendario_aulas_cronologico_secure(
    v_polo_id, 'TECNICO', v_turma_id, v_modulos, null, null
  );
  select coalesce(sum((modulo.valor ->> 'total_aulas')::integer), 0)
  into v_expected
  from jsonb_array_elements(v_subset #> '{documento,modulos_selecionados}')
    modulo(valor);
  assert jsonb_array_length(v_subset -> 'linhas') = v_expected,
    'Subconjunto de módulos não corresponde ao resumo';
  assert (
    select count(*)
    from jsonb_array_elements(v_subset -> 'linhas') linha(valor)
    where (linha.valor ->> 'modulo_id')::uuid <> all(v_modulos)
  ) = 0, 'Subconjunto incluiu aula de outro módulo';

  v_primeira_data := (v_full #>> '{linhas,0,data_iso}')::date;
  v_period := public.preparar_calendario_aulas_cronologico_secure(
    v_polo_id, 'TECNICO', v_turma_id, null,
    v_primeira_data, v_primeira_data
  );
  assert v_period #>> '{documento,data_inicio}' = v_primeira_data::text
    and v_period #>> '{documento,data_fim}' = v_primeira_data::text,
    'Período solicitado não foi preservado';
  assert (
    select count(*)
    from jsonb_array_elements(v_period -> 'linhas') linha(valor)
    where linha.valor ->> 'data_iso' <> v_primeira_data::text
  ) = 0, 'Recorte inclusivo retornou aula fora do dia';

  v_empty := public.preparar_calendario_aulas_cronologico_secure(
    v_polo_id, 'TECNICO', v_turma_id, null,
    date '1900-01-01', date '1900-01-01'
  );
  assert v_empty ->> 'status' = 'SEM_GRADE'
    and jsonb_array_length(v_empty -> 'linhas') = 0,
    'Período sem aula não retornou SEM_GRADE';
  assert (
    select count(*)
    from jsonb_array_elements(v_empty #> '{documento,modulos_selecionados}')
      modulo(valor)
    where (modulo.valor ->> 'total_aulas')::integer <> 0
  ) = 0, 'Módulo sem aula foi omitido do resumo';

  begin
    perform public.preparar_calendario_aulas_cronologico_secure(
      v_polo_id, 'TECNICO', v_turma_id, '{}'::uuid[], null, null);
    raise exception 'Array vazio foi aceito';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.preparar_calendario_aulas_cronologico_secure(
      v_polo_id, 'TECNICO', v_turma_id, array[null::uuid], null, null);
    raise exception 'Array com módulo nulo foi aceito';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.preparar_calendario_aulas_cronologico_secure(
      v_polo_id, 'TECNICO', v_turma_id, array[gen_random_uuid()], null, null);
    raise exception 'Módulo externo foi aceito';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.preparar_calendario_aulas_cronologico_secure(
      v_polo_id, 'TECNICO', v_turma_id, null, v_primeira_data, null);
    raise exception 'Período incompleto foi aceito';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.preparar_calendario_aulas_cronologico_secure(
      v_polo_id, 'TECNICO', v_turma_id, null,
      v_primeira_data + 1, v_primeira_data);
    raise exception 'Período invertido foi aceito';
  exception when sqlstate '22023' then null; end;

  select polo.id into v_outro_polo
  from public.polos polo
  where polo.id <> v_polo_id
  order by polo.id
  limit 1;
  if v_outro_polo is not null then
    begin
      perform public.preparar_calendario_aulas_cronologico_secure(
        v_outro_polo, 'TECNICO', v_turma_id, null, null, null);
      raise exception 'Turma foi exposta sob polo distinto';
    exception when sqlstate '42501' then null; end;
  end if;

  perform set_config('request.jwt.claim.role', 'anon', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin
    perform public.preparar_calendario_aulas_cronologico_secure(
      v_polo_id, 'TECNICO', v_turma_id, null, null, null);
    raise exception 'Acesso anônimo foi aceito';
  exception when sqlstate '42501' then null; end;
  assert not has_function_privilege('anon',
    'public.preparar_calendario_aulas_cronologico_secure(uuid,text,uuid,uuid[],date,date)',
    'execute'), 'Grant anônimo indevido';
end;
$test$;

rollback;
