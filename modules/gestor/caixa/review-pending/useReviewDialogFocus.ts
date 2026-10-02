import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), '
  + 'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function handleReviewDialogKey(
  event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'preventDefault'>,
  elements: HTMLElement[],
  activeElement: globalThis.Element | null,
  onClose: () => void,
) {
  if (event.key === 'Escape') {
    event.preventDefault();
    onClose();
  } else if (event.key === 'Tab' && elements.length) {
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (event.shiftKey && activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}

/** Instanciado somente enquanto o diálogo está montado. */
export function useReviewDialogFocus(
  dialogRef: RefObject<HTMLDivElement | null>,
  closeRef: RefObject<globalThis.HTMLButtonElement | null>,
  onClose: () => void,
) {
  const closeCallback = useRef(onClose);
  closeCallback.current = onClose;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const keydown = (event: KeyboardEvent) => handleReviewDialogKey(event,
      Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []),
      document.activeElement, () => closeCallback.current());
    const keepFocus = (event: globalThis.FocusEvent) => {
      if (event.target instanceof Node && !dialogRef.current?.contains(event.target)) closeRef.current?.focus();
    };
    document.addEventListener('keydown', keydown);
    document.addEventListener('focusin', keepFocus);
    return () => {
      document.removeEventListener('keydown', keydown);
      document.removeEventListener('focusin', keepFocus);
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [closeRef, dialogRef]);
}
