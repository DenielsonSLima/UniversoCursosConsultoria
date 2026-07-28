export const academicLifecycleKeys = {
  all: ['academic-lifecycle'] as const,
  turma: (turmaId: string) => [...academicLifecycleKeys.all, 'turma', turmaId] as const,
  alunos: (turmaId: string) => [...academicLifecycleKeys.turma(turmaId), 'alunos'] as const,
  alunosDisponiveis: (turmaId: string) => [...academicLifecycleKeys.alunos(turmaId), 'disponiveis'] as const,
  resumo: (turmaId: string) => [...academicLifecycleKeys.turma(turmaId), 'resumo'] as const,
  periodos: (turmaId: string) => [...academicLifecycleKeys.turma(turmaId), 'periodos'] as const,
  movimentacoes: (turmaId: string) => [...academicLifecycleKeys.turma(turmaId), 'movimentacoes'] as const,
  movimentacoesPagina: (turmaId: string, page: number, pageSize: number) =>
    [...academicLifecycleKeys.movimentacoes(turmaId), 'pagina', page, pageSize] as const,
  transferencias: (turmaId: string) => [...academicLifecycleKeys.turma(turmaId), 'transferencias'] as const,
  grade: (turmaId: string) => [...academicLifecycleKeys.turma(turmaId), 'grade'] as const,
  atividades: (turmaId: string) => [...academicLifecycleKeys.turma(turmaId), 'atividades'] as const,
  diarios: (turmaId: string) => [...academicLifecycleKeys.turma(turmaId), 'diarios'] as const,
  estagio: (
    turmaId: string,
    modo: 'GESTOR' | 'PROFESSOR' = 'GESTOR',
    disciplinaId = '',
  ) => [...academicLifecycleKeys.turma(turmaId), 'estagio', modo, disciplinaId] as const,
  estagioAvaliacoes: (turmaId: string, disciplinaId: string) =>
    [...academicLifecycleKeys.turma(turmaId), 'estagio-avaliacoes', disciplinaId] as const,
  avaliacaoEstagio: (criterios: unknown) => [...academicLifecycleKeys.all, 'avaliacao-estagio', criterios] as const,
  turmasDestino: (turmaId: string) => [...academicLifecycleKeys.turma(turmaId), 'turmas-destino'] as const,
  financeiroMatriculaConfig: (turmaId: string) => [...academicLifecycleKeys.turma(turmaId), 'financeiro-matricula-config'] as const,
};
