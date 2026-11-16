import { supabase } from '../../../../lib/supabase';
import { enrichDespesasEstimativas } from './despesas-estimativas-leitura.service';
import { enrichDespesasFornecedorFantasia } from './despesas-fornecedores';
import { mapLancamento } from './despesas.mapper';
import type { DespesasFilters, DespesaAgrupamento } from './despesas.queryKeys';
import type { DespesaLancamento, DespesasSummary, DespesaGroupSummary } from './despesas.types';

export interface DespesasVencidasWorkspace {
  items: DespesaLancamento[];
  summary: DespesasSummary;
  groups: DespesaGroupSummary[];
}

export async function getDespesasVencidas(
  filters: DespesasFilters, agrupamento: DespesaAgrupamento = 'categoria',
): Promise<DespesasVencidasWorkspace> {
  if (!filters.poloId || filters.poloId === 'todos' || !filters.tipo) {
    throw new Error('Selecione um polo e um tipo de despesa.');
  }
  const { data, error } = await supabase.rpc('get_despesas_vencidas_secure', {
    p_tipo: filters.tipo, p_polo_id: filters.poloId,
    p_categoria_id: filters.categoriaId || null, p_search: filters.search?.trim() || null,
    p_due_start: filters.dataInicio || null, p_due_end: filters.dataFim || null,
    p_turma_id: filters.turmaId || null, p_agrupamento: agrupamento,
  });
  if (error) throw error;
  if (!data || !Array.isArray(data.items) || !Array.isArray(data.groups) || !data.summary) {
    throw new Error('A lista de despesas vencidas não foi confirmada.');
  }
  const baseRows = data.items as { id:string; fornecedor_id?:string; fornecedor_nome_fantasia?:string }[];
  const [rows, partners] = await Promise.all([
    enrichDespesasEstimativas(baseRows),
    enrichDespesasFornecedorFantasia(baseRows, async ids => (
      supabase.from('parceiros').select('id,nome_fantasia').eq('tipo','PJ').in('id',ids)
    )),
  ]);
  const names = new Map(partners.map(row => [row.id,row.fornecedor_nome_fantasia]));
  return {
    items: rows.map(row => mapLancamento({ ...row,fornecedor_nome_fantasia:names.get(row.id) })),
    summary: {
      totalValue:Number(data.summary.total_value),paidValue:Number(data.summary.paid_value),
      pendingValue:Number(data.summary.pending_value),confirmedPendingValue:Number(data.summary.pending_value),
      vencidosCount:Number(data.summary.vencidos_count),estimatedValue:0,estimatedCount:0,
    },
    groups:data.groups.map(row => ({
      groupKey:row.grupo_chave,groupLabel:row.grupo_nome,categoriaId:row.categoria_id || undefined,
      categoriaNome:row.categoria_nome,totalValue:Number(row.total_value),paidValue:Number(row.paid_value),
      itemCount:Number(row.item_count),estimatedValue:0,estimatedCount:0,
    })),
  };
}
