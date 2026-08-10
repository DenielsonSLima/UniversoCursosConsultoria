import React, { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, LoaderCircle, PackageMinus, X } from 'lucide-react';
import { usePatrimonioDialog } from '../hooks/usePatrimonioDialog';
import {
  calculatePatrimonioTotalCents,
  formatPatrimonioCents,
  parsePatrimonioCurrencyToCents,
  parsePatrimonioQuantity,
} from '../patrimonio.formatters';
import { createPatrimonioRequestId } from '../patrimonio.service';
import type {
  PatrimonioItem,
  PatrimonioWriteOffReason,
  WriteOffPatrimonioInput,
} from '../patrimonio.types';

interface PatrimonioWriteOffModalProps {
  item: PatrimonioItem;
  isPending: boolean;
  errorMessage?: string;
  onClose: () => void;
  onSubmit: (input: WriteOffPatrimonioInput) => void;
}

const getToday = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

const REASON_OPTIONS: Array<{ value: PatrimonioWriteOffReason; label: string }> = [
  { value: 'perda', label: 'Perda' },
  { value: 'furto', label: 'Furto' },
  { value: 'dano', label: 'Dano sem recuperação' },
  { value: 'obsolescencia', label: 'Obsolescência' },
  { value: 'outro', label: 'Outro motivo' },
];

const inputClassName = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-100 disabled:cursor-not-allowed disabled:opacity-60';

export function PatrimonioWriteOffModal({
  item,
  isPending,
  errorMessage,
  onClose,
  onSubmit,
}: PatrimonioWriteOffModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const [requestId, setRequestId] = useState(createPatrimonioRequestId);
  const [dataBaixa, setDataBaixa] = useState(getToday);
  const [quantidade, setQuantidade] = useState('1');
  const [motivo, setMotivo] = useState<PatrimonioWriteOffReason>('perda');
  const [observacao, setObservacao] = useState('');
  const { dialogRef, initialFocusRef } = usePatrimonioDialog(true, onClose, isPending);

  const parsedQuantity = parsePatrimonioQuantity(quantidade);
  const hasValidQuantity = parsedQuantity !== null && parsedQuantity <= item.quantidadeDisponivel;
  const hasValidDate = Boolean(
    dataBaixa
    && dataBaixa >= item.dataAquisicao
    && dataBaixa <= getToday(),
  );
  const hasRequiredObservation = motivo !== 'outro' || Boolean(observacao.trim());
  const canSubmit = hasValidQuantity && hasValidDate && hasRequiredObservation;
  const unitCents = parsePatrimonioCurrencyToCents(item.valorUnitario);
  const removedCents = parsedQuantity !== null && unitCents !== null
    ? calculatePatrimonioTotalCents(parsedQuantity, unitCents)
    : null;
  const remainingQuantity = hasValidQuantity && parsedQuantity !== null
    ? item.quantidadeDisponivel - parsedQuantity
    : item.quantidadeDisponivel;

  const renewRequest = () => setRequestId(createPatrimonioRequestId());

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
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={isPending}
        tabIndex={-1}
        className="max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-t-[2rem] border border-white/70 bg-white shadow-2xl sm:rounded-[2rem]"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-5 py-5 sm:px-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
              <PackageMinus size={21} aria-hidden="true" />
            </div>
            <div>
              <h2 id={titleId} className="text-lg font-black text-[#001a33]">Registrar perda</h2>
              <p id={descriptionId} className="mt-0.5 text-xs font-medium text-slate-500">
                {item.descricao} · {item.quantidadeDisponivel} disponível(is)
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={isPending} className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50" aria-label="Fechar registro de perda">
            <X size={19} />
          </button>
        </header>

        <form
          className="space-y-5 p-5 sm:p-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit || parsedQuantity === null) return;
            onSubmit({
              requestId,
              patrimonioId: item.id,
              poloId: item.poloId,
              expectedUpdatedAt: item.updatedAt,
              dataBaixa,
              quantidadeBaixa: parsedQuantity,
              motivo,
              observacao,
            });
          }}
        >
          <div className="flex gap-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-amber-900">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <p className="text-xs font-semibold leading-relaxed">
              A baixa reduz a posição patrimonial, mas não registra uma saída de dinheiro no Caixa. O histórico do bem será preservado.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500">Data da baixa</span>
              <input
                ref={(element) => { initialFocusRef.current = element; }}
                type="date"
                min={item.dataAquisicao}
                max={getToday()}
                required
                value={dataBaixa}
                onChange={(event) => { setDataBaixa(event.target.value); renewRequest(); }}
                disabled={isPending}
                aria-invalid={Boolean(dataBaixa && !hasValidDate)}
                className={inputClassName}
              />
              {dataBaixa && !hasValidDate ? <p className="mt-1.5 text-[11px] font-semibold text-rose-600">A data deve ficar entre a aquisição e hoje.</p> : null}
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500">Quantidade baixada</span>
              <input
                type="number"
                inputMode="numeric"
                min="1"
                max={item.quantidadeDisponivel}
                step="1"
                required
                value={quantidade}
                onChange={(event) => { setQuantidade(event.target.value); renewRequest(); }}
                disabled={isPending}
                aria-invalid={Boolean(quantidade && !hasValidQuantity)}
                className={inputClassName}
              />
              {quantidade && !hasValidQuantity ? <p className="mt-1.5 text-[11px] font-semibold text-rose-600">Informe de 1 a {item.quantidadeDisponivel} unidade(s).</p> : null}
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500">Motivo</span>
            <select
              value={motivo}
              onChange={(event) => { setMotivo(event.target.value as PatrimonioWriteOffReason); renewRequest(); }}
              disabled={isPending}
              className={inputClassName}
            >
              {REASON_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500">
              Observação {motivo === 'outro' ? '' : <span className="font-medium normal-case tracking-normal text-slate-400">(opcional)</span>}
            </span>
            <textarea
              required={motivo === 'outro'}
              maxLength={500}
              rows={3}
              value={observacao}
              onChange={(event) => { setObservacao(event.target.value); renewRequest(); }}
              disabled={isPending}
              placeholder={motivo === 'outro' ? 'Descreva obrigatoriamente o motivo da baixa' : 'Detalhes que ajudem a auditar esta baixa'}
              aria-invalid={motivo === 'outro' && !observacao.trim()}
              className={`${inputClassName} resize-y`}
            />
          </label>

          <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <div>
              <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Valor da baixa</p>
              <output className="mt-1 block text-sm font-black text-rose-700" aria-live="polite">
                {removedCents === null ? '—' : formatPatrimonioCents(removedCents)}
              </output>
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Restará disponível</p>
              <output className="mt-1 block text-sm font-black text-[#001a33]" aria-live="polite">
                {remainingQuantity} unidade(s)
              </output>
            </div>
          </div>

          {errorMessage ? (
            <div role="alert" className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs font-semibold leading-relaxed text-rose-700">
              {errorMessage}
            </div>
          ) : null}

          <footer className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={isPending} className="rounded-xl border border-slate-200 px-5 py-2.5 text-xs font-black uppercase tracking-wide text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Cancelar</button>
            <button type="submit" disabled={isPending || !canSubmit} className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-5 py-2.5 text-xs font-black uppercase tracking-wide text-white shadow-md shadow-amber-950/15 transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60">
              {isPending ? <LoaderCircle size={15} className="animate-spin" /> : <PackageMinus size={15} />}
              {isPending ? 'Registrando...' : 'Confirmar perda'}
            </button>
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  );
}
