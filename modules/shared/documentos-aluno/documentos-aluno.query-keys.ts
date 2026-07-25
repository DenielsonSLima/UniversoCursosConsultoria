export const documentosAlunoKeys = {
  all: ['documentos-aluno'] as const,
  aluno: (alunoId: string) => [...documentosAlunoKeys.all, alunoId] as const,
  painel: (alunoId: string) => [...documentosAlunoKeys.aluno(alunoId), 'painel'] as const,
  arquivoUrl: (arquivoId: string) => [...documentosAlunoKeys.all, 'arquivo-url', arquivoId] as const,
  exclusoes: (alunoId: string) => [...documentosAlunoKeys.aluno(alunoId), 'exclusoes'] as const,
};
