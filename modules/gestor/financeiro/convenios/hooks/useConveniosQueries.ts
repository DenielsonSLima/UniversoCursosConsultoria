import { useQuery } from '@tanstack/react-query';
import { conveniosQueryKeys } from '../convenios.queryKeys';
import { conveniosService } from '../convenios.service';
import type { ConvenioStatusScope } from '../convenios.types';

export const useConveniosListQuery = (
  poloId: string,
  status: ConvenioStatusScope,
  search: string,
) => useQuery({
  queryKey: conveniosQueryKeys.list(poloId, status, search),
  queryFn: ({ signal }) => conveniosService.listar(poloId, status, search, signal),
  enabled: Boolean(poloId),
  staleTime: 15_000,
  gcTime: 30 * 60_000,
});

export const useConvenioDetailQuery = (
  poloId: string,
  competenciaId?: string | null,
) => useQuery({
  queryKey: conveniosQueryKeys.detail(poloId, competenciaId || 'sem-competencia'),
  queryFn: ({ signal }) => conveniosService.obterDetalhe(competenciaId!, signal),
  enabled: Boolean(poloId && competenciaId),
  staleTime: 15_000,
  gcTime: 30 * 60_000,
});
