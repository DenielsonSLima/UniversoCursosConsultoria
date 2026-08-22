import type { PortalRole } from './portal-context.contract';
import { resolveProfilePostLoginRoute } from './profile-selection';

export type PublicFirstAccessRole = Extract<PortalRole, 'Aluno' | 'Responsavel'>;

export interface PortalFirstAccessProfile {
  tipo?: string;
  contextId?: string | null;
  acceptedTermsAt?: string | null;
  requiresPasswordReset?: boolean;
}

export const requiresPortalFirstAccess = (profile: PortalFirstAccessProfile) => (
  (profile.tipo === 'Aluno' || profile.tipo === 'Responsavel')
  && (
    !profile.acceptedTermsAt?.trim()
    || profile.requiresPasswordReset !== false
  )
);

export const buildPortalFirstAccessPath = (
  role: PublicFirstAccessRole,
  contextId: string,
  requestedNext?: string | null,
) => {
  const params = new URLSearchParams();
  params.set('next', resolveProfilePostLoginRoute(role, requestedNext));
  params.set('context', contextId);
  const basePath = role === 'Responsavel'
    ? '/responsavel/primeiro-acesso'
    : '/aluno/primeiro-acesso';
  return `${basePath}?${params.toString()}`;
};
