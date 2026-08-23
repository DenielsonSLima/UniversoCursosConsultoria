export interface ProfileSelectionSessionResetDependencies {
  signOutLocal: () => Promise<{ error: unknown | null }>;
  clearPortalSession: () => void;
  clearQueryCache: () => void;
}

/**
 * Encerra a sessão Auth desta instalação antes de remover qualquer estado local
 * usado pelo seletor. Se o Auth não confirmar o sign-out, a tela de seleção
 * deve permanecer montada para não aparentar que a sessão foi encerrada.
 */
export const resetProfileSelectionSession = async ({
  signOutLocal,
  clearPortalSession,
  clearQueryCache,
}: ProfileSelectionSessionResetDependencies) => {
  const { error } = await signOutLocal();
  if (error) throw error;

  clearPortalSession();
  clearQueryCache();
};
