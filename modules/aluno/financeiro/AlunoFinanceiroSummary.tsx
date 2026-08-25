import React from 'react';
import { Clock, TrendingUp } from 'lucide-react';

import AlunoMobileFinanceSummary from './components/mobile/AlunoMobileFinanceSummary';
import {
  formatAlunoFinancialCurrency,
  getAlunoFinancialModalityAccent,
  getAlunoFinancialModalityLabel,
} from './financeiro.presentation';
import type { AlunoFinancialListPayload } from './financeiro.types';

interface AlunoFinanceiroSummaryProps {
  summary: AlunoFinancialListPayload['summary'];
}

const AlunoFinanceiroSummary: React.FC<AlunoFinanceiroSummaryProps> = ({ summary }) => (
  <>
    <AlunoMobileFinanceSummary
      totalPaid={summary.totalPaid}
      totalPending={summary.totalPending}
      formatCurrency={formatAlunoFinancialCurrency}
      onViewCharges={() => document.getElementById('aluno-finance-charges')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })}
    />
    <div className="hidden grid-cols-1 gap-3 md:grid md:grid-cols-2 md:gap-5">
      <div className="flex items-center justify-between rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Total pago</p>
          <p className="text-2xl font-black text-emerald-600">
            {formatAlunoFinancialCurrency(summary.totalPaid)}
          </p>
          <p className="text-[10px] font-medium text-slate-500">Valor efetivamente compensado</p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
          <TrendingUp size={22} />
        </div>
      </div>
      <div className="flex items-center justify-between rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">A pagar / aberto</p>
          <p className="text-2xl font-black text-[#001a33]">
            {formatAlunoFinancialCurrency(summary.totalPending)}
          </p>
          <p className="text-[10px] font-medium text-slate-500">Saldo residual canônico</p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <Clock size={22} />
        </div>
      </div>
    </div>
    {summary.openByModality.length > 0 ? (
      <div className="rounded-[1.5rem] border border-slate-100 bg-white p-4 shadow-sm sm:rounded-[2rem]">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-600">Em aberto por tipo</p>
        <p className="text-xs font-bold leading-relaxed text-slate-500">Saldos organizados pelo servidor.</p>
        <div className="mt-3 -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 xl:grid-cols-4">
          {summary.openByModality.map((item) => (
            <div key={item.modality} className={`min-w-[78%] snap-start rounded-2xl border px-4 py-3 md:min-w-0 ${getAlunoFinancialModalityAccent(item.modality).group}`}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-black uppercase tracking-widest">
                  {getAlunoFinancialModalityLabel(item.modality)}
                </span>
                <span className="rounded-full bg-white/70 px-2 py-1 text-[10px] font-black uppercase tracking-widest">
                  {item.count} item{item.count === 1 ? '' : 's'}
                </span>
              </div>
              <p className="mt-2 text-xl font-black">{formatAlunoFinancialCurrency(item.total)}</p>
            </div>
          ))}
        </div>
      </div>
    ) : null}
  </>
);

export default AlunoFinanceiroSummary;
