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
  eadProgressRoot: (alunoId: string) =>
    ['aluno-turma-ead-progress', alunoId] as const,
  eadProgress: (
    alunoId: string,
    cursoId: string,
    status: string,
  ) => [...alunoCourseAccessKeys.eadProgressRoot(alunoId), cursoId, status] as const,
  technicalAcademicRoot: (alunoId: string) =>
    ['aluno-turma-technical-academic', alunoId] as const,
  technicalAcademic: (
    alunoId: string,
    matriculaId: string,
    turmaId: string,
    status: string,
  ) => [
    ...alunoCourseAccessKeys.technicalAcademicRoot(alunoId),
    matriculaId,
    turmaId,
    status,
  ] as const,
  bulletinModulesRoot: (alunoId: string) =>
    ['secretaria', 'academic-modules', 'self', alunoId] as const,
  bulletinModules: (alunoId: string, turmaId?: string | null) =>
    [...alunoCourseAccessKeys.bulletinModulesRoot(alunoId), turmaId] as const,
  bulletinResultsRoot: (alunoId: string) =>
    ['secretaria', 'academic-results', 'self', alunoId] as const,
  bulletinResults: (
    alunoId: string,
    turmaId: string | null | undefined,
    periodoId: string | null,
    disciplinaIds: string[],
  ) => [
    ...alunoCourseAccessKeys.bulletinResultsRoot(alunoId),
    turmaId,
    periodoId,
    disciplinaIds,
  ] as const,
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
  const financeRoot = alunoCourseAccessKeys.finance(alunoId);
  for (const queryKey of alunoCourseAccessQueryKeys(alunoId)) {
    const isFinanceHierarchy = queryKey[0] === financeRoot[0]
      && queryKey[1] === financeRoot[1];
    void queryClient.invalidateQueries({
      queryKey,
      exact: !isFinanceHierarchy,
      refetchType: 'active',
    });
  }
  for (const queryKey of [
    alunoCourseAccessKeys.eadProgressRoot(alunoId),
    alunoCourseAccessKeys.technicalAcademicRoot(alunoId),
    alunoCourseAccessKeys.bulletinModulesRoot(alunoId),
    alunoCourseAccessKeys.bulletinResultsRoot(alunoId),
  ]) {
    void queryClient.invalidateQueries({
      queryKey,
      exact: false,
      refetchType: 'active',
    });
  }
};
