import { useEffect, useRef, type ComponentRef } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  onKeepEditing: () => void;
  onDiscard: () => void;
}

export default function AlunoDiscardChangesDialog({ onKeepEditing, onDiscard }: Props) {
  const dialogRef = useRef<ComponentRef<'dialog'>>(null);
  const keepEditingRef = useRef<ComponentRef<'button'>>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.showModal();
    keepEditingRef.current?.focus();
    return () => {
      dialog?.close();
      previousFocus?.focus();
    };
  }, []);

  return createPortal(
    <dialog ref={dialogRef} aria-labelledby="aluno-discard-title" aria-describedby="aluno-discard-description"
      onCancel={(event) => { event.preventDefault(); onKeepEditing(); }}
      className="m-auto w-[calc(100%_-_2rem)] max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-slate-800 shadow-xl backdrop:bg-slate-950/40">
      <h2 id="aluno-discard-title" className="text-lg font-semibold text-[#001a33]">Alterações não salvas</h2>
      <p id="aluno-discard-description" className="mt-2 text-sm leading-6 text-slate-600">
        Você alterou o cadastro. Se sair agora, essas alterações serão descartadas.
      </p>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onDiscard}
          className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-500">
          Descartar e sair
        </button>
        <button ref={keepEditingRef} type="button" onClick={onKeepEditing}
          className="min-h-11 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white outline-none hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
          Continuar editando
        </button>
      </div>
    </dialog>, document.body,
  );
}
