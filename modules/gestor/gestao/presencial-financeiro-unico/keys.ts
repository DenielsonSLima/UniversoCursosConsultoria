export const planoFinanceiroUnicoKeys = {
  turma: (turmaId: string) => ['turma-plano-financeiro-unico', turmaId] as const,
  alunos: (turmaId: string) => ['turma-plano-financeiro-unico', turmaId, 'alunos'] as const,
  pendencias: (turmaId: string) => ['turma-plano-financeiro-unico', turmaId, 'pendencias'] as const,
  codigo: (turmaId: string) => ['turma-plano-financeiro-unico', turmaId, 'codigo-condicao'] as const,
  previaCondicao: (turmaId: string, alunoId: string, ajuste: string) => (
    ['turma-plano-financeiro-unico', turmaId, 'previa-condicao', alunoId, ajuste] as const
  ),
};
