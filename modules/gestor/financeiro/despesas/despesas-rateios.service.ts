import { supabase } from '../../../../lib/supabase';

export interface DespesaRateioDetalhe {
  id: string;
  poloId: string;
  poloNome: string;
  valorBase: number;
  jurosValor: number;
  multaValor: number;
  descontoValor: number;
  valorTotal: number;
  status: string;
}

export async function listarRateiosDespesa(despesaId: string): Promise<DespesaRateioDetalhe[]> {
  if (!despesaId) throw new Error('Lançamento do rateio não informado.');
  const { data, error } = await supabase
    .from('despesas_lancamentos_rateios')
    .select('id,polo_id,valor_base,juros_valor,multa_valor,desconto_valor,valor_total,status,polo:polos!despesas_lancamentos_rateios_polo_id_fkey(nome)')
    .eq('despesa_lancamento_id', despesaId)
    .order('polo_id');
  if (error) throw error;
  return (data || []).map((row) => {
    const polo = Array.isArray(row.polo) ? row.polo[0] : row.polo;
    return {
      id: row.id, poloId: row.polo_id, poloNome: polo?.nome || 'Polo não informado',
      valorBase: Number(row.valor_base), jurosValor: Number(row.juros_valor),
      multaValor: Number(row.multa_valor), descontoValor: Number(row.desconto_valor),
      valorTotal: Number(row.valor_total), status: row.status,
    };
  }).sort((a, b) => a.poloNome.localeCompare(b.poloNome, 'pt-BR'));
}

