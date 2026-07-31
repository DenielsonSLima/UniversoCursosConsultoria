import { useMutation, useQueryClient } from '@tanstack/react-query';
import { diarioClasseKeys } from '../../../gestao/tecnicos/detalhes/components/diarios/diario-classe.keys';
import { financeiroQueryKeys } from '../../../financeiro/financeiro.queryKeys';
import { dependenciasAcademicasKeys } from '../dependencias-academicas.keys';
import { dependenciasAcademicasService } from '../dependencias-academicas.service';
import type {
  DependenciaCheckoutResult,
  DependenciaConfirmacao,
  DependenciaConfirmacaoInput,
  DependenciaPoliticaInput,
} from '../dependencias-academicas.types';

export class DependenciaCheckoutError extends Error {
  confirmation: DependenciaConfirmacao;

  constructor(message: string, confirmation: DependenciaConfirmacao) {
    super(message);
    this.name = 'DependenciaCheckoutError';
    this.confirmation = confirmation;
  }
}

const invalidateDestinationDiary = (
  queryClient: ReturnType<typeof useQueryClient>,
  turmaId: string | null,
  disciplinaId: string | null,
) => {
  if (!turmaId || !disciplinaId) return [];
  return [
    queryClient.invalidateQueries({
      queryKey: diarioClasseKeys.students(turmaId, disciplinaId, 'GESTOR'),
    }),
    queryClient.invalidateQueries({
      queryKey: diarioClasseKeys.students(turmaId, disciplinaId, 'PROFESSOR'),
    }),
    queryClient.invalidateQueries({
      queryKey: diarioClasseKeys.frequencia(turmaId, disciplinaId),
    }),
    queryClient.invalidateQueries({
      queryKey: diarioClasseKeys.resultados(turmaId, disciplinaId),
    }),
  ];
};

const useDependenciaMutationInvalidation = (poloId: string) => {
  const queryClient = useQueryClient();

  return async (result?: DependenciaConfirmacao | null) => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: dependenciasAcademicasKeys.workspace(poloId),
      }),
      queryClient.invalidateQueries({
        queryKey: dependenciasAcademicasKeys.ofertasRoot(poloId),
      }),
      queryClient.invalidateQueries({
        queryKey: dependenciasAcademicasKeys.recebiveis(poloId),
      }),
      queryClient.invalidateQueries({
        queryKey: financeiroQueryKeys.receivablesRoot,
      }),
      queryClient.invalidateQueries({
        queryKey: financeiroQueryKeys.resumoKpis,
      }),
      queryClient.invalidateQueries({
        queryKey: financeiroQueryKeys.alunoReceivables,
      }),
      ...invalidateDestinationDiary(
        queryClient,
        result?.turmaId || null,
        result?.disciplinaId || null,
      ),
    ]);
  };
};

export const useConfirmarDependenciaMutation = (poloId: string) => {
  const invalidate = useDependenciaMutationInvalidation(poloId);

  return useMutation<DependenciaCheckoutResult, Error, DependenciaConfirmacaoInput>({
    mutationFn: async (input) => {
      const confirmation = await dependenciasAcademicasService.confirmar(input);
      try {
        return await dependenciasAcademicasService.checkoutBanese(confirmation);
      } catch (error) {
        throw new DependenciaCheckoutError(
          error instanceof Error
            ? error.message
            : 'A dependência foi confirmada, mas o boleto Banese não foi registrado.',
          confirmation,
        );
      }
    },
    onSuccess: (result) => invalidate(result),
    onError: (error) => invalidate(
      error instanceof DependenciaCheckoutError ? error.confirmation : null,
    ),
  });
};

export const useEmitirBoletoDependenciaMutation = (poloId: string) => {
  const invalidate = useDependenciaMutationInvalidation(poloId);

  return useMutation<DependenciaCheckoutResult, Error, DependenciaConfirmacao>({
    mutationFn: (confirmation) =>
      dependenciasAcademicasService.checkoutBanese(confirmation),
    onSuccess: (result) => invalidate(result),
    onError: (_error, confirmation) => invalidate(confirmation),
  });
};

export const useConfigurarPoliticaDependenciaMutation = (poloId: string) => {
  const invalidate = useDependenciaMutationInvalidation(poloId);

  return useMutation<void, Error, DependenciaPoliticaInput>({
    mutationFn: (input) =>
      dependenciasAcademicasService.configurarPoliticaDisciplina(input),
    onSuccess: () => invalidate(),
  });
};
