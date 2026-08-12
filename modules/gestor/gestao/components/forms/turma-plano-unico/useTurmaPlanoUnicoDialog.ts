import { useEffect, useRef } from 'react';

export const useTurmaPlanoUnicoDialog = (
  isOpen: boolean,
  onRequestClose: () => void,
  isBusy: boolean,
) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const initialFocusRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousFocus = document.activeElement as HTMLElement | null;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isBusy) onRequestClose();
    };

    document.addEventListener('keydown', closeOnEscape);
    const focusTimer = window.setTimeout(() => initialFocusRef.current?.focus(), 0);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', closeOnEscape);
      previousFocus?.focus?.();
    };
  }, [isBusy, isOpen, onRequestClose]);

  return { dialogRef, initialFocusRef };
};
