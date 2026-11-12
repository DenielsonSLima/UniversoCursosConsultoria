import { useEffect, useRef } from 'react';

export function useNfseStudentsDialog<T extends HTMLElement = HTMLInputElement>(onClose: () => void) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const initialFocusRef = useRef<T>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const background = Array.from(document.body.children)
      .filter((element): element is HTMLElement => (
        element instanceof HTMLElement && element !== overlayRef.current
        && !element.classList.contains('institutional-select-panel')
      ))
      .map(element => ({ element, inert: element.inert, ariaHidden: element.getAttribute('aria-hidden') }));
    document.body.style.overflow = 'hidden';
    for (const item of background) {
      item.element.inert = true;
      item.element.setAttribute('aria-hidden', 'true');
    }
    const frame = window.requestAnimationFrame(() => {
      const target = initialFocusRef.current;
      if (target && !target.matches(':disabled') && !target.hidden) target.focus();
      if (!dialogRef.current?.contains(document.activeElement)) dialogRef.current?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      // InstitutionalSelect handles its own Escape and arrows first. Its portal
      // is appended after opening and stays outside the inert background.
      if (event.defaultPrevented) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button, input, textarea, [href], [tabindex]:not([tabindex="-1"])',
      )).filter((element): element is HTMLElement => (
        element instanceof HTMLElement && !element.matches(':disabled')
        && !element.hidden && element.getClientRects().length > 0
      ));
      event.preventDefault();
      if (!focusable.length) {
        dialogRef.current.focus();
        return;
      }
      const current = focusable.indexOf(document.activeElement as HTMLElement);
      const next = current < 0 ? (event.shiftKey ? focusable.length - 1 : 0)
        : (current + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length;
      focusable[next].focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      for (const item of background) {
        item.element.inert = item.inert;
        if (item.ariaHidden === null) item.element.removeAttribute('aria-hidden');
        else item.element.setAttribute('aria-hidden', item.ariaHidden);
      }
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  return { overlayRef, dialogRef, initialFocusRef };
}
