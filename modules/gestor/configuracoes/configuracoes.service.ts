
import { supabase } from '../../../lib/supabase';

export interface RegrasCobranca {
  id?: string;
  multa: number;
  juros: number;
  desconto: number;
  dias_desconto: number;
  updated_at?: string;
}

export interface ValoresCalculados {
  valor_multa: number;
  valor_juros: number;
  valor_desconto: number;
  valor_final: number;
  multa_aplicada: number;
  juros_aplicado: number;
  desconto_aplicado: number;
}

export const configuracoesService = {
  /**
   * Obtém as regras de cobrança padrão cadastradas no banco.
   */
  async getRegrasCobranca(): Promise<RegrasCobranca> {
    const { data, error } = await supabase
      .from('regras_cobranca')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Erro ao buscar regras de cobrança:', error);
      throw new Error(error.message);
    }

    return data || {
      multa: 2.00,
      juros: 1.00,
      desconto: 0.00,
      dias_desconto: 0
    };
  },

  /**
   * Salva ou atualiza as regras de cobrança padrão.
   */
  async saveRegrasCobranca(regras: RegrasCobranca): Promise<RegrasCobranca> {
    const id = regras.id || '00000000-0000-0000-0000-000000000000';
    const payload = {
      id,
      multa: Number(regras.multa),
      juros: Number(regras.juros),
      desconto: Number(regras.desconto),
      dias_desconto: Number(regras.dias_desconto),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('regras_cobranca')
      .upsert(payload)
      .select()
      .single();

    if (error) {
      console.error('Erro ao salvar regras de cobrança:', error);
      throw new Error(error.message);
    }

    return data;
  },

  /**
   * Aciona a função de cálculo PostgreSQL no banco de dados via RPC.
   * Respeita a regra de que o frontend não realiza cálculos matemáticos de regras de atraso/desconto.
   */
  async calcularValoresCobranca(
    valorBase: number,
    dataVencimento: string,
    dataPagamento: string
  ): Promise<ValoresCalculados> {
    const { data, error } = await supabase.rpc('calcular_valores_cobranca_padrao', {
      valor_base: valorBase,
      data_vencimento: dataVencimento,
      data_pagamento: dataPagamento
    });

    if (error) {
      console.error('Erro ao calcular valores de cobrança no banco:', error);
      throw new Error(error.message);
    }

    // A chamada RPC retorna as linhas em um array no Javascript
    if (Array.isArray(data) && data.length > 0) {
      return data[0];
    }
    
    throw new Error('Retorno inválido do cálculo de cobrança');
  }
};
