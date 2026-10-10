import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  children: React.ReactNode;
  onClose: () => void;
  canClose: boolean;
  focusKey?: string;
}

const ExternalTransferModalShell: React.FC<Props> = ({ children, onClose, canClose, focusKey }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const canCloseRef = useRef(canClose);
  closeRef.current = onClose;
  canCloseRef.current = canClose;

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && canCloseRef.current) closeRef.current();
    };
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);

  useEffect(() => { dialogRef.current?.focus(); }, [focusKey]);

  const modal = <div
    className="fixed inset-0 z-[10000] flex min-h-[100dvh] items-center justify-center bg-slate-900/55 p-3 backdrop-blur-sm sm:p-6"
    onMouseDown={(event) => {
      if (event.target === event.currentTarget && canClose) onClose();
    }}
  >
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Receber transferência externa"
      tabIndex={-1}
      className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl outline-none"
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const elements = Array.from<HTMLElement>(dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
        ) || []).filter((element) => element.getClientRects().length > 0 && !element.closest('fieldset:disabled'));
        const first = elements[0];
        const last = elements.at(-1);
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >{children}</div>
  </div>;
  return typeof document === 'undefined' ? modal : createPortal(modal, document.body);
};

export default ExternalTransferModalShell;
