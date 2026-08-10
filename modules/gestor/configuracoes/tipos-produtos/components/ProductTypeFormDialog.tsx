import React, { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { LoaderCircle, PackageOpen, Save, X } from 'lucide-react';
import type { PatrimonioProductType } from '../../../patrimonio/patrimonio-product-types.service';
import { useProductTypeDialog } from './useProductTypeDialog';

export interface ProductTypeFormValues {
  nome: string;
  descricao: string;
}

interface ProductTypeFormDialogProps {
  item?: PatrimonioProductType | null;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (values: ProductTypeFormValues) => void;
}

const fieldClassName = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-[#001a33] outline-none transition-colors placeholder:font-medium placeholder:text-slate-400 focus:border-cyan-500 focus:bg-white focus:ring-2 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:opacity-60';

export function ProductTypeFormDialog({
  item,
  isPending,
  onClose,
  onSubmit,
}: ProductTypeFormDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const [nome, setNome] = useState(item?.nome || '');
  const [descricao, setDescricao] = useState(item?.descricao || '');
  const { dialogRef, initialFocusRef } = useProductTypeDialog<React.ElementRef<'form'>>(onClose, isPending);

  if (typeof document === 'undefined') return null;

  const normalizedName = nome.trim();

  return createPortal(
    <div
      data-product-type-dialog-root
      className="fixed inset-0 z-[10000] flex min-h-[100dvh] items-end justify-center bg-[#001a33]/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isPending) onClose();
      }}
      role="presentation"
    >
      <form
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={isPending}
        onSubmit={(event) => {
          event.preventDefault();
          if (!normalizedName || isPending) return;
          onSubmit({ nome: normalizedName, descricao: descricao.trim() });
        }}
        className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-[2rem] border border-white/70 bg-white shadow-2xl sm:rounded-[2rem]"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-5 py-5 sm:px-7">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
              <PackageOpen size={21} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id={titleId} className="text-lg font-black text-[#001a33]">
                {item ? 'Editar tipo de produto' : 'Novo tipo de produto'}
              </h2>
              <p id={descriptionId} className="mt-0.5 text-xs font-medium leading-relaxed text-slate-500">
                Esta opção será usada nos novos cadastros de patrimônio.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Fechar formulário de tipo de produto"
          >
            <X size={19} />
          </button>
        </header>

        <div className="space-y-5 p-5 sm:p-7">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500">
              Nome do tipo
            </span>
            <input
              ref={(element) => { initialFocusRef.current = element; }}
              value={nome}
              onChange={(event) => setNome(event.target.value)}
              disabled={isPending}
              maxLength={120}
              placeholder="Ex.: Equipamento de informática"
              autoComplete="off"
              required
              className={fieldClassName}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500">
              Descrição <span className="font-medium normal-case tracking-normal text-slate-400">(opcional)</span>
            </span>
            <textarea
              value={descricao}
              onChange={(event) => setDescricao(event.target.value)}
              disabled={isPending}
              maxLength={500}
              rows={4}
              placeholder="Explique quando este tipo deve ser utilizado."
              className={`${fieldClassName} resize-y`}
            />
          </label>
        </div>

        <footer className="sticky bottom-0 flex flex-col-reverse gap-3 border-t border-slate-100 bg-white px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-xl border border-slate-200 px-5 py-2.5 text-xs font-black uppercase tracking-wide text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isPending || !normalizedName}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#001a33] px-5 py-2.5 text-xs font-black uppercase tracking-wide text-white shadow-md shadow-blue-950/15 transition-colors hover:bg-[#073b73] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />}
            {isPending ? 'Salvando...' : 'Salvar tipo'}
          </button>
        </footer>
      </form>
    </div>,
    document.body,
  );
}
