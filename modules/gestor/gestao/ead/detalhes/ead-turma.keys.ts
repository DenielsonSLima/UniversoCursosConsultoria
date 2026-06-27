export const eadTurmaKeys = {
  all: ['gestao-ead-turma'] as const,
  turma: (turmaId: string) => [...eadTurmaKeys.all, turmaId] as const,
  resumo: (turmaId: string) => [...eadTurmaKeys.turma(turmaId), 'resumo'] as const,
  alunos: (turmaId: string) => [...eadTurmaKeys.turma(turmaId), 'alunos'] as const,
  alunosDisponiveis: (turmaId: string, search: string) =>
    [...eadTurmaKeys.turma(turmaId), 'alunos-disponiveis', search] as const,
  pagamentos: (turmaId: string) => [...eadTurmaKeys.turma(turmaId), 'pagamentos'] as const,
};
