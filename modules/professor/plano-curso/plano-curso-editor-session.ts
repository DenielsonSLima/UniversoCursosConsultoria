export interface PlanoCursoEditorSession {
  identity: string;
  baseRevision: number | null;
  dirty: boolean;
  conflict: boolean;
}

export type PlanoCursoEditorReconciliation =
  | { action: 'HYDRATE'; session: PlanoCursoEditorSession }
  | { action: 'PRESERVE'; session: PlanoCursoEditorSession }
  | { action: 'UNCHANGED'; session: PlanoCursoEditorSession };

export const emptyPlanoCursoEditorSession = (): PlanoCursoEditorSession => ({
  identity: '',
  baseRevision: null,
  dirty: false,
  conflict: false,
});

export const hydratedPlanoCursoEditorSession = (
  identity: string,
  revision: number,
): PlanoCursoEditorSession => ({
  identity,
  baseRevision: revision,
  dirty: false,
  conflict: false,
});

export const dirtyPlanoCursoEditorSession = (
  session: PlanoCursoEditorSession,
): PlanoCursoEditorSession => ({ ...session, dirty: true });

/**
 * Decide como reconciliar uma revisão recebida de outra sessão.
 * Um draft sujo preserva sempre sua revisão-base; nunca herda a revisão remota.
 */
export const reconcilePlanoCursoEditorSession = (
  session: PlanoCursoEditorSession,
  remoteIdentity: string,
  remoteRevision: number,
): PlanoCursoEditorReconciliation => {
  if (session.identity !== remoteIdentity || session.baseRevision === null) {
    return {
      action: 'HYDRATE',
      session: hydratedPlanoCursoEditorSession(remoteIdentity, remoteRevision),
    };
  }
  if (session.baseRevision === remoteRevision) {
    return { action: 'UNCHANGED', session };
  }
  if (session.dirty) {
    return {
      action: 'PRESERVE',
      session: { ...session, conflict: true },
    };
  }
  return {
    action: 'HYDRATE',
    session: hydratedPlanoCursoEditorSession(remoteIdentity, remoteRevision),
  };
};

export const canSubmitPlanoCursoEditorSession = (
  session: PlanoCursoEditorSession,
) => session.baseRevision !== null && !session.conflict;
