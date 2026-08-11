import type { PatrimonioListFilters } from './patrimonio.types';

export const patrimonioQueryKeys = {
  all: ['patrimonio'] as const,
  listRoot: ['patrimonio', 'list'] as const,
  list: (filters: PatrimonioListFilters) => ['patrimonio', 'list', filters] as const,
  export: (poloId: string) => ['patrimonio', 'export', poloId] as const,
  detailRoot: ['patrimonio', 'detail'] as const,
  detail: (id: string) => ['patrimonio', 'detail', id] as const,
};
