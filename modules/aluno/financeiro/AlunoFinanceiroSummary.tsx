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
      <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-white p-4">
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-600">Total pago</p>
          <p className="text-2xl font-semibold text-emerald-600">
            {formatAlunoFinancialCurrency(summary.totalPaid)}
          </p>
          <p className="text-xs font-medium text-slate-500">Valor efetivamente compensado</p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
          <TrendingUp size={22} />
        </div>
      </div>
      <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-white p-4">
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-600">A pagar / aberto</p>
          <p className="text-2xl font-semibold text-[#001a33]">
            {formatAlunoFinancialCurrency(summary.totalPending)}
          </p>
          <p className="text-xs font-medium text-slate-500">Saldo pendente</p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <Clock size={22} />
        </div>
      </div>
    </div>
    {summary.openByModality.length > 0 ? (
      <details className="rounded-xl border border-slate-200 bg-white px-4">
        <summary className="min-h-11 cursor-pointer py-3 text-[13px] font-medium text-blue-700">Em aberto por modalidade</summary>
        <div className="mb-3 grid grid-cols-1 gap-2 min-[390px]:grid-cols-2 xl:grid-cols-4">
          {summary.openByModality.map((item) => (
            <div key={item.modality} className={`min-w-0 rounded-lg border px-3 py-2 ${getAlunoFinancialModalityAccent(item.modality).group}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold ">
                  {getAlunoFinancialModalityLabel(item.modality)}
                </span>
                <span className="rounded-full bg-white/70 px-2 py-1 text-xs font-semibold ">
                  {item.count} item{item.count === 1 ? '' : 's'}
                </span>
              </div>
              <p className="mt-2 break-all text-base font-semibold">{formatAlunoFinancialCurrency(item.total)}</p>
            </div>
          ))}
        </div>
      </details>
    ) : null}
  </>
);

export default AlunoFinanceiroSummary;
