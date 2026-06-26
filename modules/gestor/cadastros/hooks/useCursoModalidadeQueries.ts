import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CursoCadastroModalidade,
  cursoModalidadeQueryKeys,
  cursoModalidadeService
} from '../curso-modalidade.service';

export function useCursoModalidadeQueries(modalidade: CursoCadastroModalidade) {
  const queryClient = useQueryClient();

  const cursosQuery = useQuery({
    queryKey: cursoModalidadeQueryKeys.list(modalidade),
    queryFn: () => cursoModalidadeService.getCursos(modalidade),
    staleTime: 15000
  });

  const invalidateCursosModalidade = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: cursoModalidadeQueryKeys.all(modalidade) });
  }, [modalidade, queryClient]);

  return {
    cursosQuery,
    invalidateCursosModalidade
  };
}
