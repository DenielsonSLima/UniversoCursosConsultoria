import { supabase } from '../../../lib/supabase';
import { mapRelatorioMovimentacaoFinanceira, type RelatorioMovimentacaoFinanceiraFiltros } from './relatorios.service';

/** Snapshot exclusivo da exportação; a consulta da tela permanece inalterada. */
export const getExtratoFinanceiroPdf = async (filters: RelatorioMovimentacaoFinanceiraFiltros) => {
  const { data, error } = await supabase.rpc('get_extrato_financeiro_pdf_secure', {
    p_polo_id: filters.poloId && filters.poloId !== 'todos' ? filters.poloId : null,
    p_data_inicio: filters.dataInicio,
    p_data_fim: filters.dataFim,
    p_conta_bancaria_id: filters.contaBancariaId || null,
    p_categoria: filters.categoria || null,
    p_status: filters.status || 'ATIVOS',
    p_busca: filters.busca?.trim() || null,
  });
  if (error) throw error;
  const snapshot = mapRelatorioMovimentacaoFinanceira(data);
  if (snapshot.meta.tipo !== 'EXTRATO_CONTA' || !snapshot.completo) {
    throw new Error('Reduza o período ou aplique filtros para gerar um extrato completo.');
  }
  if (!snapshot.movimentos.length) throw new Error('Não há movimentos para gerar o extrato.');
  return snapshot;
};
