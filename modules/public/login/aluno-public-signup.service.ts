import { Capacitor } from '@capacitor/core';
import { buildAuthRedirectUrl } from '../../../lib/app-url';
import { supabase } from '../../../lib/supabase';
import { getPortalProfile } from '../../login/portal-session';
import {
  RELATIONSHIP_BIRTHDAY_LEGAL_BASIS,
  RELATIONSHIP_BIRTHDAY_LIA_VERSION,
  RELATIONSHIP_BIRTHDAY_POLICY_VERSION,
} from '../../shared/constants/relationship-consent';
import { TERMS_VERSION } from '../../shared/constants/terms';
import { isValidCpf, isValidEmail, normalizeEmail } from '../../shared/utils/identityValidation';
import { isPublicAlunoOlderThanTen } from './aluno-birth-date';
import {
  PUBLIC_ALUNO_RACA_COR_OPTIONS,
  PUBLIC_ALUNO_SEXO_OPTIONS,
  PublicAlunoAlreadyRegisteredError,
  isPublicAlunoAlreadyRegisteredError,
  type LegacyPublicAlunoProfileData,
  type PublicAlunoSignupData,
  type PublicSignupRelationshipSurface,
} from './aluno-public-auth.contract';
import {
  getFriendlySignupError,
  isAlreadyRegisteredSignupMessage,
  isExistingUserError,
  isStrongPassword,
  onlyDigits,
  getSafePublicAlunoRedirectPath,
} from './aluno-public-auth.helpers';
import {
  clearUnconfirmedLocalSession,
  hasConfirmedEmail,
} from './aluno-public-auth-session.helpers';
import { relationshipPreferenceService } from './relationship-consent.service';

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

export const ensureRelationshipTermsDefault = async (
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

export const finalizePublicAlunoSignup = async (data: LegacyPublicAlunoProfileData) => {
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

export const finalizePublicSignupFromMetadata = async () => {
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

const validateSignup = (data: PublicAlunoSignupData, normalized: {
  email: string;
  cpf: string;
  dataNascimento: string;
  sexo: string;
  racaCor: string;
  cep: string;
  endereco: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
}) => {
  if (!isValidEmail(normalized.email)) {
    throw new Error('Informe um e-mail válido. Ele será usado como login do aluno.');
  }
  if (!isValidCpf(normalized.cpf)) {
    throw new Error('Informe um CPF válido para concluir o cadastro.');
  }
  if (!data.acceptedTerms) {
    throw new Error('Você precisa aceitar os Termos de Uso para concluir o cadastro.');
  }
  if (!isStrongPassword(data.password)) {
    throw new Error('A senha deve ter no mínimo 8 caracteres, 1 letra maiúscula, 1 letra minúscula e 1 número.');
  }
  if (!normalized.dataNascimento) {
    throw new Error('Informe a data de nascimento para concluir o cadastro.');
  }
  if (!isPublicAlunoOlderThanTen(normalized.dataNascimento)) {
    throw new Error('O cadastro é permitido somente para alunos com mais de 10 anos de idade.');
  }
  if (!PUBLIC_ALUNO_SEXO_OPTIONS.some((option) => option.value === normalized.sexo)) {
    throw new Error('Selecione uma opção de sexo para concluir o cadastro.');
  }
  if (!PUBLIC_ALUNO_RACA_COR_OPTIONS.some((option) => option.value === normalized.racaCor)) {
    throw new Error('Selecione uma opção de raça/cor para concluir o cadastro.');
  }
  if (
    normalized.cep.length !== 8
    || !normalized.endereco
    || !normalized.numero
    || !normalized.bairro
    || !normalized.cidade
    || normalized.uf.length !== 2
  ) {
    throw new Error('Complete CEP, endereço, número, bairro, cidade e UF para concluir o cadastro.');
  }
};

export const signupPublicAluno = async (data: PublicAlunoSignupData) => {
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

  validateSignup(data, {
    email,
    cpf,
    dataNascimento,
    sexo,
    racaCor,
    cep,
    endereco,
    numero,
    bairro,
    cidade,
    uf,
  });

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
        try {
          const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
          if (signOutError) {
            console.warn('Não foi possível limpar a sessão local após falha do cadastro.', signOutError);
          }
        } catch (signOutError) {
          console.warn('Não foi possível limpar a sessão local após falha do cadastro.', signOutError);
        }
        throw finalizeError;
      }
    }

    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: buildAuthRedirectUrl(confirmationPath) },
    });
    throw new PublicAlunoAlreadyRegisteredError(!resendError);
  };

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

  const identities = (authData.user as { identities?: unknown } | null)?.identities;
  if (Array.isArray(identities) && identities.length === 0) {
    return recoverExistingSignup();
  }

  if (!authData.session || (authData.user && !hasConfirmedEmail(authData.user))) {
    if (authData.session) await clearUnconfirmedLocalSession();
    return { profile: null, emailConfirmationRequired: true };
  }

  const profile = await finalizeSignup();
  return { profile, emailConfirmationRequired: false };
};
