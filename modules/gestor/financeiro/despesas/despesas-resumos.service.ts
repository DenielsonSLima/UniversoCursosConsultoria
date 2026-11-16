import { supabase } from '../../../../lib/supabase';
import type { DespesasFilters, DespesaAgrupamento } from './despesas.queryKeys';
import type { DespesaGroupSummary, DespesasSummary } from './despesas.types';
import { getDespesasEstimativasResumo, type DespesasEstimativasResumo } from './despesas-estimativas-leitura.service';
import { getDespesasVencidas } from './despesas-vencidas.service';

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
  if (filters.statusScope === 'vencidos') return (await getDespesasVencidas(filters)).summary;
  const params = getParams(filters);
  const rpcName = params.p_polo_id && filters.tipo
    ? 'get_despesas_economicas_summary_secure'
    : 'get_despesas_summary';
  const [{ data, error }, estimates] = await Promise.all([
    supabase.rpc(rpcName, params),
    filters.tipo === 'OUTRO_DEBITO' ? null : getDespesasEstimativasResumo(params),
  ]);
  if (error) throw error;
  const row = data?.[0] || {};
  return {
    totalValue: Number(row.total_value || 0),
    paidValue: Number(row.paid_value || 0),
    pendingValue: Number(row.pending_value || 0),
    vencidosCount: Number(estimates?.vencidos_count ?? row.vencidos_count ?? 0),
    estimatedValue: Number(estimates?.estimated_value ?? 0),
    estimatedCount: Number(estimates?.estimated_count ?? 0),
    confirmedPendingValue: Number(estimates?.confirmed_pending_value ?? row.pending_value ?? 0),
  };
};

export const getDespesasGroupSummary = async (
  filters: DespesasFilters = {},
  agrupamento: DespesaAgrupamento = 'categoria',
): Promise<DespesaGroupSummary[]> => {
  if (filters.statusScope === 'vencidos') return (await getDespesasVencidas(filters, agrupamento)).groups;
  const params = getParams(filters);
  if (agrupamento !== 'categoria' && (!params.p_polo_id || !filters.tipo)) {
    throw new Error('Selecione um polo e um tipo de despesa.');
  }
  const estimatesPromise: Promise<DespesasEstimativasResumo | null> = filters.tipo === 'OUTRO_DEBITO'
    ? Promise.resolve(null) : getDespesasEstimativasResumo(params, agrupamento);
  if (agrupamento !== 'categoria') {
    const [{ data, error }, estimates] = await Promise.all([
      supabase.rpc('get_despesas_economicas_agrupamento_secure', { ...params, p_agrupamento: agrupamento }),
      estimatesPromise,
    ]);
    if (error) throw error;
    const byGroup = new Map(estimates?.groups.map(group => [group.grupo_chave, group] as const) ?? []);
    return (data || []).map((row: any) => ({
      groupKey: row.grupo_chave, groupLabel: row.grupo_nome,
      categoriaNome: row.grupo_nome,
      totalValue: Number(row.total_value || 0), paidValue: Number(row.paid_value || 0),
      itemCount: Number(row.item_count || 0),
      estimatedValue: Number(byGroup.get(row.grupo_chave)?.estimated_value ?? 0),
      estimatedCount: Number(byGroup.get(row.grupo_chave)?.estimated_count ?? 0),
    }));
  }
  const rpcName = params.p_polo_id && filters.tipo
    ? 'get_despesas_economicas_group_summary_secure'
    : 'get_despesas_group_summary_secure';
  const [{ data, error }, estimates] = await Promise.all([supabase.rpc(rpcName, params), estimatesPromise]);
  if (error) throw error;
  const byGroup = new Map(estimates?.groups.map(group => [group.grupo_chave, group] as const) ?? []);
  return (data || []).map((row: any) => ({
    categoriaId: row.categoria_id || undefined,
    categoriaNome: row.categoria_nome || 'Sem Categoria',
    totalValue: Number(row.total_value || 0),
    paidValue: Number(row.paid_value || 0),
    itemCount: Number(row.item_count || 0),
    estimatedValue: Number(byGroup.get(row.categoria_id || '__sem_categoria__')?.estimated_value ?? 0),
    estimatedCount: Number(byGroup.get(row.categoria_id || '__sem_categoria__')?.estimated_count ?? 0),
  }));
};
