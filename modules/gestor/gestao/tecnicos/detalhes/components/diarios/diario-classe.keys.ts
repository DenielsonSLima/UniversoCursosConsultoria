export const diarioClasseKeys = {
  template: (cursoId: string) => ['diario-template', cursoId] as const,
  students: (turmaId: string, disciplinaId: string, accessMode: 'GESTOR' | 'PROFESSOR') =>
    ['diario-alunos', turmaId, disciplinaId, accessMode] as const,
  aulasByTurma: (turmaId: string) => ['diario-aulas', turmaId] as const,
  aulas: (turmaId: string, disciplinaId: string) => ['diario-aulas', turmaId, disciplinaId] as const,
  frequencia: (turmaId: string, disciplinaId: string) => ['diario-frequencia', turmaId, disciplinaId] as const,
  resultadosByTurma: (turmaId: string) => ['diario-notas-resultados', turmaId] as const,
  resultados: (turmaId: string, disciplinaId: string) => ['diario-notas-resultados', turmaId, disciplinaId] as const,
  instruments: (turmaId: string, disciplinaId: string) =>
    ['diario-instruments', turmaId, disciplinaId] as const,
  praticasByTurma: (turmaId: string) => ['diario-praticas', turmaId] as const,
  praticas: (turmaId: string, disciplinaId: string) => ['diario-praticas', turmaId, disciplinaId] as const,
  observacoes: (turmaId: string, disciplinaId: string) => ['diario-observacoes', turmaId, disciplinaId] as const,
  fechamento: (turmaId: string, disciplinaId: string) => ['diario-fechamento', turmaId, disciplinaId] as const,
};
