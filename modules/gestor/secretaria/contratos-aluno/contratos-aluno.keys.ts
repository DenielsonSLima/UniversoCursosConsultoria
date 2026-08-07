export const contratosAlunoKeys = {
  all: ['secretaria', 'contratos-aluno'] as const,
  polo: (poloId: string) => [...contratosAlunoKeys.all, 'polo', poloId] as const,
  workspace: (poloId: string) => [...contratosAlunoKeys.polo(poloId), 'workspace'] as const,
};
