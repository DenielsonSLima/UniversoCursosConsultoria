// Revisão de vínculo: aulas, itens, gabaritos e identificadores são preservados.
// null em aulaId significa campo ausente; não criar uma segunda referência.
export const alignmentPatches = [
  {
    courseId: 'd23b8764-3090-42f1-bc9d-00646f92a8ff',
    courseName: 'Merendeira Escolar', hours: 100,
    expectedConfigHash: 'e961df17e28b40cbe0b24aa9aa16c005',
    activities: [
      { activityId: 'mer-atv-2',
        expected: { aulaId: null, etapaId: 'mer-etapa-4' },
        next: { aulaId: null, etapaId: 'mer-etapa-3' } },
      { activityId: 'mer-atv-3',
        expected: { aulaId: null, etapaId: 'mer-etapa-6' },
        next: { aulaId: null, etapaId: 'mer-etapa-5' } },
      { activityId: 'mer-atv-4',
        expected: { aulaId: null, etapaId: 'mer-etapa-8' },
        next: { aulaId: null, etapaId: 'mer-etapa-7' } },
    ],
  },
  {
    courseId: '213648cd-460e-4bbb-b5eb-24b19333c481',
    courseName: 'Serviços Gerais', hours: 90,
    expectedConfigHash: '85f9c641af30380ad8d499e394c45f11',
    activities: [
      { activityId: 'atividade-3',
        expected: { aulaId: 'aula-6', etapaId: 'aula-6' },
        next: { aulaId: 'aula-5', etapaId: 'aula-5' } },
    ],
  },
  {
    courseId: '1b776094-6a58-4ecf-8f8b-94951f88cf8b',
    courseName: 'Vigia', hours: 80,
    expectedConfigHash: '6de3ae5c432aa029de560b1161fb6136',
    activities: [
      { activityId: 'atividade-1',
        expected: { aulaId: 'aula-2', etapaId: 'aula-2' },
        next: { aulaId: 'aula-1', etapaId: 'aula-1' } },
      { activityId: 'atividade-3',
        expected: { aulaId: 'aula-6', etapaId: 'aula-6' },
        next: { aulaId: 'aula-5', etapaId: 'aula-5' } },
      { activityId: 'atividade-4',
        expected: { aulaId: 'aula-8', etapaId: 'aula-8' },
        next: { aulaId: 'aula-7', etapaId: 'aula-7' } },
    ],
  },
];

export default alignmentPatches;
