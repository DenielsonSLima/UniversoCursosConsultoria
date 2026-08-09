export const matriculaTecnicaFinanceiroKeys = {
  all: ['matricula-tecnica-financeiro'] as const,
  turma: (turmaId: string) => (
    [...matriculaTecnicaFinanceiroKeys.all, 'turma', turmaId] as const
  ),
  workspace: (turmaId: string, alunoId?: string | null) => (
    [
      ...matriculaTecnicaFinanceiroKeys.turma(turmaId),
      'workspace',
      alunoId || 'todos',
    ] as const
  ),
  preVinculoContexto: (turmaId: string, alunoId: string) => (
    [
      ...matriculaTecnicaFinanceiroKeys.turma(turmaId),
      'pre-vinculo-contexto',
      alunoId,
    ] as const
  ),
  previewRegra: (turmaId: string, fingerprint: string) => (
    [
      ...matriculaTecnicaFinanceiroKeys.turma(turmaId),
      'preview-regra',
      fingerprint,
    ] as const
  ),
};
