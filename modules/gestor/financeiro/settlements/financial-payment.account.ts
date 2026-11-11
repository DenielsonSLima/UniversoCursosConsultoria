import type { ContaBancaria } from '../financeiro.types';
import type { FinancialPaymentComponent, FinancialPaymentMethod } from './financial-payment.types';

const pixBanks = new Set(['BANESE', 'BANCO DO ESTADO DE SERGIPE', 'CAIXA ECONOMICA', 'CAIXA ECONOMICA FEDERAL', 'CEF']);

export function defaultPaymentMethodForAccount(account?: Pick<ContaBancaria, 'natureza' | 'banco'>): FinancialPaymentMethod | undefined {
  if (!account) return undefined;
  if (account.natureza === 'CAIXA_INTERNO') return 'DINHEIRO';
  const bank = account.banco.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toUpperCase();
  return pixBanks.has(bank) ? 'PIX' : undefined;
}

export function selectPaymentAccount(component: FinancialPaymentComponent, accountId: string, accounts: ContaBancaria[]): FinancialPaymentComponent {
  // Selecting the current account must not undo a manual payment-method choice.
  if (component.accountId === accountId) return component;
  return { ...component, accountId,
    method: defaultPaymentMethodForAccount(accounts.find(account => account.id === accountId)) ?? component.method };
}
