export type AlunoLogoutPath = '/' | '/aluno/login-app';

export const getAlunoLogoutPath = (isNativePlatform: boolean): AlunoLogoutPath =>
  isNativePlatform ? '/aluno/login-app' : '/';

export const getAlunoRejectedSessionPath = (
  isNativePlatform: boolean,
  currentPath: string,
): string => {
  const logoutPath = getAlunoLogoutPath(isNativePlatform);
  if (logoutPath === '/') return logoutPath;

  const params = new URLSearchParams({
    reason: 'session_expired',
    redirect: currentPath,
  });
  return `${logoutPath}?${params.toString()}`;
};
