// Builds a read-only SELECT from the actual migration body, without changing any table.
export function buildTransferClosingFixture(migration, options = {}) {
  const { credit = 'same', diaryComplete = false, stageHours = 0 } = options;
  const bodyMatch = migration.match(/as \$function\$([\s\S]*?)\$function\$/i);
  if (!bodyMatch) throw new Error('Closing function body missing.');
  let body = bodyMatch[1].trim().replace(/;$/, '');
  const tables = ['periodos_letivos', 'turmas', 'turmas_disciplinas', 'disciplinas',
    'matriculas', 'aulas_turma', 'diario_notas', 'diario_frequencia', 'matriculas_estagios', 'matricula_aproveitamentos'];
  for (const table of tables) body = body.replaceAll(`public.${table}`, `fixture_${table}`);
  body = body.replaceAll("coalesce((select auth.role()), '') = 'service_role'", 'true')
    .replaceAll('public.can_write_turma(p.turma_id)', 'true')
    .replaceAll('p_periodo_letivo_id', "'p1'")
    .replace(/public\.get_diario_resultados\(\s*dp\.turma_id,\s*dp\.disciplina_id\s*\)/g,
      '(select * from fixture_resultados)');
  if (/public\.|auth\.|internal_academic\./.test(body)) throw new Error('Fixture contains a real table/function access.');
  const whereEmpty = diaryComplete ? '' : ' where false';
  const creditMatricula = credit === 'other-student' ? 'm2' : 'm1';
  const creditDiscipline = credit === 'other-discipline' ? 'd2' : 'd1';
  return `with fixture_periodos_letivos(id,turma_id) as (values ('p1','t1')),
fixture_turmas(id,frequencia_minima_percent,media_minima) as (values ('t1',75::numeric,7::numeric)),
fixture_turmas_disciplinas(turma_id,disciplina_id,instrumentos_avaliativos,concluida,periodo_letivo_id) as (values ('t1','d1','{}'::jsonb,true,'p1')),
fixture_disciplinas(id,carga_horaria_estagio) as (values ('d1',${stageHours})),
fixture_matriculas(id,aluno_id,turma_id,status) as (values ('m1','a1','t1','ATIVO')),
fixture_aulas_turma(id,turma_id,disciplina_id) as (values ('l1','t1','d1')),
fixture_diario_notas(turma_id,aluno_id,disciplina_id,nota_p,nota_ti,nota_tg,nota_s,nota_cq,nota_o) as (select 't1','a1','d1',8::numeric,8::numeric,8::numeric,8::numeric,0::numeric,0::numeric${whereEmpty}),
fixture_diario_frequencia(turma_id,disciplina_id,aula_id,aluno_id,status) as (select 't1','d1','l1','a1','P'${whereEmpty}),
fixture_matriculas_estagios(turma_id,disciplina_id,aluno_id,nota_final,frequencia_estagio) as (select 't1','d1','a1',8::numeric,90::numeric${whereEmpty}),
fixture_matricula_aproveitamentos(matricula_id,disciplina_id) as (select '${creditMatricula}','${creditDiscipline}'${credit === 'none' ? ' where false' : ''}),
fixture_resultados(aluno_id,disciplina_id,resultado_final) as (values ('a1','d1','${credit === 'same' ? 'APROVEITADO' : 'APROVADO'}')),
${body.replace(/^with /i, '')}`;
}

export const transferClosingScenarios = [
  { name: 'credited', options: { credit: 'same' }, expected: { notas: 0, frequencias: 0, estagio: 0, podeFechar: true } },
  { name: 'credited_stage', options: { credit: 'same', stageHours: 10 }, expected: { notas: 0, frequencias: 0, estagio: 0, podeFechar: true } },
  { name: 'regular_missing', options: { credit: 'none', stageHours: 10 }, expected: { notas: 1, frequencias: 1, estagio: 1, podeFechar: false } },
  { name: 'other_student_credit', options: { credit: 'other-student' }, expected: { notas: 1, frequencias: 1, estagio: 0, podeFechar: false } },
  { name: 'other_discipline_credit', options: { credit: 'other-discipline' }, expected: { notas: 1, frequencias: 1, estagio: 0, podeFechar: false } },
  { name: 'regular_complete', options: { credit: 'none', diaryComplete: true, stageHours: 10 }, expected: { notas: 0, frequencias: 0, estagio: 0, podeFechar: true } },
];
