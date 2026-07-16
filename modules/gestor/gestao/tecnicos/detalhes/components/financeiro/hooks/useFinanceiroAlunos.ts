import { queryOptions, useQuery } from '@tanstack/react-query';
import { financeiroAlunosService } from '../financeiro-alunos.service';

export const turmaFinanceiroDashboardKeys = {
  turma: (turmaId: string) => ['turma-financeiro', turmaId, 'dashboard'] as const,
};

export const turmaFinanceiroDashboardQueryOptions = (turmaId: string) => queryOptions({
  queryKey: turmaFinanceiroDashboardKeys.turma(turmaId),
  queryFn: () => financeiroAlunosService.getDashboard(turmaId),
  staleTime: 5 * 60_000,
  gcTime: 30 * 60_000,
});

export const useTurmaFinanceiroDashboard = (turmaId: string) => useQuery(
  turmaFinanceiroDashboardQueryOptions(turmaId),
);
