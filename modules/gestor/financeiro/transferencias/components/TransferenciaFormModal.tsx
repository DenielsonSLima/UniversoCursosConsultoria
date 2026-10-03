import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Landmark, Loader2, Plus, X } from 'lucide-react';
import type { ContaBancaria, FinanceiroPolo } from '../../financeiro.types';
import TransferenciaPicker from './TransferenciaPicker';
import { contaTransferenciaOption, poloTransferenciaOption } from './transferencia-options';

export interface TransferFormState {
  requestId: string;
  dataTransferencia: string;
  observacao: string;
  valor: string;
  poloOrigemId: string;
  contaOrigemId: string;
  poloDestinoId: string;
  contaDestinoId: string;
}

interface TransferenciaFormModalProps {
  form: TransferFormState;
  setForm: React.Dispatch<React.SetStateAction<TransferFormState>>;
  polos: FinanceiroPolo[];
  polosLoading: boolean;
  polosError: boolean;
  originAccounts: ContaBancaria[];
  destinationAccounts: ContaBancaria[];
  originAccountsLoading: boolean;
  originAccountsError: boolean;
  destinationAccountsLoading: boolean;
  destinationAccountsError: boolean;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
}

export default function TransferenciaFormModal({
  form, setForm, polos, polosLoading, polosError, originAccounts, destinationAccounts,
  originAccountsLoading, originAccountsError, destinationAccountsLoading, destinationAccountsError,
  isPending, onClose, onSubmit,
}: TransferenciaFormModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const pendingRef = useRef(isPending);
  useEffect(() => { closeRef.current = onClose; pendingRef.current = isPending; }, [onClose, isPending]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pendingRef.current) closeRef.current();
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const elements = Array.from(dialogRef.current.querySelectorAll('button:not([disabled]), input:not([disabled])')) as HTMLElement[];
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);

  const polosOptions = polos.map(poloTransferenciaOption);
  const unavailable = polosLoading || polosError || originAccountsLoading || originAccountsError
    || destinationAccountsLoading || destinationAccountsError;
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex min-h-[100dvh] items-center justify-center bg-[#001a33]/70 p-4 backdrop-blur-sm">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="max-h-[calc(100dvh-2rem)] w-full max-w-5xl overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl outline-none">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Nova transferência</p>
            <h4 id={titleId} className="text-xl font-black uppercase tracking-tight text-[#001a33]">Transferência entre contas</h4>
          </div>
          <button type="button" disabled={isPending} onClick={onClose} aria-label="Fechar transferência" className="rounded-xl bg-slate-100 p-2 text-slate-500 hover:bg-slate-200 disabled:opacity-50"><X size={18} /></button>
        </div>
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-[1fr_1.2fr_0.8fr]">
            <label className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Data</span>
              <input type="date" value={form.dataTransferencia} disabled={isPending} onChange={(event) => setForm((current) => ({ ...current, dataTransferencia: event.target.value }))} className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 outline-none focus:border-slate-400 focus:bg-white" />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Descrição</span>
              <input value={form.observacao} disabled={isPending} onChange={(event) => setForm((current) => ({ ...current, observacao: event.target.value }))} placeholder="Ex.: Repasse para conta operacional" className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 outline-none focus:border-slate-400 focus:bg-white" />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Valor</span>
              <input type="text" inputMode="decimal" value={form.valor} disabled={isPending} onChange={(event) => setForm((current) => ({ ...current, valor: event.target.value.replace(/[^\d.,]/g, '') }))} onBlur={() => {
                const parsed = Number(form.valor.replace(/\./g, '').replace(',', '.'));
                setForm((current) => ({ ...current, valor: Number.isFinite(parsed) && parsed > 0 ? parsed.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '' }));
              }} placeholder="0,00" className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 outline-none focus:border-slate-400 focus:bg-white" />
            </label>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {(['origem', 'destino'] as const).map((side) => {
              const origin = side === 'origem';
              const accent = origin ? 'rose' : 'emerald';
              const poloId = origin ? form.poloOrigemId : form.poloDestinoId;
              return (
                <section key={side} aria-label={origin ? 'Origem' : 'Destino'} className={`min-w-0 rounded-3xl border p-4 ${origin ? 'border-rose-100 bg-rose-50/50' : 'border-emerald-100 bg-emerald-50/50'}`}>
                  <div className={`mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-wider ${origin ? 'text-rose-700' : 'text-emerald-700'}`}><Landmark size={15} />{origin ? 'Origem' : 'Destino'}</div>
                  <div className="space-y-4">
                    <TransferenciaPicker
                      label={`Empresa / polo de ${side}`} options={polosOptions} value={poloId}
                      onChange={(id) => setForm((current) => origin ? { ...current, poloOrigemId: id, contaOrigemId: '' } : { ...current, poloDestinoId: id, contaDestinoId: '' })}
                      placeholder="Buscar empresa, CNPJ ou cidade..." loading={polosLoading} error={polosError} disabled={isPending} accent={accent}
                    />
                    <TransferenciaPicker
                      label={`Conta bancária de ${side}`}
                      options={(origin ? originAccounts : destinationAccounts).filter((account) => account.id).map(contaTransferenciaOption)}
                      value={origin ? form.contaOrigemId : form.contaDestinoId}
                      onChange={(id) => setForm((current) => origin ? { ...current, contaOrigemId: id } : { ...current, contaDestinoId: id })}
                      placeholder={!poloId ? 'Selecione uma empresa primeiro' : !origin && form.poloOrigemId === form.poloDestinoId && form.contaOrigemId ? 'Selecione outra conta' : 'Buscar banco ou conta...'}
                      loading={origin ? originAccountsLoading : destinationAccountsLoading} error={origin ? originAccountsError : destinationAccountsError} disabled={!poloId || isPending} accent={accent}
                    />
                  </div>
                </section>
              );
            })}
          </div>
          <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={isPending} className="rounded-2xl border border-slate-200 px-5 py-3 text-xs font-black uppercase tracking-wider text-slate-500 hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
            <button type="submit" disabled={isPending || unavailable} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#001a33] px-6 py-3 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-slate-900/15 disabled:opacity-50">
              {isPending ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />} Salvar transferência
            </button>
          </div>
        </form>
      </div>
    </div>, document.body,
  );
}
