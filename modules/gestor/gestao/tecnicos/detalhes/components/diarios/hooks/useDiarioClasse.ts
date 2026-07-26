import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { diarioClasseKeys } from '../diario-classe.keys';
import { diarioClasseService, DiarioAulaInput, DiarioGradeFields } from '../diario-classe.service';
import { academicLifecycleKeys } from '../../../academic-lifecycle.keys';
import { gestaoQueryKeys } from '../../../../../gestao.query-keys';
import { AttendanceStatus, DiarioLockScope } from '../diario-classe.types';

const useInvalidateDiario = (turmaId: string, disciplinaId: string) => {
  const queryClient = useQueryClient();

  return {
    attendanceAndResults: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: diarioClasseKeys.frequencia(turmaId, disciplinaId) }),
      queryClient.invalidateQueries({ queryKey: diarioClasseKeys.resultados(turmaId, disciplinaId) }),
      queryClient.invalidateQueries({ queryKey: academicLifecycleKeys.alunos(turmaId) }),
      queryClient.invalidateQueries({ queryKey: academicLifecycleKeys.diarios(turmaId) }),
    ]),
    results: () => queryClient.invalidateQueries({ queryKey: diarioClasseKeys.resultados(turmaId, disciplinaId) }),
    aulasAndResults: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: diarioClasseKeys.aulas(turmaId, disciplinaId) }),
      queryClient.invalidateQueries({ queryKey: diarioClasseKeys.resultados(turmaId, disciplinaId) }),
      queryClient.invalidateQueries({ queryKey: diarioClasseKeys.praticas(turmaId, disciplinaId) }),
      queryClient.invalidateQueries({ queryKey: academicLifecycleKeys.diarios(turmaId) }),
      queryClient.invalidateQueries({ queryKey: gestaoQueryKeys.classesByModality('TECNICO') }),
      queryClient.invalidateQueries({ queryKey: gestaoQueryKeys.activeClassesRoot() }),
    ]),
    praticas: () => queryClient.invalidateQueries({ queryKey: diarioClasseKeys.praticas(turmaId, disciplinaId) }),
    observacoes: () => queryClient.invalidateQueries({ queryKey: diarioClasseKeys.observacoes(turmaId, disciplinaId) }),
  };
};

export const useDiarioTemplate = (cursoId: string) => useQuery({
  queryKey: diarioClasseKeys.template(cursoId),
  queryFn: () => diarioClasseService.getTemplate(cursoId),
  enabled: Boolean(cursoId),
});

export const useDiarioStudents = (
  turmaId: string,
  disciplinaId: string,
  accessMode: 'GESTOR' | 'PROFESSOR',
) => useQuery({
  queryKey: diarioClasseKeys.students(turmaId, disciplinaId, accessMode),
  queryFn: () => diarioClasseService.getStudents(turmaId, disciplinaId, accessMode),
  enabled: Boolean(turmaId && disciplinaId),
});

export const useDiarioAulas = (turmaId: string, disciplinaId: string) => useQuery({
  queryKey: diarioClasseKeys.aulas(turmaId, disciplinaId),
  queryFn: () => diarioClasseService.getAulas(turmaId, disciplinaId),
});

export const useAddDiarioAulaMutation = (
  turmaId: string,
  disciplinaId: string,
  onSuccess?: (input: DiarioAulaInput) => void | Promise<void>,
  onError?: (error: any) => void,
) => {
  const invalidate = useInvalidateDiario(turmaId, disciplinaId);

  return useMutation({
    mutationFn: (input: DiarioAulaInput) => diarioClasseService.addAula(turmaId, disciplinaId, input),
    onSuccess: async (_data, input) => {
      await invalidate.aulasAndResults();
      await onSuccess?.(input);
    },
    onError,
  });
};

export const useDiarioAttendance = (turmaId: string, disciplinaId: string) => useQuery({
  queryKey: diarioClasseKeys.frequencia(turmaId, disciplinaId),
  queryFn: () => diarioClasseService.getAttendance(turmaId, disciplinaId),
});

export const useDiarioGrades = (turmaId: string, disciplinaId: string) => useQuery({
  queryKey: diarioClasseKeys.resultados(turmaId, disciplinaId),
  queryFn: () => diarioClasseService.getGrades(turmaId, disciplinaId),
});

export const useDiarioPraticas = (turmaId: string, disciplinaId: string) => useQuery({
  queryKey: diarioClasseKeys.praticas(turmaId, disciplinaId),
  queryFn: () => diarioClasseService.getPraticas(turmaId, disciplinaId),
});

export const useDiarioObservacoes = (turmaId: string, disciplinaId: string) => useQuery({
  queryKey: diarioClasseKeys.observacoes(turmaId, disciplinaId),
  queryFn: () => diarioClasseService.getObservacoes(turmaId, disciplinaId),
});

export const useDiarioClosure = (turmaId: string, disciplinaId: string) => useQuery({
  queryKey: diarioClasseKeys.fechamento(turmaId, disciplinaId),
  queryFn: () => diarioClasseService.getClosureState(turmaId, disciplinaId),
});

export const useSetDiarioClosureMutation = (
  turmaId: string,
  disciplinaId: string,
  onSuccess?: (bloqueio: DiarioLockScope) => void | Promise<void>,
  onError?: (error: any) => void,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      bloqueio: DiarioLockScope;
      motivo?: string;
      confirmarPendencias?: boolean;
    }) =>
      diarioClasseService.setClosureLock(
        turmaId,
        disciplinaId,
        input.bloqueio,
        input.motivo,
        input.confirmarPendencias,
      ),
    onSuccess: async (_data, input) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: diarioClasseKeys.fechamento(turmaId, disciplinaId) }),
        queryClient.invalidateQueries({ queryKey: academicLifecycleKeys.diarios(turmaId) }),
        queryClient.invalidateQueries({ queryKey: academicLifecycleKeys.periodos(turmaId) }),
        queryClient.invalidateQueries({ queryKey: gestaoQueryKeys.classesByModality('TECNICO') }),
        queryClient.invalidateQueries({ queryKey: gestaoQueryKeys.activeClassesRoot() }),
      ]);
      await onSuccess?.(input.bloqueio);
    },
    onError,
  });
};

export const useToggleDiarioAttendanceMutation = (
  turmaId: string,
  disciplinaId: string,
  onSuccess?: (input: { aulaId: string; alunoId: string; nextStatus: AttendanceStatus }) => void | Promise<void>,
  onError?: (error: any) => void,
) => {
  const invalidate = useInvalidateDiario(turmaId, disciplinaId);

  return useMutation({
    mutationFn: (input: { aulaId: string; alunoId: string; nextStatus: AttendanceStatus }) =>
      diarioClasseService.toggleAttendance(
        turmaId,
        disciplinaId,
        input.aulaId,
        input.alunoId,
        input.nextStatus,
      ),
    onSuccess: async (_data, variables) => {
      await invalidate.attendanceAndResults();
      await onSuccess?.(variables);
    },
    onError,
  });
};

export const useSaveDiarioGradesMutation = (
  turmaId: string,
  disciplinaId: string,
  onSuccess?: (input: { alunoId: string; fields: DiarioGradeFields }) => void | Promise<void>,
  onError?: (error: any) => void,
) => {
  const invalidate = useInvalidateDiario(turmaId, disciplinaId);

  return useMutation({
    mutationFn: (input: { alunoId: string; fields: DiarioGradeFields }) =>
      diarioClasseService.saveStudentGrades(turmaId, disciplinaId, input.alunoId, input.fields),
    onSuccess: async (_data, variables) => {
      await invalidate.results();
      await onSuccess?.(variables);
    },
    onError,
  });
};

export const useSaveDiarioPraticaMutation = (
  turmaId: string,
  disciplinaId: string,
  onSuccess?: (input: { aulaId: string; text: string }) => void | Promise<void>,
  onError?: (error: any) => void,
) => {
  const invalidate = useInvalidateDiario(turmaId, disciplinaId);

  return useMutation({
    mutationFn: (input: { aulaId: string; text: string }) =>
      diarioClasseService.savePratica(turmaId, disciplinaId, input.aulaId, input.text),
    onSuccess: async (_data, variables) => {
      await invalidate.praticas();
      await onSuccess?.(variables);
    },
    onError,
  });
};

export const useSaveDiarioObservacoesMutation = (
  turmaId: string,
  disciplinaId: string,
  onSuccess?: (text: string) => void | Promise<void>,
  onError?: (error: any) => void,
) => {
  const invalidate = useInvalidateDiario(turmaId, disciplinaId);

  return useMutation({
    mutationFn: (text: string) => diarioClasseService.saveObservacoes(turmaId, disciplinaId, text),
    onSuccess: async (_data, text) => {
      await invalidate.observacoes();
      await onSuccess?.(text);
    },
    onError,
  });
};
