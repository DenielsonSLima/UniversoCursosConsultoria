import { useQuery } from '@tanstack/react-query';
import { contratosAlunoKeys } from '../contratos-aluno.keys';
import { contratosAlunoService } from '../services/contratos-aluno.service';

export const useContratosAlunoWorkspace = (poloId: string | null) => useQuery({
  queryKey: contratosAlunoKeys.workspace(poloId || 'sem-polo'),
  queryFn: () => contratosAlunoService.getWorkspace(poloId!),
  enabled: Boolean(poloId),
  staleTime: 30_000,
  gcTime: 10 * 60_000,
  retry: 1,
});
