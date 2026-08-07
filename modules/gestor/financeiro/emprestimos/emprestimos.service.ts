import { supabase } from '../../../../lib/supabase';
import {
  mapEmprestimoFinanceiro,
  mapEmprestimosFinanceiros,
} from './emprestimos.mapper';
import type {
  BaixarEmprestimoParcelaInput,
  BaixarEmprestimoParcelaResult,
  CriarEmprestimoInput,
  EmprestimoFinanceiro,
  EmprestimoParcelaStatus,
} from './emprestimos.types';

const asParcelaStatus = (value: unknown): EmprestimoParcelaStatus => {
  if (value === 'PAGO' || value === 'VENCIDO' || value === 'CANCELADO') return value;
  return 'PENDENTE';
};

const asNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const asResultRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
};

export const createEmprestimoRequestId = () => (
  typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
      const random = Math.floor(Math.random() * 16);
      return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16);
    })
);

export const emprestimosService = {
  async listar(poloResponsavelId: string): Promise<EmprestimoFinanceiro[]> {
    const { data, error } = await supabase.rpc('listar_emprestimos_financeiros_polo_secure', {
      p_polo_id: poloResponsavelId,
    });

    if (error) throw error;
    return mapEmprestimosFinanceiros(data);
  },

  async criar(input: CriarEmprestimoInput): Promise<EmprestimoFinanceiro> {
    const { data, error } = await supabase.rpc('criar_emprestimo_financeiro_polo_secure', {
      p_request_id: input.requestId,
      p_polo_id: input.poloResponsavelId,
      p_credor_nome: input.credorNome,
      p_descricao: input.descricao,
      p_valor_liberado: input.valorLiberado,
      p_valor_total_divida: input.valorTotalDivida,
      p_data_liberacao: input.dataLiberacao,
      p_data_primeiro_vencimento: input.dataPrimeiroVencimento,
      p_total_parcelas: input.totalParcelas,
      p_intervalo_meses: input.intervaloMeses,
      p_conta_credito_id: input.contaCreditoId,
      p_forma_credito: input.formaCredito,
      p_rateio_modo: input.rateioModo,
      p_polo_ids: input.rateioModo === 'SELECIONADOS' ? input.poloIds || [] : [],
      p_observacao: input.observacao || null,
    });

    if (error) throw error;
    return mapEmprestimoFinanceiro(data);
  },

  async baixarParcela(
    input: BaixarEmprestimoParcelaInput,
  ): Promise<BaixarEmprestimoParcelaResult> {
    const { data, error } = await supabase.rpc('baixar_emprestimo_parcela_polo_secure', {
      p_emprestimo_parcela_id: input.parcelaId,
      p_polo_id: input.poloResponsavelId,
      p_request_id: input.requestId,
      p_conta_bancaria_id: input.contaBancariaId,
      p_data_pagamento: input.dataPagamento,
      p_forma_pagamento: input.formaPagamento,
    });

    if (error) throw error;
    const result = asResultRecord(data);
    return {
      id: typeof result.id === 'string' ? result.id : input.parcelaId,
      status: asParcelaStatus(result.status),
      valorPago: asNumber(result.valor_pago ?? result.valorPago),
      replayed: result.replayed === true,
    };
  },
};
