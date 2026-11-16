import { useEffect, useRef } from 'react';

export function useCupomDialog(onClose: () => void, blocked = false) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const callback = useRef(onClose);
  const pending = useRef(blocked);
  callback.current = onClose;
  pending.current = blocked;
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => dialogRef.current?.querySelector<HTMLElement>('input,button')?.focus(), 0);
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === 'Escape' && !pending.current) {
        event.preventDefault();
        callback.current();
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const elements = Array.from(dialogRef.current.querySelectorAll('button,input,textarea,[tabindex="0"]'))
        .filter((item): item is HTMLElement => item instanceof HTMLElement && !item.matches(':disabled') && item.getAttribute('aria-hidden') !== 'true');
      if (!elements.length) { event.preventDefault(); dialogRef.current.focus(); return; }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', keydown);
      document.body.style.overflow = overflow;
      if (before?.isConnected) before.focus();
    };
  }, []);
  return dialogRef;
}
