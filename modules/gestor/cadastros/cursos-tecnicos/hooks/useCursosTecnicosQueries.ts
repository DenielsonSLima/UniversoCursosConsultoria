import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cursosTecnicosQueryKeys, cursosTecnicosService } from '../cursos-tecnicos.service';

export function useCursosTecnicosQueries() {
  const queryClient = useQueryClient();

  const cursosQuery = useQuery({
    queryKey: cursosTecnicosQueryKeys.list(),
    queryFn: cursosTecnicosService.getCursos,
    staleTime: 15000
  });

  const invalidateCursosTecnicos = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: cursosTecnicosQueryKeys.all });
  }, [queryClient]);

  return {
    cursosQuery,
    invalidateCursosTecnicos
  };
}
