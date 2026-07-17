export const PORTAL_INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
export const PORTAL_LAST_ACTIVITY_STORAGE_KEY = 'portal_last_activity_at';

export const getInactivityRemainingMs = (
  lastActivityAt: number,
  now: number,
  timeoutMs = PORTAL_INACTIVITY_TIMEOUT_MS,
) => Math.max(0, timeoutMs - Math.max(0, now - lastActivityAt));

export const hasInactivityExpired = (
  lastActivityAt: number,
  now: number,
  timeoutMs = PORTAL_INACTIVITY_TIMEOUT_MS,
) => getInactivityRemainingMs(lastActivityAt, now, timeoutMs) === 0;
