export const documentosAlunoKeys = {
  all: ['documentos-aluno'] as const,
  aluno: (alunoId: string) => [...documentosAlunoKeys.all, alunoId] as const,
  painel: (alunoId: string, audience: 'aluno' | 'gestor' = 'aluno') =>
    [...documentosAlunoKeys.aluno(alunoId), 'painel', audience] as const,
  arquivoUrl: (arquivoId: string) => [...documentosAlunoKeys.all, 'arquivo-url', arquivoId] as const,
  exclusoes: (alunoId: string) => [...documentosAlunoKeys.aluno(alunoId), 'exclusoes'] as const,
};

export const matriculaTecnicaWorkflowKeys = {
  all: ['matricula-tecnica-workflow'] as const,
  aluno: (alunoId: string) =>
    [...matriculaTecnicaWorkflowKeys.all, 'aluno', alunoId] as const,
  matricula: (matriculaId: string) =>
    [...matriculaTecnicaWorkflowKeys.all, 'matricula', matriculaId] as const,
  turma: (turmaId: string) =>
    [...matriculaTecnicaWorkflowKeys.all, 'turma', turmaId] as const,
};
