import { supabase } from '../../../../../lib/supabase';
import { readReceivablesRequest } from '../../financeiro.receivables-request';
import { parseServiceReceivablesPage, parseServiceReceivablesSummary, parseServiceReceivablesGroups, parseServiceReceivablesExport, serviceReceivablesArgs, type ServiceReceivablesFilters } from './servicos-receber.contract';

const read = async (name: string, args: Record<string, unknown>, signal?: AbortSignal) => {
  const { data, error } = await readReceivablesRequest(requestSignal =>
    supabase.rpc(name, args).abortSignal(requestSignal).retry(false), signal);
  if (error) throw error;
  return data;
};
export const serviceReceivablesService = {
  async exportSnapshot(filters: ServiceReceivablesFilters, signal?: AbortSignal) {
    let payload: unknown;
    try { payload = await read('exportar_servicos_receber_secure', serviceReceivablesArgs(filters), signal); }
    catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === '54000') {
        throw new Error('O extrato tem mais de 5.000 registros. Refine os filtros para exportar.', { cause: error });
      }
      throw error;
    }
    const result = parseServiceReceivablesExport(payload);
    if (filters.poloId && filters.poloId !== 'todos' && result.rows.some(row => row.poloId !== filters.poloId)) {
      throw new Error('O extrato retornou outra unidade. Reabra a consulta antes de continuar.');
    }
    return result;
  },
  async groups(filters: ServiceReceivablesFilters, page: number, pageSize: number, signal?: AbortSignal) {
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new Error('Página inválida.');
    const result = parseServiceReceivablesGroups(await read('get_servicos_receber_groups',
      { ...serviceReceivablesArgs(filters), p_page: page, p_page_size: pageSize }, signal), page, pageSize);
    if (filters.poloId && filters.poloId !== 'todos' && result.groups.some(group => group.first.poloId !== filters.poloId)) {
      throw new Error('A consulta retornou outra unidade. Atualize os serviços antes de continuar.');
    }
    return result;
  },
  async groupItems(filters: ServiceReceivablesFilters, partnerId: string, page: number, pageSize: number, signal?: AbortSignal) {
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(partnerId)
      || !Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 25) throw new Error('Página inválida.');
    const result = parseServiceReceivablesPage(await read('listar_servicos_receber_group_items',
      { ...serviceReceivablesArgs(filters), p_partner_id: partnerId, p_page: page, p_page_size: pageSize }, signal), page, pageSize);
    if (result.rows.some(row => row.clienteId !== partnerId
      || filters.poloId && filters.poloId !== 'todos' && row.poloId !== filters.poloId)) {
      throw new Error('A consulta retornou outro parceiro ou unidade. Atualize os serviços antes de continuar.');
    }
    return result;
  },
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
