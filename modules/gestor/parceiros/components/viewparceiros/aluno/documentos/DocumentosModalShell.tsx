import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface DocumentosModalShellProps {
  open: boolean;
  title: string;
  eyebrow?: string;
  description?: string;
  size?: 'md' | 'lg' | 'xl' | 'full';
  closeDisabled?: boolean;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

const sizeClasses = {
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-6xl',
  full: 'h-[100dvh] max-h-[100dvh] max-w-none rounded-none border-0 sm:max-h-[100dvh] sm:rounded-none',
};

const DocumentosModalShell: React.FC<DocumentosModalShellProps> = ({
  open,
  title,
  eyebrow,
  description,
  size = 'lg',
  closeDisabled = false,
  onClose,
  children,
  footer,
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const closeButtonRef = useRef<React.ElementRef<'button'>>(null);
  const dialogRef = useRef<React.ElementRef<'section'>>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !closeDisabled) onCloseRef.current();
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(dialogRef.current.querySelectorAll(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), iframe',
      )) as unknown as Array<{ focus: () => void }>;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement as unknown;
      if (!first || !last) return;

      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused && 'focus' in previouslyFocused) {
        (previouslyFocused as unknown as { focus: () => void }).focus();
      }
    };
  }, [closeDisabled, open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[10000] flex min-h-[100dvh] items-center justify-center ${
        size === 'full' ? 'p-0' : 'p-2 sm:p-4'
      }`}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Fechar janela"
        disabled={closeDisabled}
        className="absolute inset-0 cursor-default bg-[#001a33]/70 backdrop-blur-sm"
        onClick={onClose}
      />

      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={`relative flex w-full flex-col overflow-hidden bg-white shadow-2xl ${
          size === 'full'
            ? sizeClasses.full
            : `max-h-[calc(100dvh-1rem)] rounded-[1.75rem] border border-white/20 sm:max-h-[calc(100dvh-2rem)] sm:rounded-[2rem] ${sizeClasses[size]}`
        }`}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-7">
          <div className="min-w-0">
            {eyebrow ? (
              <p className="mb-1 text-[9px] font-black uppercase tracking-[0.22em] text-blue-600">
                {eyebrow}
              </p>
            ) : null}
            <h2 id={titleId} className="truncate text-lg font-black tracking-tight text-[#001a33]">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-1 text-xs font-medium leading-relaxed text-slate-500">
                {description}
              </p>
            ) : null}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Fechar"
            disabled={closeDisabled}
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-[#001a33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/80">{children}</div>
        {footer ? (
          <footer className="shrink-0 border-t border-slate-200 bg-white px-5 py-4 sm:px-7">
            {footer}
          </footer>
        ) : null}
      </section>
    </div>,
    document.body,
  );
};

export default DocumentosModalShell;
