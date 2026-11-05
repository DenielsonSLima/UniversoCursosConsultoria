import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { eadTurmaKeys } from '../ead-turma.keys';
import { eadTurmaService } from '../ead-turma.service';
import { AlunoDisponivel } from '../ead-turma.types';
import type { PublicCheckoutResult } from '../../../../../asaas/checkout-result';

export const useTurmaEadInvalidation = (turmaId: string) => {
  const queryClient = useQueryClient();

  return useCallback(() => {
    queryClient.invalidateQueries({ queryKey: eadTurmaKeys.turma(turmaId) });
  }, [queryClient, turmaId]);
};

export const useMatricularAlunoEadMutation = (
  turmaId: string,
  cursoId: string,
  alunosDisponiveis: AlunoDisponivel[],
  callbacks: {
    onSuccess: (alunoNome: string, result: PublicCheckoutResult) => void;
    onError: (error: any) => void;
  },
) => {
  const invalidateTurma = useTurmaEadInvalidation(turmaId);

  return useMutation({
    mutationFn: (alunoId: string) => eadTurmaService.matricularAlunoComCobranca(turmaId, cursoId, alunoId),
    onSuccess: (result, alunoId) => {
      const alunoSelecionado = alunosDisponiveis.find((item) => item.id === alunoId);
      callbacks.onSuccess(alunoSelecionado?.nome || 'Aluno', result);
      invalidateTurma();
    },
    onError: (error) => {
      invalidateTurma();
      callbacks.onError(error);
    },
  });
};
