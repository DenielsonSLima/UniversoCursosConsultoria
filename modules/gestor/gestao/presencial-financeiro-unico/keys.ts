export const planoFinanceiroUnicoKeys = {
  turma: (turmaId: string) => ['turma-plano-financeiro-unico', turmaId] as const,
  alunos: (turmaId: string) => ['turma-plano-financeiro-unico', turmaId, 'alunos'] as const,
};
