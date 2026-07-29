import type React from 'react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  GraduationCap,
  LoaderCircle,
  ReceiptText,
  Search,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { financeiroQueryKeys } from '../../financeiro/financeiro.queryKeys';
import { financeiroService } from '../../financeiro/financeiro.service';
import type {
  DashboardPartnerForm,
  DashboardQuickActionMode,
} from '../dashboard.presentation';

interface StudentReceivable {
  id: string;
  clienteNome: string;
  clienteCpf: string;
  descricao: string;
  poloNome: string;
  dataVencimento: string;
  valor: number;
  status: string;
}

interface DashboardQuickActionsModalProps {
  mode: DashboardQuickActionMode;
  poloId?: string | null;
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

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatDate = (dateValue: string) => {
  if (!dateValue) return 'Sem vencimento';
  return new Date(`${dateValue}T12:00:00`).toLocaleDateString('pt-BR');
};

const getStatusTone = (status: string) => {
  if (status === 'PAGO') return 'bg-emerald-50 text-emerald-700';
  if (status === 'VENCIDO') return 'bg-rose-50 text-rose-700';
  if (status === 'PENDENTE') return 'bg-blue-50 text-blue-700';
  return 'bg-slate-100 text-slate-600';
};

const DashboardQuickActionsModal: React.FC<DashboardQuickActionsModalProps> = ({
  mode,
  poloId,
  onClose,
  onSelectPartner,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedSearch(searchTerm.trim()), 350);
    return () => window.clearTimeout(timeoutId);
  }, [searchTerm]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const { data: receivables = [], isLoading, isError } = useQuery<StudentReceivable[]>({
    queryKey: financeiroQueryKeys.alunoReceivablesSearch(debouncedSearch, poloId),
    queryFn: () => financeiroService.searchAlunoReceivables(
      debouncedSearch,
      poloId || undefined,
    ) as Promise<StudentReceivable[]>,
    enabled: mode === 'student-finance' && debouncedSearch.length >= 2,
    staleTime: 60_000,
  });

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#001a33]/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dashboard-quick-action-title"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
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
              ) : receivables.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 px-5 py-10 text-center">
                  <ReceiptText size={22} className="mx-auto text-slate-300" />
                  <p className="mt-3 text-xs font-semibold text-slate-500">Nenhuma parcela encontrada para essa busca.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {receivables.map((receivable) => (
                    <article key={receivable.id} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-bold text-[#001a33]">{receivable.clienteNome}</h3>
                          <p className="mt-0.5 text-[10px] font-medium text-slate-400">
                            CPF: {receivable.clienteCpf || 'não informado'} • {receivable.poloNome || 'unidade não informada'}
                          </p>
                          <p className="mt-2 text-xs font-medium text-slate-600">{receivable.descricao}</p>
                        </div>
                        <div className="shrink-0 sm:text-right">
                          <p className="text-sm font-bold text-[#001a33]">{formatCurrency(receivable.valor)}</p>
                          <p className="mt-0.5 text-[10px] font-medium text-slate-400">
                            Vence em {formatDate(receivable.dataVencimento)}
                          </p>
                          <span className={`mt-2 inline-flex rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wide ${getStatusTone(receivable.status)}`}>
                            {receivable.status}
                          </span>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default DashboardQuickActionsModal;
