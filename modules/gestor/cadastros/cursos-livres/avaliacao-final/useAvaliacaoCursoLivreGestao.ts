import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import {
  avaliacaoCursoLivreGestaoService,
  createAvaliacaoCursoLivreRequestId,
} from './avaliacao-curso-livre.service';
import type { SalvarAvaliacaoCursoLivreInput } from './avaliacao-curso-livre.types';

export const avaliacaoCursoLivreGestaoKeys = {
  detail: (cursoId: string) => ['gestor', 'curso-livre', cursoId, 'avaliacao-final'] as const,
};

type SaveIntent = Omit<SalvarAvaliacaoCursoLivreInput, 'requestId'>;

export const useAvaliacaoCursoLivreGestao = (cursoId: string) => {
  const queryClient = useQueryClient();
  const requestIds = useRef(new Map<string, string>());
  const query = useQuery({
    queryKey: avaliacaoCursoLivreGestaoKeys.detail(cursoId),
    queryFn: () => avaliacaoCursoLivreGestaoService.obter(cursoId),
    enabled: Boolean(cursoId),
    staleTime: 30_000,
    retry: 1,
  });
  const mutation = useMutation({
    mutationFn: avaliacaoCursoLivreGestaoService.salvar,
    onSuccess: (workspace, input) => {
      queryClient.setQueryData(avaliacaoCursoLivreGestaoKeys.detail(input.cursoId), workspace);
      void queryClient.invalidateQueries({
        queryKey: avaliacaoCursoLivreGestaoKeys.detail(input.cursoId),
        exact: true,
      });
    },
  });

  const save = useCallback(async (intent: SaveIntent) => {
    const signature = JSON.stringify(intent);
    const requestId = requestIds.current.get(signature) || createAvaliacaoCursoLivreRequestId();
    requestIds.current.set(signature, requestId);
    const result = await mutation.mutateAsync({ ...intent, requestId });
    requestIds.current.delete(signature);
    return result;
  }, [mutation]);

  return { query, mutation, save };
};
