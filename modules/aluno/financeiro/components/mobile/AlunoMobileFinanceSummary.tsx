import React from 'react';
import { ChevronRight } from 'lucide-react';

interface AlunoMobileFinanceSummaryProps {
  totalPaid: number;
  totalPending: number;
  formatCurrency: (value: number) => string;
  onViewCharges: () => void;
}

const AlunoMobileFinanceSummary: React.FC<AlunoMobileFinanceSummaryProps> = ({
  totalPaid, totalPending, formatCurrency, onViewCharges,
}) => (
  <section className="rounded-xl border border-slate-200 bg-white p-4 md:hidden" aria-label="Resumo financeiro">
    <div className="grid grid-cols-2 gap-3">
      <div className="min-w-0">
        <p className="text-xs text-slate-600">Em aberto</p>
        <p className="mt-1 break-all text-lg font-semibold text-[#001a33]">{formatCurrency(totalPending)}</p>
        <p className="mt-1 text-xs text-slate-600">{totalPending <= 0 ? 'Nenhuma cobrança pendente' : 'Parcelas futuras e pendentes'}</p>
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-600">Total pago</p>
        <p className="mt-1 break-all text-lg font-semibold text-emerald-700">{formatCurrency(totalPaid)}</p>
      </div>
    </div>
    <button type="button" onClick={onViewCharges} className="mt-3 flex min-h-11 w-full items-center justify-between rounded-lg bg-blue-50 px-3 text-[13px] font-medium text-blue-700 hover:bg-blue-100">
      Ver cobranças <ChevronRight size={16} aria-hidden="true" />
    </button>
  </section>
);

export default AlunoMobileFinanceSummary;
