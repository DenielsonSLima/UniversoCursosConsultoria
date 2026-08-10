import assert from 'node:assert/strict';
import test from 'node:test';

import type { PlanoCursoAula } from '../../shared/plano-curso/plano-curso.types';
import {
  expandPlanoCursoConteudosByDay,
  groupPlanoCursoAulasByDay,
  paginatePlanoCursoDays,
} from './plano-curso-day-editor';

const aula = (
  aulaId: string,
  dataAula: string,
  sessao: string,
  titulo: string,
  conteudo = '',
): PlanoCursoAula => ({
  aulaId,
  dataAula,
  dataExibicao: dataAula.split('-').reverse().join('/'),
  sessao,
  titulo,
  cargaHoraria: 4,
  horaInicio: sessao === 'M' ? '08:00' : '13:00',
  horaFim: sessao === 'M' ? '12:00' : '17:00',
  conteudo,
});

test('agrupa manhã e tarde em um único dia sem duplicar títulos ou conteúdos', () => {
  const groups = groupPlanoCursoAulasByDay([
    aula('aula-1', '2026-08-10', 'M', 'Anatomia aplicada', 'Sistema muscular'),
    aula('aula-2', '2026-08-10', 'T', 'Anatomia aplicada', 'Sistema muscular'),
    aula('aula-3', '2026-08-11', 'M', 'Sistema respiratório'),
  ]);

  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0], {
    dataAula: '2026-08-10',
    dataExibicao: '10/08/2026',
    aulaIds: ['aula-1', 'aula-2'],
    titulos: ['Anatomia aplicada'],
    conteudo: 'Sistema muscular',
    possuiConteudosDivergentes: false,
  });
});

test('reúne conteúdos legados divergentes sem alterá-los enquanto o dia não for editado', () => {
  const aulas = [
    aula('aula-1', '2026-08-10', 'M', 'Fundamentos', 'Conteúdo da manhã'),
    aula('aula-2', '2026-08-10', 'T', 'Prática', 'Conteúdo da tarde'),
  ];
  const [group] = groupPlanoCursoAulasByDay(aulas);

  assert.equal(group.possuiConteudosDivergentes, true);
  assert.equal(group.conteudo, 'Conteúdo da manhã\n\nConteúdo da tarde');
  assert.deepEqual(
    expandPlanoCursoConteudosByDay(
      aulas,
      { '2026-08-10': group.conteudo },
      new Set(),
    ),
    [
      { aulaId: 'aula-1', conteudo: 'Conteúdo da manhã' },
      { aulaId: 'aula-2', conteudo: 'Conteúdo da tarde' },
    ],
  );
});

test('expande a edição diária para todas as aulas canônicas da data e remove o dia vazio', () => {
  const aulas = [
    aula('aula-1', '2026-08-10', 'M', 'Fundamentos'),
    aula('aula-2', '2026-08-10', 'T', 'Prática'),
    aula('aula-3', '2026-08-11', 'M', 'Avaliação', 'Texto anterior'),
  ];

  assert.deepEqual(
    expandPlanoCursoConteudosByDay(
      aulas,
      { '2026-08-10': 'Conteúdo único do dia', '2026-08-11': '' },
      new Set(['2026-08-10', '2026-08-11']),
    ),
    [
      { aulaId: 'aula-1', conteudo: 'Conteúdo único do dia' },
      { aulaId: 'aula-2', conteudo: 'Conteúdo único do dia' },
    ],
  );
});

test('divide os dias em páginas de continuação sem perder ordem ou conteúdo', () => {
  const days = groupPlanoCursoAulasByDay(Array.from({ length: 10 }, (_, index) => (
    aula(
      `aula-${index + 1}`,
      `2026-08-${String(index + 1).padStart(2, '0')}`,
      'M',
      `Conteúdo ${index + 1}`,
    )
  )));

  const pages = paginatePlanoCursoDays(days);

  assert.deepEqual(pages.map((page) => page.length), [3, 3, 3, 1]);
  assert.deepEqual(
    pages.flat().map((day) => day.dataAula),
    days.map((day) => day.dataAula),
  );
});

test('recusa paginação com quantidade inválida de dias', () => {
  assert.throws(() => paginatePlanoCursoDays([], 0), /inteiro positivo/);
});
