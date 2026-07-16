export const parceirosQueryKeys = {
  root: ['parceiros'] as const,
  all: ['parceiros', 'cadastros'] as const,
  list: (poloId?: string | null, includeGlobal?: boolean) => [
    'parceiros',
    'cadastros',
    'todos',
    poloId || 'todos',
    includeGlobal ? 'global' : 'local',
  ] as const,
  detail: (id: string) => ['parceiro', id] as const,
  availableClasses: ['parceiros', 'turmas-disponiveis'] as const,
  turmasDisponiveis: (poloId?: string | null) => [
    'parceiros',
    'turmas-disponiveis',
    poloId || 'todos',
  ] as const,
  matriculas: ['parceiro'] as const,
};
