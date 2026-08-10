import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle, PackagePlus, Save, X } from 'lucide-react';
import { usePatrimonioDialog } from '../hooks/usePatrimonioDialog';
import {
  type PatrimonioProductType,
  type PatrimonioProductTypeStatus,
  patrimonioProductTypeQueryKeys,
  patrimonioProductTypesService,
} from '../patrimonio-product-types.service';
import { createPatrimonioRequestId } from '../patrimonio.service';

interface PatrimonioProductTypeFormModalProps {
  poloId: string;
  productType?: PatrimonioProductType | null;
  onClose: () => void;
  onSaved: (productType: PatrimonioProductType) => void;
}

const inputClassName = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60';

export function PatrimonioProductTypeFormModal({
  poloId,
  productType,
  onClose,
  onSaved,
}: PatrimonioProductTypeFormModalProps) {
  const queryClient = useQueryClient();
  const [requestId, setRequestId] = useState(createPatrimonioRequestId);
  const [nome, setNome] = useState(productType?.nome || '');
  const [descricao, setDescricao] = useState(productType?.descricao || '');
  const [status, setStatus] = useState<PatrimonioProductTypeStatus>(productType?.status || 'ativo');
  const { dialogRef, initialFocusRef } = usePatrimonioDialog(true, onClose);

  const saveMutation = useMutation({
    mutationFn: () => productType
      ? patrimonioProductTypesService.update({
          id: productType.id,
          poloId,
          nome,
          descricao,
          status,
          expectedUpdatedAt: productType.updatedAt,
        })
      : patrimonioProductTypesService.create({
          requestId,
          poloId,
          nome,
          descricao,
        }),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: patrimonioProductTypeQueryKeys.root });
      onSaved(saved);
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: patrimonioProductTypeQueryKeys.root });
    },
  });

  const isPending = saveMutation.isPending;
  const title = productType ? 'Editar tipo de produto' : 'Adicionar tipo de produto';

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1100] flex items-end bg-slate-950/55 p-0 backdrop-blur-[2px] sm:items-center sm:justify-center sm:p-5"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isPending) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="patrimonio-product-type-form-title"
        aria-describedby="patrimonio-product-type-form-description"
        aria-busy={isPending}
        tabIndex={-1}
        className="w-full max-w-lg overflow-hidden rounded-t-[2rem] border border-white/70 bg-white shadow-2xl sm:rounded-[2rem]"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-5 py-5 sm:px-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
              <PackagePlus size={21} aria-hidden="true" />
            </div>
            <div>
              <h2 id="patrimonio-product-type-form-title" className="text-lg font-black text-[#001a33]">{title}</h2>
              <p id="patrimonio-product-type-form-description" className="mt-0.5 text-xs font-medium text-slate-500">
                {productType
                  ? 'Atualize a classificação usada nos novos patrimônios.'
                  : 'O novo tipo ficará disponível para seleção após o cadastro.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={`Fechar ${title.toLocaleLowerCase('pt-BR')}`}
          >
            <X size={19} />
          </button>
        </header>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!nome.trim() || isPending) return;
            saveMutation.mutate();
          }}
          className="space-y-5 p-5 sm:p-6"
        >
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500">Nome</span>
            <input
              ref={(element) => { initialFocusRef.current = element; }}
              required
              maxLength={120}
              value={nome}
              onChange={(event) => {
                setNome(event.target.value);
                if (!productType) setRequestId(createPatrimonioRequestId());
              }}
              disabled={isPending}
              placeholder="Ex.: Equipamento de informática"
              className={inputClassName}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500">
              Descrição <span className="font-medium normal-case tracking-normal text-slate-400">(opcional)</span>
            </span>
            <textarea
              rows={3}
              maxLength={500}
              value={descricao}
              onChange={(event) => {
                setDescricao(event.target.value);
                if (!productType) setRequestId(createPatrimonioRequestId());
              }}
              disabled={isPending}
              placeholder="Explique quando este tipo deve ser utilizado"
              className={`${inputClassName} resize-y`}
            />
          </label>

          {productType ? (
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500">Status</span>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as PatrimonioProductTypeStatus)}
                disabled={isPending}
                className={inputClassName}
              >
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </label>
          ) : null}

          {saveMutation.isError ? (
            <div role="alert" className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs font-semibold leading-relaxed text-rose-700">
              {saveMutation.error instanceof Error
                ? saveMutation.error.message
                : 'Não foi possível salvar o tipo de produto.'}
            </div>
          ) : null}

          <footer className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
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
              disabled={isPending || !nome.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#001a33] px-5 py-2.5 text-xs font-black uppercase tracking-wide text-white shadow-md shadow-blue-950/15 transition-colors hover:bg-[#073b73] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />}
              {isPending ? 'Salvando...' : 'Salvar tipo'}
            </button>
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  );
}
