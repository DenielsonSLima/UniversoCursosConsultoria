import { supabase } from '../../../../lib/supabase';
import { proescConsoleErrorMessage } from './consulta-api-proesc.filters';
import type {
  ProescConsoleFilters,
  ProescDashboard,
  ProescFeedContext,
  ProescFeedItems,
  ProescFeedPage,
} from './consulta-api-proesc.types';

export const proescConsoleKey = ['configuracoes', 'consulta-api-proesc'] as const;

export const proescConsoleParams = (filters: ProescConsoleFilters) => ({
  p_polo_id: filters.poloId,
  p_started_from: filters.startedFrom,
  p_started_to: filters.startedTo,
});

async function readConsoleRpc(name: string, params: Record<string, unknown>) {
  // Não encaminhar exceções de transporte ou mensagens livres do servidor à tela.
  let response;
  try {
    response = await supabase.rpc(name, params);
  } catch {
    throw new Error(proescConsoleErrorMessage());
  }
  if (response.error) throw new Error(proescConsoleErrorMessage(response.error.code));
  return response.data;
}

export const consultaApiProescService = {
  async dashboard(filters: ProescConsoleFilters): Promise<ProescDashboard> {
    const data = await readConsoleRpc(
      'get_proesc_reconciliation_dashboard',
      proescConsoleParams(filters),
    );
    if (!data || typeof data.available !== 'boolean') {
      throw new Error('Resposta de acompanhamento Proesc indisponível.');
    }
    return data as ProescDashboard;
  },

  async feed<C extends ProescFeedContext>(
    context: C,
    filters: ProescConsoleFilters,
    page: number,
  ): Promise<ProescFeedPage<ProescFeedItems[C]>> {
    const data = await readConsoleRpc('get_proesc_reconciliation_feed_page', {
      ...proescConsoleParams(filters),
      p_context: context,
      p_run_id: null,
      p_page: page,
      p_page_size: 20,
    });
    if (!data || !Array.isArray(data.items) || !Number.isInteger(data.totalPages) || data.totalPages < 1) {
      throw new Error('Resposta de registros Proesc indisponível.');
    }
    return data as ProescFeedPage<ProescFeedItems[C]>;
  },
};
