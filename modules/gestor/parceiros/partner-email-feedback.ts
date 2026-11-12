import type { QueryClient } from '@tanstack/react-query';
import type { PartnerEmailUpdateResult } from './partner-email-update';

export const invalidatePartnerEmailAccess = (client: QueryClient, partnerId: string) => Promise.all([
  client.invalidateQueries({ queryKey: ['parceiro', partnerId], exact: true }),
  client.invalidateQueries({ queryKey: ['parceiros'] }),
  client.invalidateQueries({ queryKey: ['partner-email-confirmation-status', partnerId] }),
  client.invalidateQueries({ queryKey: ['partner-google-identity-status', partnerId] }),
]);

export function partnerEmailUpdateFeedback(result?: PartnerEmailUpdateResult) {
  if (!result) return null;
  const type = result.deliveryPending ? 'warning' : 'success';
  const title = result.emailCorrected
    ? result.deliveryPending ? 'E-mail corrigido, envio pendente' : result.emailSent ? 'E-mail corrigido e link enviado' : 'E-mail corrigido'
    : result.deliveryPending ? 'Cadastro salvo, acesso pendente' : result.emailSent ? 'Cadastro salvo e link enviado' : 'E-mail de contato atualizado';
  return { type, title, message: result.message } as const;
}
