import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { academicLifecycleKeys } from '../academic-lifecycle.keys';
import { diarioClasseKeys } from '../components/diarios/diario-classe.keys';
import { turmaGradeService } from '../turma-grade.service';
import {
  TurmaAtividadeExtraClasseInput,
  TurmaAulaInput,
  TurmaAulaUpdateInput,
  TurmaDisciplinaConfig,
  TurmaProfessorOption,
} from '../turma-grade.types';
import { gestaoQueryKeys } from '../../../gestao.query-keys';
import { atividadesExtraClasseKeys } from '../components/atividades-extra/atividadesExtraClasse.service';

const useTurmaGradeInvalidation = (turmaId: string) => {
  const queryClient = useQueryClient();

  return useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: academicLifecycleKeys.grade(turmaId) }),
      queryClient.invalidateQueries({ queryKey: academicLifecycleKeys.atividades(turmaId) }),
      queryClient.invalidateQueries({ queryKey: atividadesExtraClasseKeys.turma(turmaId) }),
      queryClient.invalidateQueries({ queryKey: academicLifecycleKeys.diarios(turmaId) }),
      queryClient.invalidateQueries({ queryKey: diarioClasseKeys.aulasByTurma(turmaId) }),
      queryClient.invalidateQueries({ queryKey: diarioClasseKeys.resultadosByTurma(turmaId) }),
      queryClient.invalidateQueries({ queryKey: diarioClasseKeys.praticasByTurma(turmaId) }),
      queryClient.invalidateQueries({ queryKey: gestaoQueryKeys.classesByModality('TECNICO') }),
      queryClient.invalidateQueries({ queryKey: gestaoQueryKeys.activeClassesRoot() }),
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
      professor: TurmaProfessorOption | null;
      currentConfig: TurmaDisciplinaConfig;
    }) => turmaGradeService.assignProfessor(
      turmaId,
      input.disciplinaId,
      input.professor,
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
      professor: TurmaProfessorOption | null;
      configs: Record<string, TurmaDisciplinaConfig>;
    }) => turmaGradeService.assignProfessorToDisciplines(
      turmaId,
      input.disciplineIds,
      input.professor,
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

export const useAddTurmaAtividadeExtraClasseMutation = (
  turmaId: string,
  onSuccess?: (input: TurmaAtividadeExtraClasseInput) => void | Promise<void>,
  onError?: (error: any) => void,
) => {
  const invalidate = useTurmaGradeInvalidation(turmaId);

  return useMutation({
    mutationFn: (input: TurmaAtividadeExtraClasseInput) => turmaGradeService.addAtividadeExtraClasse(turmaId, input),
    onSuccess: async (_data, input) => {
      await invalidate();
      await onSuccess?.(input);
    },
    onError,
  });
};

export const useUpdateTurmaAulaMutation = (
  turmaId: string,
  onSuccess?: (input: TurmaAulaUpdateInput) => void | Promise<void>,
  onError?: (error: any) => void,
) => {
  const invalidate = useTurmaGradeInvalidation(turmaId);

  return useMutation({
    mutationFn: (input: TurmaAulaUpdateInput) => turmaGradeService.updateAula(turmaId, input),
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
