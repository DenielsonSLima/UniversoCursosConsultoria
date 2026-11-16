import { supabase } from '../../../../lib/supabase';

export interface DespesasEstimativasResumo {
  estimated_value: number | string;
  estimated_count: number;
  confirmed_pending_value: number | string;
  vencidos_count: number;
  groups: { grupo_chave: string; categoria_id?: string; estimated_value: number | string; estimated_count: number }[];
}

export async function enrichDespesasEstimativas<T extends { id: string }>(rows: T[]): Promise<T[]> {
  if (rows.length === 0) return rows;
  const { data, error } = await supabase.rpc('get_despesas_estimativas_secure', {
    p_despesa_ids: [...new Set(rows.map(row => row.id))],
  });
  if (error) throw error;
  const metadata = new Map((Array.isArray(data) ? data : []).map(row => [row.id, row]));
  if (rows.some(row => !metadata.has(row.id))) throw new Error('Não foi possível conferir as estimativas das despesas.');
  return rows.map(row => ({ ...row, ...metadata.get(row.id) }));
}

export async function getDespesasEstimativasResumo(
  params: Record<string, unknown>, agrupamento = 'categoria',
): Promise<DespesasEstimativasResumo> {
  const { data, error } = await supabase.rpc('get_despesas_estimativas_resumo_secure', {
    ...params, p_agrupamento: agrupamento,
  });
  if (error) throw error;
  if (!data || !Array.isArray(data.groups)) throw new Error('O resumo de estimativas não foi confirmado.');
  return data;
}
