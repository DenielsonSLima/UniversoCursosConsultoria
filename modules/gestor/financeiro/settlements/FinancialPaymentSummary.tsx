import React from 'react';
import { CheckCircle2, Minus, Plus } from 'lucide-react';
import type { FinancialPaymentPreview } from './financial-payment.types';
import { paymentMoneyLabel } from './financial-payment.form';

type Summary = Pick<FinancialPaymentPreview, 'originalAmount' | 'previouslyPaid' | 'remainingBefore'>;

function AdjustmentLine({ label, value, discount = false }: { label: string; value?: string; discount?: boolean }) {
  return <div className="flex items-center justify-between gap-4 py-1.5 text-xs">
    <span className="flex items-center gap-1.5 font-semibold text-slate-500">
      {discount ? <Minus size={12} className="text-emerald-600" /> : <Plus size={12} className="text-slate-400" />}
      {label}
    </span>
    <strong className={discount ? 'text-emerald-700' : 'text-slate-700'}>
      {value === undefined ? '—' : `${discount ? '−' : '+'} ${paymentMoneyLabel(value)}`}
    </strong>
  </div>;
}

export function FinancialPaymentSummary({ summary, preview, expense, readOnly }: {
  summary?: Summary;
  preview: FinancialPaymentPreview | null;
  expense: boolean;
  readOnly: boolean;
}) {
  return <aside aria-label="Resumo do pagamento" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:sticky lg:top-0">
    <div className="border-b border-slate-100 bg-[#001a33]/[0.035] px-5 py-4">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Resumo da composição</p>
      <div className="mt-2 flex items-end justify-between gap-4">
        <span className="text-xs font-bold text-slate-600">{expense ? 'Valor original' : 'Valor da cobrança'}</span>
        <strong className="text-xl font-black tracking-tight text-[#001a33]">{summary ? paymentMoneyLabel(summary.originalAmount) : '—'}</strong>
      </div>
      {summary ? <div className="mt-3 space-y-2 border-t border-slate-200/70 pt-3 text-xs">
        <p className="flex justify-between gap-3 font-semibold text-slate-500"><span>{expense ? 'Já pago' : 'Já recebido'}</span><strong className="text-slate-700">{paymentMoneyLabel(summary.previouslyPaid)}</strong></p>
        <p className="flex justify-between gap-3 font-bold text-[#001a33]"><span>Saldo em aberto</span><strong>{paymentMoneyLabel(summary.remainingBefore)}</strong></p>
      </div> : null}
    </div>
    {!readOnly ? <>
      <div className="px-5 py-4">
        <p className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Ajustes desta baixa</p>
        <AdjustmentLine label="Juros" value={preview?.interest} />
        <AdjustmentLine label="Multa" value={preview?.penalty} />
        <AdjustmentLine label="Outros acréscimos" value={preview?.addition} />
        <AdjustmentLine label="Desconto" value={preview?.discount} discount />
      </div>
      <div className="m-3 mt-0 rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-700 p-4 text-white shadow-lg shadow-emerald-900/15">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-100">{expense ? 'Total a pagar' : 'Total a receber'}</p>
        <p className="mt-1 text-3xl font-black tracking-tight">{preview ? paymentMoneyLabel(preview.paymentAmount) : '—'}</p>
        <p className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-emerald-100">
          <CheckCircle2 size={13} /> {expense ? 'Pagamento agora' : 'Recebimento agora'} · {preview ? 'valor conferido' : 'aguardando conferência'}
        </p>
      </div>
      <div className="px-5 pb-4">
        <p className="flex justify-between gap-3 text-xs font-black text-[#001a33]"><span>Saldo restante</span><span>{preview ? paymentMoneyLabel(preview.remainingAfter) : '—'}</span></p>
        <p className="mt-2 text-[10px] font-medium leading-relaxed text-slate-400">
          {preview ? preview.status === 'PAGO' ? 'Esta baixa quita o lançamento.' : 'Baixa parcial. O saldo restante continuará em aberto.' : 'Preencha os valores e as contas para conferir esta baixa.'}
        </p>
      </div>
    </> : null}
  </aside>;
}
