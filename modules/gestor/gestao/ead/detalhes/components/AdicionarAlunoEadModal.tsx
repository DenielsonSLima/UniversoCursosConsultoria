import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Loader2, Search, UserPlus, X } from 'lucide-react';
import { AlunoDisponivel } from '../ead-turma.types';

interface AdicionarAlunoEadModalProps {
  open: boolean;
  search: string;
  alunos: AlunoDisponivel[];
  isLoading: boolean;
  isFetching: boolean;
  isSearchSettling: boolean;
  isError: boolean;
  pendingAlunoId?: string | null;
  onSearchChange: (value: string) => void;
  onClose: () => void;
  onRetry: () => void;
  onMatricular: (alunoId: string) => void;
}

const AdicionarAlunoEadModal: React.FC<AdicionarAlunoEadModalProps> = ({
  open,
  search,
  alunos,
  isLoading,
  isFetching,
  isSearchSettling,
  isError,
  pendingAlunoId,
  onSearchChange,
  onClose,
  onRetry,
  onMatricular,
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const searchPending = isFetching || isSearchSettling;
  const normalizedSearch = search.trim();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusInputFrame = window.requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;

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

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusInputFrame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3 sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="flex max-h-[min(82vh,720px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white font-sans shadow-[0_28px_80px_rgba(2,12,27,0.32)] sm:rounded-3xl"
        style={{ WebkitFontSmoothing: 'auto', textRendering: 'optimizeLegibility' }}
      >
        <header className="flex items-start justify-between gap-5 border-b border-slate-200 px-5 py-5 sm:px-7">
          <div className="min-w-0">
            <div className="mb-1.5 flex items-center gap-2 text-blue-700">
              <UserPlus size={18} strokeWidth={2.2} />
              <span className="text-xs font-semibold uppercase tracking-[0.12em]">Matrícula manual</span>
            </div>
            <h2 id={titleId} className="text-xl font-extrabold leading-tight tracking-[-0.02em] text-[#001a33]">
              Adicionar aluno à turma EAD
            </h2>
            <p id={descriptionId} className="mt-1 text-sm font-medium leading-5 text-slate-600">
              O acesso será liberado sem gerar recebimento financeiro.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </header>

        <div className="px-5 pb-4 pt-5 sm:px-7">
          <label htmlFor={`${titleId}-search`} className="mb-2 block text-sm font-semibold text-slate-700">
            Localizar aluno
          </label>
          <div className="flex h-12 items-center gap-3 rounded-xl border border-slate-300 bg-white px-4 shadow-sm transition focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100">
            <Search size={18} className="shrink-0 text-slate-500" strokeWidth={2} />
            <input
              id={`${titleId}-search`}
              autoFocus
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Digite nome, e-mail ou CPF"
              className="min-w-0 flex-1 bg-transparent text-base font-medium text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-500"
            />
            {searchPending ? <Loader2 size={18} className="shrink-0 animate-spin text-blue-600" aria-label="Atualizando busca" /> : null}
          </div>
          <div className="mt-2 flex min-h-5 items-center justify-between gap-3 text-xs font-medium text-slate-500" aria-live="polite">
            <span>
              {searchPending
                ? `Atualizando resultados${normalizedSearch ? ` para “${normalizedSearch}”` : ''}...`
                : normalizedSearch
                  ? `Resultados para “${normalizedSearch}”`
                  : 'Alunos disponíveis para matrícula'}
            </span>
            {!isLoading && !isError && !searchPending ? <span>{alunos.length} {alunos.length === 1 ? 'resultado' : 'resultados'}</span> : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 px-5 pb-5 sm:px-7 sm:pb-7">
          <div className="h-full max-h-[430px] overflow-y-auto rounded-xl border border-slate-200 bg-white">
            {isLoading ? (
              <div className="flex min-h-48 flex-col items-center justify-center gap-3 px-6 text-center">
                <Loader2 size={24} className="animate-spin text-blue-600" />
                <p className="text-sm font-medium text-slate-600">Buscando alunos disponíveis...</p>
              </div>
            ) : isError ? (
              <div className="flex min-h-48 flex-col items-center justify-center gap-3 px-6 text-center">
                <AlertCircle size={26} className="text-rose-600" />
                <div>
                  <p className="text-sm font-semibold text-slate-900">Não foi possível carregar os alunos.</p>
                  <p className="mt-1 text-sm text-slate-600">Verifique sua conexão e tente novamente.</p>
                </div>
                <button
                  type="button"
                  onClick={onRetry}
                  className="rounded-lg bg-[#001a33] px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-white hover:bg-blue-700"
                >
                  Tentar novamente
                </button>
              </div>
            ) : alunos.length === 0 ? (
              <div className="flex min-h-48 flex-col items-center justify-center px-6 text-center">
                <Search size={28} className="mb-3 text-slate-400" />
                <p className="text-sm font-semibold text-slate-900">
                  {normalizedSearch ? 'Nenhum aluno corresponde à busca.' : 'Nenhum aluno disponível.'}
                </p>
                <p className="mt-1 max-w-sm text-sm leading-5 text-slate-600">
                  {normalizedSearch
                    ? 'Confira a grafia ou tente buscar pelo e-mail ou CPF.'
                    : 'Todos os alunos ativos já podem estar vinculados a este curso.'}
                </p>
              </div>
            ) : (
              <ul
                className={`divide-y divide-slate-200 transition-opacity ${searchPending ? 'pointer-events-none opacity-45' : 'opacity-100'}`}
                aria-label="Alunos disponíveis"
                aria-busy={searchPending}
              >
                {alunos.map((aluno) => {
                  const isPending = pendingAlunoId === aluno.id;
                  return (
                    <li key={aluno.id} className="flex items-center justify-between gap-4 px-4 py-3.5 transition-colors hover:bg-slate-50 sm:px-5">
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-semibold leading-5 text-[#001a33]" title={aluno.nome}>
                          {aluno.nome}
                        </p>
                        <p className="mt-0.5 truncate text-sm font-normal leading-5 text-slate-600" title={aluno.email || aluno.cpfCnpj || ''}>
                          {aluno.email || aluno.cpfCnpj || 'Sem contato cadastrado'}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={Boolean(pendingAlunoId) || searchPending}
                        onClick={() => onMatricular(aluno.id)}
                        aria-label={`Matricular ${aluno.nome}`}
                        className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 text-xs font-semibold uppercase tracking-[0.08em] text-white shadow-sm transition-colors hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-wait disabled:opacity-55"
                      >
                        {isPending ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
                        {isPending ? 'Matriculando' : 'Matricular'}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
};

export default AdicionarAlunoEadModal;
