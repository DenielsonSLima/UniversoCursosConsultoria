export type PortalLogoutScope = 'local' | 'global';

interface PortalLogoutDependencies {
  signOut(scope: PortalLogoutScope): Promise<{ error: unknown | null }>;
  forceClearLocal(): boolean;
}

type SignOutAttempt =
  | { ok: true }
  | { ok: false; error: unknown };

export type PortalLogoutResult =
  | { status: 'revoked' }
  | { status: 'local-cleared'; localError: unknown }
  | { status: 'local-only'; globalError: unknown };

const attemptSignOut = async (
  signOut: PortalLogoutDependencies['signOut'],
  scope: PortalLogoutScope,
): Promise<SignOutAttempt> => {
  try {
    const { error } = await signOut(scope);
    return error ? { ok: false, error } : { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
};

const forceClearAfterFailure = (
  forceClearLocal: PortalLogoutDependencies['forceClearLocal'],
  error: unknown,
) => {
  let cleared = false;
  try {
    cleared = forceClearLocal();
  } catch {
    // A falha original é a mais útil para o chamador e não expõe o storage.
  }
  if (!cleared) throw error;
};

export const performPortalLogout = async (
  scope: PortalLogoutScope,
  dependencies: PortalLogoutDependencies,
): Promise<PortalLogoutResult> => {
  const initialAttempt = await attemptSignOut(dependencies.signOut, scope);
  if (initialAttempt.ok === true) return { status: 'revoked' };
  const globalError = initialAttempt.error;
  if (scope === 'local') {
    forceClearAfterFailure(dependencies.forceClearLocal, globalError);
    return { status: 'local-cleared', localError: globalError };
  }

  const localAttempt = await attemptSignOut(dependencies.signOut, 'local');
  if (localAttempt.ok === false) {
    forceClearAfterFailure(dependencies.forceClearLocal, globalError);
  }

  return { status: 'local-only', globalError };
};
