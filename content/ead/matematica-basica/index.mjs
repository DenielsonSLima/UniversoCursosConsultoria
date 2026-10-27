import { sources } from './sources.mjs';
import { lesson01 } from './lesson-01.mjs';
import { lesson02 } from './lesson-02.mjs';
import { lesson03 } from './lesson-03.mjs';
import { lesson04 } from './lesson-04.mjs';
import { lesson05 } from './lesson-05.mjs';
import { activities, exam } from './assessments.mjs';

export const courseRevision = {
  revisionId: 'mb-20261027',
  courseName: 'Matemática Básica',
  hours: 80,
  audience: 'Estudantes que desejam reforçar operações, frações, porcentagens e geometria.',
  objectives: [
    'Resolver problemas com as quatro operações, números decimais e prioridade de cálculo.',
    'Comparar frações e calcular operações e partes de uma quantidade.',
    'Aplicar proporções, descontos, acréscimos e cálculo do total por porcentagem.',
    'Calcular ângulos, perímetros e áreas, distinguindo unidades de comprimento e superfície.',
    'Interpretar frequências, medidas estatísticas e probabilidades simples.',
  ],
  sources,
  lessons: [lesson01, lesson02, lesson03, lesson04, lesson05],
  activities,
  exam,
};

export const matematicaBasicaRevision = courseRevision;
export default courseRevision;
