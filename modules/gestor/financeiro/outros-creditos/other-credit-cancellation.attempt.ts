export type OtherCreditCancellationAttempt = {
  idempotencyKey: string;
  receivableIds: string[];
  reason: string;
  createdAt: number;
};
export const OTHER_CREDIT_PENDING_ATTEMPT_LIMIT = 10;
type AttemptStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const storageKey = (userId: string, poloId?: string | null) => `universo:other-credit-cancellation:v1:${userId}:${poloId || 'todos'}`;
const browserStorage = (): AttemptStorage | undefined => {
  try { return typeof window === 'undefined' ? undefined : window.sessionStorage; } catch { return undefined; }
};

export function loadOtherCreditCancellationAttempts(userId: string, poloId?: string | null, storage = browserStorage()): OtherCreditCancellationAttempt[] {
  try {
    const raw = storage?.getItem(storageKey(userId, poloId));
    if (!raw) return [];
    const values = JSON.parse(raw) as OtherCreditCancellationAttempt[];
    if (!Array.isArray(values) || values.length > OTHER_CREDIT_PENDING_ATTEMPT_LIMIT) return [];
    if (values.some(value => !value || !uuid.test(value.idempotencyKey) || !Array.isArray(value.receivableIds)
      || value.receivableIds.length < 1 || value.receivableIds.length > 25
      || value.receivableIds.some(id => typeof id !== 'string' || !uuid.test(id))
      || new Set(value.receivableIds.map(id => id.toLowerCase())).size !== value.receivableIds.length
      || typeof value.reason !== 'string' || value.reason.trim().length < 10 || value.reason.length > 500
      || !Number.isFinite(value.createdAt) || value.createdAt <= 0)) return [];
    if (new Set(values.map(value => value.idempotencyKey.toLowerCase())).size !== values.length) return [];
    return values.map(value => ({ idempotencyKey: value.idempotencyKey, receivableIds: value.receivableIds, reason: value.reason, createdAt: value.createdAt }));
  } catch { return []; }
}

export function saveOtherCreditCancellationAttempts(userId: string, poloId: string | null | undefined, attempts: OtherCreditCancellationAttempt[], storage = browserStorage()): boolean {
  try {
    if (!storage || attempts.length > OTHER_CREDIT_PENDING_ATTEMPT_LIMIT) return false;
    if (!attempts.length) storage.removeItem(storageKey(userId, poloId));
    else storage.setItem(storageKey(userId, poloId), JSON.stringify(attempts));
    return true;
  } catch { return false; }
}

