import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useProductTypeDialog<T extends HTMLElement>(
  onClose: () => void,
  closeBlocked: boolean,
) {
  const dialogRef = useRef<T>(null);
  const initialFocusRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const closeBlockedRef = useRef(closeBlocked);
  onCloseRef.current = onClose;
  closeBlockedRef.current = closeBlocked;

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    const portalRoot = dialogRef.current?.closest('[data-product-type-dialog-root]');
    const backgroundElements = Array.from(document.body.children)
      .filter((element): element is HTMLElement => (
        element instanceof HTMLElement && element !== portalRoot
      ))
      .map((element) => ({
        element,
        inert: element.inert,
        ariaHidden: element.getAttribute('aria-hidden'),
      }));

    document.body.style.overflow = 'hidden';
    for (const background of backgroundElements) {
      background.element.inert = true;
      background.element.setAttribute('aria-hidden', 'true');
    }

    const focusFrame = window.requestAnimationFrame(() => {
      initialFocusRef.current?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !closeBlockedRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll(FOCUSABLE_SELECTOR),
      ).filter((element): element is HTMLElement => element instanceof HTMLElement);

      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      for (const background of backgroundElements) {
        background.element.inert = background.inert;
        if (background.ariaHidden === null) background.element.removeAttribute('aria-hidden');
        else background.element.setAttribute('aria-hidden', background.ariaHidden);
      }
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  return { dialogRef, initialFocusRef };
}
