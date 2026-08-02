import React from 'react';
import { CheckCircle2, ChevronRight, Clock3 } from 'lucide-react';

interface AlunoMobileFinanceSummaryProps {
  totalPaid: number;
  totalPending: number;
  formatCurrency: (value: number) => string;
  onViewCharges: () => void;
}

const AlunoMobileFinanceSummary: React.FC<AlunoMobileFinanceSummaryProps> = ({
  totalPaid,
  totalPending,
  formatCurrency,
  onViewCharges,
}) => {
  const isUpToDate = totalPending <= 0;

  return (
    <section
      className="overflow-hidden rounded-[1.75rem] bg-[#001f3f] text-white shadow-[0_18px_44px_-28px_rgba(0,31,63,0.8)] md:hidden"
      aria-labelledby="mobile-finance-summary-title"
    >
      <div className="relative px-5 pb-5 pt-5">
        <div className="pointer-events-none absolute -right-12 -top-16 h-36 w-36 rounded-full bg-blue-500/25 blur-2xl" />

        <div className="relative flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-blue-200">
              <Clock3 size={15} aria-hidden="true" />
              <p className="text-[10px] font-black uppercase tracking-[0.18em]">
                {isUpToDate ? 'Situação financeira' : 'Total em aberto'}
              </p>
            </div>
            <h3 id="mobile-finance-summary-title" className="mt-2 text-[1.75rem] font-black tracking-[-0.04em]">
              {formatCurrency(totalPending)}
            </h3>
            <p className="mt-1 text-xs font-medium text-blue-100/75">
              {isUpToDate ? 'Nenhuma cobrança pendente' : 'Parcelas futuras e pendentes'}
            </p>
          </div>

          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${isUpToDate ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/10 text-blue-100'}`}>
            {isUpToDate ? <CheckCircle2 size={21} aria-hidden="true" /> : <Clock3 size={20} aria-hidden="true" />}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onViewCharges}
        className="flex min-h-14 w-full items-center justify-between border-t border-white/10 bg-white/[0.06] px-5 text-left transition-colors active:bg-white/10"
      >
        <span>
          <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-blue-200/70">Total pago</span>
          <span className="mt-0.5 block text-sm font-black text-white">{formatCurrency(totalPaid)}</span>
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.14em] text-blue-100">
          Ver cobranças <ChevronRight size={15} aria-hidden="true" />
        </span>
      </button>
    </section>
  );
};

export default AlunoMobileFinanceSummary;
