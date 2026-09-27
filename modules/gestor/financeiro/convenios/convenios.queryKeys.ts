import type { ConvenioStatusScope } from './convenios.types';

const scopeKey = (poloId?: string | null) => poloId || 'sem-polo';

export const conveniosQueryKeys = {
  all: ['financeiro', 'convenios'] as const,
  lists: ['financeiro', 'convenios', 'listas'] as const,
  listForPolo: (poloId?: string | null) => [
    'financeiro',
    'convenios',
    'listas',
    scopeKey(poloId),
  ] as const,
  list: (poloId: string, status: ConvenioStatusScope, search: string) => [
    ...conveniosQueryKeys.listForPolo(poloId),
    status,
    search,
  ] as const,
  details: ['financeiro', 'convenios', 'detalhes'] as const,
  detailsForPolo: (poloId?: string | null) => [
    'financeiro',
    'convenios',
    'detalhes',
    scopeKey(poloId),
  ] as const,
  detail: (poloId: string, competenciaId: string) => [
    ...conveniosQueryKeys.detailsForPolo(poloId),
    competenciaId,
  ] as const,
  openOptions: (poloId?: string | null) => [
    'financeiro',
    'convenios',
    'opcoes-abertas',
    scopeKey(poloId),
  ] as const,
};
