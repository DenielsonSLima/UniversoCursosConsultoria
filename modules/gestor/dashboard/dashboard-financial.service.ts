import { supabase } from '../../../lib/supabase';
import {
  mapDashboardFinancialRadar,
  type DashboardFinancialRadar,
} from './dashboard-financial.mapper';

export type { DashboardFinancialRadar } from './dashboard-financial.mapper';

export const dashboardFinancialService = {
  async getRadar(
    poloId: string,
    competencia: string,
    signal?: AbortSignal,
  ): Promise<DashboardFinancialRadar> {
    const request = supabase.rpc('get_caixa_contas_pagar_resumo_secure', {
      p_polo_id: poloId,
      p_competencia: competencia,
    });
    if (signal) request.abortSignal(signal);
    const { data, error } = await request;
    if (error) throw error;
    return mapDashboardFinancialRadar(data, { poloId, competencia });
  },
};
