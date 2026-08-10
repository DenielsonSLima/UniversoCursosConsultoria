import React, { useId } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, LoaderCircle, Power, Trash2, X } from 'lucide-react';
import { useProductTypeDialog } from './useProductTypeDialog';

export type ProductTypeConfirmAction = 'activate' | 'deactivate' | 'remove';

interface ProductTypeConfirmDialogProps {
  action: ProductTypeConfirmAction;
  itemName: string;
  usageCount: number;
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const contentByAction: Record<ProductTypeConfirmAction, {
  title: string;
  confirmLabel: string;
  tone: string;
  icon: React.ReactNode;
}> = {
  activate: {
    title: 'Ativar tipo de produto?',
    confirmLabel: 'Sim, ativar',
    tone: 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-950/15',
    icon: <Power size={28} />,
  },
  deactivate: {
    title: 'Inativar tipo de produto?',
    confirmLabel: 'Sim, inativar',
    tone: 'bg-amber-500 hover:bg-amber-600 shadow-amber-950/15',
    icon: <AlertTriangle size={28} />,
  },
  remove: {
    title: 'Excluir tipo de produto?',
    confirmLabel: 'Sim, excluir',
    tone: 'bg-rose-600 hover:bg-rose-700 shadow-rose-950/15',
    icon: <Trash2 size={28} />,
  },
};

export function ProductTypeConfirmDialog({
  action,
  itemName,
  usageCount,
  isPending,
  onClose,
  onConfirm,
}: ProductTypeConfirmDialogProps) {
  const titleId = useId();
  const messageId = useId();
  const content = contentByAction[action];
  const { dialogRef, initialFocusRef } = useProductTypeDialog<React.ElementRef<'section'>>(onClose, isPending);

  if (typeof document === 'undefined') return null;

  const message = action === 'activate'
    ? 'O tipo voltará a aparecer nos novos cadastros de patrimônio.'
    : action === 'deactivate'
      ? `O tipo deixará de aparecer em novos cadastros. ${usageCount > 0 ? `Os ${usageCount} registros existentes continuarão preservados.` : 'O histórico existente continuará preservado.'}`
      : 'A exclusão é permanente e só é permitida porque este tipo ainda não foi usado em nenhum patrimônio.';

  return createPortal(
    <div
      data-product-type-dialog-root
      className="fixed inset-0 z-[10000] flex min-h-[100dvh] items-center justify-center bg-[#001a33]/60 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isPending) onClose();
      }}
    >
      <section
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        aria-busy={isPending}
        className="relative w-full max-w-md rounded-[2rem] border border-white/70 bg-white p-6 text-center shadow-2xl sm:p-8"
      >
        <button
          type="button"
          onClick={onClose}
          disabled={isPending}
          className="absolute right-4 top-4 rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Fechar confirmação"
        >
          <X size={19} />
        </button>

        <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ${action === 'activate' ? 'bg-emerald-50 text-emerald-600' : action === 'deactivate' ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600'}`}>
          {content.icon}
        </div>
        <h2 id={titleId} className="mt-5 text-xl font-black tracking-tight text-[#001a33]">
          {content.title}
        </h2>
        <p className="mt-2 text-sm font-bold text-slate-700">{itemName}</p>
        <p id={messageId} className="mt-2 text-sm font-medium leading-relaxed text-slate-500">
          {message}
        </p>

        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row">
          <button
            ref={(element) => { initialFocusRef.current = element; }}
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-xs font-black uppercase tracking-wide text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-black uppercase tracking-wide text-white shadow-lg transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${content.tone}`}
          >
            {isPending ? <LoaderCircle size={15} className="animate-spin" /> : null}
            {isPending ? 'Processando...' : content.confirmLabel}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
