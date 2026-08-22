import { supabase } from '../../../lib/supabase';
import { requiresPortalFirstAccess } from '../../login/portal-first-access';
import { getPortalProfile } from '../../login/portal-session';
import { TERMS_VERSION } from '../../shared/constants/terms';
import type { FinalizePortalFirstAccessData } from './aluno-public-auth.contract';
import {
  FIRST_ACCESS_GENERIC_ERROR,
  FIRST_ACCESS_RPC,
  UUID_PATTERN,
  getFirstAccessErrorMessage,
  isStrongPassword,
  normalizeFirstAccessRpcResult,
} from './aluno-public-auth.helpers';
import { ensureRelationshipTermsDefault } from './aluno-public-signup.service';

export const finalizePublicAlunoFirstAccess = async ({
  role,
  contextId,
  requestId,
  acceptedTerms,
  acceptTermsVersion = TERMS_VERSION,
  setPassword = false,
  newPassword,
}: FinalizePortalFirstAccessData) => {
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
      throw new Error(
        'A nova senha deve ter no mínimo 8 caracteres, 1 letra maiúscula, 1 letra minúscula e 1 número.',
      );
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

  if (role === 'Aluno') {
    await ensureRelationshipTermsDefault('student_first_access');
  }

  // A resposta da mutação é validada, mas a navegação depende de uma nova
  // leitura canônica. Assim, storage e resposta local nunca concluem acesso.
  const profile = await getPortalProfile({
    preferredRole: role,
    allowedRoles: [role],
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
};

export const needsPublicAlunoInitialAccess = (profile: {
  tipo?: string;
  acceptedTermsAt?: string | null;
  requiresPasswordReset?: boolean;
}) => requiresPortalFirstAccess(profile);
