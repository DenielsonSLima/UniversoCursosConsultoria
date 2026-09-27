import { supabase } from '../../../../lib/supabase';
import type { DespesasFilters } from './despesas.queryKeys';
import type { DespesaGroupSummary, DespesasSummary } from './despesas.types';

const getParams = (filters: DespesasFilters) => ({
  p_tipo: filters.tipo || null,
  p_polo_id: filters.poloId && filters.poloId !== 'todos' ? filters.poloId : null,
  p_categoria_id: filters.categoriaId || null,
  p_search: filters.search?.trim() || null,
  p_due_start: filters.dataInicio || null,
  p_due_end: filters.dataFim || null,
  p_status_scope: filters.statusScope || 'todos',
  p_turma_id: filters.turmaId || null,
});

export const getDespesasSummary = async (
  filters: DespesasFilters = {},
): Promise<DespesasSummary> => {
  const params = getParams(filters);
  const rpcName = params.p_polo_id && filters.tipo
    ? 'get_despesas_economicas_summary_secure'
    : 'get_despesas_summary';
  const { data, error } = await supabase.rpc(rpcName, params);
  if (error) throw error;
  const row = data?.[0] || {};
  return {
    totalValue: Number(row.total_value || 0),
    paidValue: Number(row.paid_value || 0),
    pendingValue: Number(row.pending_value || 0),
    vencidosCount: Number(row.vencidos_count || 0),
  };
};

export const getDespesasGroupSummary = async (
  filters: DespesasFilters = {},
): Promise<DespesaGroupSummary[]> => {
  const params = getParams(filters);
  const rpcName = params.p_polo_id && filters.tipo
    ? 'get_despesas_economicas_group_summary_secure'
    : 'get_despesas_group_summary_secure';
  const { data, error } = await supabase.rpc(rpcName, params);
  if (error) throw error;
  return (data || []).map((row: any) => ({
    categoriaId: row.categoria_id || undefined,
    categoriaNome: row.categoria_nome || 'Sem Categoria',
    totalValue: Number(row.total_value || 0),
    paidValue: Number(row.paid_value || 0),
    itemCount: Number(row.item_count || 0),
  }));
};
