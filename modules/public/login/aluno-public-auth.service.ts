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
import { getPortalProfile } from '../../login/portal-session';
import { TERMS_VERSION } from '../../shared/constants/terms';
import { isValidCpf, isValidEmail, normalizeEmail } from '../../shared/utils/identityValidation';
import { isPublicAlunoOlderThanTen } from './aluno-birth-date';
import { relationshipConsentService } from './relationship-consent.service';
import {
  RELATIONSHIP_BIRTHDAY_POLICY_VERSION,
  type RelationshipConsentSurface,
} from '../../shared/constants/relationship-consent';

export interface PublicAlunoSignupData {
  nome: string;
  email: string;
  telefone: string;
  cpf: string;
  dataNascimento: string;
  password: string;
  acceptedTerms: boolean;
  relationshipBirthdayConsent: boolean;
  relationshipBirthdayConsentSurface: Extract<
    RelationshipConsentSurface,
    'public_signup_web' | 'public_signup_app'
  >;
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

interface FinalizeAlunoFirstAccessData {
  partnerId: string;
  acceptedTerms: boolean;
  acceptTermsVersion?: string;
  setPassword?: boolean;
  newPassword?: string;
  relationshipBirthdayConsent?: boolean;
  relationshipPreferenceDecided?: boolean;
}

type PublicAlunoProfileData = Omit<PublicAlunoSignupData, 'password' | 'redirectPath' | 'appFlow'>;
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
  | 'relationshipBirthdayConsent'
  | 'relationshipBirthdayConsentSurface'
> & Partial<Pick<
  PublicAlunoProfileData,
  | 'cep'
  | 'endereco'
  | 'numero'
  | 'complemento'
  | 'bairro'
  | 'cidade'
  | 'uf'
  | 'relationshipBirthdayConsent'
  | 'relationshipBirthdayConsentSurface'
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
  value.length >= 6 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value)
);

const getFriendlySignupError = (message: string) => {
  const lower = message.toLowerCase();
  if (lower.includes('already registered') || lower.includes('user already')) {
    return 'Este e-mail já possui acesso. Entre com sua senha para continuar a compra.';
  }
  if (lower.includes('password')) {
    return 'A senha precisa ter pelo menos 6 caracteres.';
  }
  if (lower.includes('duplicate') || lower.includes('cpf_cnpj')) {
    return 'Este CPF já está cadastrado. Entre com seu e-mail ou fale com a secretaria.';
  }
  if (
    lower.includes('public_aluno_cpf_unique')
    || lower.includes('cpf ja esta cadastrado')
    || lower.includes('cpf já está cadastrado')
  ) {
    return 'Este CPF já está cadastrado. Entre com seu e-mail ou fale com a secretaria.';
  }
  return message;
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
    throw new Error('Este CPF já está cadastrado. Entre com seu e-mail ou fale com a secretaria.');
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
    throw new Error(getFriendlySignupError(error.message));
  }

  const profile = await getPortalProfile({ preferredRole: 'Aluno', allowedRoles: ['Aluno'] });
  if (!profile || profile.tipo !== 'Aluno') {
    throw new Error('Cadastro criado, mas não foi possível iniciar a sessão do aluno.');
  }

  // O trigger do Auth preserva a escolha mesmo quando há confirmação de
  // e-mail. Esta chamada autenticada cobre cadastro já existente/fallback e é
  // idempotente quando o trigger já registrou a mesma decisão.
  if (
    typeof data.relationshipBirthdayConsent === 'boolean'
    && data.relationshipBirthdayConsentSurface
  ) {
    await relationshipConsentService.registerPreference(
      data.relationshipBirthdayConsent,
      data.relationshipBirthdayConsentSurface,
    );
  }

  return profile;
};

const finalizePublicSignupFromMetadata = async () => {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email) return null;

  const metadata = data.user.user_metadata || {};
  if (metadata.origem !== 'cadastro_publico_ead' && metadata.tipo !== 'Aluno') return null;
  if (!metadata.cpf || !metadata.dataNascimento) return null;

  return finalizePublicAlunoSignup({
    nome: String(metadata.nome || data.user.email),
    email: data.user.email,
    telefone: String(metadata.telefone || ''),
    cpf: String(metadata.cpf || ''),
    dataNascimento: String(metadata.dataNascimento || ''),
    acceptedTerms: metadata.acceptedTerms === true,
    cep: String(metadata.cep || ''),
    endereco: String(metadata.endereco || ''),
    numero: String(metadata.numero || ''),
    complemento: String(metadata.complemento || ''),
    bairro: String(metadata.bairro || ''),
    cidade: String(metadata.cidade || ''),
    uf: String(metadata.uf || ''),
    relationshipBirthdayConsent:
      typeof metadata.relationshipBirthdayConsent === 'boolean'
        ? metadata.relationshipBirthdayConsent
        : undefined,
    relationshipBirthdayConsentSurface:
      metadata.relationshipBirthdayConsentSurface === 'public_signup_app'
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

export const alunoPublicAuthService = {
  async login(
    email: string,
    password: string,
    turnstileToken: string,
  ) {
    const { error } = await loginService.login({
      email,
      password,
      turnstileToken,
    });
    if (error) throw new Error(error);

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

  getFriendlyAuthRedirectError,

  async signup(
    data: PublicAlunoSignupData,
  ) {
    const email = normalizeEmail(data.email);
    const nome = data.nome.trim().toLocaleUpperCase('pt-BR');
    const telefone = onlyDigits(data.telefone);
    const cpf = onlyDigits(data.cpf);
    const dataNascimento = data.dataNascimento.trim();
    const acceptedTerms = data.acceptedTerms;
    const relationshipBirthdayConsent = data.relationshipBirthdayConsent;
    const relationshipBirthdayConsentSurface = data.relationshipBirthdayConsentSurface;
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
      throw new Error('A senha deve ter no mínimo 6 caracteres, 1 letra maiúscula, 1 letra minúscula e 1 número.');
    }

    if (!dataNascimento) {
      throw new Error('Informe a data de nascimento para concluir o cadastro.');
    }

    if (!isPublicAlunoOlderThanTen(dataNascimento)) {
      throw new Error('O cadastro é permitido somente para alunos com mais de 10 anos de idade.');
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
      acceptedTerms,
      relationshipBirthdayConsent,
      relationshipBirthdayConsentSurface,
      cep,
      endereco,
      numero,
      complemento,
      bairro,
      cidade,
      uf,
    });

    await assertPublicAlunoCpfAvailable(cpf, email, data.turnstileToken);

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
          acceptedTerms,
          termsVersion: TERMS_VERSION,
          relationshipBirthdayChoiceMade: true,
          relationshipBirthdayConsent,
          relationshipBirthdayPolicyVersion: RELATIONSHIP_BIRTHDAY_POLICY_VERSION,
          relationshipBirthdayConsentSurface,
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
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: data.password });
        if (signInError) throw new Error(getFriendlySignupError(authError.message));

        const profile = await finalizeSignup();
        return { profile, emailConfirmationRequired: false };
      }
      throw new Error(getFriendlySignupError(authError.message));
    }

    const identities = (authData.user as any)?.identities;
    if (Array.isArray(identities) && identities.length === 0) {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: data.password });
      if (signInError) throw new Error('Este e-mail já possui acesso. Entre com sua senha para continuar a compra.');

      const profile = await finalizeSignup();
      return { profile, emailConfirmationRequired: false };
    }

    if (!authData.session) {
      return { profile: null, emailConfirmationRequired: true };
    }

    const profile = await finalizeSignup();
    return { profile, emailConfirmationRequired: false };
  },

  async finalizeFirstAccess({
    partnerId,
    acceptedTerms,
    acceptTermsVersion = TERMS_VERSION,
    setPassword = false,
    newPassword,
    relationshipBirthdayConsent,
    relationshipPreferenceDecided = true,
  }: FinalizeAlunoFirstAccessData) {
    const updates: Record<string, any> = {};

    if (!relationshipPreferenceDecided) {
      if (typeof relationshipBirthdayConsent !== 'boolean') {
        throw new Error('Escolha se deseja ou não receber felicitações e comunicados de relacionamento.');
      }
      await relationshipConsentService.registerPreference(
        relationshipBirthdayConsent,
        'student_first_access',
      );
    }

    if (acceptedTerms) {
      updates.aceitou_termos_uso = true;
      updates.aceitou_termos_uso_em = new Date().toISOString();
      updates.termos_uso_versao = acceptTermsVersion;
    }

    if (setPassword) {
      if (!newPassword) {
        throw new Error('Informe uma nova senha para concluir o primeiro acesso.');
      }

      if (!isStrongPassword(newPassword)) {
        throw new Error('A nova senha deve ter no mínimo 6 caracteres, 1 letra maiúscula, 1 letra minúscula e 1 número.');
      }

      const passwordUpdateError = await loginService.updatePassword(newPassword);
      if (passwordUpdateError) {
        throw new Error(passwordUpdateError);
      }

      // O trigger do Auth é a autoridade que conclui a troca obrigatória e
      // ativa o acesso depois que a senha foi realmente persistida.
    }

    if (Object.keys(updates).length === 0) {
      return getPortalProfile({ preferredRole: 'Aluno', allowedRoles: ['Aluno'] });
    }

    const { error } = await supabase.from('parceiros').update(updates).eq('id', partnerId);
    if (error) {
      throw new Error(getFriendlySignupError(error.message));
    }

    return getPortalProfile({ preferredRole: 'Aluno', allowedRoles: ['Aluno'] });
  },

  needsInitialAccess(profile: { tipo?: string; acceptedTermsAt?: string | null; requiresPasswordReset?: boolean }) {
    return (
      profile?.tipo === 'Aluno'
      && (!profile.acceptedTermsAt || Boolean(profile.requiresPasswordReset))
    );
  },
};
