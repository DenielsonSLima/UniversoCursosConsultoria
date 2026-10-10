import { useEffect, useRef } from 'react';
import {
  getInactivityRemainingMs,
  hasInactivityExpired,
  PORTAL_INACTIVITY_TIMEOUT_MS,
  PORTAL_LAST_ACTIVITY_STORAGE_KEY,
} from './inactivity-policy';

type TimeoutReason = 'inactivity';

interface UseInactivityLogoutOptions {
  isEnabled?: boolean;
  timeoutMs?: number;
  onTimeout: (reason: TimeoutReason) => void | Promise<void>;
}

const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  'click',
  'mousedown',
  'mousemove',
  'pointerdown',
  'pointermove',
  'keydown',
  'input',
  'touchstart',
  'touchmove',
  'wheel',
  'scroll',
];

const readLastActivityAt = () => {
  try {
    const storedValue = window.localStorage.getItem(PORTAL_LAST_ACTIVITY_STORAGE_KEY);
    const parsedValue = Number(storedValue);
    return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null;
  } catch {
    return null;
  }
};

const persistLastActivityAt = (value: number) => {
  try {
    window.localStorage.setItem(PORTAL_LAST_ACTIVITY_STORAGE_KEY, String(value));
  } catch {
    // O relógio em memória continua protegendo a sessão se o storage estiver indisponível.
  }
};

export const useInactivityLogout = ({
  isEnabled = true,
  timeoutMs = PORTAL_INACTIVITY_TIMEOUT_MS,
  onTimeout,
}: UseInactivityLogoutOptions) => {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityAtRef = useRef(0);
  const lastPersistedActivityAtRef = useRef(0);
  const isTimingOutRef = useRef(false);
  const isEnabledRef = useRef(isEnabled);
  const onTimeoutRef = useRef(onTimeout);

  useEffect(() => {
    isEnabledRef.current = isEnabled;
    onTimeoutRef.current = onTimeout;
  }, [isEnabled, onTimeout]);

  useEffect(() => {
    if (!isEnabled || typeof window === 'undefined') return;
    isTimingOutRef.current = false;

    const clearExistingTimeout = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    const triggerTimeout = () => {
      if (!isEnabledRef.current || isTimingOutRef.current) return;
      isTimingOutRef.current = true;
      clearExistingTimeout();
      void Promise.resolve(onTimeoutRef.current('inactivity')).catch((error) => {
        console.error('Não foi possível concluir o logout por inatividade.', error);
      });
    };

    const syncLatestActivityAt = () => {
      const storedActivityAt = readLastActivityAt();
      if (storedActivityAt !== null) {
        lastActivityAtRef.current = Math.max(lastActivityAtRef.current, storedActivityAt);
        lastPersistedActivityAtRef.current = Math.max(lastPersistedActivityAtRef.current, storedActivityAt);
      }
      return storedActivityAt;
    };

    const scheduleExpirationCheck = () => {
      clearExistingTimeout();
      if (!isEnabledRef.current || isTimingOutRef.current) return;

      // A suspended tab may run its timer before a newer cross-tab storage event.
      syncLatestActivityAt();
      const now = Date.now();
      if (hasInactivityExpired(lastActivityAtRef.current, now, timeoutMs)) {
        triggerTimeout();
        return;
      }

      timeoutRef.current = setTimeout(
        scheduleExpirationCheck,
        getInactivityRemainingMs(lastActivityAtRef.current, now, timeoutMs),
      );
    };

    const registerActivity = () => {
      if (document.visibilityState === 'hidden' || isTimingOutRef.current) return;
      const now = Date.now();
      lastActivityAtRef.current = now;
      if (now - lastPersistedActivityAtRef.current >= 1000) {
        persistLastActivityAt(now);
        lastPersistedActivityAtRef.current = now;
      }
    };

    const checkBeforeRegisteringActivity = () => {
      syncLatestActivityAt();
      if (hasInactivityExpired(lastActivityAtRef.current, Date.now(), timeoutMs)) {
        triggerTimeout();
        return;
      }
      registerActivity();
      scheduleExpirationCheck();
    };

    const handleActivity = () => {
      if (hasInactivityExpired(lastActivityAtRef.current, Date.now(), timeoutMs)) {
        syncLatestActivityAt();
        if (hasInactivityExpired(lastActivityAtRef.current, Date.now(), timeoutMs)) {
          triggerTimeout();
          return;
        }
      }
      registerActivity();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkBeforeRegisteringActivity();
        return;
      }
      if (lastActivityAtRef.current > lastPersistedActivityAtRef.current) {
        persistLastActivityAt(lastActivityAtRef.current);
        lastPersistedActivityAtRef.current = lastActivityAtRef.current;
      }
    };

    const handleStorage = (event: { key: string | null }) => {
      if (event.key !== PORTAL_LAST_ACTIVITY_STORAGE_KEY) return;
      // The current value wins over queued events from before a new login.
      if (syncLatestActivityAt() === null) {
        triggerTimeout();
        return;
      }
      scheduleExpirationCheck();
    };

    const storedLastActivityAt = readLastActivityAt();
    lastActivityAtRef.current = storedLastActivityAt || Date.now();
    lastPersistedActivityAtRef.current = lastActivityAtRef.current;
    if (!storedLastActivityAt) persistLastActivityAt(lastActivityAtRef.current);
    scheduleExpirationCheck();

    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, handleActivity, { passive: true, capture: true });
    });
    window.addEventListener('focus', checkBeforeRegisteringActivity);
    window.addEventListener('storage', handleStorage);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, handleActivity, true);
      });
      window.removeEventListener('focus', checkBeforeRegisteringActivity);
      window.removeEventListener('storage', handleStorage);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearExistingTimeout();
    };
  }, [isEnabled, timeoutMs]);
};
