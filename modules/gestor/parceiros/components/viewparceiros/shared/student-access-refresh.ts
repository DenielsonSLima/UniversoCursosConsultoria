import type { QueryClient } from '@tanstack/react-query';
import type { PartnerEmailConfirmationStatus } from '../../../portal-activation.service';

export type StudentAccessRefreshStatus = 'idle' | 'loading' | 'ready' | 'error';

interface StudentAccessRefreshSources<T extends { id: string; email?: string | null }> {
  getPartner: () => Promise<T>;
  getEmailStatus: () => Promise<PartnerEmailConfirmationStatus | null>;
}

export const refreshStudentAccess = async <T extends { id: string; email?: string | null }>(
  queryClient: QueryClient,
  partnerId: string,
  sources: StudentAccessRefreshSources<T>,
  signal?: AbortSignal,
) => {
  const partnerKey = ['parceiro', partnerId];
  const emailKey = ['partner-email-confirmation-status', partnerId];
  const assertActive = () => {
    if (signal?.aborted) throw new Error('A conferência deste acesso foi cancelada.');
  };
  assertActive();
  // staleTime: 0 ainda reutiliza uma consulta em voo; cada entrada precisa de uma nova leitura.
  await Promise.all([
    queryClient.cancelQueries({ queryKey: partnerKey, exact: true }),
    queryClient.cancelQueries({ queryKey: emailKey, exact: true }),
  ]);
  assertActive();
  const partner = await queryClient.fetchQuery({
    queryKey: partnerKey,
    queryFn: sources.getPartner,
    staleTime: 0,
  });
  assertActive();
  if (partner.id !== partnerId) {
    throw new Error('Não foi possível conferir o cadastro deste aluno.');
  }

  // O canal deve vir da linha recém-lida, e não do snapshot anterior da tela.
  if (String(partner.email || '').trim()) {
    // O cadastro atualizado pode ter habilitado a consulta automática do cartão de e-mail.
    await queryClient.cancelQueries({ queryKey: emailKey, exact: true });
    assertActive();
    const emailStatus = await queryClient.fetchQuery({
      queryKey: emailKey,
      queryFn: sources.getEmailStatus,
      staleTime: 0,
    });
    assertActive();
    if (!emailStatus || emailStatus.partnerId !== partnerId
      || emailStatus.status === 'unknown' || emailStatus.status === 'no_email') {
      throw new Error('Não foi possível conferir a confirmação do e-mail.');
    }
  }
  return partner;
};
