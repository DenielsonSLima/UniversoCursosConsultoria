import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { academicLifecycleKeys } from '../../tecnicos/detalhes/academic-lifecycle.keys';
import { planoFinanceiroUnicoKeys } from '../keys';
import { planoFinanceiroUnicoService } from '../presencial-financeiro-unico.service';

export const usePlanoFinanceiroUnicoWorkspace = (turmaId: string, enabled = true) => useQuery({
  queryKey: planoFinanceiroUnicoKeys.turma(turmaId),
  queryFn: () => planoFinanceiroUnicoService.getWorkspace(turmaId),
  enabled: enabled && Boolean(turmaId),
  staleTime: 30_000,
  gcTime: 15 * 60_000,
  retry: 1,
});

export const useMatricularAlunoPlanoFinanceiroUnico = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: planoFinanceiroUnicoService.matricularAlunoGerarParcelas,
    onSuccess: async (_result, input) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: planoFinanceiroUnicoKeys.turma(input.turmaId) }),
        queryClient.invalidateQueries({ queryKey: planoFinanceiroUnicoKeys.alunos(input.turmaId) }),
        queryClient.invalidateQueries({ queryKey: academicLifecycleKeys.alunos(input.turmaId) }),
        queryClient.invalidateQueries({ queryKey: academicLifecycleKeys.movimentacoes(input.turmaId) }),
        queryClient.invalidateQueries({ queryKey: ['turma-financeiro', input.turmaId] }),
        queryClient.invalidateQueries({ queryKey: ['financeiro-alunos', input.turmaId] }),
      ]);
    },
  });
};

export const useTurmasDestinoPlanoFinanceiroUnico = (turmaId: string, enabled: boolean) => useQuery({
  queryKey: [...planoFinanceiroUnicoKeys.turma(turmaId), 'destinos'],
  queryFn: () => planoFinanceiroUnicoService.getDestinationClasses(turmaId),
  enabled: enabled && Boolean(turmaId),
  staleTime: 30_000,
});
