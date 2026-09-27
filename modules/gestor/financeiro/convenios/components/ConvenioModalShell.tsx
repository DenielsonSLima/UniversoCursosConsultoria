import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ConvenioModalShellProps {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
}

const ConvenioModalShell: React.FC<ConvenioModalShellProps> = ({
  title,
  subtitle,
  onClose,
  children,
}) => {
  const titleId = useId();
  const subtitleId = useId();
  const dialogRef = useRef<React.ElementRef<'section'>>(null);
  const closeButtonRef = useRef<React.ElementRef<'button'>>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(dialogRef.current.querySelectorAll(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled])',
      )) as HTMLElement[];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

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
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, []);

  const modal = (
    <div className="fixed inset-0 z-[220] flex min-h-[100dvh] items-center justify-center overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-sm animate-fadeIn sm:p-6">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitleId}
        className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20 sm:max-h-[calc(100dvh-3rem)]"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <h3 id={titleId} className="text-lg font-black uppercase tracking-tight text-[#001a33]">{title}</h3>
            <p id={subtitleId} className="mt-1 text-xs font-medium text-slate-500">{subtitle}</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 p-2 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );

  return typeof document === 'undefined' ? modal : createPortal(modal, document.body);
};

export default ConvenioModalShell;
