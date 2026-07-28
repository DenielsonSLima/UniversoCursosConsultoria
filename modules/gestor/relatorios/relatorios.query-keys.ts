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
};
