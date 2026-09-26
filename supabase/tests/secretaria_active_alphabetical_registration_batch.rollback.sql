-- Executar depois da migration. Emissões/modelo são revertidos integralmente.
-- Fixtures acadêmicas são escolhidas internamente; nenhum dado pessoal é impresso.
begin;
set local statement_timeout = '60s';
set local lock_timeout = '5s';
set local plpgsql.check_asserts = 'on';

do $test$
declare
  v_class uuid;
  v_ids uuid[];
  v_expected uuid[];
  v_inactive uuid[];
  v_received uuid[];
  v_reverse uuid[];
  v_model uuid := gen_random_uuid();
  v_type text;
  v_reference text;
  v_key text;
  v_first jsonb;
  v_replay jsonb;
  v_before bigint;
  v_after bigint;
  v_count bigint;
  v_eligible_count integer;
  v_denied boolean;
  v_sort text[];
begin
  assert not has_function_privilege(
    'anon',
    'public.reemitir_fichas_ativas_lote_portal(text,uuid[],text,text,uuid)',
    'execute'
  ), 'A RPC não pode ser executada por anon';

  select array_agg(name order by lower(name) collate pg_catalog."pt-BR-x-icu")
  into v_sort
  from unnest(array['Érica', 'bruno', 'Álvaro', 'ana']) as names(name);
  assert v_sort = array['Álvaro', 'ana', 'bruno', 'Érica'],
    'A ordenação pt-BR deve tratar acentos e caixa';

  -- Preferir turma mista que permita provar a exclusão de TRANCADO.
  select enrollment.turma_id into strict v_class
  from public.matriculas as enrollment
  join public.parceiros as student on student.id = enrollment.aluno_id
  join public.turmas as class on class.id = enrollment.turma_id
  join public.cursos as course on course.id = class.curso_id
  where not exists (
    select 1 from public.documentos_validacao as document
    where document.matricula_id = enrollment.id
      and document.documento in ('pasta_identificacao', 'ficha_matricula')
      and document.status = 'REVOGADO'
  )
  group by enrollment.turma_id
  having count(*) between 3 and 100
    and count(*) filter (where enrollment.status = 'ATIVO') >= 2
    and count(*) filter (where enrollment.status = 'TRANCADO') >= 1
  order by count(*) filter (where enrollment.status = 'TRANCADO') desc
  limit 1;

  select array_agg(enrollment.id order by enrollment.id desc),
    array_agg(enrollment.id order by
      lower(btrim(coalesce(student.nome, ''))) collate pg_catalog."pt-BR-x-icu",
      enrollment.id
    ) filter (where upper(btrim(enrollment.status)) in ('ATIVO', 'PENDENTE', 'EM_ANDAMENTO')),
    array_agg(enrollment.id order by enrollment.id)
      filter (where upper(btrim(enrollment.status)) not in ('ATIVO', 'PENDENTE', 'EM_ANDAMENTO'))
  into v_ids, v_expected, v_inactive
  from public.matriculas as enrollment
  join public.parceiros as student on student.id = enrollment.aluno_id
  where enrollment.turma_id = v_class
    and not exists (
      select 1 from public.documentos_validacao as document
      where document.matricula_id = enrollment.id
        and document.documento in ('pasta_identificacao', 'ficha_matricula')
        and document.status = 'REVOGADO'
    );
  assert cardinality(v_expected) >= 2 and cardinality(v_inactive) >= 1;
  v_eligible_count := cardinality(v_expected);

  -- A guarda precisa executar antes de excluir itens inativos.
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  v_denied := false;
  begin
    perform public.reemitir_fichas_ativas_lote_portal(
      'pasta_identificacao', v_ids, gen_random_uuid()::text
    );
  exception when insufficient_privilege then v_denied := true;
  end;
  assert v_denied, 'Sem autorização, lote misto deve falhar';
  v_denied := false;
  begin
    perform public.reemitir_fichas_ativas_lote_portal(
      'pasta_identificacao', v_inactive, gen_random_uuid()::text
    );
  exception when insufficient_privilege then v_denied := true;
  end;
  assert v_denied, 'Sem autorização, lote apenas inativo deve falhar';

  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  insert into public.modelos_fichas (
    id, nome, tipo_curso, status, requer_assinatura, template_config
  ) values (
    v_model, 'Teste transacional de lote alfabético', 'TODOS', 'ATIVO', false,
    '{"textContent":"<p>Ficha transacional de matrícula.</p>"}'::jsonb
  );

  foreach v_type in array array['pasta_identificacao', 'ficha_matricula'] loop
    v_reference := case when v_type = 'ficha_matricula' then v_model::text else null end;
    v_key := gen_random_uuid()::text;
    select jsonb_agg(to_jsonb(issued) order by issued.ordem_solicitacao),
      array_agg(issued.matricula_id order by issued.ordem_solicitacao)
    into v_first, v_received
    from public.reemitir_fichas_ativas_lote_portal(
      v_type, v_ids, v_key, v_reference
    ) as issued;
    assert cardinality(v_received) = v_eligible_count,
      'Todas as matrículas elegíveis devem ser emitidas';
    select array_agg(document.matricula_id order by
      lower(btrim(coalesce(document.dados_emissao ->> 'studentName', '')))
        collate pg_catalog."pt-BR-x-icu", document.matricula_id
    ) into v_expected
    from public.documentos_validacao as document
    where document.codigo in (
      select item ->> 'codigo' from jsonb_array_elements(v_first) as result(item)
    );
    assert v_received = v_expected, 'Lote deve seguir o nome do snapshot exibido no PDF';
    assert not (v_received && v_inactive), 'Lote emitiu matrícula inativa';
    assert not exists (
      select 1 from jsonb_array_elements(v_first) with ordinality as result(item, position)
      where (item ->> 'ordem_solicitacao')::integer <> position
    ), 'Posições alfabéticas devem ser contíguas';

    select array_agg(id order by position desc) into v_reverse
    from unnest(v_ids) with ordinality as requested(id, position);
    select jsonb_agg(to_jsonb(issued) order by issued.ordem_solicitacao)
    into v_replay
    from public.reemitir_fichas_ativas_lote_portal(
      v_type, v_reverse, v_key, v_reference
    ) as issued;
    assert v_replay = v_first, 'Retry com mesmos IDs em ordem inversa deve ser idempotente';

    select count(*) into v_before from public.documentos_validacao
      where matricula_id = any(v_inactive) and documento = v_type;
    select count(*) into v_count
    from public.reemitir_fichas_ativas_lote_portal(
      v_type, v_inactive, gen_random_uuid()::text, v_reference
    );
    select count(*) into v_after from public.documentos_validacao
      where matricula_id = any(v_inactive) and documento = v_type;
    assert v_count = 0 and v_before = v_after, 'Lote vazio não deve emitir';

    -- Contrato anterior continua preservando a seleção personalizada.
    v_reverse := array[v_expected[2], v_expected[1]];
    select array_agg(issued.matricula_id order by issued.ordem_solicitacao)
    into v_received
    from public.reemitir_fichas_validacao_lote_portal(
      v_type, v_reverse, gen_random_uuid()::text, v_reference
    ) as issued;
    assert v_received = v_reverse, 'RPC anterior deve preservar ordem personalizada';
  end loop;

  v_denied := false;
  begin
    perform public.reemitir_fichas_ativas_lote_portal(
      'pasta_identificacao', array[v_expected[1], v_expected[1]], gen_random_uuid()::text
    );
  exception when invalid_parameter_value then v_denied := true;
  end;
  assert v_denied, 'IDs duplicados devem falhar';
  v_denied := false;
  begin
    perform public.reemitir_fichas_ativas_lote_portal(
      'pasta_identificacao', array[v_expected[1], null::uuid], gen_random_uuid()::text
    );
  exception when invalid_parameter_value then v_denied := true;
  end;
  assert v_denied, 'ID nulo deve falhar';
  v_denied := false;
  begin
    perform public.reemitir_fichas_ativas_lote_portal(
      'pasta_identificacao', array[v_expected[1], gen_random_uuid()], gen_random_uuid()::text
    );
  exception when invalid_parameter_value then v_denied := true;
  end;
  assert v_denied, 'ID inexistente deve falhar sem emitir parcialmente';
  v_denied := false;
  begin
    perform public.reemitir_fichas_ativas_lote_portal(
      'boletim', v_expected, gen_random_uuid()::text
    );
  exception when invalid_parameter_value then v_denied := true;
  end;
  assert v_denied, 'O endpoint não deve ampliar outros documentos';
end;
$test$;

select 'Pasta/Ficha: ordem pt-BR, exclusão, autorização, replay e contrato anterior aprovados' as result;
rollback;
