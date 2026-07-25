import type { QueryClient } from '@tanstack/react-query';

export const alunoCourseAccessKeys = {
  catalog: (alunoId: string) => ['aluno-cursos-disponiveis', alunoId] as const,
  finance: (alunoId: string) => ['aluno-financeiro', alunoId] as const,
  enrollments: (alunoId: string) => ['aluno-matriculas', alunoId] as const,
  homeEnrollmentCount: (alunoId: string) => ['aluno-matriculas-count', alunoId] as const,
  homeEnrollments: (alunoId: string) => ['aluno-inicio-matriculas', alunoId] as const,
  homeFinanceSummary: (alunoId: string) => ['aluno-inicio-financeiro-resumo', alunoId] as const,
  libraryEnrollments: (alunoId: string) => ['aluno-biblioteca-matriculas', alunoId] as const,
  calendar: (alunoId: string) => ['aluno-calendario', alunoId] as const,
  calendarEligibility: (alunoId: string) =>
    ['aluno', alunoId, 'calendario', 'elegibilidade'] as const,
};

export const alunoCourseAccessQueryKeys = (alunoId: string) => [
  alunoCourseAccessKeys.catalog(alunoId),
  alunoCourseAccessKeys.finance(alunoId),
  alunoCourseAccessKeys.enrollments(alunoId),
  alunoCourseAccessKeys.homeEnrollmentCount(alunoId),
  alunoCourseAccessKeys.homeEnrollments(alunoId),
  alunoCourseAccessKeys.homeFinanceSummary(alunoId),
  alunoCourseAccessKeys.libraryEnrollments(alunoId),
  alunoCourseAccessKeys.calendar(alunoId),
  alunoCourseAccessKeys.calendarEligibility(alunoId),
] as const;

export const invalidateAlunoCourseAccessQueries = (
  queryClient: QueryClient,
  alunoId?: string | null,
) => {
  if (!alunoId) return;
  for (const queryKey of alunoCourseAccessQueryKeys(alunoId)) {
    void queryClient.invalidateQueries({
      queryKey,
      exact: true,
      refetchType: 'active',
    });
  }
};
