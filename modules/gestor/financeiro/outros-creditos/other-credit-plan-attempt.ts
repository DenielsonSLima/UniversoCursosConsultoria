import type { OtherCreditPlanForm } from './other-credit-plan.model';
import { validateOtherCreditPlanInput } from './other-credit-plan.model';
import type { OtherCreditPlanInput } from './other-credit-plan.types';
import { isDefinitiveOtherCreditPlanCreationError } from './other-credit-plan-error';

export type OtherCreditPlanCreationAttempt = {
  requestId: string;
  poloId: string;
  input: OtherCreditPlanInput;
  form: OtherCreditPlanForm;
  phase: 'pending' | 'uncertain';
};
type AttemptStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};
const storageKey = (poloId: string) => `universo:other-credit-plan-attempt:v1:${poloId}`;
const formStrings = ['partnerId', 'description', 'categoryId', 'quantity', 'value', 'firstDueDate', 'interest', 'penalty', 'discount', 'discountDays'] as const;
const browserStorage = (): AttemptStorage | undefined => {
  try { return typeof window === 'undefined' ? undefined : window.sessionStorage; } catch { return undefined; }
};

export function loadOtherCreditPlanAttempt(poloId: string, storage = browserStorage()): OtherCreditPlanCreationAttempt | null {
  try {
    const saved = storage?.getItem(storageKey(poloId));
    if (!saved) return null;
    const attempt = JSON.parse(saved) as OtherCreditPlanCreationAttempt;
    if (attempt.poloId !== poloId || !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(attempt.requestId)
      || validateOtherCreditPlanInput(attempt.input, poloId) || !attempt.form
      || formStrings.some(key => typeof attempt.form[key] !== 'string')
      || !['FIXO', 'PERCENTUAL'].includes(attempt.form.discountType)) return null;
    for (const fee of [attempt.form.enrollment, attempt.form.reenrollment]) {
      if (!fee || typeof fee.enabled !== 'boolean' || typeof fee.value !== 'string' || typeof fee.dueDate !== 'string') return null;
    }
    return { ...attempt, phase: 'uncertain' };
  } catch { return null; }
}

export function saveOtherCreditPlanAttempt(attempt: OtherCreditPlanCreationAttempt, storage = browserStorage()) {
  try { storage?.setItem(storageKey(attempt.poloId), JSON.stringify(attempt)); } catch { /* Keep the in-memory attempt when storage is unavailable. */ }
}

export function clearOtherCreditPlanAttempt(poloId: string, storage = browserStorage()) {
  try { storage?.removeItem(storageKey(poloId)); } catch { /* A successful RPC remains canonical even when browser storage is unavailable. */ }
}

export function markOtherCreditPlanAttemptUncertain(attempt: OtherCreditPlanCreationAttempt, storage = browserStorage()) {
  const uncertain: OtherCreditPlanCreationAttempt = { ...attempt, phase: 'uncertain' };
  saveOtherCreditPlanAttempt(uncertain, storage);
  return uncertain;
}

/** A rejected retry cannot prove that a prior request failed to commit. */
export function resolveOtherCreditPlanCreationFailure(
  attempt: OtherCreditPlanCreationAttempt,
  error: unknown,
  storage = browserStorage(),
): OtherCreditPlanCreationAttempt | null {
  if (attempt.phase === 'pending' && isDefinitiveOtherCreditPlanCreationError(error)) {
    clearOtherCreditPlanAttempt(attempt.poloId, storage);
    return null;
  }
  return markOtherCreditPlanAttemptUncertain(attempt, storage);
}
