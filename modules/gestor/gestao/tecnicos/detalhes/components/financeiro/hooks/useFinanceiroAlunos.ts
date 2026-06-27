import { useQuery } from '@tanstack/react-query';
import { financeiroAlunosService } from '../financeiro-alunos.service';

export const financeiroAlunosKeys = {
  turma: (turmaId: string) => ['financeiro-alunos', turmaId] as const,
};

export const useFinanceiroAlunos = (turmaId: string) => useQuery({
  queryKey: financeiroAlunosKeys.turma(turmaId),
  queryFn: () => financeiroAlunosService.getAlunos(turmaId),
});
