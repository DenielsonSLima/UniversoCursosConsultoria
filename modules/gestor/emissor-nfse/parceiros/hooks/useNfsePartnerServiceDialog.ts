import { useEffect, useRef, type ElementRef } from 'react';

export function useNfsePartnerServiceDialog(onClose: () => void, busy: boolean) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<ElementRef<'form'>>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  closeRef.current = onClose;
  busyRef.current = busy;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    const background = Array.from(document.body.children)
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== overlayRef.current
        && !element.classList.contains('institutional-select-panel'))
      .map(element => ({ element, inert: element.inert, ariaHidden: element.getAttribute('aria-hidden') }));
    document.body.style.overflow = 'hidden';
    background.forEach(({ element }) => { element.inert = true; element.setAttribute('aria-hidden', 'true'); });
    const frame = window.requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLInputElement>('input')?.focus());
    const keyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!busyRef.current) closeRef.current();
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button, input, textarea, summary, [tabindex]:not([tabindex="-1"])'))
        .filter((element): element is HTMLElement => element instanceof HTMLElement
          && !element.matches(':disabled') && !element.hidden && element.getClientRects().length > 0);
      event.preventDefault();
      if (!focusable.length) { dialogRef.current.focus(); return; }
      const current = focusable.indexOf(document.activeElement as HTMLElement);
      const next = current < 0 ? (event.shiftKey ? focusable.length - 1 : 0)
        : (current + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length;
      focusable[next].focus();
    };
    document.addEventListener('keydown', keyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', keyDown);
      document.body.style.overflow = overflow;
      background.forEach(({ element, inert, ariaHidden }) => {
        element.inert = inert;
        if (ariaHidden === null) element.removeAttribute('aria-hidden');
        else element.setAttribute('aria-hidden', ariaHidden);
      });
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return { overlayRef, dialogRef };
}
