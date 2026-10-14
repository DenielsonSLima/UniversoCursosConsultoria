export type FinancialPaymentSummary = {
  originalAmount: string; previouslyPaid: string; remainingBefore: string; status: string; hasEvents: boolean;
};

export function parseFinancialPaymentSummary(value: unknown): FinancialPaymentSummary | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const summary = value as FinancialPaymentSummary;
  if (['originalAmount', 'previouslyPaid', 'remainingBefore'].some(key => !/^\d+(?:\.\d+)?$/.test(String(summary[key as keyof FinancialPaymentSummary])))) return undefined;
  if (typeof summary.status !== 'string' || typeof summary.hasEvents !== 'boolean') return undefined;
  return summary;
}

export const hasPartialPayment = (summary?: FinancialPaymentSummary) => Boolean(summary?.hasEvents && summary.status !== 'PAGO' && Number(summary.previouslyPaid) > 0 && Number(summary.remainingBefore) > 0);

