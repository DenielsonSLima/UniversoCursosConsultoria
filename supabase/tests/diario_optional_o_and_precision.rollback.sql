-- Synthetic fixtures only. No real notes or instrument configurations are changed.
-- Run through the PGlite runner's isolated schema, never against production.
begin;
set local plpgsql.check_asserts = 'on';
do $test$
declare
  v_config jsonb := '{"p":true,"ti":true,"tg":false,"s":false,"cq":false,"o":true}';
  v_only_o jsonb := '{"p":false,"ti":false,"tg":false,"s":false,"cq":false,"o":true}';
  v_none jsonb := '{"p":false,"ti":false,"tg":false,"s":false,"cq":false,"o":false}';
  v_required text;
  v_class uuid := gen_random_uuid();
  v_period uuid := gen_random_uuid();
  v_subject uuid := gen_random_uuid();
  v_student uuid := gen_random_uuid();
  v_enrollment uuid := gen_random_uuid();
  v_lesson uuid := gen_random_uuid();
  v_pending jsonb;
  v_result record;
begin
  assert internal_academic.calculate_diario_partial(v_config, 5, 4.5, null, null, null, null) = 9.5,
    'Missing optional O must not suppress the sum';
  assert internal_academic.calculate_diario_partial(v_config, 4, 5, null, null, null, null) = 9;
  assert internal_academic.calculate_diario_partial(v_config, 5, 4.5, null, null, null, 0.25) = 9.75;
  assert internal_academic.calculate_diario_partial(v_config, 5, 4.5, null, null, null, 2) = 10,
    'The existing maximum must remain 10';
  assert internal_academic.calculate_diario_partial(v_config || '{"cq":true}', 1.25, 3, null, null, 0.5, null) = 4.75,
    'The canonical sum must retain two decimal places';
  assert internal_academic.calculate_diario_partial(v_config, 5.945, 0, null, null, null, null) = 5.95;
  assert internal_academic.calculate_diario_partial(v_config, 5.95, 0, null, null, null, null) = 5.95,
    'Two decimals must not round a below-threshold grade up to 6';

  foreach v_required in array array['p', 'ti', 'tg', 's', 'cq'] loop
    assert internal_academic.calculate_diario_partial(
      v_none || jsonb_build_object(v_required, true, 'o', true),
      null, null, null, null, null, 9
    ) is null, 'Every other active instrument must remain required';
  end loop;
  assert internal_academic.calculate_diario_partial(v_only_o, null, null, null, null, null, null) is null;
  assert internal_academic.calculate_diario_partial(v_only_o, 5, 4.5, null, null, null, null) is null,
    'Inactive notes cannot complete a diary';
  assert internal_academic.calculate_diario_partial(v_only_o, null, null, null, null, null, 0) = 0,
    'Explicit zero is a recorded grade';
  assert internal_academic.calculate_diario_partial(v_only_o, null, null, null, null, null, 1.25) = 1.25;
  assert internal_academic.calculate_diario_partial(v_none, 5, 4.5, null, null, null, 1) is null;
  assert internal_academic.calculate_diario_partial(v_config || '{"o":false}', 5, 4.5, null, null, null, 1) = 9.5;
  assert internal_academic.calculate_diario_partial(null, 5, 4.5, 0, 0, 0, null) = 9.5,
    'Legacy NULL configuration still defaults each instrument to active';

  perform set_config('request.jwt.claim.role', 'service_role', true);
  insert into public.turmas(id, frequencia_minima_percent, media_minima) values(v_class, 75, 6);
  insert into public.periodos_letivos(id, turma_id) values(v_period, v_class);
  insert into public.disciplinas(id, carga_horaria_estagio) values(v_subject, 0);
  insert into public.turmas_disciplinas(turma_id, disciplina_id, periodo_letivo_id, concluida, instrumentos_avaliativos)
    values(v_class, v_subject, v_period, true, v_config);
  insert into public.matriculas(id, turma_id, aluno_id, status) values(v_enrollment, v_class, v_student, 'ATIVO');
  insert into public.aulas_turma(id, turma_id, disciplina_id, data_aula, carga_horaria)
    values(v_lesson, v_class, v_subject, current_date, 4);
  insert into public.diario_frequencia(turma_id, disciplina_id, aluno_id, aula_id, status)
    values(v_class, v_subject, v_student, v_lesson, 'P');
  insert into public.diario_notas(turma_id, disciplina_id, aluno_id, nota_p, nota_ti)
    values(v_class, v_subject, v_student, 5, 4.5);
  select * into strict v_result from public.v_diario_notas_resultados
    where turma_id = v_class and disciplina_id = v_subject and aluno_id = v_student;
  assert v_result.nota_o is null and v_result.media_parcial = 9.5 and v_result.media_final = 9.5;
  assert v_result.resultado_final = 'APROVADO';
  v_pending := internal_academic.p1_get_pendencias_fechamento_periodo_20260719(v_period);
  assert (v_pending->>'lancamentosDeNotaPendentes')::integer = 0 and (v_pending->>'podeFechar')::boolean,
    'Period closure must agree with the optional-O canonical result';
  assert (select nota_o is null from public.diario_notas where turma_id = v_class),
    'Computing results must never write a fabricated zero';

  update public.diario_notas set nota_ti = null where turma_id = v_class;
  v_pending := internal_academic.p1_get_pendencias_fechamento_periodo_20260719(v_period);
  assert (v_pending->>'lancamentosDeNotaPendentes')::integer = 1 and not (v_pending->>'podeFechar')::boolean;
  update public.diario_notas set nota_ti = 4.5 where turma_id = v_class;
  update public.turmas_disciplinas set instrumentos_avaliativos = v_only_o where turma_id = v_class;
  v_pending := internal_academic.p1_get_pendencias_fechamento_periodo_20260719(v_period);
  assert (v_pending->>'lancamentosDeNotaPendentes')::integer = 1 and not (v_pending->>'podeFechar')::boolean;
  update public.diario_notas set nota_o = 0 where turma_id = v_class;
  v_pending := internal_academic.p1_get_pendencias_fechamento_periodo_20260719(v_period);
  assert (v_pending->>'lancamentosDeNotaPendentes')::integer = 0;
  assert (v_pending->>'recuperacoesPendentes')::integer = 1 and not (v_pending->>'podeFechar')::boolean;

  update public.turmas_disciplinas set instrumentos_avaliativos = v_config where turma_id = v_class;
  update public.diario_notas set nota_p = 1, nota_ti = 1, nota_o = null, nota_rec = 9.05 where turma_id = v_class;
  select * into strict v_result from public.v_diario_notas_resultados where turma_id = v_class;
  assert v_result.media_parcial = 2 and v_result.media_final = 9.05,
    'The legacy view must preserve recovery precision as well';
  update public.diario_notas set nota_rec = null where turma_id = v_class;
  v_pending := internal_academic.p1_get_pendencias_fechamento_periodo_20260719(v_period);
  assert (v_pending->>'recuperacoesPendentes')::integer = 1 and not (v_pending->>'podeFechar')::boolean;
  update public.diario_notas set nota_p = 5, nota_ti = 4.5 where turma_id = v_class;

  delete from public.diario_frequencia where turma_id = v_class;
  v_pending := internal_academic.p1_get_pendencias_fechamento_periodo_20260719(v_period);
  assert (v_pending->>'frequenciasPendentes')::integer = 1 and not (v_pending->>'podeFechar')::boolean;
  insert into public.diario_frequencia(turma_id, disciplina_id, aluno_id, aula_id, status)
    values(v_class, v_subject, v_student, v_lesson, 'P');
  update public.turmas_disciplinas set concluida = false where turma_id = v_class;
  v_pending := internal_academic.p1_get_pendencias_fechamento_periodo_20260719(v_period);
  assert (v_pending->>'disciplinasNaoConcluidas')::integer = 1 and not (v_pending->>'podeFechar')::boolean;
  update public.turmas_disciplinas set concluida = true where turma_id = v_class;
  update public.disciplinas set carga_horaria_estagio = 1 where id = v_subject;
  v_pending := internal_academic.p1_get_pendencias_fechamento_periodo_20260719(v_period);
  assert (v_pending->>'avaliacoesEstagioPendentes')::integer = 1 and not (v_pending->>'podeFechar')::boolean;

  delete from public.diario_notas where turma_id = v_class;
  delete from public.diario_frequencia where turma_id = v_class;
  insert into public.matricula_aproveitamentos(matricula_id, disciplina_id) values(v_enrollment, v_subject);
  v_pending := internal_academic.p1_get_pendencias_fechamento_periodo_20260719(v_period);
  assert (v_pending->>'lancamentosDeNotaPendentes')::integer = 0;
  assert (v_pending->>'frequenciasPendentes')::integer = 0;
  assert (v_pending->>'avaliacoesEstagioPendentes')::integer = 0 and (v_pending->>'podeFechar')::boolean,
    'Existing transfer-credit exceptions must remain unchanged';

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  v_pending := internal_academic.p1_get_pendencias_fechamento_periodo_20260719(v_period);
  assert not (v_pending->>'podeFechar')::boolean and (v_pending->>'lancamentosDeNotaPendentes')::integer = 0,
    'Unauthorized callers must not acquire period access';
end;
$test$;
set constraints all immediate;
rollback;
