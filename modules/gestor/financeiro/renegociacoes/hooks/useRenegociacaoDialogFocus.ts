import { useEffect, type RefObject } from 'react';

interface DialogFocusOptions {
  isOpen: boolean;
  dialogRef: RefObject<HTMLElement | null>;
  submittingRef: RefObject<boolean>;
  closeRef: RefObject<() => void>;
}

const focusableSelector = ['button', 'input', 'select', 'textarea', 'a[href]', '[tabindex]:not([tabindex="-1"])'].join(
  ',',
);

const openDialogs: HTMLElement[] = [];
let bodyOverflowBeforeDialogs: string | null = null;

const isTopDialog = (dialog: HTMLElement) => openDialogs.at(-1) === dialog;

export function useRenegociacaoDialogFocus({ isOpen, dialogRef, submittingRef, closeRef }: DialogFocusOptions) {
  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (openDialogs.length === 0) bodyOverflowBeforeDialogs = document.body.style.overflow;
    openDialogs.push(dialog);
    document.body.style.overflow = 'hidden';
    const frame = window.requestAnimationFrame(() => {
      if (isTopDialog(dialog)) dialog.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTopDialog(dialog)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (!submittingRef.current) closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>(focusableSelector)].filter(
        (element) =>
          element.tabIndex >= 0 &&
          !element.matches(':disabled') &&
          !element.closest('[hidden], [inert], [aria-hidden="true"]') &&
          element.getClientRects().length > 0,
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      const active = document.activeElement;
      const fromContainer = active === dialog || !dialog.contains(active);
      if (!first || !last) {
        event.preventDefault();
        dialog.focus();
      } else if (fromContainer || (event.shiftKey && active === first) || (!event.shiftKey && active === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };

    const onFocusIn = (event: globalThis.FocusEvent) => {
      if (isTopDialog(dialog) && event.target instanceof Node && !dialog.contains(event.target)) {
        dialog.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('focusin', onFocusIn);
      const dialogIndex = openDialogs.lastIndexOf(dialog);
      if (dialogIndex >= 0) openDialogs.splice(dialogIndex, 1);
      if (openDialogs.length === 0) {
        document.body.style.overflow = bodyOverflowBeforeDialogs ?? '';
        bodyOverflowBeforeDialogs = null;
      } else {
        document.body.style.overflow = 'hidden';
      }
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isOpen, dialogRef, submittingRef, closeRef]);
}
