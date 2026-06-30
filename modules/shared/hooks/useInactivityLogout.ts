import { useEffect, useRef } from 'react';

type TimeoutReason = 'inactivity';

interface UseInactivityLogoutOptions {
  isEnabled?: boolean;
  timeoutMs?: number;
  onTimeout: (reason: TimeoutReason) => void | Promise<void>;
}

const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes
const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  'click',
  'mousedown',
  'mousemove',
  'keydown',
  'touchstart',
  'scroll',
  'focus',
];
const DOCUMENT_ACTIVITY_EVENTS: Array<keyof DocumentEventMap> = ['visibilitychange'];

export const useInactivityLogout = ({
  isEnabled = true,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  onTimeout,
}: UseInactivityLogoutOptions) => {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isEnabledRef = useRef(isEnabled);
  const onTimeoutRef = useRef(onTimeout);

  useEffect(() => {
    isEnabledRef.current = isEnabled;
    onTimeoutRef.current = onTimeout;
  }, [isEnabled, onTimeout]);

  useEffect(() => {
    if (!isEnabled || typeof window === 'undefined') return;

    const clearExistingTimeout = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    const schedule = () => {
      clearExistingTimeout();
      timeoutRef.current = setTimeout(async () => {
        if (!isEnabledRef.current) return;
        await onTimeoutRef.current('inactivity');
      }, timeoutMs);
    };

    const handleActivity = () => {
      schedule();
    };

    schedule();

    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, handleActivity, { passive: true });
    });
    DOCUMENT_ACTIVITY_EVENTS.forEach((eventName) => {
      document.addEventListener(eventName, handleActivity, { passive: true });
    });

    return () => {
      ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, handleActivity);
      });
      DOCUMENT_ACTIVITY_EVENTS.forEach((eventName) => {
        document.removeEventListener(eventName, handleActivity);
      });
      clearExistingTimeout();
    };
  }, [isEnabled, timeoutMs]);
};
