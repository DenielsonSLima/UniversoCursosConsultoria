import React from 'react';
import { TrendingUp, WalletCards } from 'lucide-react';
import { formatProfessorFinancialCurrency } from './financeiro.presentation';
import type { ProfessorFinancialListPayload } from './financeiro.types';

interface FinanceiroSummaryCardsProps {
  summary: ProfessorFinancialListPayload['summary'];
}

const FinanceiroSummaryCards: React.FC<FinanceiroSummaryCardsProps> = ({ summary }) => (
  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
    <div className="flex items-center justify-between rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Total recebido</p>
        <p className="text-2xl font-black text-emerald-600">
          {formatProfessorFinancialCurrency(summary.totalReceived)}
        </p>
        <p className="text-[10px] font-medium text-slate-500">Valor efetivamente baixado</p>
      </div>
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
        <TrendingUp size={22} />
      </div>
    </div>

    <div className="flex items-center justify-between rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">A receber</p>
        <p className="text-2xl font-black text-[#001a33]">
          {formatProfessorFinancialCurrency(summary.totalIncoming)}
        </p>
        <p className="text-[10px] font-medium text-slate-500">Saldo residual pendente ou vencido</p>
      </div>
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-50 text-purple-600">
        <WalletCards size={22} />
      </div>
    </div>
  </div>
);

export default FinanceiroSummaryCards;
