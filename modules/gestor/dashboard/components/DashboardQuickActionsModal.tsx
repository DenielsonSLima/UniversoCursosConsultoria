import type React from 'react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  GraduationCap,
  LoaderCircle,
  Search,
  UserRound,
  Users,
  UsersRound,
  X,
} from 'lucide-react';
import ToastNotification, { useToast } from '../../components/ToastNotification';
import ManualSettlementModal from '../../financeiro/receber/components/manual-settlement/ManualSettlementModal';
import type {
  DashboardPartnerForm,
  DashboardQuickActionMode,
} from '../dashboard.presentation';
import DashboardStudentFinanceResults from '../student-finance/DashboardStudentFinanceResults';
import {
  dashboardStudentFinanceSearchKey,
  searchDashboardStudentReceivables,
} from '../student-finance/dashboard-student-finance.service';
import type { DashboardStudentReceivable } from '../student-finance/dashboard-student-finance.model';
import { useDashboardStudentSettlement } from '../student-finance/useDashboardStudentSettlement';

interface DashboardQuickActionsModalProps {
  mode: DashboardQuickActionMode;
  poloId?: string | null;
  canSettleStudentFinance: boolean;
  onClose: () => void;
  onSelectPartner: (form: DashboardPartnerForm) => void;
}

const partnerOptions: Array<{
  id: DashboardPartnerForm;
  label: string;
  description: string;
  icon: typeof GraduationCap;
  tone: string;
}> = [
  {
    id: 'aluno',
    label: 'Aluno',
    description: 'Cadastro e vínculo acadêmico',
    icon: GraduationCap,
    tone: 'bg-blue-50 text-blue-600',
  },
  {
    id: 'professor',
    label: 'Professor',
    description: 'Cadastro de docente',
    icon: Users,
    tone: 'bg-violet-50 text-violet-600',
  },
  {
    id: 'responsavel',
    label: 'Responsável',
    description: 'Representante legal do aluno',
    icon: UsersRound,
    tone: 'bg-emerald-50 text-emerald-600',
  },
  {
    id: 'pf',
    label: 'Pessoa física',
    description: 'Prestador de serviço',
    icon: UserRound,
    tone: 'bg-amber-50 text-amber-600',
  },
  {
    id: 'pj',
    label: 'Pessoa jurídica',
    description: 'Empresa ou instituição',
    icon: Building2,
    tone: 'bg-slate-100 text-slate-700',
  },
];

const DashboardQuickActionsModal: React.FC<DashboardQuickActionsModalProps> = ({
  mode,
  poloId,
  canSettleStudentFinance,
  onClose,
  onSelectPartner,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const { toasts, removeToast, toast } = useToast();
  const settlement = useDashboardStudentSettlement({
    activePoloId: poloId,
    canSettle: canSettleStudentFinance,
    toast,
  });

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedSearch(searchTerm.trim()), 350);
    return () => window.clearTimeout(timeoutId);
  }, [searchTerm]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (settlement.pending) return;
      if (settlement.selected) {
        settlement.closeSettlement();
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, settlement]);

  const { data: receivables = [], isLoading, isError } = useQuery<DashboardStudentReceivable[]>({
    queryKey: dashboardStudentFinanceSearchKey(debouncedSearch, poloId),
    queryFn: () => searchDashboardStudentReceivables(
      debouncedSearch,
      poloId,
    ),
    enabled: mode === 'student-finance' && debouncedSearch.length >= 2,
    staleTime: 60_000,
  });

  if (typeof document === 'undefined') return null;

  return createPortal((
    <>
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#001a33]/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dashboard-quick-action-title"
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget || settlement.pending) return;
        if (settlement.selected) settlement.closeSettlement();
        else onClose();
      }}
    >
      <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-[2rem] border border-white/20 bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5 sm:px-7">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-blue-600">Ação rápida</p>
            <h2 id="dashboard-quick-action-title" className="mt-1 text-xl font-bold text-[#001a33]">
              {mode === 'partner' ? 'Cadastrar parceiro' : 'Financeiro do aluno'}
            </h2>
            <p className="mt-1 text-xs font-medium text-slate-500">
              {mode === 'partner'
                ? 'Escolha o tipo de registro que deseja iniciar.'
                : 'Busque pelo nome ou CPF para consultar as parcelas retornadas pelo financeiro.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={settlement.pending}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Fechar"
          >
            <X size={19} />
          </button>
        </header>

        {mode === 'partner' ? (
          <div className="grid gap-3 p-6 sm:grid-cols-2 sm:p-7">
            {partnerOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onSelectPartner(option.id)}
                  className="group flex items-center gap-4 rounded-2xl border border-slate-200 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
                >
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${option.tone}`}>
                    <Icon size={19} />
                  </span>
                  <span>
                    <span className="block text-sm font-bold text-[#001a33]">{option.label}</span>
                    <span className="mt-0.5 block text-[11px] font-medium text-slate-500">{option.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="p-6 sm:p-7">
            <label className="relative block">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Digite o nome ou CPF do aluno..."
                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-4 text-sm font-medium text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-50"
              />
            </label>

            <div className="mt-5 max-h-[52vh] overflow-y-auto pr-1">
              {debouncedSearch.length < 2 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-5 py-10 text-center">
                  <Search size={22} className="mx-auto text-slate-300" />
                  <p className="mt-3 text-xs font-semibold text-slate-500">Digite pelo menos dois caracteres para buscar.</p>
                </div>
              ) : isLoading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-xs font-bold text-slate-500">
                  <LoaderCircle size={18} className="animate-spin text-blue-600" />
                  Consultando financeiro...
                </div>
              ) : isError ? (
                <div className="rounded-2xl bg-rose-50 px-5 py-8 text-center text-xs font-semibold text-rose-700">
                  Não foi possível consultar o financeiro agora.
                </div>
              ) : (
                <DashboardStudentFinanceResults
                  receivables={receivables}
                  activePoloId={poloId}
                  canSettle={canSettleStudentFinance}
                  onSettle={settlement.openSettlement}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>

    {settlement.selected && settlement.accountsLoading && (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Carregando contas para baixa"
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm"
      >
        <div className="rounded-[2rem] bg-white px-8 py-7 text-center shadow-2xl">
          <LoaderCircle size={24} className="mx-auto animate-spin text-emerald-600" />
          <p className="mt-3 text-xs font-bold text-slate-600">Carregando contas do polo...</p>
          <button
            type="button"
            onClick={settlement.closeSettlement}
            className="mt-4 text-[10px] font-black uppercase tracking-wider text-slate-500 hover:text-slate-800"
          >
            Cancelar
          </button>
        </div>
      </div>
    )}

    {settlement.selected && !settlement.accountsLoading && (
      <ManualSettlementModal
        key={settlement.selected.id}
        receivable={settlement.selected}
        accounts={settlement.accounts}
        initialAccountId={settlement.accounts[0]?.id || ''}
        pending={settlement.pending}
        error={settlement.error}
        onClose={settlement.closeSettlement}
        onConfirm={settlement.confirmSettlement}
      />
    )}

    <ToastNotification toasts={toasts} onRemove={removeToast} />
    </>
  ),
    document.body,
  );
};

export default DashboardQuickActionsModal;
