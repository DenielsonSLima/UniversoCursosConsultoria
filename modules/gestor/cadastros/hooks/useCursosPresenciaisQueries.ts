import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Curso } from '../cadastros.types';

export interface CursosPresenciaisQueryConfig {
  queryKeys: {
    all: readonly unknown[];
    list: () => readonly unknown[];
  };
  getCursos: () => Promise<Curso[]>;
  staleTime?: number;
}

export function useCursosPresenciaisQueries(config: CursosPresenciaisQueryConfig) {
  const queryClient = useQueryClient();

  const cursosQuery = useQuery({
    queryKey: config.queryKeys.list(),
    queryFn: config.getCursos,
    staleTime: config.staleTime ?? 15000,
  });

  const invalidateCursos = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: config.queryKeys.all });
  }, [config.queryKeys.all, queryClient]);

  return {
    cursosQuery,
    invalidateCursos,
  };
}
