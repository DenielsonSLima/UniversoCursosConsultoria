import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { eadTurmaKeys } from '../ead-turma.keys';
import { eadTurmaService } from '../ead-turma.service';
import { AlunoDisponivel } from '../ead-turma.types';
import type { EadEnrollmentInput, EadEnrollmentResult } from '../ead-enrollment.model';

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
  canManageEnrollment: boolean,
  canChooseFinancial: boolean,
  callbacks: {
    onSuccess: (alunoNome: string, result: EadEnrollmentResult) => void;
    onError: (error: any) => void;
  },
) => {
  const invalidateTurma = useTurmaEadInvalidation(turmaId);

  return useMutation({
    mutationFn: (input: EadEnrollmentInput) => {
      if (!canManageEnrollment) throw new Error('Acesso aos alunos da turma EAD obrigatório para adicionar alunos.');
      if (input.mode === 'SEM_COBRANCA' && !canChooseFinancial) {
        throw new Error('Acesso ao Financeiro obrigatório para adicionar sem cobrança.');
      }
      return eadTurmaService.adicionarAluno(turmaId, cursoId, input);
    },
    onSuccess: (result, input) => {
      const alunoSelecionado = alunosDisponiveis.find((item) => item.id === input.alunoId);
      callbacks.onSuccess(alunoSelecionado?.nome || 'Aluno', result);
      invalidateTurma();
    },
    onError: (error) => {
      invalidateTurma();
      callbacks.onError(error);
    },
  });
};
