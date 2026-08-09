import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { academicLifecycleKeys } from '../academic-lifecycle.keys';
import { diarioClasseKeys } from '../components/diarios/diario-classe.keys';
import {
  turmaGradeService,
  type TurmaProfessorAssignmentRow,
} from '../turma-grade.service';
import {
  TurmaAtividadeExtraClasseInput,
  TurmaAulaInput,
  TurmaAulaPlanejada,
  TurmaAulaUpdateInput,
  TurmaDisciplinaConfig,
  TurmaGradeData,
  TurmaProfessorOption,
} from '../turma-grade.types';
import { gestaoQueryKeys } from '../../../gestao.query-keys';
import { atividadesExtraClasseKeys } from '../components/atividades-extra/atividadesExtraClasse.service';
import { calendarioAulasExportacaoQueryKeys } from '../../../../calendario/exportacao-aulas/calendarioAulasExportacao.queryKeys';
import {
  beginLocalProfessorAssignment,
  cancelLocalProfessorAssignment,
  settleLocalProfessorAssignment,
} from './useTurmaTecnicoRealtime';

const updateProfessorOptimistically = (
  current: TurmaGradeData | undefined,
  disciplinaIds: string[],
  professor: TurmaProfessorOption | null,
) => {
  if (!current) return current;
  const disciplinasConfig = { ...current.disciplinasConfig };
  disciplinaIds.forEach((disciplinaId) => {
    const previous = disciplinasConfig[disciplinaId] || { professor: null, concluida: false };
    disciplinasConfig[disciplinaId] = {
      ...previous,
      professor: professor?.nome || null,
      professorId: professor?.id || null,
    };
  });
  return { ...current, disciplinasConfig };
};

const reconcileCanonicalProfessorAssignments = (
  current: TurmaGradeData | undefined,
  assignments: TurmaProfessorAssignmentRow[],
) => {
  if (!current) return current;
  const disciplinasConfig = { ...current.disciplinasConfig };
  assignments.forEach((assignment) => {
    disciplinasConfig[assignment.disciplina_id] = {
      professor: assignment.professor_nome,
      professorId: assignment.professor_id,
      concluida: assignment.concluida,
    };
  });
  return { ...current, disciplinasConfig };
};

const changedCanonicalProfessorAssignmentIds = (
  previousGrade: TurmaGradeData | undefined,
  assignments: TurmaProfessorAssignmentRow[],
) => assignments
  .filter((assignment) => {
    if (!previousGrade) return true;
    const previous = previousGrade.disciplinasConfig[assignment.disciplina_id];
    return previous?.professorId !== assignment.professor_id
      || previous?.professor !== assignment.professor_nome;
  })
  .map((assignment) => assignment.disciplina_id);

const reconcileCanonicalAula = (
  current: TurmaGradeData | undefined,
  disciplinaId: string,
  aula: TurmaAulaPlanejada,
  previousAulaId?: string,
) => {
  if (!current) return current;
  const currentAulas = current.aulas[disciplinaId] || [];
  const existingIndex = currentAulas.findIndex((item) => (
    item.id === aula.id
    || item.id === previousAulaId
    || item.sessoes.some((sessao) => sessao.id === previousAulaId)
  ));
  const nextAulas = existingIndex >= 0
    ? currentAulas.map((item, index) => (index === existingIndex ? aula : item))
    : [...currentAulas, aula];
  nextAulas.sort((left, right) => (
    (left.dataAula || '').localeCompare(right.dataAula || '')
    || left.id.localeCompare(right.id)
  ));
  return {
    ...current,
    aulas: { ...current.aulas, [disciplinaId]: nextAulas },
  };
};

const removeCanonicalAulaFromCache = (
  current: TurmaGradeData | undefined,
  aulaId: string,
) => {
  if (!current) return current;
  const aulas = Object.fromEntries(Object.entries(current.aulas).map(([disciplinaId, items]) => [
    disciplinaId,
    items.filter((item) => (
      item.id !== aulaId
      && !item.sessoes.some((sessao) => sessao.id === aulaId)
    )),
  ]));
  return { ...current, aulas };
};

const useTurmaGradeInvalidation = (
  turmaId: string,
  invalidateCalendarioExportacao = false,
  invalidateClassLists = false,
) => {
  const queryClient = useQueryClient();

  return useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: academicLifecycleKeys.grade(turmaId),
        exact: true,
      }),
      queryClient.invalidateQueries({
        queryKey: academicLifecycleKeys.atividades(turmaId),
        exact: true,
      }),
      queryClient.invalidateQueries({
        queryKey: atividadesExtraClasseKeys.turma(turmaId),
        exact: true,
      }),
      queryClient.invalidateQueries({
        queryKey: academicLifecycleKeys.diarios(turmaId),
        exact: true,
      }),
      queryClient.invalidateQueries({
        queryKey: diarioClasseKeys.aulasByTurma(turmaId),
        exact: true,
      }),
      queryClient.invalidateQueries({
        queryKey: diarioClasseKeys.resultadosByTurma(turmaId),
        exact: true,
      }),
      queryClient.invalidateQueries({
        queryKey: diarioClasseKeys.praticasByTurma(turmaId),
        exact: true,
      }),
      ...(invalidateClassLists
        ? [
          queryClient.invalidateQueries({
            queryKey: gestaoQueryKeys.classesByModality('TECNICO'),
          }),
          queryClient.invalidateQueries({
            queryKey: gestaoQueryKeys.activeClassesRoot(),
          }),
        ]
        : []),
      ...(invalidateCalendarioExportacao
        ? [
          // Prefixo restrito ao exportador: a próxima emissão pede a grade
          // canônica atualizada, sem invalidar consultas de outros módulos.
          queryClient.invalidateQueries({ queryKey: calendarioAulasExportacaoQueryKeys.all }),
        ]
        : []),
    ]);
  }, [invalidateCalendarioExportacao, invalidateClassLists, queryClient, turmaId]);
};

const useMarkTurmaGradeDependentsStale = (
  turmaId: string,
  invalidateCalendarioExportacao = false,
  invalidateClassLists = false,
) => {
  const queryClient = useQueryClient();

  return useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: academicLifecycleKeys.grade(turmaId),
        exact: true,
        refetchType: 'none',
      }),
      queryClient.invalidateQueries({
        queryKey: academicLifecycleKeys.diarios(turmaId),
        exact: true,
        refetchType: 'none',
      }),
      queryClient.invalidateQueries({
        queryKey: diarioClasseKeys.aulasByTurma(turmaId),
        exact: true,
        refetchType: 'none',
      }),
      queryClient.invalidateQueries({
        queryKey: diarioClasseKeys.resultadosByTurma(turmaId),
        exact: true,
        refetchType: 'none',
      }),
      queryClient.invalidateQueries({
        queryKey: diarioClasseKeys.praticasByTurma(turmaId),
        exact: true,
        refetchType: 'none',
      }),
      ...(invalidateClassLists
        ? [
          queryClient.invalidateQueries({
            queryKey: gestaoQueryKeys.classesByModality('TECNICO'),
            refetchType: 'none',
          }),
          queryClient.invalidateQueries({
            queryKey: gestaoQueryKeys.activeClassesRoot(),
            refetchType: 'none',
          }),
        ]
        : []),
      ...(invalidateCalendarioExportacao
        ? [queryClient.invalidateQueries({
          queryKey: calendarioAulasExportacaoQueryKeys.all,
          refetchType: 'none',
        })]
        : []),
    ]);
  }, [invalidateCalendarioExportacao, invalidateClassLists, queryClient, turmaId]);
};

export const useTurmaGradeData = (turmaId: string, cursoId: string) => useQuery({
  queryKey: academicLifecycleKeys.grade(turmaId),
  queryFn: () => turmaGradeService.getGradeData(turmaId, cursoId),
  staleTime: 15_000,
});

export const useAssignProfessorMutation = (
  turmaId: string,
  onSuccess?: (
    assignment: TurmaProfessorAssignmentRow,
    input: {
      disciplinaId: string;
      professor: TurmaProfessorOption | null;
      currentConfig: TurmaDisciplinaConfig;
    },
  ) => void | Promise<void>,
  onError?: (error: any) => void,
) => {
  const queryClient = useQueryClient();
  const queryKey = academicLifecycleKeys.grade(turmaId);

  return useMutation({
    mutationFn: (input: {
      disciplinaId: string;
      professor: TurmaProfessorOption | null;
      currentConfig: TurmaDisciplinaConfig;
    }) => turmaGradeService.assignProfessor(
      turmaId,
      input.disciplinaId,
      input.professor,
    ),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey, exact: true });
      const previousGrade = queryClient.getQueryData<TurmaGradeData>(queryKey);
      const realtimeToken = beginLocalProfessorAssignment(
        turmaId,
        [input.disciplinaId],
        input.professor?.id || null,
      );
      queryClient.setQueryData<TurmaGradeData>(queryKey, (current) => (
        updateProfessorOptimistically(current, [input.disciplinaId], input.professor)
      ));
      return { previousGrade, realtimeToken };
    },
    onSuccess: async (assignment, input, context) => {
      if (context?.realtimeToken) {
        settleLocalProfessorAssignment(
          turmaId,
          context.realtimeToken,
          changedCanonicalProfessorAssignmentIds(context.previousGrade, [assignment]),
        );
      }
      queryClient.setQueryData<TurmaGradeData>(queryKey, (current) => (
        reconcileCanonicalProfessorAssignments(current, [assignment])
      ));
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: academicLifecycleKeys.diarios(turmaId),
          exact: true,
          refetchType: 'none',
        }),
        queryClient.invalidateQueries({
          queryKey: calendarioAulasExportacaoQueryKeys.all,
          refetchType: 'none',
        }),
      ]);
      await onSuccess?.(assignment, input);
    },
    onError: (error, _input, context) => {
      if (context?.previousGrade) {
        queryClient.setQueryData(queryKey, context.previousGrade);
      }
      if (context?.realtimeToken) {
        cancelLocalProfessorAssignment(turmaId, context.realtimeToken);
      }
      void queryClient.invalidateQueries({ queryKey, exact: true });
      onError?.(error);
    },
  });
};

export const useAssignProfessorToAllMutation = (
  turmaId: string,
  onSuccess?: (assignments: TurmaProfessorAssignmentRow[]) => void | Promise<void>,
  onError?: (error: any) => void,
) => {
  const queryClient = useQueryClient();
  const queryKey = academicLifecycleKeys.grade(turmaId);

  return useMutation({
    mutationFn: (input: {
      disciplineIds: string[];
      professor: TurmaProfessorOption | null;
      configs: Record<string, TurmaDisciplinaConfig>;
    }) => turmaGradeService.assignProfessorToDisciplines(
      turmaId,
      input.disciplineIds,
      input.professor,
    ),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey, exact: true });
      const previousGrade = queryClient.getQueryData<TurmaGradeData>(queryKey);
      const realtimeToken = beginLocalProfessorAssignment(
        turmaId,
        input.disciplineIds,
        input.professor?.id || null,
      );
      queryClient.setQueryData<TurmaGradeData>(queryKey, (current) => (
        updateProfessorOptimistically(current, input.disciplineIds, input.professor)
      ));
      return { previousGrade, realtimeToken };
    },
    onSuccess: async (assignments, _input, context) => {
      if (context?.realtimeToken) {
        settleLocalProfessorAssignment(
          turmaId,
          context.realtimeToken,
          changedCanonicalProfessorAssignmentIds(context.previousGrade, assignments),
        );
      }
      queryClient.setQueryData<TurmaGradeData>(queryKey, (current) => (
        reconcileCanonicalProfessorAssignments(current, assignments)
      ));
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: academicLifecycleKeys.diarios(turmaId),
          exact: true,
          refetchType: 'none',
        }),
        queryClient.invalidateQueries({
          queryKey: calendarioAulasExportacaoQueryKeys.all,
          refetchType: 'none',
        }),
      ]);
      await onSuccess?.(assignments);
    },
    onError: (error, _input, context) => {
      if (context?.previousGrade) {
        queryClient.setQueryData(queryKey, context.previousGrade);
      }
      if (context?.realtimeToken) {
        cancelLocalProfessorAssignment(turmaId, context.realtimeToken);
      }
      void queryClient.invalidateQueries({ queryKey, exact: true });
      onError?.(error);
    },
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
  const queryClient = useQueryClient();
  const queryKey = academicLifecycleKeys.grade(turmaId);
  const markStale = useMarkTurmaGradeDependentsStale(turmaId, true, true);

  return useMutation({
    mutationFn: (input: TurmaAulaInput) => turmaGradeService.addAula(turmaId, input),
    onSuccess: async (aula, input) => {
      queryClient.setQueryData<TurmaGradeData>(queryKey, (current) => (
        reconcileCanonicalAula(current, input.disciplinaId, aula)
      ));
      await markStale();
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
  const queryClient = useQueryClient();
  const queryKey = academicLifecycleKeys.grade(turmaId);
  const markStale = useMarkTurmaGradeDependentsStale(turmaId, true, true);

  return useMutation({
    mutationFn: (input: TurmaAulaUpdateInput) => turmaGradeService.updateAula(turmaId, input),
    onSuccess: async (aula, input) => {
      queryClient.setQueryData<TurmaGradeData>(queryKey, (current) => (
        reconcileCanonicalAula(current, input.disciplinaId, aula, input.aulaId)
      ));
      await markStale();
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
  const queryClient = useQueryClient();
  const queryKey = academicLifecycleKeys.grade(turmaId);
  const markStale = useMarkTurmaGradeDependentsStale(turmaId, true, true);

  return useMutation({
    mutationFn: (aulaId: string) => turmaGradeService.removeAula(aulaId),
    onMutate: async (aulaId) => {
      await queryClient.cancelQueries({ queryKey, exact: true });
      const previousGrade = queryClient.getQueryData<TurmaGradeData>(queryKey);
      queryClient.setQueryData<TurmaGradeData>(queryKey, (current) => (
        removeCanonicalAulaFromCache(current, aulaId)
      ));
      return { previousGrade };
    },
    onSuccess: async () => {
      await markStale();
      await onSuccess?.();
    },
    onError: (error, _aulaId, context) => {
      if (context?.previousGrade) {
        queryClient.setQueryData(queryKey, context.previousGrade);
      }
      onError?.(error);
    },
  });
};
