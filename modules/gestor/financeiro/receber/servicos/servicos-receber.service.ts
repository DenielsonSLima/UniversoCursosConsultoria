import { supabase } from '../../../../../lib/supabase';
import { readReceivablesRequest } from '../../financeiro.receivables-request';
import { parseServiceReceivablesPage, parseServiceReceivablesSummary, serviceReceivablesArgs, type ServiceReceivablesFilters } from './servicos-receber.contract';

const read = async (name: string, args: Record<string, unknown>, signal?: AbortSignal) => {
  const { data, error } = await readReceivablesRequest(requestSignal =>
    supabase.rpc(name, args).abortSignal(requestSignal).retry(false), signal);
  if (error) throw error;
  return data;
};
export const serviceReceivablesService = {
  async page(filters: ServiceReceivablesFilters, page: number, pageSize: number, signal?: AbortSignal) {
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new Error('Página inválida.');
    const result = parseServiceReceivablesPage(await read('listar_servicos_receber_secure',
      { ...serviceReceivablesArgs(filters), p_page: page, p_page_size: pageSize }, signal), page, pageSize);
    if (filters.poloId && filters.poloId !== 'todos' && result.rows.some(row => row.poloId !== filters.poloId)) {
      throw new Error('A consulta retornou outra unidade. Atualize os serviços antes de continuar.');
    }
    return result;
  },
  async summary(filters: ServiceReceivablesFilters, signal?: AbortSignal) {
    return parseServiceReceivablesSummary(await read('get_servicos_receber_summary', serviceReceivablesArgs(filters), signal));
  },
};
