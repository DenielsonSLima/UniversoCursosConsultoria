import { supabase } from '../../../../lib/supabase';

export interface TaxaPagamento {
  id?: string;
  forma: string;
  prazo: string;
  taxa: number | string;
}

export const taxasPagamentoService = {
  async getAll(): Promise<TaxaPagamento[]> {
    const { data, error } = await supabase
      .from('taxas_pagamento')
      .select('*')
      .order('forma', { ascending: true });

    if (error) {
      console.error('Erro ao buscar taxas de pagamento:', error);
      throw new Error(error.message);
    }

    return (data || []).map(item => ({
      id: item.id,
      forma: item.forma,
      prazo: item.prazo,
      taxa: Number(item.taxa).toFixed(2), // Garante formato string formatada pra exibição/editação
    }));
  },

  async create(taxa: Omit<TaxaPagamento, 'id'>): Promise<TaxaPagamento> {
    const { data, error } = await supabase
      .from('taxas_pagamento')
      .insert({
        forma: taxa.forma,
        prazo: taxa.prazo,
        taxa: Number(taxa.taxa) || 0
      })
      .select()
      .single();

    if (error) {
      console.error('Erro ao criar taxa de pagamento:', error);
      throw new Error(error.message);
    }

    return {
      id: data.id,
      forma: data.forma,
      prazo: data.prazo,
      taxa: Number(data.taxa).toFixed(2),
    };
  },

  async update(id: string, taxa: Partial<TaxaPagamento>): Promise<boolean> {
    const dbPayload: any = {};
    if (taxa.forma !== undefined) dbPayload.forma = taxa.forma;
    if (taxa.prazo !== undefined) dbPayload.prazo = taxa.prazo;
    if (taxa.taxa !== undefined) dbPayload.taxa = Number(taxa.taxa) || 0;

    const { error } = await supabase
      .from('taxas_pagamento')
      .update(dbPayload)
      .eq('id', id);

    if (error) {
      console.error('Erro ao atualizar taxa de pagamento:', error);
      throw new Error(error.message);
    }

    return true;
  },

  async delete(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('taxas_pagamento')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Erro ao excluir taxa de pagamento:', error);
      throw new Error(error.message);
    }

    return true;
  }
};
