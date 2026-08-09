import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { planoCursoKeys } from './plano-curso.keys';
import {
  beginLocalPlanoCursoMutation,
  cancelLocalPlanoCursoMutation,
  settleLocalPlanoCursoMutation,
} from './plano-curso.realtime';
import { planoCursoService } from './plano-curso.service';
import type {
  PlanoCursoConclusaoInput,
  PlanoCursoProfessorResumo,
  PlanoCursoSaveInput,
  PlanoCursoWorkspace,
} from './plano-curso.types';

const reconcileProfessorList = (
  current: PlanoCursoProfessorResumo[] | undefined,
  workspace: PlanoCursoWorkspace,
) => current?.map((item) => (
  item.turmaId === workspace.turmaId && item.disciplinaId === workspace.disciplinaId
    ? {
        planoId: workspace.planoId,
        status: workspace.status,
        revisao: workspace.revisao,
        turmaId: workspace.turmaId,
        disciplinaId: workspace.disciplinaId,
        professorId: workspace.professorId,
        turmaNome: workspace.turmaNome,
        turmaCodigo: workspace.turmaCodigo,
        cursoNome: workspace.cursoNome,
        poloId: workspace.poloId,
        poloNome: workspace.poloNome,
        disciplinaNome: workspace.disciplinaNome,
        professorNome: workspace.professorNome,
        totalDias: workspace.totalDias,
        totalAulas: workspace.totalAulas,
        primeiraAula: workspace.primeiraAula,
        ultimaAula: workspace.ultimaAula,
        updatedAt: workspace.updatedAt,
        templateRevision: workspace.templateRevision,
        documentoFingerprint: workspace.documentoFingerprint,
      }
    : item
));

export const useProfessorPlanosCurso = (professorId: string, poloId: string) => useQuery({
  queryKey: planoCursoKeys.professorList(professorId, poloId),
  queryFn: () => planoCursoService.listProfessor(poloId),
  enabled: Boolean(professorId && poloId),
  staleTime: 20_000,
});

export const useProfessorPlanoCursoWorkspace = (
  professorId: string,
  poloId: string,
  turmaId: string,
  disciplinaId: string,
) => useQuery({
  queryKey: planoCursoKeys.professorWorkspace(
    professorId,
    poloId,
    turmaId,
    disciplinaId,
  ),
  queryFn: () => planoCursoService.getProfessorWorkspace(turmaId, disciplinaId),
  enabled: Boolean(professorId && poloId && turmaId && disciplinaId),
  staleTime: 10_000,
});

interface ProfessorMutationOptions {
  professorId: string;
  poloId: string;
  onSuccess?: (workspace: PlanoCursoWorkspace) => void | Promise<void>;
  onError?: (error: unknown) => void;
}

const requirePersistedWorkspace = (
  workspace: PlanoCursoWorkspace,
  message: string,
) => {
  if (!workspace.planoId) throw new Error(message);
  return workspace as PlanoCursoWorkspace & { planoId: string };
};

const isPostgrestFunctionCacheError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; message?: unknown; details?: unknown };
  const message = [candidate.message, candidate.details]
    .filter((value): value is string => typeof value === 'string')
    .join(' ');
  return candidate.code === 'PGRST202'
    || /schema cache|could not find the function/i.test(message);
};

const shouldRetryGestaoPlanosCurso = (failureCount: number, error: unknown) => (
  failureCount < 1 && !isPostgrestFunctionCacheError(error)
);

export const useSaveProfessorPlanoCurso = ({
  professorId,
  poloId,
  onSuccess,
  onError,
}: ProfessorMutationOptions) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: PlanoCursoSaveInput) => requirePersistedWorkspace(
      await planoCursoService.saveProfessor(input),
      'O servidor não confirmou a identificação do Plano de Curso.',
    ),
    onMutate: (input) => ({
      realtimeToken: beginLocalPlanoCursoMutation(
        input.turmaId,
        input.disciplinaId,
      ),
    }),
    onSuccess: async (workspace, input, context) => {
      settleLocalPlanoCursoMutation(context.realtimeToken, workspace.planoId, workspace.revisao);
      queryClient.setQueryData(
        planoCursoKeys.professorWorkspace(
          professorId,
          poloId,
          input.turmaId,
          input.disciplinaId,
        ),
        workspace,
      );
      queryClient.setQueryData<PlanoCursoProfessorResumo[]>(
        planoCursoKeys.professorList(professorId, poloId),
        (current) => reconcileProfessorList(current, workspace),
      );
      void queryClient.invalidateQueries({
        queryKey: [...planoCursoKeys.all, 'document', workspace.planoId],
        refetchType: 'none',
      });
      await onSuccess?.(workspace);
    },
    onError: (error, _input, context) => {
      if (context?.realtimeToken) cancelLocalPlanoCursoMutation(context.realtimeToken);
      onError?.(error);
    },
  });
};

export const useConcludeProfessorPlanoCurso = ({
  professorId,
  poloId,
  onSuccess,
  onError,
}: ProfessorMutationOptions) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: PlanoCursoConclusaoInput) => requirePersistedWorkspace(
      await planoCursoService.concludeProfessor(input),
      'O servidor não confirmou a conclusão do Plano de Curso.',
    ),
    onMutate: (input) => ({
      realtimeToken: beginLocalPlanoCursoMutation(
        input.turmaId,
        input.disciplinaId,
      ),
    }),
    onSuccess: async (workspace, input, context) => {
      settleLocalPlanoCursoMutation(context.realtimeToken, workspace.planoId, workspace.revisao);
      queryClient.setQueryData(
        planoCursoKeys.professorWorkspace(
          professorId,
          poloId,
          input.turmaId,
          input.disciplinaId,
        ),
        workspace,
      );
      queryClient.setQueryData<PlanoCursoProfessorResumo[]>(
        planoCursoKeys.professorList(professorId, poloId),
        (current) => reconcileProfessorList(current, workspace),
      );
      void queryClient.invalidateQueries({
        queryKey: [...planoCursoKeys.all, 'document', workspace.planoId],
        refetchType: 'none',
      });
      await onSuccess?.(workspace);
    },
    onError: (error, _input, context) => {
      if (context?.realtimeToken) cancelLocalPlanoCursoMutation(context.realtimeToken);
      onError?.(error);
    },
  });
};

export const useGestaoPlanosCurso = (turmaId: string) => useQuery({
  queryKey: planoCursoKeys.gestaoStatusList(turmaId),
  queryFn: () => planoCursoService.listGestao(turmaId),
  enabled: Boolean(turmaId),
  staleTime: 20_000,
  retry: shouldRetryGestaoPlanosCurso,
  retryDelay: 500,
});

export const useGestaoPlanoCurso = (
  turmaId: string,
  disciplinaId: string,
  professorId?: string | null,
) => useQuery({
  queryKey: planoCursoKeys.gestaoDetail(turmaId, disciplinaId, professorId),
  queryFn: () => planoCursoService.getGestaoWorkspace(turmaId, disciplinaId, professorId),
  enabled: Boolean(turmaId && disciplinaId),
  staleTime: 20_000,
});

export const usePlanoCursoDocumento = (
  planoId: string,
  revisao: number,
  templateRevision: number | null,
  documentoFingerprint: string,
) => useQuery({
  queryKey: planoCursoKeys.document(
    planoId,
    revisao,
    templateRevision ?? 0,
    documentoFingerprint,
  ),
  queryFn: async () => {
    const response = await planoCursoService.getDocument(planoId);
    if (
      response.revisao !== revisao
      || response.templateRevision !== templateRevision
      || response.documentoFingerprint !== documentoFingerprint
    ) {
      throw new Error('A identidade canônica do documento mudou. Reabra a prévia pela Grade.');
    }
    return response;
  },
  enabled: Boolean(
    planoId
    && revisao >= 0
    && templateRevision !== null
    && documentoFingerprint,
  ),
  // O payload é versionado, mas a assinatura privada usa URL temporária.
  staleTime: 45 * 60 * 1_000,
});
