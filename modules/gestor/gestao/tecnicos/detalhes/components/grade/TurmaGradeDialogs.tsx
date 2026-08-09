import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Trash2, X } from 'lucide-react';
import { TurmaProfessorOption } from '../../turma-grade.types';

interface DocenteDialogProps {
  disciplinaId: string;
  professores: TurmaProfessorOption[];
  onAssign: (disciplinaId: string, professorId: string) => void;
  onClose: () => void;
  isAssigning?: boolean;
  assigningProfessorId?: string | null;
}

export const TurmaGradeDocenteDialog: React.FC<DocenteDialogProps> = ({
  disciplinaId,
  professores,
  onAssign,
  onClose,
  isAssigning = false,
  assigningProfessorId = null,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const isAssigningRef = useRef(isAssigning);
  const onCloseRef = useRef(onClose);
  isAssigningRef.current = isAssigning || assigningProfessorId !== null;
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      const initialFocus = dialogRef.current?.querySelector<HTMLElement>(
        '[data-docente-option]:not([disabled])',
      ) ?? dialogRef.current?.querySelector<HTMLElement>(
        '[data-docente-dialog-close]:not([disabled])',
      );
      initialFocus?.focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!isAssigningRef.current) onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusableElements = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      const firstFocusable = focusableElements[0] as HTMLElement | undefined;
      const lastFocusable = focusableElements[focusableElements.length - 1] as HTMLElement | undefined;
      if (!firstFocusable || !lastFocusable) return;
      if (event.shiftKey && document.activeElement === firstFocusable) {
        event.preventDefault();
        lastFocusable.focus();
      } else if (!event.shiftKey && document.activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      previouslyFocused?.focus();
    };
  }, []);

  if (typeof document === 'undefined') return null;

  const assignmentLocked = isAssigning || assigningProfessorId !== null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden p-3 sm:p-6"
    >
      <div
        aria-hidden="true"
        onMouseDown={assignmentLocked ? undefined : onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-[#001a33]/60 backdrop-blur-sm"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="docente-dialog-title"
        aria-describedby="docente-dialog-description"
        aria-busy={assignmentLocked}
        className="relative flex max-h-[88dvh] w-full max-w-3xl flex-col overflow-hidden rounded-[1.75rem] border border-white/70 bg-white shadow-[0_32px_90px_rgba(0,26,51,0.35)]"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-600">Corpo docente</p>
            <h3 id="docente-dialog-title" className="mt-1 text-xl font-bold text-[#001a33] sm:text-2xl">
              Selecionar docente
            </h3>
            <p id="docente-dialog-description" className="mt-1 text-xs text-slate-500 sm:text-sm">
              Escolha o professor responsável por esta disciplina.
            </p>
          </div>
          <button
            data-docente-dialog-close
            type="button"
            onClick={onClose}
            disabled={assignmentLocked}
            aria-label="Fechar seleção de docente"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </header>

        <section className="flex min-h-0 flex-1 flex-col bg-slate-50" aria-label="Professores disponíveis">
          <div className="shrink-0 border-b border-slate-200/80 bg-white/80 px-5 py-3 sm:px-6">
            <p className="text-sm font-bold text-[#001a33]">Professores disponíveis</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {professores.length} professor{professores.length === 1 ? '' : 'es'} ativo{professores.length === 1 ? '' : 's'} encontrado{professores.length === 1 ? '' : 's'}
            </p>
          </div>

          {professores.length === 0 ? (
            <div className="m-4 flex min-h-52 flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center sm:m-5">
              <p className="text-base font-bold text-slate-600">Nenhum professor cadastrado.</p>
              <p className="mt-2 text-sm text-slate-500">
                Cadastre professores ativos no módulo de Parceiros primeiro.
              </p>
            </div>
          ) : (
            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
              <div className="grid content-start gap-2.5 sm:grid-cols-2">
                {professores.map((professor) => {
                  const isSelectedAssigning = assigningProfessorId === professor.id;
                  return (
                    <button
                      key={professor.id}
                      data-docente-option
                      type="button"
                      onClick={() => {
                        if (assignmentLocked) return;
                        onAssign(disciplinaId, professor.id);
                      }}
                      disabled={assignmentLocked}
                      aria-busy={isSelectedAssigning}
                      className={`group flex min-h-16 w-full items-center rounded-2xl border bg-white px-4 py-3 text-left text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                        isSelectedAssigning
                          ? 'cursor-wait border-blue-400 bg-blue-50 text-blue-900 shadow-sm'
                          : assignmentLocked
                            ? 'cursor-not-allowed border-slate-200 text-slate-500 opacity-55'
                            : 'border-slate-200 text-slate-700 hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-900 hover:shadow-md'
                      }`}
                    >
                      <span className={`mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-black transition-colors ${
                        isSelectedAssigning
                          ? 'bg-blue-600 text-white'
                          : 'bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white'
                      }`}>
                        {professor.nome.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{professor.nome}</span>
                      {isSelectedAssigning && (
                        <span className="ml-2 flex items-center text-blue-700" aria-live="polite">
                          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                          <span className="sr-only">Confirmando {professor.nome}</span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>,
    document.body,
  );
};
interface DeleteAulaDialogProps {
  onCancel: () => void;
  onConfirm: () => void;
  isDeleting?: boolean;
}

export const TurmaGradeDeleteAulaDialog: React.FC<DeleteAulaDialogProps> = ({
  onCancel,
  onConfirm,
  isDeleting = false,
}) => {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex min-h-[100dvh] w-screen items-center justify-center overflow-hidden p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-aula-title"
    >
      <button
        type="button"
        aria-label="Fechar confirmação"
        onClick={isDeleting ? undefined : onCancel}
        className="absolute inset-0 h-full w-full cursor-default bg-[#001a33]/65 backdrop-blur-sm"
      />

      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/70 bg-white shadow-[0_32px_90px_rgba(0,26,51,0.35)] ">
        <div className="p-6 sm:p-7">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
            <Trash2 size={22} />
          </div>
          <h3 id="delete-aula-title" className="text-xl font-bold text-[#001a33]">Excluir aula?</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            A aula e seus lançamentos associados serão removidos definitivamente.
          </p>

          <div className="mt-7 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={isDeleting}
              className="rounded-xl border border-slate-200 px-4 py-3 text-xs font-bold uppercase text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isDeleting}
              className="flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-xs font-bold uppercase text-white shadow-lg shadow-red-900/20 transition hover:bg-red-700 disabled:cursor-wait disabled:opacity-75"
            >
              {isDeleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
              {isDeleting ? 'Excluindo...' : 'Excluir aula'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
