export const academicLifecycleKeys = {
  all: ['academic-lifecycle'] as const,
  turma: (turmaId: string) => [...academicLifecycleKeys.all, 'turma', turmaId] as const,
  alunos: (turmaId: string) => [...academicLifecycleKeys.turma(turmaId), 'alunos'] as const,
  resumo: (turmaId: string) => [...academicLifecycleKeys.turma(turmaId), 'resumo'] as const,
  periodos: (turmaId: string) => [...academicLifecycleKeys.turma(turmaId), 'periodos'] as const,
  movimentacoes: (turmaId: string) => [...academicLifecycleKeys.turma(turmaId), 'movimentacoes'] as const,
  transferencias: (turmaId: string) => [...academicLifecycleKeys.turma(turmaId), 'transferencias'] as const,
  diarios: (turmaId: string) => [...academicLifecycleKeys.turma(turmaId), 'diarios'] as const,
  avaliacaoEstagio: (criterios: unknown) => [...academicLifecycleKeys.all, 'avaliacao-estagio', criterios] as const,
  turmasDestino: (turmaId: string) => [...academicLifecycleKeys.turma(turmaId), 'turmas-destino'] as const,
};
