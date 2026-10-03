import React from 'react';
import { CalendarDays, Loader2 } from 'lucide-react';
import { formatCents, formatRenegociacaoDate } from '../renegociacoes.model';
import type { RenegociacaoScheduleEntry } from '../renegociacoes.types';
import type { ScheduleDraftEntry } from '../hooks/useRenegociacaoScheduleDraft';

interface Props {
  rows: ScheduleDraftEntry[];
  entries: RenegociacaoScheduleEntry[];
  financedCents: number;
  changed: boolean;
  valid: boolean;
  disabled: boolean;
  pending: boolean;
  onChange: (sequence: number, field: 'dueDate' | 'amount', value: string) => void;
  onValidate: () => void;
  onReset: () => void;
}

const RenegociacaoScheduleEditor: React.FC<Props> = ({
  rows, entries, financedCents, changed, valid, disabled, pending, onChange, onValidate, onReset,
}) => (
  <section aria-label="Cronograma editável" className="rounded-2xl border border-slate-200 bg-white p-4">
    <h4 className="flex items-center gap-2 text-xs font-black uppercase text-[#001a33]">
      <CalendarDays size={17} className="text-blue-600" /> Cronograma
    </h4>
    <p className="mt-2 text-sm font-bold text-[#001a33]">Total a distribuir nas parcelas: {formatCents(financedCents)}</p>
    <p className="mt-1 text-xs text-slate-500">
      Edite o vencimento e o valor individual. A soma deve corresponder ao saldo parcelado acima.
      Para alterar o desconto ou o total negociado, volte às Condições.
    </p>
    {entries.filter((entry) => entry.kind === 'DOWN_PAYMENT').map((entry) => (
      <p key={entry.sequence} className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
        Entrada: {formatCents(entry.amountCents)} • {formatRenegociacaoDate(entry.dueDate)}.
        A entrada é ajustada nas Condições e não faz parte da distribuição abaixo.
      </p>
    ))}
    <fieldset disabled={disabled} className="mt-4 space-y-3 disabled:opacity-60">
      <legend className="sr-only">Vencimentos e valores das parcelas</legend>
      {rows.map((row) => (
        <div key={row.sequence} className="grid items-center gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-[100px_1fr_1fr]">
          <span className="text-sm font-bold text-[#001a33]">Parcela {row.sequence}</span>
          <label className="text-[10px] font-black uppercase text-slate-500">
            Vencimento
            <input aria-label={`Vencimento da parcela ${row.sequence}`} type="date" value={row.dueDate}
              onChange={(event) => onChange(row.sequence, 'dueDate', event.target.value)}
              className={inputClass} />
          </label>
          <label className="text-[10px] font-black uppercase text-slate-500">
            Valor (R$)
            <input aria-label={`Valor da parcela ${row.sequence}`} inputMode="decimal" value={row.amount}
              onChange={(event) => onChange(row.sequence, 'amount', event.target.value)}
              className={inputClass} />
          </label>
        </div>
      ))}
    </fieldset>
    {!rows.length ? <p className="mt-3 text-xs text-slate-500">Pagamento integral na entrada, sem parcelas restantes.</p> : null}
    <p role="status" aria-live="polite" className={`mt-3 text-xs font-semibold ${changed ? 'text-amber-800' : 'text-emerald-700'}`}>
      {changed ? 'Alterações ainda não validadas. Valide o cronograma antes de salvar a proposta.' : 'Cronograma validado pelo servidor.'}
    </p>
    {changed ? (
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" disabled={disabled || !valid} onClick={onValidate}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-700 px-4 text-xs font-black text-white disabled:opacity-40">
          {pending ? <Loader2 size={15} className="animate-spin" /> : null} Validar cronograma
        </button>
        <button type="button" disabled={disabled} onClick={onReset}
          className="min-h-11 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-600 disabled:opacity-40">
          Restaurar cronograma validado
        </button>
        {!valid ? <p className="text-xs text-rose-700">Preencha as datas e valores positivos com até duas casas decimais.</p> : null}
      </div>
    ) : null}
  </section>
);

const inputClass = 'mt-1 block min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-[#001a33] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100';
export default RenegociacaoScheduleEditor;
