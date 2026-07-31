import { queryOptions } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';
import { assertCaixaStatementRequest, normalizeCaixaPoloId } from '../caixa.service';
import { mapCaixaDetailedReport } from './caixa-report.mapper';
import type { CaixaDetailedReport } from './caixa-report.types';

export const caixaReportService = {
  async getDetailedMonthlyReport(
    poloId: string | null | undefined,
    competencia: string,
  ): Promise<CaixaDetailedReport> {
    const normalizedPoloId = normalizeCaixaPoloId(poloId);
    const { data, error } = await supabase.rpc(
      'get_caixa_relatorio_mensal_detalhado_secure',
      {
        p_polo_id: normalizedPoloId,
        p_competencia: competencia,
      },
    );

    if (error) {
      console.error('Erro ao buscar relatório detalhado do Caixa:', {
        code: error.code,
        message: error.message,
      });
      throw error;
    }

    const report = mapCaixaDetailedReport(data);
    assertCaixaStatementRequest(report.resumo, normalizedPoloId, competencia);
    return report;
  },
};

export const caixaReportQueryKeys = {
  root: ['caixa-report'] as const,
  monthly: ['caixa-report', 'monthly'] as const,
  monthlyForPolo: (poloId: string | null | undefined) => [
    'caixa-report',
    'monthly',
    normalizeCaixaPoloId(poloId) || 'todos',
  ] as const,
};

export const caixaReportQueryKey = (
  poloId: string | null | undefined,
  competencia: string,
) => [
  ...caixaReportQueryKeys.monthlyForPolo(poloId),
  competencia,
] as const;

export const caixaReportQueryOptions = (
  poloId: string | null | undefined,
  competencia: string,
  enabled: boolean,
) => queryOptions({
  queryKey: caixaReportQueryKey(poloId, competencia),
  queryFn: () => caixaReportService.getDetailedMonthlyReport(poloId, competencia),
  enabled,
  staleTime: 0,
  gcTime: 0,
  refetchOnMount: 'always',
  refetchOnWindowFocus: false,
});
