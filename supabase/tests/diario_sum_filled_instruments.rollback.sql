-- Synthetic fixtures for the PGlite schema only; never execute in production.
begin;
set local plpgsql.check_asserts = 'on';
do $test$
declare
  v_all jsonb := '{"p":true,"ti":true,"tg":true,"s":true,"cq":true,"o":true}';
  v_none jsonb := '{"p":false,"ti":false,"tg":false,"s":false,"cq":false,"o":false}';
  v_notes numeric[];
  v_index integer;
  v_class uuid := gen_random_uuid();
  v_period uuid := gen_random_uuid();
  v_subject uuid := gen_random_uuid();
  v_student uuid := gen_random_uuid();
  v_lesson uuid := gen_random_uuid();
  v_pending jsonb;
  v_result record;
begin
  for v_index in 1..6 loop
    v_notes := array[null, null, null, null, null, null]::numeric[];
    v_notes[v_index] := 1.25;
    assert internal_academic.calculate_diario_partial(
      v_all, v_notes[1], v_notes[2], v_notes[3], v_notes[4], v_notes[5], v_notes[6]
    ) = 1.25, 'Each filled active instrument must independently produce a partial';
    v_notes[v_index] := 0;
    assert internal_academic.calculate_diario_partial(
      v_all, v_notes[1], v_notes[2], v_notes[3], v_notes[4], v_notes[5], v_notes[6]
    ) = 0, 'An explicitly entered zero is a grade';
  end loop;
  assert internal_academic.calculate_diario_partial(v_all, null, null, null, null, null, null) is null,
    'All empty active instruments must keep the partial NULL';
  assert internal_academic.calculate_diario_partial(v_all, 5, 4.5, null, null, null, null) = 9.5;
  assert internal_academic.calculate_diario_partial(v_all, 1.25, 3, null, null, 0.5, null) = 4.75;
  assert internal_academic.calculate_diario_partial(v_all, 5.945, null, null, null, null, null) = 5.95;
  assert internal_academic.calculate_diario_partial(v_all, 5.95, null, null, null, null, null) = 5.95;
  assert internal_academic.calculate_diario_partial(v_all, 9.75, null, null, null, null, 1) = 10;
  assert internal_academic.calculate_diario_partial(v_none, 5, 4.5, null, null, null, 0) is null;
  assert internal_academic.calculate_diario_partial(v_none || '{"ti":true}', 5, null, null, null, null, 1) is null,
    'Only inactive notes cannot complete the partial';
  assert internal_academic.calculate_diario_partial(v_none || '{"p":true}', 1.25, 3, 3, 3, 3, 3) = 1.25;
  assert internal_academic.calculate_diario_partial(null, 1.25, null, null, null, null, null) = 1.25,
    'Legacy NULL configuration keeps instruments active';

  perform set_config('request.jwt.claim.role', 'service_role', true);
  insert into public.turmas(id, frequencia_minima_percent, media_minima) values(v_class, 75, 6);
  insert into public.periodos_letivos(id, turma_id) values(v_period, v_class);
  insert into public.disciplinas(id, carga_horaria_estagio) values(v_subject, 0);
  insert into public.turmas_disciplinas(turma_id, disciplina_id, periodo_letivo_id, concluida, instrumentos_avaliativos)
    values(v_class, v_subject, v_period, true, v_all);
  insert into public.matriculas(id, turma_id, aluno_id, status) values(gen_random_uuid(), v_class, v_student, 'ATIVO');
  insert into public.aulas_turma(id, turma_id, disciplina_id, data_aula, carga_horaria)
    values(v_lesson, v_class, v_subject, current_date, 4);
  insert into public.diario_frequencia(turma_id, disciplina_id, aluno_id, aula_id, status)
    values(v_class, v_subject, v_student, v_lesson, 'P');
  insert into public.diario_notas(turma_id, disciplina_id, aluno_id) values(v_class, v_subject, v_student);
  for v_index in 1..6 loop
    update public.diario_notas set
      nota_p = case when v_index = 1 then 6.25 end,
      nota_ti = case when v_index = 2 then 6.25 end,
      nota_tg = case when v_index = 3 then 6.25 end,
      nota_s = case when v_index = 4 then 6.25 end,
      nota_cq = case when v_index = 5 then 6.25 end,
      nota_o = case when v_index = 6 then 6.25 end
    where turma_id = v_class;
    select * into strict v_result from public.v_diario_notas_resultados where turma_id = v_class;
    assert v_result.media_parcial = 6.25 and v_result.media_final = 6.25 and v_result.resultado_final = 'APROVADO';
    assert num_nonnulls(v_result.nota_p, v_result.nota_ti, v_result.nota_tg, v_result.nota_s, v_result.nota_cq, v_result.nota_o) = 1,
      'Empty fields must stay NULL when calculating';
    v_pending := internal_academic.p1_get_pendencias_fechamento_periodo_20260719(v_period);
    assert (v_pending->>'lancamentosDeNotaPendentes')::integer = 0 and (v_pending->>'podeFechar')::boolean,
      'Existing period closure must consume the new canonical helper';
  end loop;
  update public.diario_notas set nota_o = null where turma_id = v_class;
  select * into strict v_result from public.v_diario_notas_resultados where turma_id = v_class;
  assert v_result.media_parcial is null and v_result.media_final is null and v_result.resultado_final = 'SEM_LANCAMENTO';
  v_pending := internal_academic.p1_get_pendencias_fechamento_periodo_20260719(v_period);
  assert (v_pending->>'lancamentosDeNotaPendentes')::integer = 1 and not (v_pending->>'podeFechar')::boolean;
  update public.diario_notas set nota_p = 0 where turma_id = v_class;
  v_pending := internal_academic.p1_get_pendencias_fechamento_periodo_20260719(v_period);
  assert (v_pending->>'lancamentosDeNotaPendentes')::integer = 0;
  assert (v_pending->>'recuperacoesPendentes')::integer = 1 and not (v_pending->>'podeFechar')::boolean;
  update public.diario_notas set nota_p = 1.25, nota_rec = 9.05 where turma_id = v_class;
  select * into strict v_result from public.v_diario_notas_resultados where turma_id = v_class;
  assert v_result.media_parcial = 1.25 and v_result.media_final = 9.05;
  delete from public.diario_frequencia where turma_id = v_class;
  v_pending := internal_academic.p1_get_pendencias_fechamento_periodo_20260719(v_period);
  assert (v_pending->>'frequenciasPendentes')::integer = 1 and not (v_pending->>'podeFechar')::boolean;
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  v_pending := internal_academic.p1_get_pendencias_fechamento_periodo_20260719(v_period);
  assert not (v_pending->>'podeFechar')::boolean;
end;
$test$;
set constraints all immediate;
rollback;
