import type React from 'react';
import { ChevronRight, UserPlus, WalletCards } from 'lucide-react';
import type { DashboardQuickActionMode } from '../dashboard.presentation';

interface DashboardQuickActionsHeaderProps {
  canCreatePartner: boolean;
  canSearchStudentFinance: boolean;
  onOpenAction: (mode: DashboardQuickActionMode) => void;
}

const DashboardQuickActionsHeader: React.FC<DashboardQuickActionsHeaderProps> = ({
  canCreatePartner,
  canSearchStudentFinance,
  onOpenAction,
}) => (
  <header className="relative overflow-hidden rounded-[1.75rem] border border-blue-100 bg-white px-6 py-6 shadow-sm sm:px-8">
    <div className="pointer-events-none absolute -right-14 -top-20 h-56 w-56 rounded-full bg-blue-100/60 blur-3xl" />
    <div className="relative">
      <h2 className="flex items-center gap-2 text-sm font-bold tracking-tight text-blue-700">
        <span aria-hidden="true" className="h-4 w-1 rounded-full bg-blue-600" />
        Atalhos
      </h2>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {canCreatePartner && (
          <button
            type="button"
            onClick={() => onOpenAction('partner')}
            className="group flex items-center gap-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50 hover:shadow-md"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-900/10">
              <UserPlus size={19} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-[#001a33]">Cadastrar parceiro</span>
              <span className="mt-0.5 block text-[11px] font-medium text-slate-500">
                Aluno, professor, responsável, pessoa física ou jurídica
              </span>
            </span>
            <ChevronRight size={16} className="text-blue-300 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-600" />
          </button>
        )}

        {canSearchStudentFinance && (
          <button
            type="button"
            onClick={() => onOpenAction('student-finance')}
            className="group flex items-center gap-4 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-md"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-900/10">
              <WalletCards size={19} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-[#001a33]">Financeiro do aluno</span>
              <span className="mt-0.5 block text-[11px] font-medium text-slate-500">
                Digite o nome e consulte as parcelas
              </span>
            </span>
            <ChevronRight size={16} className="text-emerald-300 transition-transform group-hover:translate-x-0.5 group-hover:text-emerald-600" />
          </button>
        )}
      </div>
    </div>
  </header>
);

export default DashboardQuickActionsHeader;
