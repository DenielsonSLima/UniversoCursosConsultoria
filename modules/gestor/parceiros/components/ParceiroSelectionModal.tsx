import React, { useEffect, useRef } from 'react';
import { Building, GraduationCap, User, Users, UsersRound, X } from 'lucide-react';

type FormType = 'aluno' | 'professor' | 'responsavel' | 'selection' | 'pf' | 'pj' | null;

interface ParceiroSelectionModalProps {
  onSelect: (form: FormType) => void;
  onClose: () => void;
  canCreateResponsavel?: boolean;
  responsavelUnavailableReason?: string;
}

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const ParceiroSelectionModal: React.FC<ParceiroSelectionModalProps> = ({
  onSelect,
  onClose,
  canCreateResponsavel = true,
  responsavelUnavailableReason = 'Cadastro disponível somente para gestores com escopo global.',
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<React.ElementRef<'button'>>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
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
      document.removeEventListener('keydown', handleKeyDown);
      window.setTimeout(() => {
        if (previouslyFocused?.isConnected && previouslyFocused !== document.body) {
          previouslyFocused.focus();
          return;
        }
        document.querySelector<HTMLElement>('[data-parceiro-selection-trigger]')?.focus();
      }, 0);
    };
  }, []);

  return (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#001a33]/60 p-4 backdrop-blur-sm">
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="parceiro-selection-title"
      aria-describedby="parceiro-selection-description"
      tabIndex={-1}
      className="relative max-h-[calc(100dvh-2rem)] w-full max-w-4xl overflow-y-auto overscroll-contain rounded-[2.5rem] border border-slate-100 bg-white p-5 shadow-2xl sm:p-8"
    >
      <button
        ref={closeButtonRef}
        type="button"
        onClick={onClose}
        aria-label="Fechar seleção de novo registro"
        className="absolute top-6 right-6 p-2 rounded-full text-slate-400 hover:bg-slate-50 hover:text-red-500 transition-colors"
      >
        <X size={24} />
      </button>

      <div className="text-center mb-10 mt-2">
        <h3 id="parceiro-selection-title" className="text-2xl font-black text-[#001a33] uppercase tracking-tight">Novo Registro</h3>
        <p id="parceiro-selection-description" className="text-slate-500 font-medium">Selecione o tipo de cadastro que deseja realizar.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <button
          onClick={() => onSelect('aluno')}
          className="group flex flex-col items-center justify-center p-6 rounded-3xl border-2 border-slate-100 hover:border-blue-500 hover:bg-blue-50 transition-all duration-300"
        >
          <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-sm">
            <GraduationCap size={32} />
          </div>
          <span className="text-sm font-black text-[#001a33] uppercase tracking-wide group-hover:text-blue-700 text-center">Aluno</span>
          <span className="text-[10px] text-slate-400 font-medium mt-1 text-center">Vínculo de matrícula</span>
        </button>

        <button
          onClick={() => onSelect('professor')}
          className="group flex flex-col items-center justify-center p-6 rounded-3xl border-2 border-slate-100 hover:border-purple-500 hover:bg-purple-50 transition-all duration-300"
        >
          <div className="w-16 h-16 bg-purple-100 text-purple-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-sm">
            <Users size={32} />
          </div>
          <span className="text-sm font-black text-[#001a33] uppercase tracking-wide group-hover:text-purple-700 text-center">Professor</span>
          <span className="text-[10px] text-slate-400 font-medium mt-1 text-center">Vínculo docente</span>
        </button>

        <button
          onClick={() => onSelect('responsavel')}
          aria-disabled={!canCreateResponsavel}
          aria-describedby={!canCreateResponsavel ? 'responsavel-unavailable-reason' : undefined}
          className={`group flex flex-col items-center justify-center rounded-3xl border-2 p-4 transition-all duration-300 sm:p-6 ${
            canCreateResponsavel
              ? 'border-slate-100 hover:border-emerald-500 hover:bg-emerald-50'
              : 'border-slate-100 bg-slate-50 text-slate-400 grayscale'
          }`}
        >
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 transition-transform shadow-sm ${
            canCreateResponsavel
              ? 'bg-emerald-100 text-emerald-600 group-hover:scale-110'
              : 'bg-slate-200 text-slate-400'
          }`}>
            <UsersRound size={32} />
          </div>
          <span className={`text-sm font-black uppercase tracking-wide text-center ${
            canCreateResponsavel ? 'text-[#001a33] group-hover:text-emerald-700' : 'text-slate-500'
          }`}>Responsável</span>
          <span
            id={!canCreateResponsavel ? 'responsavel-unavailable-reason' : undefined}
            className="text-[10px] text-slate-400 font-medium mt-1 text-center"
          >
            {canCreateResponsavel ? 'Representante legal' : responsavelUnavailableReason}
          </span>
        </button>

        <button
          onClick={() => onSelect('pj')}
          className="group flex flex-col items-center justify-center p-6 rounded-3xl border-2 border-slate-100 hover:border-slate-800 hover:bg-slate-50 transition-all duration-300"
        >
          <div className="w-16 h-16 bg-slate-900 text-white rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-sm">
            <Building size={32} />
          </div>
          <span className="text-sm font-black text-[#001a33] uppercase tracking-wide group-hover:text-slate-900 text-center">Pess. Jurídica</span>
          <span className="text-[10px] text-slate-400 font-medium mt-1 text-center">Empresas e filiais</span>
        </button>

        <button
          onClick={() => onSelect('pf')}
          className="group flex flex-col items-center justify-center p-6 rounded-3xl border-2 border-slate-100 hover:border-amber-500 hover:bg-amber-50 transition-all duration-300"
        >
          <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-sm">
            <User size={32} />
          </div>
          <span className="text-sm font-black text-[#001a33] uppercase tracking-wide group-hover:text-amber-700 text-center">Pess. Física</span>
          <span className="text-[10px] text-slate-400 font-medium mt-1 text-center">Prestad. de Serviço</span>
        </button>
      </div>
    </div>
  </div>
  );
};

export default ParceiroSelectionModal;
