import {
  PUBLIC_ALUNO_ALREADY_REGISTERED_MESSAGE,
  type FirstAccessRpcResult,
} from './aluno-public-auth.contract';

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export const FIRST_ACCESS_RPC = 'portal_finalizar_primeiro_acesso';
export const FIRST_ACCESS_GENERIC_ERROR =
  'Não foi possível concluir o primeiro acesso. Tente novamente em instantes.';

const FIRST_ACCESS_ERROR_MESSAGES: Record<string, string> = {
  AUTENTICACAO_OBRIGATORIA: 'Sua sessão expirou. Entre novamente para concluir o primeiro acesso.',
  PORTAL_PRIMEIRO_ACESSO_PARAMETROS_INVALIDOS:
    'Os dados do primeiro acesso estão inválidos. Atualize a página e tente novamente.',
  PORTAL_PRIMEIRO_ACESSO_CONTEXTO_NAO_AUTORIZADO:
    'Este perfil não está mais disponível para a sua conta.',
  PORTAL_PRIMEIRO_ACESSO_TERMOS_NAO_ACEITOS:
    'É obrigatório aceitar os Termos de Uso para continuar.',
  PORTAL_PRIMEIRO_ACESSO_TERMOS_VERSAO_DIVERGENTE:
    'Os Termos de Uso foram atualizados. Atualize a página antes de continuar.',
  PORTAL_PRIMEIRO_ACESSO_SENHA_AINDA_OBRIGATORIA:
    'A alteração da senha ainda está sendo confirmada. Tente concluir novamente.',
  PORTAL_IDENTIDADE_REQUEST_REPLAY_DIVERGENTE:
    'Esta tentativa não corresponde mais aos dados exibidos. Atualize a página e tente novamente.',
};

export const onlyDigits = (value: string) => value.replace(/\D/g, '');

export const getSafePublicAlunoRedirectPath = (
  value?: string | null,
  fallback = '/aluno',
) => {
  const raw = String(value || '').trim();
  if (!raw) return fallback;

  let path = raw;
  if (!path.startsWith('/')) {
    try {
      path = decodeURIComponent(raw);
    } catch {
      return fallback;
    }
  }

  return path.startsWith('/') && !path.startsWith('//') ? path : fallback;
};

export const isStrongPassword = (value: string) => (
  value.length >= 8
  && /[A-Z]/.test(value)
  && /[a-z]/.test(value)
  && /\d/.test(value)
);

export const isAlreadyRegisteredSignupMessage = (message: string) => {
  const lower = message.toLowerCase();
  return (
    lower.includes('already registered')
    || lower.includes('user already')
    || lower.includes('duplicate')
    || lower.includes('cpf_cnpj')
    || lower.includes('public_aluno_cpf_unique')
    || lower.includes('cpf ja esta cadastrado')
    || lower.includes('cpf já está cadastrado')
  );
};

export const isExistingUserError = (message: string) => {
  const lower = message.toLowerCase();
  return lower.includes('already registered') || lower.includes('user already');
};

export const getFriendlySignupError = (message: string) => {
  const lower = message.toLowerCase();
  if (isAlreadyRegisteredSignupMessage(message)) {
    return PUBLIC_ALUNO_ALREADY_REGISTERED_MESSAGE;
  }
  if (lower.includes('password')) {
    return 'A senha precisa ter pelo menos 8 caracteres.';
  }
  if (
    lower.includes('unexpected failure')
    || lower.includes('check server logs')
    || lower.includes('database error saving new user')
  ) {
    return 'Não foi possível concluir o cadastro agora. Tente novamente em instantes; se o problema continuar, fale com a secretaria.';
  }
  return message || 'Não foi possível concluir o cadastro. Tente novamente.';
};

export const getFriendlyOAuthError = (message: string) => {
  if (message.includes('Manual linking is disabled')) {
    return 'O projeto do Supabase não permite vínculo manual de contas. Ative "Allow manual linking" em Authentication > Settings.';
  }

  if (message.includes('Unsupported provider: provider is not enabled')) {
    return 'Login com Google não está habilitado no projeto do Supabase ainda. Ative em Authentication > Providers > Google e configure CLIENT_ID/CLIENT_SECRET do OAuth.';
  }

  return message;
};

export const getFriendlyAuthRedirectError = (message: string) => {
  const decoded = decodeURIComponent(String(message || '').replace(/\+/g, ' '));
  const lower = decoded.toLowerCase();

  if (
    lower.includes('token')
    || lower.includes('expired')
    || lower.includes('otp')
    || lower.includes('invalid')
  ) {
    return 'Este link já foi usado ou expirou. Se você já confirmou o e-mail, entre normalmente com sua senha; caso contrário, solicite um novo link.';
  }

  return decoded || 'Não foi possível concluir a confirmação do e-mail. Tente entrar novamente.';
};

export const getFirstAccessErrorMessage = (error: unknown) => {
  const raw = error && typeof error === 'object' && 'message' in error
    ? String((error as { message?: unknown }).message || '')
    : '';
  const code = Object.keys(FIRST_ACCESS_ERROR_MESSAGES).find((item) => raw.includes(item));
  return code ? FIRST_ACCESS_ERROR_MESSAGES[code] : FIRST_ACCESS_GENERIC_ERROR;
};

export const normalizeFirstAccessRpcResult = (
  value: unknown,
  expectedContextId: string,
  expectedTermsVersion: string,
): FirstAccessRpcResult => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(FIRST_ACCESS_GENERIC_ERROR);
  }
  const source = value as Record<string, unknown>;
  const firstAccess = source.firstAccess;
  if (!firstAccess || typeof firstAccess !== 'object' || Array.isArray(firstAccess)) {
    throw new Error(FIRST_ACCESS_GENERIC_ERROR);
  }
  const access = firstAccess as Record<string, unknown>;
  if (
    source.contextId !== expectedContextId
    || typeof access.acceptedTermsAt !== 'string'
    || !access.acceptedTermsAt.trim()
    || access.acceptedTermsVersion !== expectedTermsVersion
    || access.requiresPasswordReset !== false
    || typeof source.replayed !== 'boolean'
  ) {
    throw new Error(FIRST_ACCESS_GENERIC_ERROR);
  }
  return source as FirstAccessRpcResult;
};
