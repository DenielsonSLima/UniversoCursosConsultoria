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
      p_polo_id: poloId || null,
    });

    if (error) {
      console.error('Erro ao carregar os indicadores permitidos do dashboard:', error);
      throw error;
    }

    const result = data?.[0] || {};
    return {
      alunosAtivos: Number(result.alunos_ativos || 0),
      alunosAtivosMudanca: Number(result.alunos_ativos_mudanca || 0),
      receitaMes: Number(result.receita_mes || 0),
      receitaMesMudanca: Number(result.receita_mes_mudanca || 0),
      taxaInadimplencia: Number(result.taxa_inadimplencia || 0),
      taxaInadimplenciaMudanca: Number(result.taxa_inadimplencia_mudanca || 0),
      novasMatriculas: Number(result.novas_matriculas || 0),
      novasMatriculasMudanca: Number(result.novas_matriculas_mudanca || 0),
    };
  },

  async getChartData(poloId?: string | null, months = 6): Promise<ChartDataPoint[]> {
    const { data, error } = await supabase.rpc('get_dashboard_chart_data', {
      p_polo_id: poloId || null,
      p_months: months,
    });

    if (error) {
      console.error('Erro ao carregar o gráfico permitido do dashboard:', error);
      throw error;
    }

    return (data || []).map((row: any) => ({
      mesNum: Number(row.mes_num || 0),
      anoNum: Number(row.ano_num || 0),
      mesNome: row.mes_nome || '',
      receitas: Number(row.receitas || 0),
      despesas: Number(row.despesas || 0),
    }));
  },

  async getRecentActivity(poloId?: string | null, limit = 5): Promise<RecentActivityItem[]> {
    const { data, error } = await supabase.rpc('get_dashboard_recent_activity', {
      p_polo_id: poloId || null,
      p_limit: limit,
    });

    if (error) {
      console.error('Erro ao carregar as atividades permitidas do dashboard:', error);
      throw error;
    }

    return (data || []).map((row: any) => ({
      tipoAtividade: row.tipo_atividade,
      titulo: row.titulo || '',
      descricao: row.descricao || '',
      dataEvento: row.data_evento || '',
    }));
  },
};
