-- Synthetic fixtures only. Run against the migration in one transaction;
-- no real assignments, access identities or notifications are committed.
begin;
set local statement_timeout = '60s';
set local lock_timeout = '3s';
set local plpgsql.check_asserts = 'on';
do $test$
declare
  v_polo uuid; v_other_polo uuid;
  v_course uuid := gen_random_uuid(); v_livre_course uuid := gen_random_uuid();
  v_superior_course uuid := gen_random_uuid();
  v_module uuid := gen_random_uuid(); v_livre_module uuid := gen_random_uuid();
  v_superior_module uuid := gen_random_uuid();
  v_class uuid := gen_random_uuid(); v_livre_class uuid := gen_random_uuid();
  v_superior_class uuid := gen_random_uuid();
  v_subject uuid := gen_random_uuid(); v_legacy_subject uuid := gen_random_uuid();
  v_insert_subject uuid := gen_random_uuid(); v_livre_subject uuid := gen_random_uuid();
  v_superior_subject uuid := gen_random_uuid(); v_period uuid;
  v_home uuid := gen_random_uuid(); v_multi uuid := gen_random_uuid();
  v_foreign uuid := gen_random_uuid(); v_legacy uuid := gen_random_uuid();
  v_global uuid := gen_random_uuid(); v_today date := current_date;
  v_assignment record; v_count integer;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  select id into strict v_polo from public.polos order by id limit 1;
  select id into strict v_other_polo from public.polos where id <> v_polo order by id limit 1;
  insert into public.cursos(id, nome, modalidade, carga_horaria) values
    (v_course, 'Curso técnico sintético docente', 'TECNICO', 120),
    (v_livre_course, 'Curso livre sintético docente', 'LIVRE', 40),
    (v_superior_course, 'Curso superior sintético docente', 'SUPERIOR', 40);
  insert into public.modulos(id, curso_id, nome, ordem) values
    (v_module, v_course, 'Módulo técnico sintético', 1),
    (v_livre_module, v_livre_course, 'Módulo livre sintético', 1),
    (v_superior_module, v_superior_course, 'Módulo superior sintético', 1);
  insert into public.disciplinas(id, modulo_id, nome, ordem, carga_horaria) values
    (v_subject, v_module, 'Disciplina técnica sintética', 1, 40),
    (v_legacy_subject, v_module, 'Disciplina legado sintética', 2, 40),
    (v_insert_subject, v_module, 'Disciplina nova sintética', 3, 40),
    (v_livre_subject, v_livre_module, 'Disciplina livre sintética', 1, 40),
    (v_superior_subject, v_superior_module, 'Disciplina superior sintética', 1, 40);
  insert into public.turmas(id, codigo, nome, curso_id, polo_id, turno, status,
    data_inicio, data_previsao_termino, valor_matricula, valor_rematricula, qtd_parcelas,
    valor_parcela, primeiro_vencimento_padrao) values
    (v_class, 'TEST-' || v_class, 'Turma técnica sintética docente', v_course, v_polo,
      'INTEGRAL', 'PLANEJADA', v_today + 7, v_today + 730, 100, 75, 12, 250, v_today + 7),
    (v_livre_class, 'TEST-' || v_livre_class, 'Turma livre sintética docente', v_livre_course, v_polo,
      'INTEGRAL', 'PLANEJADA', v_today + 7, v_today + 730, 100, 0, 1, 250, v_today + 7),
    (v_superior_class, 'TEST-' || v_superior_class, 'Turma superior sintética docente', v_superior_course, v_polo,
      'INTEGRAL', 'PLANEJADA', v_today + 7, v_today + 730, 100, 0, 1, 250, v_today + 7);
  select id into v_period from public.periodos_letivos
    where turma_id = v_class and modulo_id = v_module;
  if v_period is null then
    insert into public.periodos_letivos(id, turma_id, modulo_id, nome, ordem, status)
      values(gen_random_uuid(), v_class, v_module, 'Período sintético docente', 1, 'PLANEJADO')
      returning id into v_period;
  end if;
  insert into public.turmas_disciplinas(turma_id, disciplina_id, periodo_letivo_id) values
    (v_class, v_subject, v_period), (v_class, v_legacy_subject, v_period)
    on conflict (turma_id, disciplina_id) do nothing;
  delete from public.turmas_disciplinas where turma_id = v_class and disciplina_id = v_insert_subject;
  insert into public.turmas_disciplinas(turma_id, disciplina_id) values
    (v_superior_class, v_superior_subject) on conflict (turma_id, disciplina_id) do nothing;
  insert into public.parceiros(id, tipo, nome, polo_id, polo_ids) values
    (v_home, 'Professor', 'Docente principal sintético', v_polo, '{}'),
    (v_multi, 'Professor', 'Docente multipolo sintético', v_other_polo, array[v_polo]),
    (v_foreign, 'Professor', 'Docente externo sintético', v_other_polo, array[v_other_polo]),
    (v_legacy, 'Professor', 'Docente legado sintético', v_polo, '{}'),
    (v_global, 'Professor', 'Docente sem polo sintético', null, '{}');

  execute 'set local role service_role';
  select * into strict v_assignment from public.atribuir_docente_disciplinas_turma(v_class, array[v_subject], v_home);
  assert v_assignment.professor_id = v_home;
  select * into strict v_assignment from public.atribuir_docente_disciplinas_turma(v_class, array[v_subject], v_multi);
  assert v_assignment.professor_id = v_multi, 'Additional polo membership must authorize assignment';
  begin
    perform public.atribuir_docente_disciplinas_turma(v_class, array[v_subject], v_foreign);
    raise exception 'Foreign polo assignment was accepted' using errcode = 'ZX001';
  exception when invalid_parameter_value then
    assert sqlerrm = 'O docente precisa estar vinculado ao polo da turma técnica.';
  end;
  begin
    perform public.atribuir_docente_disciplinas_turma(v_class, array[v_subject], v_global);
    raise exception 'Unscoped teacher assignment was accepted' using errcode = 'ZX001';
  exception when invalid_parameter_value then null; end;
  begin
    update public.turmas_disciplinas set professor_id = v_foreign
      where turma_id = v_class and disciplina_id = v_subject;
    raise exception 'Direct foreign polo assignment was accepted' using errcode = 'ZX001';
  exception when invalid_parameter_value then null; end;
  begin
    insert into public.turmas_disciplinas(turma_id, disciplina_id, periodo_letivo_id, professor_id)
      values(v_class, v_insert_subject, v_period, v_foreign);
    raise exception 'Direct foreign polo INSERT was accepted' using errcode = 'ZX001';
  exception when invalid_parameter_value then null; end;
  select count(*) into v_count from public.turmas_disciplinas
    where turma_id = v_class and disciplina_id = v_subject and professor_id = v_multi;
  assert v_count = 1, 'Rejected assignments must preserve the previous teacher';

  perform public.atribuir_docente_disciplinas_turma(v_class, array[v_legacy_subject], v_legacy);
  -- Model a preexisting assignment whose partner scope has since changed.
  update public.parceiros set polo_id = v_other_polo, polo_ids = array[v_other_polo] where id = v_legacy;
  select * into strict v_assignment from public.atribuir_docente_disciplinas_turma(v_class, array[v_legacy_subject], v_legacy);
  assert v_assignment.professor_id = v_legacy, 'Same-assignment replay must remain valid';
  update public.turmas_disciplinas set concluida = true, professor_id = v_legacy
    where turma_id = v_class and disciplina_id = v_legacy_subject;
  insert into public.turmas_disciplinas(turma_id, disciplina_id, professor_id, professor_nome, concluida)
    values(v_class, v_legacy_subject, v_legacy, v_assignment.professor_nome, true)
    on conflict (turma_id, disciplina_id) do update
    set professor_id = excluded.professor_id, professor_nome = excluded.professor_nome, concluida = excluded.concluida;
  assert exists(select 1 from public.turmas_disciplinas
    where turma_id = v_class and disciplina_id = v_legacy_subject and professor_id = v_legacy and concluida);
  select * into strict v_assignment from public.atribuir_docente_disciplinas_turma(v_class, array[v_legacy_subject], null);
  assert v_assignment.professor_id is null and v_assignment.concluida;
  begin
    perform public.atribuir_docente_disciplinas_turma(v_class, array[v_legacy_subject], v_legacy);
    raise exception 'Removed out-of-scope assignment was recreated' using errcode = 'ZX001';
  exception when invalid_parameter_value then null; end;

  select * into strict v_assignment from public.atribuir_docente_disciplinas_turma(v_livre_class, array[v_livre_subject], v_foreign);
  assert v_assignment.professor_id = v_foreign, 'Livre contract must remain unchanged';
  select * into strict v_assignment from public.atribuir_docente_disciplinas_turma(v_superior_class, array[v_superior_subject], v_foreign);
  assert v_assignment.professor_id = v_foreign, 'Superior contract must remain unchanged';
  execute 'reset role';
  assert not has_function_privilege('anon', 'internal_academic.guard_technical_teacher_polo_scope()', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'internal_academic.guard_technical_teacher_polo_scope()', 'EXECUTE');
  assert not has_function_privilege('service_role', 'internal_academic.guard_technical_teacher_polo_scope()', 'EXECUTE');
end;
$test$;
set constraints all immediate;
rollback;
