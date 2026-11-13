import { useEffect } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { eadTurmaKeys } from '../ead-turma.keys';
import { eadTurmaService } from '../ead-turma.service';

export const useTurmaEadResumo = (turmaId: string) => useQuery({
  queryKey: eadTurmaKeys.resumo(turmaId),
  queryFn: () => eadTurmaService.getResumo(turmaId),
});

const useCancelRestrictedRead = (turmaId: string, kind: 'alunos' | 'trust-access', enabled: boolean) => {
  const queryClient = useQueryClient();
  useEffect(() => {
    const queryKey = kind === 'alunos' ? eadTurmaKeys.alunos(turmaId) : eadTurmaKeys.trustAccess(turmaId);
    const cancel = () => { void queryClient.cancelQueries({ queryKey, exact: true }, { silent: true }); };
    if (!enabled) { cancel(); queryClient.removeQueries({ queryKey, exact: true }); }
    return cancel;
  }, [enabled, kind, queryClient, turmaId]);
};

export const useTurmaEadAlunos = (turmaId: string, enabled = true) => {
  useCancelRestrictedRead(turmaId, 'alunos', enabled);
  return useQuery({ queryKey: eadTurmaKeys.alunos(turmaId),
    queryFn: ({ signal }) => eadTurmaService.getAlunos(turmaId, signal), enabled });
};

export const useTurmaEadTrustAccess = (turmaId: string, enabled: boolean) => {
  useCancelRestrictedRead(turmaId, 'trust-access', enabled);
  return useQuery({ queryKey: eadTurmaKeys.trustAccess(turmaId),
    queryFn: ({ signal }) => eadTurmaService.getTrustAccess(turmaId, signal), enabled,
    retry: false, gcTime: 0, refetchOnMount: 'always' });
};

export const useTurmaEadAlunosDisponiveis = (
  turmaId: string,
  search: string,
  enabled: boolean,
) => useQuery({
  queryKey: eadTurmaKeys.alunosDisponiveis(turmaId, search.trim()),
  queryFn: () => eadTurmaService.getAlunosDisponiveis(turmaId, search.trim()),
  enabled,
  placeholderData: keepPreviousData,
  staleTime: 30_000,
  refetchOnWindowFocus: false,
});

export const useTurmaEadPagamentos = (turmaId: string, enabled = true) => useQuery({
  queryKey: eadTurmaKeys.pagamentos(turmaId),
  queryFn: () => eadTurmaService.getPagamentos(turmaId),
  enabled,
});
