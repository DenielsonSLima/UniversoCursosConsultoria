import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { academicLifecycleKeys } from '../academic-lifecycle.keys';
import { turmaGradeService } from '../turma-grade.service';
import { TurmaAulaInput, TurmaDisciplinaConfig } from '../turma-grade.types';

const useTurmaGradeInvalidation = (turmaId: string) => {
  const queryClient = useQueryClient();

  return useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: academicLifecycleKeys.grade(turmaId) }),
      queryClient.invalidateQueries({ queryKey: academicLifecycleKeys.diarios(turmaId) }),
    ]);
  }, [queryClient, turmaId]);
};

export const useTurmaGradeData = (turmaId: string, cursoId: string) => useQuery({
  queryKey: academicLifecycleKeys.grade(turmaId),
  queryFn: () => turmaGradeService.getGradeData(turmaId, cursoId),
  staleTime: 15_000,
});

export const useAssignProfessorMutation = (
  turmaId: string,
  onSuccess?: () => void | Promise<void>,
  onError?: (error: any) => void,
) => {
  const invalidate = useTurmaGradeInvalidation(turmaId);

  return useMutation({
    mutationFn: (input: {
      disciplinaId: string;
      professorName: string | null;
      currentConfig: TurmaDisciplinaConfig;
    }) => turmaGradeService.assignProfessor(
      turmaId,
      input.disciplinaId,
      input.professorName,
      input.currentConfig,
    ),
    onSuccess: async () => {
      await invalidate();
      await onSuccess?.();
    },
    onError,
  });
};

export const useAssignProfessorToAllMutation = (
  turmaId: string,
  onSuccess?: () => void | Promise<void>,
  onError?: (error: any) => void,
) => {
  const invalidate = useTurmaGradeInvalidation(turmaId);

  return useMutation({
    mutationFn: (input: {
      disciplineIds: string[];
      professorName: string | null;
      configs: Record<string, TurmaDisciplinaConfig>;
    }) => turmaGradeService.assignProfessorToDisciplines(
      turmaId,
      input.disciplineIds,
      input.professorName,
      input.configs,
    ),
    onSuccess: async () => {
      await invalidate();
      await onSuccess?.();
    },
    onError,
  });
};

export const useToggleDisciplinaConcluidaMutation = (
  turmaId: string,
  onError?: (error: any) => void,
) => {
  const invalidate = useTurmaGradeInvalidation(turmaId);

  return useMutation({
    mutationFn: (input: {
      disciplinaId: string;
      currentConfig: TurmaDisciplinaConfig;
    }) => turmaGradeService.toggleConcluida(
      turmaId,
      input.disciplinaId,
      input.currentConfig,
    ),
    onSuccess: invalidate,
    onError,
  });
};

export const useAddTurmaAulaMutation = (
  turmaId: string,
  onSuccess?: (input: TurmaAulaInput) => void | Promise<void>,
  onError?: (error: any) => void,
) => {
  const invalidate = useTurmaGradeInvalidation(turmaId);

  return useMutation({
    mutationFn: (input: TurmaAulaInput) => turmaGradeService.addAula(turmaId, input),
    onSuccess: async (_data, input) => {
      await invalidate();
      await onSuccess?.(input);
    },
    onError,
  });
};

export const useRemoveTurmaAulaMutation = (
  turmaId: string,
  onSuccess?: () => void | Promise<void>,
  onError?: (error: any) => void,
) => {
  const invalidate = useTurmaGradeInvalidation(turmaId);

  return useMutation({
    mutationFn: (aulaId: string) => turmaGradeService.removeAula(aulaId),
    onSuccess: async () => {
      await invalidate();
      await onSuccess?.();
    },
    onError,
  });
};
