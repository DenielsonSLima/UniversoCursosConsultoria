import { supabase } from '../../../../lib/supabase';
import { financeiroQueryKeys } from '../../financeiro/financeiro.queryKeys';
import {
  mapDashboardStudentReceivable,
  type DashboardStudentReceivable,
} from './dashboard-student-finance.model';

export const dashboardStudentFinanceSearchKey = (
  searchQuery: string,
  poloId?: string | null,
) => [
  ...financeiroQueryKeys.alunoReceivables,
  'dashboard-existing-title-v1',
  searchQuery.trim(),
  poloId || 'todos',
] as const;

export const searchDashboardStudentReceivables = async (
  searchQuery: string,
  poloId?: string | null,
): Promise<DashboardStudentReceivable[]> => {
  const normalizedSearch = searchQuery.trim();
  if (normalizedSearch.length < 2) return [];

  const { data, error } = await supabase.rpc('search_financeiro_aluno_receivables_secure', {
    p_search: normalizedSearch,
    p_polo_id: poloId && poloId !== 'todos' ? poloId : null,
    p_limit: 50,
  });

  if (error) {
    console.error('Erro ao buscar contas a receber de alunos no início:', error);
    throw error;
  }

  return (Array.isArray(data) ? data : [])
    .map((row) => mapDashboardStudentReceivable(row as Record<string, unknown>))
    .filter((row): row is DashboardStudentReceivable => row !== null);
};
