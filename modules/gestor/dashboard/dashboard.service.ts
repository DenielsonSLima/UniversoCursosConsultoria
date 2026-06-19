// File: modules/gestor/dashboard/dashboard.service.ts

import { supabase } from '../../../lib/supabase';

export interface DashboardKpis {
  alunosAtivos: number;
  alunosAtivosMudanca: number;
  receitaMes: number;
  receitaMesMudanca: number;
  taxaInadimplencia: number;
  taxaInadimplenciaMudanca: number;
  novasMatriculas: number;
  novasMatriculasMudanca: number;
}

export interface ChartDataPoint {
  mesNum: number;
  anoNum: number;
  mesNome: string;
  receitas: number;
  despesas: number;
}

export interface RecentActivityItem {
  tipoAtividade: 'matricula' | 'pagamento' | 'documento';
  titulo: string;
  descricao: string;
  dataEvento: string;
}

export const dashboardService = {
  async getKpis(poloId?: string | null): Promise<DashboardKpis> {
    const { data, error } = await supabase.rpc('get_dashboard_kpis', {
      p_polo_id: poloId || null
    });
    if (error) {
      console.error('Erro ao chamar get_dashboard_kpis RPC:', error);
      throw error;
    }
    const res = data && data[0] ? data[0] : {};
    return {
      alunosAtivos: Number(res.alunos_ativos || 0),
      alunosAtivosMudanca: Number(res.alunos_ativos_mudanca || 0),
      receitaMes: Number(res.receita_mes || 0),
      receitaMesMudanca: Number(res.receita_mes_mudanca || 0),
      taxaInadimplencia: Number(res.taxa_inadimplencia || 0),
      taxaInadimplenciaMudanca: Number(res.taxa_inadimplencia_mudanca || 0),
      novasMatriculas: Number(res.novas_matriculas || 0),
      novasMatriculasMudanca: Number(res.novas_matriculas_mudanca || 0)
    };
  },

  async getChartData(poloId?: string | null, months: number = 6): Promise<ChartDataPoint[]> {
    const { data, error } = await supabase.rpc('get_dashboard_chart_data', {
      p_polo_id: poloId || null,
      p_months: months
    });
    if (error) {
      console.error('Erro ao chamar get_dashboard_chart_data RPC:', error);
      throw error;
    }
    return (data || []).map((row: any) => ({
      mesNum: Number(row.mes_num || 0),
      anoNum: Number(row.ano_num || 0),
      mesNome: row.mes_nome || '',
      receitas: Number(row.receitas || 0),
      despesas: Number(row.despesas || 0)
    }));
  },

  async getRecentActivity(poloId?: string | null, limit: number = 5): Promise<RecentActivityItem[]> {
    const { data, error } = await supabase.rpc('get_dashboard_recent_activity', {
      p_polo_id: poloId || null,
      p_limit: limit
    });
    if (error) {
      console.error('Erro ao chamar get_dashboard_recent_activity RPC:', error);
      throw error;
    }
    return (data || []).map((row: any) => ({
      tipoAtividade: row.tipo_atividade,
      titulo: row.titulo || '',
      descricao: row.descricao || '',
      dataEvento: row.data_evento || ''
    }));
  }
};
