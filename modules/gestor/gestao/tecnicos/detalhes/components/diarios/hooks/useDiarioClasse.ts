import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { diarioClasseKeys } from '../diario-classe.keys';
import { diarioClasseService, DiarioGradeFields } from '../diario-classe.service';

const useInvalidateDiario = (turmaId: string, disciplinaId: string) => {
  const queryClient = useQueryClient();

  return {
    attendanceAndResults: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: diarioClasseKeys.frequencia(turmaId, disciplinaId) }),
      queryClient.invalidateQueries({ queryKey: diarioClasseKeys.resultados(turmaId, disciplinaId) }),
    ]),
    results: () => queryClient.invalidateQueries({ queryKey: diarioClasseKeys.resultados(turmaId, disciplinaId) }),
    praticas: () => queryClient.invalidateQueries({ queryKey: diarioClasseKeys.praticas(turmaId, disciplinaId) }),
    observacoes: () => queryClient.invalidateQueries({ queryKey: diarioClasseKeys.observacoes(turmaId, disciplinaId) }),
  };
};

export const useDiarioTemplate = (cursoId: string) => useQuery({
  queryKey: diarioClasseKeys.template(cursoId),
  queryFn: () => diarioClasseService.getTemplate(cursoId),
  enabled: Boolean(cursoId),
});

export const useDiarioStudents = (turmaId: string) => useQuery({
  queryKey: diarioClasseKeys.students(turmaId),
  queryFn: () => diarioClasseService.getStudents(turmaId),
});

export const useDiarioAulas = (turmaId: string, disciplinaId: string) => useQuery({
  queryKey: diarioClasseKeys.aulas(turmaId, disciplinaId),
  queryFn: () => diarioClasseService.getAulas(turmaId, disciplinaId),
});

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

export const useToggleDiarioAttendanceMutation = (turmaId: string, disciplinaId: string) => {
  const invalidate = useInvalidateDiario(turmaId, disciplinaId);

  return useMutation({
    mutationFn: (input: { aulaId: string; alunoId: string; nextStatus: 'P' | 'F' }) =>
      diarioClasseService.toggleAttendance(
        turmaId,
        disciplinaId,
        input.aulaId,
        input.alunoId,
        input.nextStatus,
      ),
    onSuccess: invalidate.attendanceAndResults,
  });
};

export const useSaveDiarioGradesMutation = (turmaId: string, disciplinaId: string) => {
  const invalidate = useInvalidateDiario(turmaId, disciplinaId);

  return useMutation({
    mutationFn: (input: { alunoId: string; fields: DiarioGradeFields }) =>
      diarioClasseService.saveStudentGrades(turmaId, disciplinaId, input.alunoId, input.fields),
    onSuccess: invalidate.results,
  });
};

export const useSaveDiarioPraticaMutation = (turmaId: string, disciplinaId: string) => {
  const invalidate = useInvalidateDiario(turmaId, disciplinaId);

  return useMutation({
    mutationFn: (input: { aulaId: string; text: string }) =>
      diarioClasseService.savePratica(turmaId, disciplinaId, input.aulaId, input.text),
    onSuccess: invalidate.praticas,
  });
};

export const useSaveDiarioObservacoesMutation = (turmaId: string, disciplinaId: string) => {
  const invalidate = useInvalidateDiario(turmaId, disciplinaId);

  return useMutation({
    mutationFn: (text: string) => diarioClasseService.saveObservacoes(turmaId, disciplinaId, text),
    onSuccess: invalidate.observacoes,
  });
};
