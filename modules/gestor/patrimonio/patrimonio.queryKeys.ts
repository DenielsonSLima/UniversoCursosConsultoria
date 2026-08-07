import type { PatrimonioListFilters } from './patrimonio.types';

export const patrimonioQueryKeys = {
  all: ['patrimonio'] as const,
  listRoot: ['patrimonio', 'list'] as const,
  list: (filters: PatrimonioListFilters) => ['patrimonio', 'list', filters] as const,
};
