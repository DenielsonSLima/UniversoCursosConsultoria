import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { matriculaTecnicaFinanceiroKeys } from '../matricula-tecnica-financeiro.keys';
import {
  isFinanceiroContractError,
  matriculaTecnicaFinanceiroService,
} from '../matricula-tecnica-financeiro.service';
import type {
  AtivarFinanceiroMatriculaTecnicaInput,
  AtivarFinanceiroMatriculasTecnicasLoteInput,
  MatriculaTecnicaFinanceiroRow,
  MatriculaTecnicaFinanceiroWorkspace,
  PreverRegraFinanceiraTecnicaInput,
  PreVincularAlunoTecnicoInput,
  RemoverOverrideFinanceiroTecnicoInput,
  SalvarOverrideFinanceiroTecnicoInput,
  SalvarRegraFinanceiraTecnicaInput,
} from '../matricula-tecnica-financeiro.types';
import { markFinanceiroRequestReconciled } from '../matricula-tecnica-financeiro.echo';

export const createFinanceiroRequestId = () => crypto.randomUUID();

export const matriculaTecnicaFinanceiroWorkspaceQueryOptions = (
  turmaId: string,
  alunoId?: string | null,
) => queryOptions({
  queryKey: matriculaTecnicaFinanceiroKeys.workspace(turmaId, alunoId),
  queryFn: () => matriculaTecnicaFinanceiroService.getWorkspace(turmaId, alunoId),
  staleTime: 30_000,
  gcTime: 15 * 60_000,
  retry: (failureCount, error) => (
    !isFinanceiroContractError(error) && failureCount < 1
  ),
});

export const useMatriculaTecnicaFinanceiroWorkspace = (
  turmaId: string,
  alunoId?: string | null,
  enabled = true,
) => useQuery({
  ...matriculaTecnicaFinanceiroWorkspaceQueryOptions(turmaId, alunoId),
  enabled: enabled && Boolean(turmaId),
});

export const usePreVinculoAlunoTecnicoContexto = (
  turmaId: string,
  alunoId?: string | null,
  enabled = true,
) => useQuery({
  queryKey: matriculaTecnicaFinanceiroKeys.preVinculoContexto(turmaId, alunoId || ''),
  queryFn: () => matriculaTecnicaFinanceiroService.getPreVinculoContexto(turmaId, alunoId || ''),
  enabled: enabled && Boolean(turmaId) && Boolean(alunoId),
  staleTime: 30_000,
  gcTime: 15 * 60_000,
});

export const usePreverRegraFinanceiraTecnica = (
  input: PreverRegraFinanceiraTecnicaInput,
  enabled = true,
) => useQuery({
  queryKey: matriculaTecnicaFinanceiroKeys.previewRegra(
    input.turmaId,
    JSON.stringify(input.regra),
  ),
  queryFn: () => matriculaTecnicaFinanceiroService.previewRegra(input),
  enabled: enabled && Boolean(input.turmaId),
  staleTime: 30_000,
  gcTime: 5 * 60_000,
});

const reconcileWorkspace = (
  queryClient: QueryClient,
  turmaId: string,
  workspace: MatriculaTecnicaFinanceiroWorkspace,
) => {
  queryClient.setQueriesData<MatriculaTecnicaFinanceiroWorkspace>(
    { queryKey: matriculaTecnicaFinanceiroKeys.turma(turmaId) },
    (current) => {
      if (!current) return current;
      if (!current.aluno) return workspace;
      return {
        ...workspace,
        aluno: current.aluno,
        matriculas: workspace.matriculas.filter((row) => row.alunoId === current.aluno?.alunoId),
      };
    },
  );
};

const reconcileRow = (
  queryClient: QueryClient,
  turmaId: string,
  row: MatriculaTecnicaFinanceiroRow,
) => {
  queryClient.setQueriesData<MatriculaTecnicaFinanceiroWorkspace>(
    { queryKey: matriculaTecnicaFinanceiroKeys.turma(turmaId) },
    (current) => {
      if (!current) return current;
      const existingIndex = current.matriculas.findIndex((item) => item.matriculaId === row.matriculaId);
      const matriculas = existingIndex < 0
        ? [...current.matriculas, row]
        : current.matriculas.map((item) => item.matriculaId === row.matriculaId ? row : item);
      return {
        ...current,
        matriculas,
      };
    },
  );
};

export const usePreVincularAlunoTecnico = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PreVincularAlunoTecnicoInput) => (
      matriculaTecnicaFinanceiroService.preVincular(input)
    ),
    onSuccess: (result, input) => {
      reconcileRow(queryClient, input.turmaId, result.matricula);
      markFinanceiroRequestReconciled(result.requestId);
    },
  });
};

export const useSalvarRegraFinanceiraTecnica = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SalvarRegraFinanceiraTecnicaInput) => (
      matriculaTecnicaFinanceiroService.salvarRegra(input)
    ),
    onSuccess: (result, input) => {
      reconcileWorkspace(queryClient, input.turmaId, result.workspace);
      markFinanceiroRequestReconciled(result.requestId);
    },
  });
};

export const useSalvarOverrideFinanceiroTecnico = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SalvarOverrideFinanceiroTecnicoInput) => (
      matriculaTecnicaFinanceiroService.salvarOverride(input)
    ),
    onSuccess: (result, input) => {
      reconcileWorkspace(queryClient, input.turmaId, result.workspace);
      markFinanceiroRequestReconciled(result.requestId);
    },
  });
};

export const useRemoverOverrideFinanceiroTecnico = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RemoverOverrideFinanceiroTecnicoInput) => (
      matriculaTecnicaFinanceiroService.removerOverride(input)
    ),
    onSuccess: (result, input) => {
      reconcileWorkspace(queryClient, input.turmaId, result.workspace);
      markFinanceiroRequestReconciled(result.requestId);
    },
  });
};

export const useAtivarFinanceiroMatriculaTecnica = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AtivarFinanceiroMatriculaTecnicaInput) => (
      matriculaTecnicaFinanceiroService.ativarIndividual(input)
    ),
    onSuccess: (result, input) => {
      reconcileWorkspace(queryClient, input.turmaId, result.workspace);
      markFinanceiroRequestReconciled(result.requestId);
    },
  });
};

export const useAtivarFinanceiroMatriculasTecnicasLote = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AtivarFinanceiroMatriculasTecnicasLoteInput) => (
      matriculaTecnicaFinanceiroService.ativarLote(input)
    ),
    onSuccess: (result, input) => {
      reconcileWorkspace(queryClient, input.turmaId, result.workspace);
      markFinanceiroRequestReconciled(result.requestId);
    },
  });
};
