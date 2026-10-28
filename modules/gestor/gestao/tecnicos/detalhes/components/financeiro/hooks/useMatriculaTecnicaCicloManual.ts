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
import { observeManualCycleIssuance, type ManualCycleObservationIdentity } from '../manual-cycle-observation';
import { manualCycleProgressOptions } from '../manual-cycle-progress.service';
import { beginManualCycleObservation } from '../manual-cycle-activity';
import { rememberPendingCycleObservation } from '../manual-cycle-pending-observation';
import { manualCycleObservationMutationKey } from './useCicloManualLiveProgress';

export const usePreviewCicloFinanceiroTecnicoManual = (
  input: PreviewCicloFinanceiroTecnicoManualInput,
  enabled: boolean,
) => {
  const queryClient = useQueryClient();
  return useQuery({
  queryKey: matriculaTecnicaFinanceiroKeys.previewCicloManual(
    input.matriculaId,
    input.cicloNumero,
    input.primeiroVencimento,
    input.revisao,
  ),
  queryFn: async () => {
    try {
      return await matriculaTecnicaCicloManualService.preview(input);
    } finally {
      if (input.conferirProesc && input.turmaId) {
        void queryClient.invalidateQueries({ queryKey: matriculaTecnicaFinanceiroKeys.turma(input.turmaId) });
      }
    }
  },
  enabled: enabled
    && Boolean(input.matriculaId)
    && Number.isInteger(input.cicloNumero)
    && input.cicloNumero > 0,
  staleTime: input.conferirProesc ? 0 : 15_000,
  gcTime: 5 * 60_000,
  placeholderData: (previousData) => previousData,
  retry: false,
  });
};

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

const runObservedCycle = async <T>(queryClient: QueryClient, input: ManualCycleObservationIdentity, send: () => Promise<T>) => {
  rememberPendingCycleObservation(input);
  const finish = beginManualCycleObservation(input.turmaId);
  try {
    return await observeManualCycleIssuance(send, () => queryClient.fetchQuery(manualCycleProgressOptions(input)));
  } finally { finish(); }
};

export const useGerarCicloFinanceiroTecnicoManual = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: manualCycleObservationMutationKey,
    mutationFn: (input: GerarCicloFinanceiroTecnicoManualInput) => runObservedCycle(
      queryClient, input, () => matriculaTecnicaCicloManualService.generate(input),
    ),
    retry: false,
    onSuccess: (result) => {
      markFinanceiroRequestReconciled(result.requestId);
    },
    onSettled: (_result, _error, input) => {
      void invalidateIssuanceQueries(queryClient, input.turmaId).catch(() => undefined);
    },
  });
};

export const useRetomarEmissaoCicloFinanceiroTecnicoManual = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: manualCycleObservationMutationKey,
    mutationFn: (input: RetomarEmissaoCicloFinanceiroTecnicoManualInput) => input.correctionOperationId
      ? matriculaTecnicaCicloManualService.resume(input)
      : runObservedCycle(queryClient, input, () => matriculaTecnicaCicloManualService.resume(input)),
    retry: false,
    onSuccess: (result) => {
      markFinanceiroRequestReconciled(result.requestId);
    },
    onSettled: (_result, _error, input) => {
      void invalidateIssuanceQueries(queryClient, input.turmaId).catch(() => undefined);
    },
  });
};
