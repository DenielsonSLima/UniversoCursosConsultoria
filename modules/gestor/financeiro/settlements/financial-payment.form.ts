import type { FinancialPaymentInput } from './financial-payment.types';

export const paymentMoneyLabel = (value: string | number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
export const paymentMoneyInput = (value: string | number) => String(value).replace('.', ',');

/** Parsing only: all financial totals and balances belong to the preview RPC. */
export function canonicalPaymentAmount(value: string): string | null {
  const clean = value.trim().replace(/\s/g, '');
  if (!clean) return '0.00';
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(clean)) return null;
  const [integer, decimals = ''] = clean.replace(/\./g, '').split(',');
  return `${integer.replace(/^0+(?=\d)/, '')}.${decimals.padEnd(2, '0')}`;
}

export function normalizePaymentDraft(input: FinancialPaymentInput): FinancialPaymentInput | null {
  const moneyKeys = ['interest', 'penalty', 'addition', 'discount'] as const;
  const components = input.components.map(component => ({ ...component, amount: canonicalPaymentAmount(component.amount) }));
  if (components.some(component => !component.accountId || !component.amount || component.amount === '0.00')) return null;
  const adjustments = Object.fromEntries(moneyKeys.map(key => [key, canonicalPaymentAmount(input[key])])) as Pick<FinancialPaymentInput, typeof moneyKeys[number]>;
  if (moneyKeys.some(key => adjustments[key] === null)) return null;
  return { ...input, ...adjustments, components: components as FinancialPaymentInput['components'] };
}

export function draftFromCanonical(input: FinancialPaymentInput): FinancialPaymentInput {
  return { ...input, interest: paymentMoneyInput(input.interest), penalty: paymentMoneyInput(input.penalty),
    addition: paymentMoneyInput(input.addition), discount: paymentMoneyInput(input.discount),
    components: input.components.map(component => ({ ...component, amount: paymentMoneyInput(component.amount) })) };
}

export function isStoredFinancialPayment(value: unknown, sourceId: string): value is import('./financial-payment.types').FinancialPaymentConfirmation {
  if (!value || typeof value !== 'object') return false;
  const { input, fingerprint } = value as import('./financial-payment.types').FinancialPaymentConfirmation;
  const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
  const money = (amount: unknown) => typeof amount === 'string' && /^\d{1,12}\.\d{2}$/.test(amount);
  return Boolean(input && input.sourceId === sourceId && uuid.test(input.requestId)
    && typeof fingerprint === 'string' && fingerprint.length > 0 && fingerprint.length <= 200
    && /^\d{4}-\d{2}-\d{2}$/.test(input.paymentDate) && typeof input.notes === 'string' && input.notes.length <= 1000
    && ['interest', 'penalty', 'addition', 'discount'].every(key => money(input[key as keyof typeof input]))
    && Array.isArray(input.components) && input.components.length > 0 && input.components.length <= 10
    && input.components.every(component => component && uuid.test(component.accountId) && money(component.amount)
      && component.amount !== '0.00' && ['DINHEIRO', 'PIX', 'CARTAO', 'BOLETO', 'TED'].includes(component.method)));
}
