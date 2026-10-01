import { useQuery } from '@tanstack/react-query';
import { trancamentoFinanceiroService } from '../trancamento-financeiro.service';

export interface TrancamentoPreviewInput {
  matriculaId: string;
  cutoffDate: string;
}

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export const trancamentoFinanceiroKeys = {
  preview: (input: TrancamentoPreviewInput | null) => [
    'technical-trancamento-financeiro',
    input?.matriculaId || '',
    input?.cutoffDate || '',
  ] as const,
};

export const useTrancamentoFinancialPreview = (
  input: TrancamentoPreviewInput | null,
) => {
  const enabled = Boolean(
    input?.matriculaId && input?.cutoffDate && isoDate.test(input.cutoffDate),
  );
  const query = useQuery({
    queryKey: trancamentoFinanceiroKeys.preview(input),
    queryFn: () => trancamentoFinanceiroService.preview(
      input!.matriculaId,
      input!.cutoffDate,
    ),
    enabled,
    staleTime: 15_000,
    retry: false,
  });
  return {
    query,
    canConfirm: enabled && query.isSuccess
      && query.data.cutoffDate === input?.cutoffDate,
  };
};
