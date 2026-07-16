import { useQuery } from '@tanstack/react-query';
import { gestaoQueryKeys } from '../gestao.query-keys';
import { gestaoService } from '../gestao.service';
import type { Turma } from '../gestao.types';

export const useGestaoCursos = (modalidade: Turma['modalidade']) => useQuery({
  queryKey: gestaoQueryKeys.coursesByModality(modalidade),
  queryFn: () => gestaoService.getCursosByModalidade(modalidade),
  staleTime: Number.POSITIVE_INFINITY,
  gcTime: 30 * 60_000,
});
