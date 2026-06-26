import { supabase } from '../../../lib/supabase';
import { loginService } from '../../login/login.service';
import { getPortalProfile } from '../../login/portal-session';
import { TERMS_VERSION } from '../../shared/constants/terms';

export interface PublicAlunoSignupData {
  nome: string;
  email: string;
  telefone: string;
  cpf: string;
  dataNascimento: string;
  password: string;
  acceptedTerms: boolean;
}

interface FinalizeAlunoFirstAccessData {
  partnerId: string;
  acceptedTerms: boolean;
  acceptTermsVersion?: string;
  setPassword?: boolean;
  newPassword?: string;
}

const onlyDigits = (value: string) => value.replace(/\D/g, '');
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
  return message;
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

export const alunoPublicAuthService = {
  async login(email: string, password: string) {
    const { error } = await loginService.login({ email, password });
    if (error) throw new Error(error);

    const profile = await getPortalProfile();
    if (!profile || profile.tipo !== 'Aluno') {
      await loginService.logout();
      throw new Error('Este login é exclusivo para alunos. Use uma conta de aluno ou acesse o portal institucional.');
    }

    return profile;
  },

  async loginWithGoogle(redirectPath = '/aluno') {
    const redirectTo = `${window.location.origin}/login?redirect=${encodeURIComponent(redirectPath)}`;
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
  },

  async finishExternalLogin() {
    const profile = await getPortalProfile();
    if (!profile || (profile.tipo !== 'Aluno' && profile.tipo !== 'Professor')) {
      await loginService.logout();
      throw new Error('Este login é exclusivo para alunos. Use uma conta de aluno ou acesse o portal institucional.');
    }

    return profile;
  },

  async signup(data: PublicAlunoSignupData) {
    const email = data.email.trim().toLowerCase();
    const nome = data.nome.trim();
    const telefone = onlyDigits(data.telefone);
    const cpf = onlyDigits(data.cpf);
    const dataNascimento = data.dataNascimento.trim();

    if (!data.acceptedTerms) {
      throw new Error('Você precisa aceitar os Termos de Uso para concluir o cadastro.');
    }

    if (!isStrongPassword(data.password)) {
      throw new Error('A senha deve ter no mínimo 6 caracteres, 1 letra maiúscula, 1 letra minúscula e 1 número.');
    }

    if (!dataNascimento) {
      throw new Error('Informe a data de nascimento para concluir o cadastro.');
    }

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password: data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/login?redirect=${encodeURIComponent('/aluno')}`,
        data: {
          nome,
          tipo: 'Aluno',
          origem: 'cadastro_publico_ead',
        },
      },
    });

    if (authError) {
      throw new Error(getFriendlySignupError(authError.message));
    }

    const identities = (authData.user as any)?.identities;
    if (Array.isArray(identities) && identities.length === 0) {
      throw new Error('Este e-mail já possui acesso. Entre com sua senha para continuar a compra.');
    }

    const { data: existingAluno, error: existingError } = await supabase
      .from('parceiros')
      .select('id')
      .ilike('email', email)
      .eq('tipo', 'Aluno')
      .maybeSingle();

    if (existingError && existingError.code !== 'PGRST116') {
      throw new Error(existingError.message);
    }

    const agora = new Date().toISOString();
    const alunoPayload = {
      tipo: 'Aluno',
      nome,
      email,
      telefone,
      cpf_cnpj: cpf || null,
      data_nascimento: dataNascimento,
      status: 'ATIVO',
      observacao: 'Cadastro publico criado pelo fluxo de compra online EAD.',
      aceitou_termos_uso: true,
      aceitou_termos_uso_em: agora,
      termos_uso_versao: TERMS_VERSION,
    };

    if (existingAluno?.id) {
      const { error } = await supabase
        .from('parceiros')
        .update(alunoPayload)
        .eq('id', existingAluno.id);
      if (error) throw new Error(getFriendlySignupError(error.message));
    } else {
      const { error } = await supabase.from('parceiros').insert(alunoPayload);
      if (error) throw new Error(getFriendlySignupError(error.message));
    }

    if (!authData.session) {
      return { profile: null, emailConfirmationRequired: true };
    }

    const profile = await getPortalProfile();
    if (!profile || profile.tipo !== 'Aluno') {
      throw new Error('Cadastro criado, mas não foi possível iniciar a sessão do aluno.');
    }

    return { profile, emailConfirmationRequired: false };
  },

  async finalizeFirstAccess({
    partnerId,
    acceptedTerms,
    acceptTermsVersion = TERMS_VERSION,
    setPassword = false,
    newPassword,
  }: FinalizeAlunoFirstAccessData) {
    const updates: Record<string, any> = {};

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

      updates.troca_senha_obrigatoria = false;
    }

    if (Object.keys(updates).length === 0) {
      return getPortalProfile();
    }

    const { error } = await supabase.from('parceiros').update(updates).eq('id', partnerId);
    if (error) {
      throw new Error(getFriendlySignupError(error.message));
    }

    return getPortalProfile();
  },

  needsInitialAccess(profile: { tipo?: string; acceptedTermsAt?: string | null; requiresPasswordReset?: boolean }) {
    return (
      profile?.tipo === 'Aluno'
      && (!profile.acceptedTermsAt || Boolean(profile.requiresPasswordReset))
    );
  },
};
