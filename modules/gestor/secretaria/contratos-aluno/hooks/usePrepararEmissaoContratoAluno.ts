import { useMutation, useQueryClient } from '@tanstack/react-query';
import { contratosAlunoKeys } from '../contratos-aluno.keys';
import { contratosAlunoService } from '../services/contratos-aluno.service';
import type { ContratoAlunoPreparationInput } from '../types/contratos-aluno.types';

export const usePrepararEmissaoContratoAluno = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ContratoAlunoPreparationInput) => contratosAlunoService.prepararEmissao(input),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({
        queryKey: contratosAlunoKeys.workspace(input.poloId),
        exact: true,
      });
    },
  });
};
