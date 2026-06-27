import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { eadTurmaKeys } from '../ead-turma.keys';
import { eadTurmaService } from '../ead-turma.service';
import { AlunoDisponivel } from '../ead-turma.types';

export const useTurmaEadInvalidation = (turmaId: string) => {
  const queryClient = useQueryClient();

  return useCallback(() => {
    queryClient.invalidateQueries({ queryKey: eadTurmaKeys.turma(turmaId) });
  }, [queryClient, turmaId]);
};

export const useLiberarMatriculaEadMutation = (
  turmaId: string,
  onError?: (error: any) => void,
) => {
  const invalidateTurma = useTurmaEadInvalidation(turmaId);

  return useMutation({
    mutationFn: (matriculaId: string) => eadTurmaService.liberarMatricula(matriculaId),
    onSuccess: invalidateTurma,
    onError,
  });
};

export const useMatricularAlunoEadMutation = (
  turmaId: string,
  alunosDisponiveis: AlunoDisponivel[],
  callbacks: {
    onSuccess: (alunoNome: string) => void;
    onError: (error: any) => void;
  },
) => {
  const invalidateTurma = useTurmaEadInvalidation(turmaId);

  return useMutation({
    mutationFn: (alunoId: string) => eadTurmaService.matricularAlunoManual(turmaId, alunoId),
    onSuccess: (_result, alunoId) => {
      const alunoSelecionado = alunosDisponiveis.find((item) => item.id === alunoId);
      callbacks.onSuccess(alunoSelecionado?.nome || 'Aluno');
      invalidateTurma();
    },
    onError: callbacks.onError,
  });
};
