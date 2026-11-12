import type { PartnerGoogleIdentityStatus } from '../../../portal-activation.service';

export const partnerGoogleStatusKey = (partnerId: string, contactEmail?: string | null) => [
  'partner-google-identity-status', partnerId, String(contactEmail || '').trim().toLowerCase(),
] as const;

export const describePartnerGoogleIdentity = (
  status: PartnerGoogleIdentityStatus | undefined,
  type: 'Aluno' | 'Professor',
) => {
  if (!status?.has_auth_user) {
    return 'Nenhuma conta de acesso está vinculada a este cadastro. Isso não indica que o e-mail de contato seja inválido.';
  }
  if (status.google_linked) return `Google vinculado${status.google_email ? ` em ${status.google_email}` : ''}.`;
  return `A conta de acesso deste ${type.toLowerCase()} não tem Google vinculado. O acesso por matrícula e senha é independente.`;
};
