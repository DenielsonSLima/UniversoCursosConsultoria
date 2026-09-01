import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { matriculaTecnicaCicloManualService } from '../matricula-tecnica-ciclo-manual.service';
import { matriculaTecnicaFinanceiroKeys } from '../matricula-tecnica-financeiro.keys';
import type {
  GerarCicloFinanceiroTecnicoManualInput,
  PreviewCicloFinanceiroTecnicoManualInput,
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

export const useGerarCicloFinanceiroTecnicoManual = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: GerarCicloFinanceiroTecnicoManualInput) => (
      matriculaTecnicaCicloManualService.generate(input)
    ),
    onSuccess: async (result, input) => {
      markFinanceiroRequestReconciled(result.requestId);
      await queryClient.invalidateQueries({
        queryKey: matriculaTecnicaFinanceiroKeys.turma(input.turmaId),
      });
    },
  });
};
