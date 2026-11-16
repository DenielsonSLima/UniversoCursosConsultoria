import { supabase } from '../../../../lib/supabase';
import { mapLancamento } from './despesas.mapper';
import type { DespesasFilters, DespesaAgrupamento } from './despesas.queryKeys';
import type { DespesaLancamento, DespesasSummary, DespesaGroupSummary } from './despesas.types';

export interface DespesasWorkspace {
  items: DespesaLancamento[];
  summary: DespesasSummary;
  groups: DespesaGroupSummary[];
}

const numberFromServer = (value: unknown): number => {
  const number = typeof value === 'number' || typeof value === 'string' && value.trim() !== ''
    ? Number(value) : Number.NaN;
  if (!Number.isFinite(number)) throw new Error('O resumo de despesas não foi confirmado.');
  return number;
};

export async function getDespesasWorkspace(
  filters: DespesasFilters, agrupamento: DespesaAgrupamento | 'nenhum' = 'nenhum',
): Promise<DespesasWorkspace> {
  if (!filters.poloId || filters.poloId === 'todos'
    || !['DESPESA_FIXA', 'DESPESA_VARIAVEL'].includes(filters.tipo || '')) {
    throw new Error('Selecione um polo e um tipo de despesa.');
  }
  const { data, error } = await supabase.rpc('get_despesas_workspace_secure', {
    p_tipo: filters.tipo, p_polo_id: filters.poloId,
    p_categoria_id: filters.categoriaId || null, p_search: filters.search?.trim() || null,
    p_due_start: filters.dataInicio || null, p_due_end: filters.dataFim || null,
    p_turma_id: filters.turmaId || null, p_status_scope: filters.statusScope || 'mes_atual',
    p_situacao: filters.situacao || 'todas', p_ordem: filters.ordem || 'vencimento_asc',
    p_agrupamento: agrupamento,
  });
  if (error) throw error;
  if (!data || !Array.isArray(data.items) || !Array.isArray(data.groups) || !data.summary) {
    throw new Error('A lista de despesas não foi confirmada.');
  }
  const summary = data.summary;
  return {
    items: data.items.map(mapLancamento),
    summary: {
      totalValue: numberFromServer(summary.total_value),
      paidValue: numberFromServer(summary.paid_value),
      pendingValue: numberFromServer(summary.pending_value),
      confirmedPendingValue: numberFromServer(summary.confirmed_pending_value),
      vencidosCount: numberFromServer(summary.vencidos_count),
      estimatedValue: numberFromServer(summary.estimated_value),
      estimatedCount: numberFromServer(summary.estimated_count),
    },
    groups: data.groups.map(row => ({
      groupKey: row.grupo_chave, groupLabel: row.grupo_nome,
      categoriaId: row.categoria_id || undefined, categoriaNome: row.categoria_nome || row.grupo_nome,
      totalValue: numberFromServer(row.total_value), paidValue: numberFromServer(row.paid_value),
      itemCount: numberFromServer(row.item_count),
      estimatedValue: numberFromServer(row.estimated_value),
      estimatedCount: numberFromServer(row.estimated_count),
    })),
  };
}
