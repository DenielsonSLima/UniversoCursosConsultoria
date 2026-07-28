import type React from 'react';
import { ChevronRight, DollarSign } from 'lucide-react';

interface DashboardFinancialShortcutProps {
  labels: string[];
  onOpen: () => void;
}

const DashboardFinancialShortcut: React.FC<DashboardFinancialShortcutProps> = ({ labels, onOpen }) => (
  <button
    type="button"
    onClick={onOpen}
    className="group flex w-full flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white px-5 py-4 text-left shadow-sm transition-colors hover:border-blue-200 sm:flex-row sm:items-center"
  >
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 group-hover:bg-blue-50 group-hover:text-blue-600">
      <DollarSign size={17} />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-xs font-bold text-[#001a33]">Resumo financeiro</span>
      <span className="mt-0.5 block text-[11px] font-medium text-slate-500">Consulte os dados completos no módulo Financeiro.</span>
      <span className="mt-2 flex flex-wrap gap-1.5">
        {labels.map((label) => (
          <span key={label} className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-slate-500">
            {label}
          </span>
        ))}
      </span>
    </span>
    <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-blue-600">
      Acessar <ChevronRight size={13} />
    </span>
  </button>
);

export default DashboardFinancialShortcut;
