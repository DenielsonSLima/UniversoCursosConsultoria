import { supabase } from '../../../../lib/supabase';
import type { DespesaTipo } from './despesas.queryKeys';

export interface DespesaSugestao {
  id: string;
  descricao: string;
  valorBase: number;
  categoriaId: string;
}

export const getUltimaDespesaDoCredor = async (
  poloId: string,
  tipo: DespesaTipo,
  fornecedorId: string,
): Promise<DespesaSugestao | null> => {
  if (!poloId || poloId === 'todos' || !fornecedorId || tipo === 'OUTRO_DEBITO') return null;
  // O SELECT autenticado conserva a RLS financeira por polo. A consulta traz
  // somente os campos sugeríveis, sem carregar pagamentos ou todo o histórico.
  const { data, error } = await supabase.from('despesas_lancamentos')
    .select('id,descricao,valor_base,categoria_financeira_id')
    .eq('polo_id', poloId)
    .eq('tipo', tipo)
    .eq('fornecedor_id', fornecedorId)
    .is('excluido_em', null)
    .neq('status', 'CANCELADO')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    descricao: data.descricao || '',
    valorBase: Number(data.valor_base),
    categoriaId: data.categoria_financeira_id || '',
  };
};
