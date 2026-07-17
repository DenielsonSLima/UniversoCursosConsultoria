// File: modules/gestor/caixa/caixa.service.ts

import { supabase } from '../../../lib/supabase';
import { queryOptions } from '@tanstack/react-query';

export interface CaixaDashboardData {
  saldoTotalContas: number;
  saldosIndividuais: Array<{
    id: string;
    banco: string;
    agencia: string;
    conta: string;
    saldoAtual: number;
    poloNome: string;
    poloId: string;
  }>;
  totalReceber: number;
  receberPorTipo: Array<{
    categoria: string;
    valor: number;
  }>;
  totalPagar: number;
  pagarPorTipo: Array<{
    categoria: string;
    valor: number;
  }>;
  mensalidadesEmAtraso: {
    quantidade: number;
    valorTotal: number;
  };
  fluxo3Meses: Array<{
    mesNome: string;
    creditos: number;
    debitos: number;
  }>;
}

export const PRINCIPAL_POLO_ID = '44444444-4444-4444-4444-444444444444';

export const caixaService = {
  async getCaixaDashboardData(poloId?: string): Promise<CaixaDashboardData> {
    const { data, error } = await supabase.rpc('get_caixa_dashboard_secure', {
      p_polo_id: poloId && poloId !== 'todos' ? poloId : null,
    });

    if (error) {
      console.error('Erro ao buscar o painel agregado do Caixa:', error);
      throw error;
    }

    const payload: any = Array.isArray(data) ? data[0] : data || {};

    return {
      saldoTotalContas: Number(payload.saldo_total_contas || 0),
      saldosIndividuais: (payload.saldos_individuais || []).map((account: any) => ({
        id: account.id,
        banco: account.banco || '',
        agencia: account.agencia || '',
        conta: account.conta || '',
        saldoAtual: Number(account.saldo_atual || 0),
        poloNome: account.polo_nome || 'Polo Geral',
        poloId: account.polo_id || '',
      })),
      totalReceber: Number(payload.total_receber || 0),
      receberPorTipo: (payload.receber_por_tipo || []).map((item: any) => ({
        categoria: item.categoria,
        valor: Number(item.valor || 0),
      })),
      totalPagar: Number(payload.total_pagar || 0),
      pagarPorTipo: (payload.pagar_por_tipo || []).map((item: any) => ({
        categoria: item.categoria,
        valor: Number(item.valor || 0),
      })),
      mensalidadesEmAtraso: {
        quantidade: Number(payload.mensalidades_em_atraso?.quantidade || 0),
        valorTotal: Number(payload.mensalidades_em_atraso?.valor_total || 0),
      },
      fluxo3Meses: (payload.fluxo_3_meses || []).map((month: any) => ({
        mesNome: `${month.mes_nome}/${month.ano}`,
        creditos: Number(month.creditos || 0),
        debitos: Number(month.debitos || 0),
      })),
    };
  }
};

export const caixaQueryKeys = {
  root: ['caixa'] as const,
  dashboards: ['caixa', 'dashboard'] as const,
  dashboard: (poloId?: string | null) => ['caixa', 'dashboard', poloId || 'todos'] as const,
};

export const caixaDashboardQueryOptions = (poloId?: string | null) => queryOptions({
  queryKey: caixaQueryKeys.dashboard(poloId),
  queryFn: () => caixaService.getCaixaDashboardData(poloId || undefined),
  staleTime: 5 * 60_000,
  gcTime: 30 * 60_000,
});
