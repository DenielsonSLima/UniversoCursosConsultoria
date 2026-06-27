export const diarioClasseKeys = {
  template: (cursoId: string) => ['diario-template', cursoId] as const,
  students: (turmaId: string) => ['diario-alunos', turmaId] as const,
  aulas: (turmaId: string, disciplinaId: string) => ['diario-aulas', turmaId, disciplinaId] as const,
  frequencia: (turmaId: string, disciplinaId: string) => ['diario-frequencia', turmaId, disciplinaId] as const,
  resultados: (turmaId: string, disciplinaId: string) => ['diario-notas-resultados', turmaId, disciplinaId] as const,
  praticas: (turmaId: string, disciplinaId: string) => ['diario-praticas', turmaId, disciplinaId] as const,
  observacoes: (turmaId: string, disciplinaId: string) => ['diario-observacoes', turmaId, disciplinaId] as const,
};
