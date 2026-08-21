import { supabase } from '../../../lib/supabase';
import { Capacitor } from '@capacitor/core';
import { buildAuthRedirectUrl } from '../../../lib/app-url';
import {
  clearPendingOAuthReturn,
  rememberPendingOAuthReturn,
} from '../../shared/auth/oauth-return-state';
import {
  isNativeOAuthPlatform,
  startNativeGoogleOAuth,
} from '../../shared/auth/native-oauth';
import { loginService } from '../../login/login.service';
import {
  getPortalAccessErrorLog,
  getPortalAccessErrorMessage,
} from '../../login/institutional-login-error';
import {
  getPortalProfile,
  getPublicPortalProfiles,
  type PortalAuthProfile,
} from '../../login/portal-session';
import { TERMS_VERSION } from '../../shared/constants/terms';
import { isValidCpf, isValidEmail, normalizeEmail } from '../../shared/utils/identityValidation';
import { isPublicAlunoOlderThanTen } from './aluno-birth-date';
import { relationshipPreferenceService } from './relationship-consent.service';
import {
  RELATIONSHIP_BIRTHDAY_LEGAL_BASIS,
  RELATIONSHIP_BIRTHDAY_LIA_VERSION,
  RELATIONSHIP_BIRTHDAY_POLICY_VERSION,
  type RelationshipPreferenceSurface,
} from '../../shared/constants/relationship-consent';

type PublicSignupRelationshipSurface = Extract<
  RelationshipPreferenceSurface,
  'public_signup_web' | 'public_signup_app'
>;

export interface PublicAlunoSignupData {
  nome: string;
  email: string;
  telefone: string;
  cpf: string;
  dataNascimento: string;
  sexo: string;
  racaCor: string;
  password: string;
  acceptedTerms: boolean;
  cep: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  turnstileToken: string;
  redirectPath?: string;
  appFlow?: boolean;
}

export const PUBLIC_ALUNO_SEXO_OPTIONS = [
  { value: 'FEMININO', label: 'Feminino' },
  { value: 'MASCULINO', label: 'Masculino' },
  { value: 'NÃO-BINÁRIO', label: 'Não binário' },
  { value: 'PREFIRO NÃO INFORMAR', label: 'Prefiro não informar' },
] as const;

export const PUBLIC_ALUNO_RACA_COR_OPTIONS = [
  { value: 'BRANCA', label: 'Branca' },
  { value: 'PRETA', label: 'Preta' },
  { value: 'PARDA', label: 'Parda' },
  { value: 'AMARELA', label: 'Amarela' },
  { value: 'INDÍGENA', label: 'Indígena' },
  { value: 'PREFIRO NÃO INFORMAR', label: 'Prefiro não informar' },
] as const;

export const PUBLIC_ALUNO_ALREADY_REGISTERED_CODE = 'public_aluno_already_registered' as const;
export const PUBLIC_ALUNO_ALREADY_REGISTERED_MESSAGE =
  'Usuário já cadastrado. Entre com o e-mail informado no cadastro ou use Recuperar senha para acessar sua conta.';
export const PUBLIC_ALUNO_CONFIRMATION_RESENT_MESSAGE =
  'Usuário já cadastrado. Enviamos um novo link de confirmação para o e-mail informado. Você também pode Entrar ou usar Recuperar senha.';
const PUBLIC_ALUNO_EMAIL_CONFIRMATION_REQUIRED_MESSAGE =
  'Confirme o e-mail enviado para ativar sua conta. Verifique também Spam ou Lixo eletrônico.';

type EmailConfirmationState = {
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
};

const hasConfirmedEmail = (user?: EmailConfirmationState | null) =>
  Boolean(user?.email_confirmed_at || user?.confirmed_at);

const clearUnconfirmedLocalSession = async () => {
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) {
    console.warn('Não foi possível limpar a sessão local sem confirmação de e-mail.', error);
  }
};

export class PublicAlunoAlreadyRegisteredError extends Error {
  readonly code = PUBLIC_ALUNO_ALREADY_REGISTERED_CODE;
  readonly confirmationResent: boolean;

  constructor(confirmationResent = false) {
    super(confirmationResent
      ? PUBLIC_ALUNO_CONFIRMATION_RESENT_MESSAGE
      : PUBLIC_ALUNO_ALREADY_REGISTERED_MESSAGE);
    this.name = 'PublicAlunoAlreadyRegisteredError';
    this.confirmationResent = confirmationResent;
  }
}

export const isPublicAlunoAlreadyRegisteredError = (
  error: unknown,
): error is PublicAlunoAlreadyRegisteredError => (
  error instanceof PublicAlunoAlreadyRegisteredError
  || (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === PUBLIC_ALUNO_ALREADY_REGISTERED_CODE
  )
);

interface FinalizeAlunoFirstAccessData {
  contextId: string;
  requestId: string;
  acceptedTerms: boolean;
  acceptTermsVersion?: string;
  setPassword?: boolean;
  newPassword?: string;
}

type FirstAccessRpcResult = {
  contextId: string;
  firstAccess: {
    acceptedTermsAt: string;
    acceptedTermsVersion: string;
    requiresPasswordReset: false;
  };
  replayed: boolean;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const FIRST_ACCESS_RPC = 'portal_finalizar_primeiro_acesso';
const FIRST_ACCESS_GENERIC_ERROR = 'Não foi possível concluir o primeiro acesso. Tente novamente em instantes.';
const FIRST_ACCESS_ERROR_MESSAGES: Record<string, string> = {
  AUTENTICACAO_OBRIGATORIA: 'Sua sessão expirou. Entre novamente para concluir o primeiro acesso.',
  PORTAL_PRIMEIRO_ACESSO_PARAMETROS_INVALIDOS: 'Os dados do primeiro acesso estão inválidos. Atualize a página e tente novamente.',
  PORTAL_PRIMEIRO_ACESSO_CONTEXTO_NAO_AUTORIZADO: 'Este perfil de aluno não está mais disponível para a sua conta.',
  PORTAL_PRIMEIRO_ACESSO_TERMOS_NAO_ACEITOS: 'É obrigatório aceitar os Termos de Uso para continuar.',
  PORTAL_PRIMEIRO_ACESSO_TERMOS_VERSAO_DIVERGENTE: 'Os Termos de Uso foram atualizados. Atualize a página antes de continuar.',
  PORTAL_PRIMEIRO_ACESSO_SENHA_AINDA_OBRIGATORIA: 'A alteração da senha ainda está sendo confirmada. Tente concluir novamente.',
  PORTAL_IDENTIDADE_REQUEST_REPLAY_DIVERGENTE: 'Esta tentativa não corresponde mais aos dados exibidos. Atualize a página e tente novamente.',
};

const getFirstAccessErrorMessage = (error: unknown) => {
  const raw = error && typeof error === 'object' && 'message' in error
    ? String((error as { message?: unknown }).message || '')
    : '';
  const code = Object.keys(FIRST_ACCESS_ERROR_MESSAGES).find((item) => raw.includes(item));
  return code ? FIRST_ACCESS_ERROR_MESSAGES[code] : FIRST_ACCESS_GENERIC_ERROR;
};

const normalizeFirstAccessRpcResult = (
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

type PublicAlunoProfileData = Omit<PublicAlunoSignupData, 'password' | 'redirectPath' | 'appFlow'> & {
  relationshipBirthdayPreferenceSurface?: PublicSignupRelationshipSurface;
};
type LegacyPublicAlunoProfileData = Omit<
  PublicAlunoProfileData,
  | 'cep'
  | 'endereco'
  | 'numero'
  | 'complemento'
  | 'bairro'
  | 'cidade'
  | 'uf'
  | 'turnstileToken'
> & Partial<Pick<
  PublicAlunoProfileData,
  | 'cep'
  | 'endereco'
  | 'numero'
  | 'complemento'
  | 'bairro'
  | 'cidade'
  | 'uf'
  | 'relationshipBirthdayPreferenceSurface'
>>;

const onlyDigits = (value: string) => value.replace(/\D/g, '');
export const getSafePublicAlunoRedirectPath = (value?: string | null, fallback = '/aluno') => {
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

const isStrongPassword = (value: string) => (
  value.length >= 8 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value)
);

const isAlreadyRegisteredSignupMessage = (message: string) => {
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

const getFriendlySignupError = (message: string) => {
  const lower = message.toLowerCase();
  if (isAlreadyRegisteredSignupMessage(message)) return PUBLIC_ALUNO_ALREADY_REGISTERED_MESSAGE;
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

const assertPublicAlunoCpfAvailable = async (
  cpf: string,
  email: string,
  turnstileToken: string,
) => {
  const { data, error } = await supabase.functions.invoke('portal-auth', {
    body: {
      action: 'signup',
      identifier: email,
      cpf,
      turnstileToken,
      challengeContext: Capacitor.isNativePlatform() ? 'native' : 'web',
    },
  });

  if (!error && data?.available === true) return;

  const context = (error as {
    context?: { status?: number; clone?: () => Response };
  } | null)?.context;
  let code = '';

  if (typeof context?.clone === 'function') {
    try {
      const body = await context.clone().json() as { code?: unknown };
      code = typeof body?.code === 'string' ? body.code : '';
    } catch {
      // O status HTTP abaixo ainda produz uma mensagem segura.
    }
  }

  if (context?.status === 409 || code === 'cpf_already_registered') {
    throw new PublicAlunoAlreadyRegisteredError();
  }
  if (context?.status === 403 || code === 'challenge_failed') {
    throw new Error('A verificação de segurança expirou ou falhou. Tente verificá-la novamente.');
  }
  if (context?.status === 429 || code === 'rate_limited') {
    throw new Error('Muitas tentativas. Aguarde alguns minutos e tente novamente.');
  }

  throw new Error('Não foi possível verificar o CPF agora. Tente novamente em instantes.');
};

const isExistingUserError = (message: string) => {
  const lower = message.toLowerCase();
  return lower.includes('already registered') || lower.includes('user already');
};

const getFriendlyOAuthError = (message: string) => {
  if (message.includes('Manual linking is disabled')) {
    return 'O projeto do Supabase não permite vínculo manual de contas. Ative "Allow manual linking" em Authentication > Settings.';
  }

  if (message.includes('Unsupported provider: provider is not enabled')) {
    return 'Login com Google não está habilitado no projeto do Supabase ainda. Ative em Authentication > Providers > Google e configure CLIENT_ID/CLIENT_SECRET do OAuth.';
  }

  return message;
};

const getFriendlyAuthRedirectError = (message: string) => {
  const decoded = decodeURIComponent(String(message || '').replace(/\+/g, ' '));
  const lower = decoded.toLowerCase();

  if (
    lower.includes('token') ||
    lower.includes('expired') ||
    lower.includes('otp') ||
    lower.includes('invalid')
  ) {
    return 'Este link já foi usado ou expirou. Se você já confirmou o e-mail, entre normalmente com sua senha; caso contrário, solicite um novo link.';
  }

  return decoded || 'Não foi possível concluir a confirmação do e-mail. Tente entrar novamente.';
};

const ensureRelationshipTermsDefault = async (
  surface: 'public_signup_web' | 'public_signup_app' | 'student_first_access',
) => {
  try {
    await relationshipPreferenceService.ensureTermsDefault(surface);
  } catch (error) {
    // O trigger transacional do banco é a autoridade. Uma indisponibilidade
    // deste reforço autenticado não pode transformar um cadastro já concluído
    // em uma falsa falha para o aluno.
    console.warn('Não foi possível reconfirmar a preferência de relacionamento.', error);
  }
};

const finalizePublicAlunoSignup = async (data: LegacyPublicAlunoProfileData) => {
  const email = normalizeEmail(data.email);
  const nome = data.nome.trim().toLocaleUpperCase('pt-BR');
  const cep = onlyDigits(data.cep || '');
  const endereco = String(data.endereco || '').trim().toLocaleUpperCase('pt-BR');
  const numero = String(data.numero || '').trim().toLocaleUpperCase('pt-BR');
  const complemento = String(data.complemento || '').trim().toLocaleUpperCase('pt-BR');
  const bairro = String(data.bairro || '').trim().toLocaleUpperCase('pt-BR');
  const cidade = String(data.cidade || '').trim().toLocaleUpperCase('pt-BR');
  const uf = String(data.uf || '').trim().toLocaleUpperCase('pt-BR').slice(0, 2);
  const hasCompleteAddress = (
    cep.length === 8
    && Boolean(endereco)
    && Boolean(numero)
    && Boolean(bairro)
    && Boolean(cidade)
    && uf.length === 2
  );

  const baseRpcPayload = {
    p_nome: nome,
    p_email: email,
    p_telefone: onlyDigits(data.telefone),
    p_cpf: onlyDigits(data.cpf),
    p_data_nascimento: data.dataNascimento,
    p_aceitou_termos: data.acceptedTerms,
    p_termos_versao: TERMS_VERSION,
  };
  const { error } = hasCompleteAddress
    ? await supabase.rpc('finalizar_cadastro_publico_aluno', {
        ...baseRpcPayload,
        p_cep: cep,
        p_endereco: endereco,
        p_numero: numero,
        p_complemento: complemento,
        p_bairro: bairro,
        p_cidade: cidade,
        p_uf: uf,
      })
    : await supabase.rpc('finalizar_cadastro_publico_aluno', baseRpcPayload);

  if (error) {
    if (isAlreadyRegisteredSignupMessage(error.message)) {
      throw new PublicAlunoAlreadyRegisteredError();
    }
    throw new Error(getFriendlySignupError(error.message));
  }

  const profile = await getPortalProfile({ preferredRole: 'Aluno', allowedRoles: ['Aluno'] });
  if (!profile || profile.tipo !== 'Aluno') {
    throw new Error('Cadastro criado, mas não foi possível iniciar a sessão do aluno.');
  }

  // O trigger do banco cria esta preferência no aceite dos Termos, inclusive
  // quando a confirmação de e-mail adia a primeira sessão. A garantia
  // autenticada cobre cadastros já existentes e nunca sobrescreve um opt-out.
  if (data.acceptedTerms && data.relationshipBirthdayPreferenceSurface) {
    await ensureRelationshipTermsDefault(data.relationshipBirthdayPreferenceSurface);
  }

  return profile;
};

const finalizePublicSignupFromMetadata = async () => {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email) return null;

  const metadata = data.user.user_metadata || {};
  if (metadata.origem !== 'cadastro_publico_ead' || metadata.tipo !== 'Aluno') return null;
  if (!metadata.cpf || !metadata.dataNascimento) return null;

  return finalizePublicAlunoSignup({
    nome: String(metadata.nome || data.user.email),
    email: data.user.email,
    telefone: String(metadata.telefone || ''),
    cpf: String(metadata.cpf || ''),
    dataNascimento: String(metadata.dataNascimento || ''),
    sexo: String(metadata.sexo || ''),
    racaCor: String(metadata.racaCor || ''),
    acceptedTerms: metadata.acceptedTerms === true,
    cep: String(metadata.cep || ''),
    endereco: String(metadata.endereco || ''),
    numero: String(metadata.numero || ''),
    complemento: String(metadata.complemento || ''),
    bairro: String(metadata.bairro || ''),
    cidade: String(metadata.cidade || ''),
    uf: String(metadata.uf || ''),
    relationshipBirthdayPreferenceSurface:
      metadata.relationshipBirthdayPreferenceSurface === 'public_signup_app'
        ? 'public_signup_app'
        : metadata.relationshipBirthdayPreferenceSurface === 'public_signup_web'
          ? 'public_signup_web'
          : metadata.relationshipBirthdayConsentSurface === 'public_signup_app'
            ? 'public_signup_app'
            : metadata.relationshipBirthdayConsentSurface === 'public_signup_web'
              ? 'public_signup_web'
          : undefined,
  });
};

const getExistingOrFinalizePublicAlunoProfile = async () => {
  // O perfil sincronizado pelo Auth pode já existir e ter sido corrigido pela
  // secretaria depois do cadastro. Nesse caso, os metadados originais não
  // devem sobrescrever novamente CPF, telefone ou outros dados a cada login.
  const existingProfile = await getPortalProfile({
    preferredRole: 'Aluno',
    allowedRoles: ['Aluno'],
  });
  if (existingProfile) return existingProfile;

  return finalizePublicSignupFromMetadata();
};

const getPublicLoginProfiles = async (): Promise<PortalAuthProfile[]> => {
  let profiles: PortalAuthProfile[];
  try {
    profiles = await getPublicPortalProfiles();
  } catch (error) {
    console.error(
      'Falha ao resolver acesso público do aluno:',
      getPortalAccessErrorLog(error),
    );
    throw new Error(getPortalAccessErrorMessage(
      error,
      'Não foi possível carregar os perfis disponíveis para este acesso.',
    ), { cause: error });
  }

  if (profiles.length > 0) return profiles;
  throw new Error('Esta conta não possui um vínculo ativo para acesso ao portal. Solicite a verificação do vínculo à secretaria.');
};

export const alunoPublicAuthService = {
  async login(
    email: string,
    password: string,
    turnstileToken: string,
  ) {
    const { error, user } = await loginService.login({
      email,
      password,
      turnstileToken,
    });
    if (error) throw new Error(error);
    if (user && !hasConfirmedEmail(user)) {
      await clearUnconfirmedLocalSession();
      throw new Error(PUBLIC_ALUNO_EMAIL_CONFIRMATION_REQUIRED_MESSAGE);
    }

    try {
      const profile = await getExistingOrFinalizePublicAlunoProfile();

      if (!profile || profile.tipo !== 'Aluno') {
        throw new Error('Este login é exclusivo para alunos. Use uma conta de aluno ou acesse o portal institucional.');
      }

      return profile;
    } catch (profileError) {
      await loginService.logout();
      throw profileError;
    }
  },

  /**
   * Fluxo novo de login público. A escolha só é apresentada para contextos
   * que a RPC já devolveu como ativos e autorizados.
   */
  async loginAndListProfiles(
    email: string,
    password: string,
    turnstileToken: string,
  ): Promise<PortalAuthProfile[]> {
    const { error, user } = await loginService.login({
      email,
      password,
      turnstileToken,
    });
    if (error) throw new Error(error);
    if (user && !hasConfirmedEmail(user)) {
      await clearUnconfirmedLocalSession();
      throw new Error(PUBLIC_ALUNO_EMAIL_CONFIRMATION_REQUIRED_MESSAGE);
    }

    try {
      return await getPublicLoginProfiles();
    } catch (profileError) {
      await loginService.logout();
      throw profileError;
    }
  },

  async loginWithGoogle(redirectPath = '/aluno') {
    const safeRedirectPath = getSafePublicAlunoRedirectPath(redirectPath);

    if (isNativeOAuthPlatform()) {
      try {
        await startNativeGoogleOAuth('aluno', safeRedirectPath);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || '');
        throw new Error(getFriendlyOAuthError(message), { cause: error });
      }
      return;
    }

    rememberPendingOAuthReturn('aluno', safeRedirectPath);

    // O callback precisa ser uma URL fixa da allowlist do Supabase. O destino
    // final fica no sessionStorage e não participa da validação do redirectTo.
    const redirectTo = buildAuthRedirectUrl('/login');
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });
      if (error) throw new Error(getFriendlyOAuthError(error.message));
    } catch (error) {
      clearPendingOAuthReturn('aluno');
      throw error;
    }
  },

  async finishExternalLogin() {
    try {
      const profile = await getExistingOrFinalizePublicAlunoProfile();

      if (!profile || profile.tipo !== 'Aluno') {
        throw new Error('Esta conta não possui vínculo de aluno. Use um e-mail de aluno ou crie o cadastro de aluno antes de entrar.');
      }

      return profile;
    } catch (profileError) {
      await loginService.logout();
      throw profileError;
    }
  },

  async finishExternalLoginAndListProfiles(): Promise<PortalAuthProfile[]> {
    try {
      return await getPublicLoginProfiles();
    } catch (profileError) {
      await loginService.logout();
      throw profileError;
    }
  },

  getFriendlyAuthRedirectError,

  async signup(
    data: PublicAlunoSignupData,
  ) {
    const email = normalizeEmail(data.email);
    const nome = data.nome.trim().toLocaleUpperCase('pt-BR');
    const telefone = onlyDigits(data.telefone);
    const cpf = onlyDigits(data.cpf);
    const dataNascimento = data.dataNascimento.trim();
    const sexo = data.sexo.trim().toLocaleUpperCase('pt-BR');
    const racaCor = data.racaCor.trim().toLocaleUpperCase('pt-BR');
    const acceptedTerms = data.acceptedTerms;
    const relationshipBirthdayPreferenceSurface: PublicSignupRelationshipSurface = data.appFlow
      ? 'public_signup_app'
      : 'public_signup_web';
    const cep = onlyDigits(data.cep);
    const endereco = data.endereco.trim().toLocaleUpperCase('pt-BR');
    const numero = data.numero.trim().toLocaleUpperCase('pt-BR');
    const complemento = data.complemento.trim().toLocaleUpperCase('pt-BR');
    const bairro = data.bairro.trim().toLocaleUpperCase('pt-BR');
    const cidade = data.cidade.trim().toLocaleUpperCase('pt-BR');
    const uf = data.uf.trim().toLocaleUpperCase('pt-BR').slice(0, 2);
    const requestedRedirectPath = data.redirectPath
      ? getSafePublicAlunoRedirectPath(data.redirectPath)
      : null;
    const loginPath = data.appFlow ? '/aluno/login-app' : '/login';
    const confirmationPagePath = data.appFlow ? '/aluno/confirmacao-email' : '/confirmacao-email';
    const postConfirmationPath = requestedRedirectPath
      ? `${loginPath}?${new URLSearchParams({ redirect: requestedRedirectPath }).toString()}`
      : loginPath;
    const confirmationPath = `${confirmationPagePath}?${new URLSearchParams({
      redirect: postConfirmationPath,
    }).toString()}`;

    const recoverExistingSignup = async () => {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: data.password,
      });
      if (!signInError) {
        if (signInData.user && !hasConfirmedEmail(signInData.user)) {
          await clearUnconfirmedLocalSession();
          const { error: resendError } = await supabase.auth.resend({
            type: 'signup',
            email,
            options: { emailRedirectTo: buildAuthRedirectUrl(confirmationPath) },
          });
          throw new PublicAlunoAlreadyRegisteredError(!resendError);
        }
        try {
          const profile = await finalizeSignup();
          return { profile, emailConfirmationRequired: false };
        } catch (finalizeError) {
          // A senha comprovou a conta, mas ela só pode permanecer autenticada
          // depois que o vínculo canônico confirmar um perfil de Aluno.
          try {
            const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
            if (signOutError) console.warn('Não foi possível limpar a sessão local após falha do cadastro.', signOutError);
          } catch (signOutError) {
            console.warn('Não foi possível limpar a sessão local após falha do cadastro.', signOutError);
          }
          throw finalizeError;
        }
      }

      // Para cadastros que chegaram ao Auth, mas falharam antes do vínculo do
      // aluno, o reenvio recupera a confirmação sem revelar se o e-mail existe.
      // O Auth aplica seu próprio cooldown; o Turnstile já foi validado no
      // preflight portal-auth que identificou o CPF existente.
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: buildAuthRedirectUrl(confirmationPath) },
      });
      throw new PublicAlunoAlreadyRegisteredError(!resendError);
    };

    if (!isValidEmail(email)) {
      throw new Error('Informe um e-mail válido. Ele será usado como login do aluno.');
    }

    if (!isValidCpf(cpf)) {
      throw new Error('Informe um CPF válido para concluir o cadastro.');
    }

    if (!data.acceptedTerms) {
      throw new Error('Você precisa aceitar os Termos de Uso para concluir o cadastro.');
    }

    if (!isStrongPassword(data.password)) {
      throw new Error('A senha deve ter no mínimo 8 caracteres, 1 letra maiúscula, 1 letra minúscula e 1 número.');
    }

    if (!dataNascimento) {
      throw new Error('Informe a data de nascimento para concluir o cadastro.');
    }

    if (!isPublicAlunoOlderThanTen(dataNascimento)) {
      throw new Error('O cadastro é permitido somente para alunos com mais de 10 anos de idade.');
    }

    if (!PUBLIC_ALUNO_SEXO_OPTIONS.some((option) => option.value === sexo)) {
      throw new Error('Selecione uma opção de sexo para concluir o cadastro.');
    }

    if (!PUBLIC_ALUNO_RACA_COR_OPTIONS.some((option) => option.value === racaCor)) {
      throw new Error('Selecione uma opção de raça/cor para concluir o cadastro.');
    }

    if (
      cep.length !== 8
      || !endereco
      || !numero
      || !bairro
      || !cidade
      || uf.length !== 2
    ) {
      throw new Error('Complete CEP, endereço, número, bairro, cidade e UF para concluir o cadastro.');
    }

    const finalizeSignup = async () => finalizePublicAlunoSignup({
      nome,
      email,
      telefone,
      cpf,
      dataNascimento,
      sexo,
      racaCor,
      acceptedTerms,
      relationshipBirthdayPreferenceSurface,
      cep,
      endereco,
      numero,
      complemento,
      bairro,
      cidade,
      uf,
    });

    try {
      await assertPublicAlunoCpfAvailable(cpf, email, data.turnstileToken);
    } catch (error) {
      if (isPublicAlunoAlreadyRegisteredError(error)) {
        return recoverExistingSignup();
      }
      throw error;
    }

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password: data.password,
      options: {
        emailRedirectTo: buildAuthRedirectUrl(confirmationPath),
        data: {
          nome,
          tipo: 'Aluno',
          origem: 'cadastro_publico_ead',
          cpf,
          telefone,
          dataNascimento,
          sexo,
          racaCor,
          acceptedTerms,
          termsVersion: TERMS_VERSION,
          relationshipBirthdayDefaultEnabled: true,
          relationshipBirthdayLegalBasis: RELATIONSHIP_BIRTHDAY_LEGAL_BASIS,
          relationshipBirthdayActivationReason: 'terms_acceptance',
          relationshipBirthdayPolicyVersion: RELATIONSHIP_BIRTHDAY_POLICY_VERSION,
          relationshipBirthdayLiaVersion: RELATIONSHIP_BIRTHDAY_LIA_VERSION,
          relationshipBirthdayPreferenceSurface,
          relationshipBirthdayIncludesCommercialAdvertising: false,
          cep,
          endereco,
          numero,
          complemento,
          bairro,
          cidade,
          uf,
        },
      },
    });

    if (authError) {
      if (isExistingUserError(authError.message)) {
        return recoverExistingSignup();
      }
      throw new Error(getFriendlySignupError(authError.message));
    }

    const identities = (authData.user as any)?.identities;
    if (Array.isArray(identities) && identities.length === 0) {
      return recoverExistingSignup();
    }

    if (!authData.session || (authData.user && !hasConfirmedEmail(authData.user))) {
      if (authData.session) await clearUnconfirmedLocalSession();
      return { profile: null, emailConfirmationRequired: true };
    }

    const profile = await finalizeSignup();
    return { profile, emailConfirmationRequired: false };
  },

  async finalizeFirstAccess({
    contextId,
    requestId,
    acceptedTerms,
    acceptTermsVersion = TERMS_VERSION,
    setPassword = false,
    newPassword,
  }: FinalizeAlunoFirstAccessData) {
    if (!UUID_PATTERN.test(contextId) || !UUID_PATTERN.test(requestId)) {
      throw new Error('O contexto do primeiro acesso é inválido. Atualize a página e tente novamente.');
    }
    if (!acceptedTerms) {
      throw new Error('É obrigatório aceitar os Termos de Uso para continuar.');
    }
    if (acceptTermsVersion !== TERMS_VERSION) {
      throw new Error('Os Termos de Uso foram atualizados. Atualize a página antes de continuar.');
    }

    if (setPassword) {
      if (!newPassword) {
        throw new Error('Informe uma nova senha para concluir o primeiro acesso.');
      }

      if (!isStrongPassword(newPassword)) {
        throw new Error('A nova senha deve ter no mínimo 8 caracteres, 1 letra maiúscula, 1 letra minúscula e 1 número.');
      }

      const { error: passwordUpdateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (passwordUpdateError) {
        throw new Error('Não foi possível atualizar a senha. Confira os requisitos e tente novamente.');
      }
    }

    const { data, error } = await (supabase.rpc as any)(FIRST_ACCESS_RPC, {
      p_context_id: contextId,
      p_aceitar_termos: true,
      p_termos_versao: acceptTermsVersion,
      p_request_id: requestId,
    });
    if (error) {
      throw new Error(getFirstAccessErrorMessage(error));
    }
    normalizeFirstAccessRpcResult(data, contextId, acceptTermsVersion);

    await ensureRelationshipTermsDefault('student_first_access');

    // A resposta da mutação é validada, mas a navegação depende de uma nova
    // leitura canônica. Assim, storage e resposta local nunca concluem acesso.
    const profile = await getPortalProfile({
      preferredRole: 'Aluno',
      allowedRoles: ['Aluno'],
      contextId,
    });
    if (
      !profile
      || profile.contextId !== contextId
      || !profile.acceptedTermsAt
      || profile.acceptedTermsVersion !== acceptTermsVersion
      || profile.requiresPasswordReset
    ) {
      throw new Error(FIRST_ACCESS_GENERIC_ERROR);
    }
    return profile;
  },

  needsInitialAccess(profile: { tipo?: string; acceptedTermsAt?: string | null; requiresPasswordReset?: boolean }) {
    return (
      profile?.tipo === 'Aluno'
      && (
        !profile.acceptedTermsAt?.trim()
        || profile.requiresPasswordReset !== false
      )
    );
  },
};
