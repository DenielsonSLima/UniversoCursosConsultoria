import { supabase } from '../../../../../lib/supabase';
import { parseTrancamentoFinancialPreview } from './trancamento-financeiro.contract';

export const trancamentoFinanceiroService = {
  async preview(matriculaId: string, cutoffDate: string) {
    const { data, error } = await supabase.rpc('preview_trancamento_financeiro', {
      p_matricula_id: matriculaId,
      p_data_movimentacao: cutoffDate,
    });
    if (error) throw error;
    return parseTrancamentoFinancialPreview(data);
  },
};
