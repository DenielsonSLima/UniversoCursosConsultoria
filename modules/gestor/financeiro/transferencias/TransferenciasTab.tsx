// File: modules/gestor/financeiro/transferencias/TransferenciasTab.tsx

import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRightLeft,
  Plus,
  Search,
} from 'lucide-react';
import ToastNotification, { useToast } from '../../components/ToastNotification';
import {
  ContaBancaria,
  financeiroService,
  isContaDisponivelNoPolo,
  TransferenciaConta,
  TransferenciaInput,
  TransferenciasFilters,
} from '../financeiro.service';
import { financeiroQueryKeys } from '../financeiro.queryKeys';
import { useFinanceiroRealtime } from '../hooks/useFinanceiroRealtime';
import { useFinanceiroSharedQueries } from '../hooks/useFinanceiroSharedQueries';
import { useTransferenciasQueries } from './hooks/useTransferenciasQueries';
import { caixaQueryKeys } from '../../caixa/caixa.service';
import FinancialUnderlineTabs from '../components/FinancialUnderlineTabs';
import TransferenciaFormModal, { type TransferFormState } from './components/TransferenciaFormModal';
import TransferenciasList from './components/TransferenciasList';
import { formatTransferCurrency } from './components/transferencia-options';
import { useTransferenciaAccountsQueries } from './hooks/useTransferenciaAccountsQueries';

type PeriodScope = 'current_month' | 'all';

interface TransferenciasTabProps {
  poloId?: string | null;
}


const today = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const createRequestId = () => globalThis.crypto?.randomUUID?.()
  || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const DEFAULT_TRANSFER_DESCRIPTION = 'Transferência entre contas';

const createEmptyForm = (poloId = ''): TransferFormState => ({
  requestId: createRequestId(),
  dataTransferencia: today(),
  observacao: DEFAULT_TRANSFER_DESCRIPTION,
  valor: '',
  poloOrigemId: poloId,
  contaOrigemId: '',
  poloDestinoId: poloId,
  contaDestinoId: '',
});

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

const normalizeCurrencyInput = (value: string) => value.replace(/[^\d.,]/g, '');

const parseCurrencyInput = (value: string) => {
  const normalized = normalizeCurrencyInput(value).replace(/\./g, '').replace(',', '.');
  return Number(normalized || 0);
};

const accountLabel = (account: ContaBancaria) =>
  `${account.banco} - ${account.conta}`;

const TransferenciasTab: React.FC<TransferenciasTabProps> = ({ poloId }) => {
  const queryClient = useQueryClient();
  const { toasts, removeToast, toast } = useToast();
  const [periodScope, setPeriodScope] = useState<PeriodScope>('current_month');
  const [search, setSearch] = useState('');
  const [originAccountFilter, setOriginAccountFilter] = useState('');
  const [destinationAccountFilter, setDestinationAccountFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const pageSize = 8;

  useFinanceiroRealtime(poloId);

  const { accountsQuery, polosQuery } = useFinanceiroSharedQueries({
    partners: false,
    poloId,
  });
  const accounts = accountsQuery.data || [];
  const polos = polosQuery.data || [];
  const activePoloId = poloId || '';
  const activePolo = polos.find((polo: any) => polo.id === activePoloId);

  const [form, setForm] = useState<TransferFormState>(() => createEmptyForm(activePoloId));

  const filters = useMemo<TransferenciasFilters>(() => ({
    poloId: activePoloId || undefined,
    search,
    contaOrigemId: originAccountFilter,
    contaDestinoId: destinationAccountFilter,
    dataInicio: startDate,
    dataFim: endDate,
    mesAtual: periodScope === 'current_month',
  }), [activePoloId, destinationAccountFilter, endDate, originAccountFilter, periodScope, search, startDate]);

  const { transferenciasQuery, summaryQuery } = useTransferenciasQueries(filters);
  const transferencias = transferenciasQuery.data || [];
  const isLoading = transferenciasQuery.isLoading || accountsQuery.isLoading || polosQuery.isLoading;

  const activeAccounts = useMemo(
    () => accounts.filter((account) => account.ativo !== false),
    [accounts],
  );

  const filterAccounts = useMemo(
    () => activeAccounts.filter((account) => isContaDisponivelNoPolo(account, activePoloId)),
    [activeAccounts, activePoloId],
  );

  const { originAccountsQuery, destinationAccountsQuery } = useTransferenciaAccountsQueries(
    form.poloOrigemId, form.poloDestinoId, isModalOpen,
  );
  const originAccounts = originAccountsQuery.data || [];
  const destinationAccounts = useMemo(
    () => (destinationAccountsQuery.data || []).filter((account) => !(
      form.poloOrigemId === form.poloDestinoId && account.id === form.contaOrigemId
    )),
    [destinationAccountsQuery.data, form.contaOrigemId, form.poloDestinoId, form.poloOrigemId],
  );
  const originAccountsLoading = originAccountsQuery.isLoading || originAccountsQuery.isFetching;
  const destinationAccountsLoading = destinationAccountsQuery.isLoading || destinationAccountsQuery.isFetching;

  const totalPages = Math.max(1, Math.ceil(transferencias.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = transferencias.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [filters]);

  useEffect(() => {
    if (originAccountFilter && !filterAccounts.some((account) => account.id === originAccountFilter)) {
      setOriginAccountFilter('');
    }
    if (destinationAccountFilter && !filterAccounts.some((account) => account.id === destinationAccountFilter)) {
      setDestinationAccountFilter('');
    }
  }, [destinationAccountFilter, filterAccounts, originAccountFilter]);

  useEffect(() => {
    if (!form.poloOrigemId && activePoloId) {
      setForm((current) => ({
        ...current,
        poloOrigemId: activePoloId,
        poloDestinoId: current.poloDestinoId || activePoloId,
      }));
    }
  }, [activePoloId, form.poloOrigemId]);

  useEffect(() => {
    if (!isModalOpen || originAccountsLoading || originAccountsQuery.isError) return;
    if (form.contaOrigemId && !originAccounts.some((account) => account.id === form.contaOrigemId)) {
      setForm((current) => ({ ...current, contaOrigemId: '' }));
    }
  }, [form.contaOrigemId, isModalOpen, originAccounts, originAccountsLoading, originAccountsQuery.isError]);

  useEffect(() => {
    if (!isModalOpen || destinationAccountsLoading || destinationAccountsQuery.isError) return;
    if (form.contaDestinoId && !destinationAccounts.some((account) => account.id === form.contaDestinoId)) {
      setForm((current) => ({ ...current, contaDestinoId: '' }));
    }
  }, [destinationAccounts, destinationAccountsLoading, destinationAccountsQuery.isError, form.contaDestinoId, isModalOpen]);

  const invalidateTransferencias = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.transferenciasRoot }),
      queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.contasBancariasSaldos }),
      queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.resumoKpis }),
      queryClient.invalidateQueries({ queryKey: caixaQueryKeys.dashboards }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: (input: TransferenciaInput) => financeiroService.createTransferencia(input),
    onSuccess: async () => {
      await invalidateTransferencias();
      setIsModalOpen(false);
      setForm(createEmptyForm(activePoloId));
      toast.success(
        'Transferência registrada',
        'Os saldos serão recalculados pelo banco na próxima atualização.',
      );
    },
    onError: (error: any) => toast.error('Erro na transferência', error.message),
  });

  const openCreateModal = () => {
    setForm(createEmptyForm(activePoloId));
    setIsModalOpen(true);
  };

  const openReverseModal = (transfer: TransferenciaConta) => {
    setForm({
      requestId: createRequestId(),
      dataTransferencia: today(),
      observacao: `Estorno: ${transfer.observacao || 'Transferência interna'}`,
      valor: formatTransferCurrency(transfer.valor),
      poloOrigemId: transfer.poloDestinoId || activePoloId,
      contaOrigemId: transfer.contaDestinoId,
      poloDestinoId: transfer.poloId || activePoloId,
      contaDestinoId: transfer.contaOrigemId,
    });
    setIsModalOpen(true);
  };

  const buildTransferInput = (): TransferenciaInput | null => {
    const numericValue = parseCurrencyInput(form.valor);

    if (originAccountsLoading || destinationAccountsLoading || originAccountsQuery.isError
      || destinationAccountsQuery.isError || polosQuery.isLoading || polosQuery.isError) {
      toast.warning('Contas indisponíveis', 'Aguarde o carregamento das empresas e dos saldos por polo.');
      return null;
    }
    if (!polos.some((polo) => polo.id === form.poloOrigemId)
      || !polos.some((polo) => polo.id === form.poloDestinoId)
      || !originAccounts.some((account) => account.id === form.contaOrigemId)
      || !destinationAccounts.some((account) => account.id === form.contaDestinoId)) {
      toast.warning('Seleção obrigatória', 'Selecione empresas e contas disponíveis para a transferência.');
      return null;
    }

    if (!form.dataTransferencia) {
      toast.warning('Data obrigatória', 'Informe a data da transferência.');
      return null;
    }
    if (!form.observacao.trim()) {
      toast.warning('Descrição obrigatória', 'Informe uma descrição para localizar o lançamento.');
      return null;
    }
    if (!form.poloOrigemId || !form.contaOrigemId) {
      toast.warning('Origem obrigatória', 'Selecione o polo e a conta de origem.');
      return null;
    }
    if (!form.poloDestinoId || !form.contaDestinoId) {
      toast.warning('Destino obrigatório', 'Selecione o polo e a conta de destino.');
      return null;
    }
    if (
      form.contaOrigemId === form.contaDestinoId
      && form.poloOrigemId === form.poloDestinoId
    ) {
      toast.warning(
        'Origem e destino iguais',
        'Selecione outra conta bancária ou um polo diferente para o destino.',
      );
      return null;
    }
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      toast.warning('Valor inválido', 'Informe um valor maior que zero.');
      return null;
    }

    return {
      requestId: form.requestId,
      poloOrigemId: form.poloOrigemId,
      contaOrigemId: form.contaOrigemId,
      poloDestinoId: form.poloDestinoId,
      contaDestinoId: form.contaDestinoId,
      valor: numericValue,
      dataTransferencia: form.dataTransferencia,
      observacao: form.observacao.trim(),
    };
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (saveMutation.isPending) return;
    const input = buildTransferInput();
    if (!input) return;
    saveMutation.mutate(input);
  };

  return (
    <div className="animate-fadeIn space-y-6">
      <ToastNotification toasts={toasts} onRemove={removeToast} />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-slate-500">
            <ArrowRightLeft size={16} /> Movimentação interna
          </p>
          <h3 className="text-2xl font-black uppercase tracking-tight text-[#001a33]">Transferências</h3>
          <p className="mt-1 max-w-2xl text-sm font-medium text-slate-500">
            {activePolo?.nome || 'Unidade financeira'}{activePolo?.cidade ? ` - ${activePolo.cidade}/${activePolo.estado || ''}` : ''}
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#001a33] px-5 py-3 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-slate-900/15 hover:bg-[#062849]"
        >
          <Plus size={16} /> Nova transferência
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 max-w-xl">
        {[
          {
            label: 'Total Transferido',
            value: !activePoloId
              ? 'Selecione um polo'
              : summaryQuery.isPending
                ? 'Carregando...'
              : summaryQuery.isError
                ? 'Indisponível'
                : formatCurrency(summaryQuery.data?.totalValue || 0),
            color: 'text-[#001a33]',
          },
          {
            label: 'Quantidade',
            value: !activePoloId
              ? 'Selecione um polo'
              : summaryQuery.isPending
                ? 'Carregando...'
              : summaryQuery.isError
                ? 'Indisponível'
                : `${summaryQuery.data?.totalCount || 0} transferências`,
            color: 'text-indigo-600',
          },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1">{kpi.label}</p>
            <p className={`text-lg font-black ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>
      {summaryQuery.isError && (
        <p className="max-w-xl rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
          Não foi possível carregar o resumo canônico das transferências. Tente atualizar a página.
        </p>
      )}

      {/* Tabs de período */}
      <FinancialUnderlineTabs
        items={[
          { id: 'current_month' as const, label: 'Mês Atual' },
          { id: 'all' as const, label: 'Todos' },
        ]}
        value={periodScope}
        onChange={setPeriodScope}
        ariaLabel="Período das transferências"
        indicatorClassName="bg-indigo-600"
        activeIconClassName="text-indigo-600"
      />

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Busca */}
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Descrição, polo, banco, conta..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
          />
        </div>

        {/* Data Início */}
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
          title="Data Inicial"
        />

        {/* Data Fim */}
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
          title="Data Final"
        />

        {/* Conta que saiu */}
        <select
          value={originAccountFilter}
          onChange={(e) => setOriginAccountFilter(e.target.value)}
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
        >
          <option value="">Todas as contas de saída</option>
          {filterAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {accountLabel(account)}
            </option>
          ))}
        </select>

        {/* Conta que recebeu */}
        <select
          value={destinationAccountFilter}
          onChange={(e) => setDestinationAccountFilter(e.target.value)}
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
        >
          <option value="">Todas as contas de entrada</option>
          {filterAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {accountLabel(account)}
            </option>
          ))}
        </select>

        {/* Limpar Filtros */}
        {(search || startDate || endDate || originAccountFilter || destinationAccountFilter) && (
          <button
            onClick={() => {
              setSearch('');
              setOriginAccountFilter('');
              setDestinationAccountFilter('');
              setStartDate('');
              setEndDate('');
            }}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl text-xs font-bold uppercase transition-colors"
          >
            Limpar
          </button>
        )}
      </div>

      <TransferenciasList
        isLoading={isLoading}
        isError={transferenciasQuery.isError}
        transferencias={transferencias}
        pageItems={pageItems}
        currentPage={currentPage}
        totalPages={totalPages}
        setPage={setPage}
        openReverseModal={openReverseModal}
      />

      {isModalOpen && (
        <TransferenciaFormModal
          form={form}
          setForm={setForm}
          polos={polos}
          polosLoading={polosQuery.isLoading}
          polosError={polosQuery.isError}
          originAccounts={originAccounts}
          destinationAccounts={destinationAccounts}
          originAccountsLoading={originAccountsLoading}
          originAccountsError={originAccountsQuery.isError}
          destinationAccountsLoading={destinationAccountsLoading}
          destinationAccountsError={destinationAccountsQuery.isError}
          isPending={saveMutation.isPending}
          onClose={() => setIsModalOpen(false)}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
};

export default TransferenciasTab;
