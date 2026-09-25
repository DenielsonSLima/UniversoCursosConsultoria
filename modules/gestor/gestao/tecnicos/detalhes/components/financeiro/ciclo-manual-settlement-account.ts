import { isContaDisponivelNoPolo, type ContaBancaria } from '../../../../../financeiro/financeiro.types';
import { canAccessFinanceiroTab, canAccessGestorModule, type GestorPermissions } from '../../../../../access-control';

export const canUseManualEnrollmentSettlement = (permissions: GestorPermissions) => {
  const finance = canAccessGestorModule(permissions, 'financeiro');
  const canReadAccounts = finance || canAccessGestorModule(permissions, 'caixa');
  const canSettle = (finance && canAccessFinanceiroTab(permissions, 'receber'))
    || (canAccessGestorModule(permissions, 'secretaria')
      && (permissions.tabs?.secretaria || []).some((tab) => ['recebimentos', 'consulta-financeira'].includes(tab)));
  return canReadAccounts && canSettle;
};

// A baixa manual exige conta física do polo ou global. O vínculo compartilhado
// permite consulta de saldo, mas não substitui essa autorização de recebimento.
export const isManualEnrollmentSettlementAccount = (account: ContaBancaria, poloId: string) => (
  account.ativo === true
  && Boolean(account.id)
  && (!account.poloId || account.poloId === poloId)
  && isContaDisponivelNoPolo(account, poloId)
);

export const manualEnrollmentAccountsErrorMessage = (error: unknown) => {
  const message = error && typeof error === 'object' && 'message' in error
    && typeof error.message === 'string' ? error.message.trim() : '';
  return message || 'Não foi possível carregar as contas para este recebimento. Feche e abra o recebimento para tentar novamente.';
};
