import { fiscalReviewDate } from './nfse-fiscal-review.contract';
import type { NfseFiscalReview } from './nfse-fiscal-review.types';

export interface NfseFiscalReviewDates {
  competenceDate: string;
  serviceDate: string;
  source: 'SAVED' | 'PAYMENT' | 'MANUAL';
  paymentDates: string[];
}

/** Approved academic pre-model: latest effective payment day in the payment
 * month. Saved revisions remain immutable; a different date needs a new review. */
export function getNfseFiscalReviewDates(review: NfseFiscalReview): NfseFiscalReviewDates {
  const competenceDate = review.service.competenceDate || '';
  const serviceDate = review.service.serviceDate || '';
  const dates = review.preparation.paymentDates || [];
  let paymentDates: string[] = [];
  try {
    if (dates.length <= Math.min(review.preparation.receiptCount, 31)
      && dates.every(date => fiscalReviewDate(date).slice(0, 7) === review.preparation.paymentMonth)
      && new Set(dates).size === dates.length) paymentDates = [...dates].sort();
  } catch { /* Missing or malformed receipt evidence cannot generate a date. */ }
  const changedSource = review.checks.some(check => check.status !== 'PASSED'
    && ['SOURCE_CHANGED', 'PREPARATION_REMOVED', 'ACADEMIC_DESCRIPTION_CONTEXT_REQUIRED'].includes(check.code));
  if (!changedSource && paymentDates.length) {
    const referenceDate = paymentDates[paymentDates.length - 1];
    return { competenceDate: referenceDate, serviceDate: referenceDate,
      source: competenceDate === referenceDate && serviceDate === referenceDate ? 'SAVED' : 'PAYMENT', paymentDates };
  }
  return { competenceDate: '', serviceDate: '', source: 'MANUAL', paymentDates };
}
