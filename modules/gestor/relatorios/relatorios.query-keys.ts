export type RelatoriosQueryFilters = object;

export const relatoriosKeys = {
  all: ['relatorios'] as const,
  matriculas: {
    all: () => [...relatoriosKeys.all, 'matriculas'] as const,
    lists: () => [...relatoriosKeys.matriculas.all(), 'list'] as const,
    list: (filters: RelatoriosQueryFilters) =>
      [...relatoriosKeys.matriculas.lists(), filters] as const,
    turmas: (poloId?: string | null, modalidade = 'todos') =>
      [...relatoriosKeys.matriculas.all(), 'turmas', poloId || 'todos', modalidade] as const,
  },
  censo: {
    all: () => [...relatoriosKeys.all, 'censo'] as const,
    matriculaInicial: () =>
      [...relatoriosKeys.censo.all(), 'matricula-inicial'] as const,
    readiness: (filters: RelatoriosQueryFilters) =>
      [...relatoriosKeys.censo.matriculaInicial(), 'readiness', filters] as const,
  },
  financeiro: {
    all: () => [...relatoriosKeys.all, 'movimentacao-financeira'] as const,
    report: (filters: RelatoriosQueryFilters) =>
      [...relatoriosKeys.financeiro.all(), filters] as const,
    fluxo: (filters: RelatoriosQueryFilters) =>
      [...relatoriosKeys.financeiro.all(), 'fluxo-caixa', filters] as const,
    inadimplencia: (filters: RelatoriosQueryFilters) =>
      [...relatoriosKeys.financeiro.all(), 'inadimplencia', filters] as const,
  },
};
