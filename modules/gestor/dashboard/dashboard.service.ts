import { supabase } from '../../../lib/supabase';

export interface DashboardKpis {
  cadastrosAlunosAtivos: number;
  cadastrosAlunosAtivosMudanca: number;
  receitaMes: number;
  receitaMesMudanca: number;
  taxaInadimplencia: number;
  taxaInadimplenciaMudanca: number;
  novasMatriculas: number;
  novasMatriculasMudanca: number;
}

export interface DashboardKpiRequirements {
  students?: boolean;
  revenue?: boolean;
  delinquency?: boolean;
  enrollments?: boolean;
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
  async getKpis(
    poloId?: string | null,
    requirements: DashboardKpiRequirements = {},
  ): Promise<DashboardKpis> {
    const { data, error } = await supabase.rpc('get_dashboard_kpis', {
      p_polo_id: poloId || null,
    });

    if (error) {
      console.error('Erro ao carregar os indicadores permitidos do dashboard:', error);
      throw error;
    }

    const result = Array.isArray(data) ? data[0] : null;
    if (!result || typeof result !== 'object') {
      throw new Error('O backend não retornou os indicadores do painel.');
    }
    const metric = (value: unknown, field: string, required: boolean) => {
      if (value === null || value === undefined) {
        if (required) {
          throw new Error(`Indicador autorizado ausente no painel: ${field}.`);
        }
        return 0;
      }
      if (
        (typeof value !== 'number' && typeof value !== 'string')
        || (typeof value === 'string' && value.trim() === '')
      ) {
        throw new Error(`Indicador inválido retornado pelo painel: ${field}.`);
      }
      const normalized = Number(value);
      if (!Number.isFinite(normalized)) {
        throw new Error(`Indicador inválido retornado pelo painel: ${field}.`);
      }
      return normalized;
    };
    return {
      cadastrosAlunosAtivos: metric(result.alunos_ativos, 'alunos_ativos', Boolean(requirements.students)),
      cadastrosAlunosAtivosMudanca: metric(result.alunos_ativos_mudanca, 'alunos_ativos_mudanca', Boolean(requirements.students)),
      receitaMes: metric(result.receita_mes, 'receita_mes', Boolean(requirements.revenue)),
      receitaMesMudanca: metric(result.receita_mes_mudanca, 'receita_mes_mudanca', Boolean(requirements.revenue)),
      taxaInadimplencia: metric(result.taxa_inadimplencia, 'taxa_inadimplencia', Boolean(requirements.delinquency)),
      taxaInadimplenciaMudanca: metric(result.taxa_inadimplencia_mudanca, 'taxa_inadimplencia_mudanca', Boolean(requirements.delinquency)),
      novasMatriculas: metric(result.novas_matriculas, 'novas_matriculas', Boolean(requirements.enrollments)),
      novasMatriculasMudanca: metric(result.novas_matriculas_mudanca, 'novas_matriculas_mudanca', Boolean(requirements.enrollments)),
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
