import { queryOptions } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';
import { mapCaixaDetailedReport } from './caixa-report.mapper';
import type { CaixaDetailedReport } from './caixa-report.types';

const normalizePoloId = (poloId: string | null | undefined) => (
  poloId && poloId !== 'todos' ? poloId : null
);

export const caixaReportService = {
  async getDetailedMonthlyReport(
    poloId: string | null | undefined,
    competencia: string,
  ): Promise<CaixaDetailedReport> {
    const { data, error } = await supabase.rpc(
      'get_caixa_relatorio_mensal_detalhado_secure',
      {
        p_polo_id: normalizePoloId(poloId),
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

    return mapCaixaDetailedReport(data);
  },
};

export const caixaReportQueryOptions = (
  poloId: string | null | undefined,
  competencia: string,
  enabled: boolean,
) => queryOptions({
  queryKey: [
    'caixa',
    'statement',
    normalizePoloId(poloId) || 'todos',
    competencia,
    'pdf',
  ],
  queryFn: () => caixaReportService.getDetailedMonthlyReport(poloId, competencia),
  enabled,
  staleTime: 30_000,
  gcTime: 0,
  refetchOnWindowFocus: false,
});
