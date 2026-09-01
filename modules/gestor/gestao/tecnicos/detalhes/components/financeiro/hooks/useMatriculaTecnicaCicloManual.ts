import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { financeiroQueryKeys } from '../../../../../../financeiro/financeiro.queryKeys';
import { matriculaTecnicaCicloManualService } from '../matricula-tecnica-ciclo-manual.service';
import { matriculaTecnicaFinanceiroKeys } from '../matricula-tecnica-financeiro.keys';
import type {
  GerarCicloFinanceiroTecnicoManualInput,
  PreviewCicloFinanceiroTecnicoManualInput,
  RetomarEmissaoCicloFinanceiroTecnicoManualInput,
} from '../matricula-tecnica-ciclo-manual.types';
import { markFinanceiroRequestReconciled } from '../matricula-tecnica-financeiro.echo';

export const usePreviewCicloFinanceiroTecnicoManual = (
  input: PreviewCicloFinanceiroTecnicoManualInput,
  enabled: boolean,
) => useQuery({
  queryKey: matriculaTecnicaFinanceiroKeys.previewCicloManual(
    input.matriculaId,
    input.cicloNumero,
    input.primeiroVencimento,
  ),
  queryFn: () => matriculaTecnicaCicloManualService.preview(input),
  enabled: enabled
    && Boolean(input.matriculaId)
    && Number.isInteger(input.cicloNumero)
    && input.cicloNumero > 0,
  staleTime: 15_000,
  gcTime: 5 * 60_000,
  retry: false,
});

const invalidateIssuanceQueries = (
  queryClient: QueryClient,
  turmaId: string,
) => Promise.all([
  queryClient.invalidateQueries({
    queryKey: matriculaTecnicaFinanceiroKeys.turma(turmaId),
  }),
  queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.receivablesRoot }),
  queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.alunoReceivables }),
  queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.resumoKpis }),
  queryClient.invalidateQueries({ queryKey: ['aluno-financeiro'] }),
]);

export const useGerarCicloFinanceiroTecnicoManual = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: GerarCicloFinanceiroTecnicoManualInput) => (
      matriculaTecnicaCicloManualService.generate(input)
    ),
    onSuccess: (result) => {
      markFinanceiroRequestReconciled(result.requestId);
    },
    onSettled: (_result, _error, input) => invalidateIssuanceQueries(
      queryClient,
      input.turmaId,
    ),
  });
};

export const useRetomarEmissaoCicloFinanceiroTecnicoManual = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RetomarEmissaoCicloFinanceiroTecnicoManualInput) => (
      matriculaTecnicaCicloManualService.resume(input)
    ),
    onSuccess: (result) => {
      markFinanceiroRequestReconciled(result.requestId);
    },
    onSettled: (_result, _error, input) => invalidateIssuanceQueries(
      queryClient,
      input.turmaId,
    ),
  });
};
