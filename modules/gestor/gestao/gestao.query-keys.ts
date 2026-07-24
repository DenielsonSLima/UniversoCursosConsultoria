import type { Turma, TurmasPageFilters } from './gestao.types';

export const gestaoQueryKeys = {
  all: ['gestao'] as const,
  summaries: () => ['gestao', 'resumos'] as const,
  summary: (poloId?: string) => ['gestao', 'resumos', poloId || 'matriz-global'] as const,
  activeClassesRoot: () => ['gestao', 'resumo-active-classes'] as const,
  activeClasses: (poloId?: string) => ['gestao', 'resumo-active-classes', poloId || 'todos'] as const,
  courses: () => ['gestao', 'cursos'] as const,
  coursesByModality: (modalidade: Turma['modalidade']) => ['gestao', 'cursos', modalidade] as const,
  classes: () => ['gestao', 'turmas'] as const,
  classesByModality: (modalidade: Turma['modalidade']) => ['gestao', 'turmas', modalidade] as const,
  classPage: (filters: TurmasPageFilters) => [
    'gestao',
    'turmas',
    filters.modalidade,
    {
      poloId: filters.poloId || 'todos',
      status: filters.status,
      sortBy: filters.sortBy || 'NOME_ASC',
      search: filters.search || '',
      dataInicial: filters.dataInicial || '',
      dataFinal: filters.dataFinal || '',
      page: filters.page,
      pageSize: filters.pageSize,
    },
  ] as const,
};
