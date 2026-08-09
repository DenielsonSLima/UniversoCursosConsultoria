export const planoCursoKeys = {
  all: ['plano-curso'] as const,
  professorRoot: (professorId: string, poloId: string) => (
    [...planoCursoKeys.all, 'professor', professorId, poloId] as const
  ),
  professorList: (professorId: string, poloId: string) => (
    [...planoCursoKeys.professorRoot(professorId, poloId), 'list'] as const
  ),
  professorWorkspace: (
    professorId: string,
    poloId: string,
    turmaId: string,
    disciplinaId: string,
  ) => (
    [
      ...planoCursoKeys.professorRoot(professorId, poloId),
      'workspace',
      turmaId,
      disciplinaId,
    ] as const
  ),
  gestaoRoot: (turmaId: string) => (
    [...planoCursoKeys.all, 'gestao', turmaId] as const
  ),
  gestaoStatusList: (turmaId: string) => (
    [...planoCursoKeys.gestaoRoot(turmaId), 'status-list'] as const
  ),
  gestaoDetail: (turmaId: string, disciplinaId: string, professorId?: string | null) => (
    [
      ...planoCursoKeys.gestaoRoot(turmaId),
      'detail',
      disciplinaId,
      professorId || 'docente-atual',
    ] as const
  ),
  document: (
    planoId: string,
    revision: number,
    templateRevision: number,
    documentoFingerprint: string,
  ) => (
    [
      ...planoCursoKeys.all,
      'document',
      planoId,
      revision,
      templateRevision,
      documentoFingerprint,
    ] as const
  ),
};
