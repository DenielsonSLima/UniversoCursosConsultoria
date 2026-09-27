import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface DespesaModalPortalProps {
  children: React.ReactNode;
  onClose: () => void;
}

const DespesaModalPortal: React.FC<DespesaModalPortalProps> = ({ children, onClose }) => {
  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [onClose]);

  const modal = (
    <div
      className="fixed inset-0 z-[2147482999] flex min-h-[100dvh] w-screen items-center justify-center overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-sm sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {children}
    </div>
  );

  return typeof document === 'undefined' ? modal : createPortal(modal, document.body);
};

export default DespesaModalPortal;
