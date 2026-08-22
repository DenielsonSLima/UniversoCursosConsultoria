export type RecoveryMode = 'request' | 'reset';
export type PasswordSetupKind = 'recovery' | 'invite';

export interface RecoveryAuthorization {
  userId: string;
  accessToken: string;
  kind: PasswordSetupKind;
}

export interface PasswordRecoveryPageProps {
  appFlow?: boolean;
}

export const getAuthReturnParam = (name: string) => {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const searchParams = new URLSearchParams(window.location.search);
  return hashParams.get(name) || searchParams.get(name);
};

export const getPasswordSetupTypeInUrl = (): PasswordSetupKind | null => {
  const type = getAuthReturnParam('type');
  return type === 'recovery' || type === 'invite' ? type : null;
};

export const clearRecoveryAuthParams = () => {
  const authKeys = [
    'code',
    'access_token',
    'refresh_token',
    'token_type',
    'expires_in',
    'expires_at',
    'type',
    'error',
    'error_code',
    'error_description',
  ];
  const url = new URL(window.location.href);
  authKeys.forEach((key) => url.searchParams.delete(key));

  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
  authKeys.forEach((key) => hashParams.delete(key));
  const nextHash = hashParams.toString();

  window.history.replaceState(
    {},
    document.title,
    `${url.pathname}${url.search}${nextHash ? `#${nextHash}` : ''}`,
  );
};
