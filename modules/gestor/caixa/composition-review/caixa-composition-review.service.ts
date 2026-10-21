import { queryOptions } from '@tanstack/react-query';
import { queueCaixaRead } from '../caixa-read-queue';
import { caixaReportService } from '../report/caixa-report.service';

/** Mounted only after an explicit click. No new RPC, access grant or write. */
export const compositionReviewQueryOptions = (poloId: string | null, competencia: string) => queryOptions({
  queryKey: ['caixa', 'composition-review', poloId, competencia] as const,
  queryFn: ({ signal }) => queueCaixaRead(signal,
    () => caixaReportService.getDetailedMonthlyReport(poloId, competencia, signal), 'interactive'),
  staleTime: 0, gcTime: 0, retry: false, retryOnMount: false,
  refetchOnWindowFocus: false, refetchOnReconnect: false,
});
