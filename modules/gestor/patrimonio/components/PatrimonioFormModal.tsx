import React, { useState } from 'react';
import { LoaderCircle, PackagePlus, X } from 'lucide-react';
import { PATRIMONIO_TIPO_OPTIONS } from '../patrimonio.constants';
import { createPatrimonioRequestId } from '../patrimonio.service';
import type { CreatePatrimonioInput } from '../patrimonio.types';

interface PatrimonioFormModalProps {
  poloId: string;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (input: CreatePatrimonioInput) => void;
}

interface PatrimonioFormState {
  dataAquisicao: string;
  tipoProduto: string;
  descricao: string;
  quantidade: string;
  valorUnitario: string;
  numeroSerie: string;
  observacao: string;
}

const getToday = () => new Date().toISOString().slice(0, 10);

const initialState = (): PatrimonioFormState => ({
  dataAquisicao: getToday(),
  tipoProduto: '',
  descricao: '',
  quantidade: '1',
  valorUnitario: '',
  numeroSerie: '',
  observacao: '',
});

const inputClassName = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60';

export function PatrimonioFormModal({
  poloId,
  isPending,
  onClose,
  onSubmit,
}: PatrimonioFormModalProps) {
  const [form, setForm] = useState<PatrimonioFormState>(initialState);

  const update = <Field extends keyof PatrimonioFormState>(field: Field, value: PatrimonioFormState[Field]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onSubmit({
      requestId: createPatrimonioRequestId(),
      poloId,
      dataAquisicao: form.dataAquisicao,
      tipoProduto: form.tipoProduto.trim(),
      descricao: form.descricao.trim(),
      quantidade: Number(form.quantidade),
      valorUnitario: Number(form.valorUnitario),
      numeroSerie: form.numeroSerie,
      observacao: form.observacao,
    });
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-end bg-slate-950/45 p-0 backdrop-blur-[1px] sm:items-center sm:justify-center sm:p-5" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="patrimonio-form-title"
        className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-[2rem] bg-white shadow-2xl sm:rounded-[2rem]"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-5 py-5 sm:px-7">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><PackagePlus size={21} /></div>
            <div>
              <h2 id="patrimonio-form-title" className="text-lg font-black text-[#001a33]">Novo patrimônio</h2>
              <p className="mt-0.5 text-xs font-medium text-slate-500">Registre o bem no polo selecionado.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={isPending} className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50" aria-label="Fechar formulário"><X size={19} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-5 sm:p-7">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500">Data de aquisição</span>
              <input type="date" required value={form.dataAquisicao} onChange={(event) => update('dataAquisicao', event.target.value)} disabled={isPending} className={inputClassName} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500">Tipo de produto</span>
              <input list="patrimonio-tipos-form" required value={form.tipoProduto} onChange={(event) => update('tipoProduto', event.target.value)} disabled={isPending} placeholder="Ex.: Mobiliário" className={inputClassName} />
              <datalist id="patrimonio-tipos-form">
                {PATRIMONIO_TIPO_OPTIONS.map((option) => <option key={option} value={option} />)}
              </datalist>
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500">Descrição</span>
            <input required value={form.descricao} onChange={(event) => update('descricao', event.target.value)} disabled={isPending} placeholder="Ex.: Notebook para atendimento" className={inputClassName} />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500">Quantidade</span>
              <input type="number" inputMode="numeric" min="1" step="1" required value={form.quantidade} onChange={(event) => update('quantidade', event.target.value)} disabled={isPending} className={inputClassName} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500">Valor unitário</span>
              <input type="number" inputMode="decimal" step="0.01" required value={form.valorUnitario} onChange={(event) => update('valorUnitario', event.target.value)} disabled={isPending} placeholder="0,00" className={inputClassName} />
            </label>
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-medium leading-relaxed text-blue-800">
            O valor total é calculado, validado e devolvido pelo sistema no cadastro. Esta tela não realiza cálculo financeiro.
          </div>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500">Número de série <span className="font-medium normal-case tracking-normal text-slate-400">(opcional)</span></span>
            <input value={form.numeroSerie} onChange={(event) => update('numeroSerie', event.target.value)} disabled={isPending} placeholder="Ex.: SN-123456" className={inputClassName} />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500">Observação <span className="font-medium normal-case tracking-normal text-slate-400">(opcional)</span></span>
            <textarea value={form.observacao} onChange={(event) => update('observacao', event.target.value)} disabled={isPending} rows={3} placeholder="Informações complementares sobre o bem" className={`${inputClassName} resize-y`} />
          </label>

          <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={isPending} className="rounded-xl border border-slate-200 px-5 py-2.5 text-xs font-black uppercase tracking-wide text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Cancelar</button>
            <button type="submit" disabled={isPending} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#001a33] px-5 py-2.5 text-xs font-black uppercase tracking-wide text-white shadow-md shadow-blue-950/15 transition-colors hover:bg-[#073b73] disabled:cursor-not-allowed disabled:opacity-60">
              {isPending ? <LoaderCircle size={15} className="animate-spin" /> : <PackagePlus size={15} />}
              {isPending ? 'Salvando...' : 'Cadastrar patrimônio'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
