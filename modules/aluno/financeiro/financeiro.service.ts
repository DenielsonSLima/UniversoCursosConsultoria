import { supabase } from '../../../lib/supabase';
import {
  parseAlunoFinancialListPayload,
  parseAlunoFinancialReceiptPayload,
} from './financeiro.contract';
import type { AlunoFinancialFilters } from './financeiro.types';

const abortedRequest = () => {
  const error = new Error('A consulta foi cancelada.');
  error.name = 'AbortError';
  return error;
};

const requestError = (scope: 'list' | 'receipt', signal?: AbortSignal) => {
  if (signal?.aborted) return abortedRequest();
  return new Error(scope === 'receipt'
    ? 'ALUNO_FINANCE_RECEIPT_UNAVAILABLE'
    : 'ALUNO_FINANCE_LIST_UNAVAILABLE');
};

const rpcList = async (
  alunoId: string,
  filters: AlunoFinancialFilters,
  signal?: AbortSignal,
  paymentId?: string | null,
) => {
  let request = supabase.rpc('portal_aluno_financeiro_listar', {
    p_aluno_id: alunoId,
    p_busca: paymentId ? null : filters.search || null,
    p_data_inicial: paymentId ? null : filters.startDate || null,
    p_data_final: paymentId ? null : filters.endDate || null,
    p_modalidade: paymentId ? 'TODOS' : filters.modality,
    p_status: paymentId ? 'TODOS' : filters.status,
    p_pagina: paymentId ? 1 : filters.page,
    p_tamanho_pagina: paymentId ? 1 : filters.pageSize,
    p_lancamento_id: paymentId || null,
  });
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw requestError('list', signal);
  try {
    return parseAlunoFinancialListPayload(data);
  } catch {
    throw requestError('list', signal);
  }
};

export const alunoFinanceiroService = {
  list(
    alunoId: string,
    filters: AlunoFinancialFilters,
    signal?: AbortSignal,
  ) {
    return rpcList(alunoId, filters, signal);
  },

  async getPayment(alunoId: string, paymentId: string, signal?: AbortSignal) {
    const payload = await rpcList(alunoId, {
      search: '',
      startDate: '',
      endDate: '',
      modality: 'TODOS',
      status: 'TODOS',
      page: 1,
      pageSize: 1,
    }, signal, paymentId);
    return payload.items[0] || null;
  },

  async getReceipt(alunoId: string, paymentId: string, signal?: AbortSignal) {
    let request = supabase.rpc('portal_aluno_financeiro_preparar_recibo', {
      p_aluno_id: alunoId,
      p_lancamento_id: paymentId,
    });
    if (signal) request = request.abortSignal(signal);
    const { data, error } = await request;
    if (error) throw requestError('receipt', signal);
    try {
      return parseAlunoFinancialReceiptPayload(data);
    } catch {
      throw requestError('receipt', signal);
    }
  },
};
