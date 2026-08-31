import { supabase } from '../../../lib/supabase';
import type {
  ContasPagar,
  TransferenciaConta,
  TransferenciaInput,
  TransferenciasFilters,
  TransferenciasSummary,
} from './financeiro.types';

export const financeiroPayablesServiceMethods = {
  async getContasPagar(filters?: { poloId?: string; status?: string; categoria?: string }): Promise<ContasPagar[]> {
    let query = supabase
      .from('contas_pagar')
      .select('*, parceiros(nome), polos(nome)');

    if (filters?.poloId && filters.poloId !== 'todos') {
      query = query.eq('polo_id', filters.poloId);
    }
    if (filters?.status && filters.status !== 'todos') {
      query = query.eq('status', filters.status);
    }
    if (filters?.categoria && filters.categoria !== 'todos') {
      query = query.eq('categoria', filters.categoria);
    }

    const { data, error } = await query.order('data_vencimento', { ascending: true });
    if (error) {
      console.error('Erro ao buscar contas a pagar:', error);
      throw error;
    }

    return (data || []).map((cp: any) => ({
      id: cp.id,
      poloId: cp.polo_id,
      poloNome: cp.polos?.nome || '',
      descricao: cp.descricao,
      valor: Number(cp.valor),
      dataVencimento: cp.data_vencimento,
      dataPagamento: cp.data_pagamento,
      valorPago: cp.valor_pago ? Number(cp.valor_pago) : undefined,
      status: cp.status,
      categoria: cp.categoria,
      fornecedorId: cp.fornecedor_id,
      fornecedorNome: cp.parceiros?.nome || 'Fornecedor Geral',
      formaPagamento: cp.forma_pagamento,
      contaBancariaId: cp.conta_bancaria_id,
      createdAt: cp.created_at,
    }));
  },

  async createPayable(cp: Omit<ContasPagar, 'id'>): Promise<void> {
    const { error } = await supabase.from('contas_pagar').insert({
      polo_id: cp.poloId,
      descricao: cp.descricao,
      valor: cp.valor,
      data_vencimento: cp.dataVencimento,
      status: 'PENDENTE',
      categoria: cp.categoria,
      fornecedor_id: cp.fornecedorId || null,
      forma_pagamento: cp.formaPagamento || null,
      conta_bancaria_id: null,
    });
    if (error) {
      console.error('Erro ao criar conta a pagar:', error);
      throw error;
    }
  },

  async markPayablePaid(
    id: string,
    params: {
      contaBancariaId: string;
      valorPago: number;
      dataPagamento: string;
      formaPagamento: 'BOLETO' | 'PIX' | 'TED' | 'DINHEIRO';
    },
  ): Promise<void> {
    const requestId = globalThis.crypto?.randomUUID?.()
      || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const { error } = await supabase.rpc('baixar_conta_pagar_secure', {
      p_conta_pagar_id: id,
      p_request_id: requestId,
      p_conta_bancaria_id: params.contaBancariaId,
      p_data_pagamento: params.dataPagamento,
      p_forma_pagamento: params.formaPagamento,
    });
    if (error) {
      console.error('Erro ao liquidar conta a pagar:', error);
      throw error;
    }
  },

  async deletePayable(id: string): Promise<void> {
    const { error } = await supabase.from('contas_pagar').delete().eq('id', id);
    if (error) {
      console.error('Erro ao deletar conta a pagar:', error);
      throw error;
    }
  },

  async getTransferencias(filters: TransferenciasFilters = {}): Promise<TransferenciaConta[]> {
    const { data, error } = await supabase.rpc('get_transferencias_contas', {
      p_polo_id: filters.poloId && filters.poloId !== 'todos' ? filters.poloId : null,
      p_search: filters.search?.trim() || null,
      p_conta_origem_id: filters.contaOrigemId || null,
      p_conta_destino_id: filters.contaDestinoId || null,
      p_data_inicio: filters.dataInicio || null,
      p_data_fim: filters.dataFim || null,
      p_mes_atual: filters.mesAtual === true,
    });
    if (error) {
      console.error('Erro ao buscar transferências:', error);
      throw error;
    }

    return (data || []).map((t: any) => ({
      id: t.id,
      poloId: t.polo_origem_id,
      poloNome: t.polo_origem_nome || '',
      poloCnpj: t.polo_origem_cnpj || '',
      poloCidade: t.polo_origem_cidade || '',
      poloUf: t.polo_origem_uf || '',
      contaOrigemId: t.conta_origem_id,
      contaOrigemBanco: t.conta_origem_banco || '',
      contaOrigemTitular: t.conta_origem_titular || '',
      contaOrigemAgencia: t.conta_origem_agencia || '',
      contaOrigemConta: t.conta_origem_conta || '',
      contaOrigemNome: `${t.conta_origem_banco || ''} - ${t.conta_origem_conta || ''}`,
      poloDestinoId: t.polo_destino_id,
      poloDestinoNome: t.polo_destino_nome || '',
      poloDestinoCnpj: t.polo_destino_cnpj || '',
      poloDestinoCidade: t.polo_destino_cidade || '',
      poloDestinoUf: t.polo_destino_uf || '',
      contaDestinoId: t.conta_destino_id,
      contaDestinoBanco: t.conta_destino_banco || '',
      contaDestinoTitular: t.conta_destino_titular || '',
      contaDestinoAgencia: t.conta_destino_agencia || '',
      contaDestinoConta: t.conta_destino_conta || '',
      contaDestinoNome: `${t.conta_destino_banco || ''} - ${t.conta_destino_conta || ''}`,
      valor: Number(t.valor),
      dataTransferencia: t.data_transferencia,
      observacao: t.observacao,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    }));
  },

  async getTransferenciasSummary(
    filters: TransferenciasFilters = {},
  ): Promise<TransferenciasSummary> {
    const { data, error } = await supabase.rpc('get_transferencias_summary_secure', {
      p_polo_id: filters.poloId && filters.poloId !== 'todos' ? filters.poloId : null,
      p_search: filters.search?.trim() || null,
      p_conta_origem_id: filters.contaOrigemId || null,
      p_conta_destino_id: filters.contaDestinoId || null,
      p_data_inicio: filters.dataInicio || null,
      p_data_fim: filters.dataFim || null,
      p_mes_atual: filters.mesAtual === true,
    });
    if (error) {
      console.error('Erro ao buscar resumo de transferências:', error);
      throw error;
    }

    const row = Array.isArray(data) ? data[0] : data;
    return {
      totalValue: Number(row?.total_value || 0),
      totalCount: Number(row?.total_count || 0),
    };
  },

  async createTransferencia(t: TransferenciaInput): Promise<string> {
    const { data, error } = await supabase.rpc('registrar_transferencia_conta', {
      p_polo_origem_id: t.poloOrigemId,
      p_conta_origem_id: t.contaOrigemId,
      p_polo_destino_id: t.poloDestinoId,
      p_conta_destino_id: t.contaDestinoId,
      p_valor: t.valor,
      p_data_transferencia: t.dataTransferencia,
      p_observacao: t.observacao || null,
      p_request_id: t.requestId,
    });
    if (error) {
      console.error('Erro ao registrar transferência:', error);
      throw error;
    }
    return data as string;
  },

  async updateTransferencia(id: string, t: TransferenciaInput): Promise<void> {
    const { error } = await supabase.rpc('editar_transferencia_conta', {
      p_transferencia_id: id,
      p_polo_origem_id: t.poloOrigemId,
      p_conta_origem_id: t.contaOrigemId,
      p_polo_destino_id: t.poloDestinoId,
      p_conta_destino_id: t.contaDestinoId,
      p_valor: t.valor,
      p_data_transferencia: t.dataTransferencia,
      p_observacao: t.observacao || null,
    });
    if (error) {
      console.error('Erro ao editar transferência:', error);
      throw error;
    }
  },

  async deleteTransferencia(id: string): Promise<void> {
    const { error } = await supabase.rpc('excluir_transferencia_conta', {
      p_transferencia_id: id,
    });
    if (error) {
      console.error('Erro ao excluir transferência:', error);
      throw error;
    }
  },
};
