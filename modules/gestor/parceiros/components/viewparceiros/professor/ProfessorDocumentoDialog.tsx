import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

interface Props {
  title: string;
  onClose: () => void;
  busy?: boolean;
  wide?: boolean;
  children: React.ReactNode;
}

const ProfessorDocumentoDialog: React.FC<Props> = ({ title, onClose, busy, wide, children }) => {
  const ref = useRef<React.ElementRef<'dialog'>>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      className={`m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-0 text-[13px] text-slate-700 shadow-xl backdrop:bg-slate-900/50 ${
        wide ? 'max-w-5xl' : 'max-w-lg'
      }`}
    >
      <header className='flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3'>
        <h3 id={titleId} className='min-w-0 break-words text-base font-semibold text-[#001a33]'>
          {title}
        </h3>
        <button
          type='button'
          aria-label='Fechar janela'
          onClick={onClose}
          disabled={busy}
          className='flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-50'
        >
          <X size={18} />
        </button>
      </header>
      <div className='p-4'>{children}</div>
    </dialog>
  );
};

export default ProfessorDocumentoDialog;
