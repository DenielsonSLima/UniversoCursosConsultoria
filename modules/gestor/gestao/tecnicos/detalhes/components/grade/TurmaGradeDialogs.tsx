import React from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Trash2, X } from 'lucide-react';
import { TurmaProfessorOption } from '../../turma-grade.types';

interface DocenteDialogProps {
  disciplinaId: string;
  professores: TurmaProfessorOption[];
  onAssign: (disciplinaId: string, professorId: string) => void;
  onClose: () => void;
}

export const TurmaGradeDocenteDialog: React.FC<DocenteDialogProps> = ({
  disciplinaId,
  professores,
  onAssign,
  onClose,
}) => {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex h-[100dvh] w-screen flex-col overflow-hidden bg-white"
      role="dialog"
      aria-modal="true"
      aria-labelledby="docente-dialog-title"
    >
      <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 py-4 sm:px-8 sm:py-5">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-600">Corpo docente</p>
          <h3 id="docente-dialog-title" className="mt-1 text-xl font-bold text-[#001a33] sm:text-2xl">
            Selecionar docente
          </h3>
          <p className="mt-1 text-xs text-slate-500 sm:text-sm">
            Escolha o professor responsável por esta disciplina.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar seleção de docente"
          className="ml-4 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
        >
          <X size={22} />
        </button>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-5 sm:p-8">
        <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-5 flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <p className="text-sm font-bold text-[#001a33]">Professores disponíveis</p>
              <p className="mt-1 text-xs text-slate-500">
                {professores.length} professor{professores.length === 1 ? '' : 'es'} ativo{professores.length === 1 ? '' : 's'} encontrado{professores.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>

          {professores.length === 0 ? (
            <div className="flex min-h-80 flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
              <p className="text-base font-bold text-slate-600">Nenhum professor cadastrado.</p>
              <p className="mt-2 text-sm text-slate-500">
                Cadastre professores ativos no módulo de Parceiros primeiro.
              </p>
            </div>
          ) : (
            <div className="grid content-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {professores.map((professor) => (
                <button
                  key={professor.id}
                  type="button"
                  onClick={() => onAssign(disciplinaId, professor.id)}
                  className="group flex min-h-20 w-full items-center rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left text-sm font-bold text-slate-700 transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-900 hover:shadow-md"
                >
                  <span className="mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-sm font-black text-blue-600 group-hover:bg-blue-600 group-hover:text-white">
                    {professor.nome.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 truncate">{professor.nome}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </main>
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
