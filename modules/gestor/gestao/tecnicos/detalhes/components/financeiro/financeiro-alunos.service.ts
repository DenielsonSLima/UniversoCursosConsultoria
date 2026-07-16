import { supabase } from '../../../../../../../lib/supabase';
import { formatMatricula } from '../../../../../../../lib/academicUtils';

export interface AlunoFinanceiro {
  id: string;
  nome: string;
  matricula: string;
  valorMatricula: number;
  valorMensalidade: number;
  status: 'em_dia' | 'atrasado' | 'inadimplente';
  parcelasPagas: number;
  totalParcelas: number;
  cobrancaUrl?: string;
  cobrancaDescricao?: string;
}

export interface TurmaFinanceiroDashboard {
  summary: {
    total: number;
    received: number;
    overdue: number;
    overduePercent: number;
  };
  alunos: AlunoFinanceiro[];
}

export const financeiroAlunosService = {
  async getDashboard(turmaId: string): Promise<TurmaFinanceiroDashboard> {
    const { data, error } = await supabase.rpc('get_turma_financeiro_dashboard_secure', {
      p_turma_id: turmaId,
    });

    if (error) throw error;

    const payload: any = Array.isArray(data) ? data[0] : data || {};
    const summary = payload.summary || {};
    const total = Number(summary.total || 0);
    const overdue = Number(summary.overdue || 0);

    return {
      summary: {
        total,
        received: Number(summary.received || 0),
        overdue,
        overduePercent: total > 0 ? (overdue / total) * 100 : 0,
      },
      alunos: (payload.students || []).map((student: any) => ({
        id: student.id,
        nome: student.nome || 'Aluno',
        matricula: formatMatricula(student.id, student.data_matricula, student.polo_id),
        valorMatricula: Number(student.valor_matricula || 0),
        valorMensalidade: Number(student.valor_mensalidade || 0),
        status: student.status || 'em_dia',
        parcelasPagas: Number(student.parcelas_pagas || 0),
        totalParcelas: Number(student.total_parcelas || 0),
        cobrancaUrl: student.cobranca_url || undefined,
        cobrancaDescricao: student.cobranca_descricao || undefined,
      })),
    };
  },
};
