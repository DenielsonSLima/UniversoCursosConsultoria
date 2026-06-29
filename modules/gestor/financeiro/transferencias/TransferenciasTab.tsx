// File: modules/gestor/financeiro/transferencias/TransferenciasTab.tsx

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRightLeft,
  ChevronLeft,
  ChevronRight,
  Landmark,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import ConfirmModal from '../../components/ConfirmModal';
import ToastNotification, { useToast } from '../../components/ToastNotification';
import {
  ContaBancaria,
  financeiroService,
  TransferenciaConta,
  TransferenciaInput,
  TransferenciasFilters,
} from '../financeiro.service';
import { financeiroQueryKeys } from '../financeiro.queryKeys';
import { useFinanceiroRealtime } from '../hooks/useFinanceiroRealtime';
import { useFinanceiroSharedQueries } from '../hooks/useFinanceiroSharedQueries';
import { useTransferenciasQueries } from './hooks/useTransferenciasQueries';

type PeriodScope = 'current_month' | 'all';

interface TransferenciasTabProps {
  poloId?: string | null;
}

interface TransferFormState {
  dataTransferencia: string;
  observacao: string;
  valor: string;
  poloOrigemId: string;
  contaOrigemId: string;
  poloDestinoId: string;
  contaDestinoId: string;
}

const today = () => new Date().toISOString().slice(0, 10);

const DEFAULT_TRANSFER_DESCRIPTION = 'Transferência entre contas';

const createEmptyForm = (poloId = ''): TransferFormState => ({
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

const formatCurrencyInput = (value: string) => {
  const parsed = parseCurrencyInput(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return '';
  return parsed.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatDate = (value?: string) =>
  value ? new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR') : '-';

const accountLabel = (account: ContaBancaria) =>
  `${account.banco} - ${account.conta}`;

const accountOptionLabel = (account: ContaBancaria) =>
  `${accountLabel(account)} - Saldo: ${formatCurrency(account.saldoAtual || 0)}`;

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
  const [editingTransfer, setEditingTransfer] = useState<TransferenciaConta | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TransferenciaConta | null>(null);
  const pageSize = 8;

  useFinanceiroRealtime();

  const sessionPoloId = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return sessionStorage.getItem('current_polo_id') || sessionStorage.getItem('active_polo_id') || '';
  }, []);

  const { accountsQuery, polosQuery } = useFinanceiroSharedQueries({ partners: false });
  const accounts = accountsQuery.data || [];
  const polos = polosQuery.data || [];
  const activePoloId = poloId || sessionPoloId || polos[0]?.id || '';
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

  const { transferenciasQuery } = useTransferenciasQueries(filters);
  const transferencias = transferenciasQuery.data || [];
  const isLoading = transferenciasQuery.isLoading || accountsQuery.isLoading || polosQuery.isLoading;

  const kpis = useMemo(() => {
    const total = transferencias.reduce((s, i) => s + i.valor, 0);
    const count = transferencias.length;
    return { total, count };
  }, [transferencias]);

  const activeAccounts = useMemo(
    () => accounts.filter((account) => account.ativo !== false),
    [accounts],
  );

  const filterAccounts = useMemo(
    () => activeAccounts.filter((account) => !activePoloId || account.poloId === activePoloId),
    [activeAccounts, activePoloId],
  );

  const originAccounts = useMemo(
    () => activeAccounts.filter((account) => !form.poloOrigemId || account.poloId === form.poloOrigemId),
    [activeAccounts, form.poloOrigemId],
  );

  const destinationAccounts = useMemo(
    () => activeAccounts.filter((account) => !form.poloDestinoId || account.poloId === form.poloDestinoId),
    [activeAccounts, form.poloDestinoId],
  );

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
    if (form.contaOrigemId && !originAccounts.some((account) => account.id === form.contaOrigemId)) {
      setForm((current) => ({ ...current, contaOrigemId: '' }));
    }
  }, [form.contaOrigemId, originAccounts]);

  useEffect(() => {
    if (form.contaDestinoId && !destinationAccounts.some((account) => account.id === form.contaDestinoId)) {
      setForm((current) => ({ ...current, contaDestinoId: '' }));
    }
  }, [destinationAccounts, form.contaDestinoId]);

  const invalidateTransferencias = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.transferenciasRoot }),
      queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.contasBancariasSaldos }),
      queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.resumoKpis }),
      queryClient.invalidateQueries({ queryKey: ['caixa-dashboard-data'] }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: async (input: TransferenciaInput) => {
      if (editingTransfer?.id) {
        await financeiroService.updateTransferencia(editingTransfer.id, input);
      } else {
        await financeiroService.createTransferencia(input);
      }
    },
    onSuccess: async () => {
      await invalidateTransferencias();
      setIsModalOpen(false);
      setEditingTransfer(null);
      setForm(createEmptyForm(activePoloId));
      toast.success(
        editingTransfer ? 'Transferência atualizada' : 'Transferência registrada',
        'Os saldos serão recalculados pelo banco na próxima atualização.',
      );
    },
    onError: (error: any) => toast.error('Erro na transferência', error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => financeiroService.deleteTransferencia(id),
    onSuccess: async () => {
      await invalidateTransferencias();
      setDeleteTarget(null);
      toast.success('Transferência excluída', 'O lançamento foi removido e os saldos serão recompostos.');
    },
    onError: (error: any) => toast.error('Erro ao excluir', error.message),
  });

  const openCreateModal = () => {
    setEditingTransfer(null);
    setForm(createEmptyForm(activePoloId));
    setIsModalOpen(true);
  };

  const openEditModal = (transfer: TransferenciaConta) => {
    setEditingTransfer(transfer);
    setForm({
      dataTransferencia: transfer.dataTransferencia || today(),
      observacao: transfer.observacao || '',
      valor: formatCurrencyInput(String(transfer.valor)),
      poloOrigemId: transfer.poloId || activePoloId,
      contaOrigemId: transfer.contaOrigemId,
      poloDestinoId: transfer.poloDestinoId || transfer.poloId || activePoloId,
      contaDestinoId: transfer.contaDestinoId,
    });
    setIsModalOpen(true);
  };

  const buildTransferInput = (): TransferenciaInput | null => {
    const numericValue = parseCurrencyInput(form.valor);

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
    if (form.contaOrigemId === form.contaDestinoId) {
      toast.warning('Contas iguais', 'A conta de destino precisa ser diferente da origem.');
      return null;
    }
    if (!numericValue || numericValue <= 0) {
      toast.warning('Valor inválido', 'Informe um valor maior que zero.');
      return null;
    }

    return {
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
    const input = buildTransferInput();
    if (!input) return;
    saveMutation.mutate(input);
  };

  const renderPoloOption = (polo: any) => (
    <option key={polo.id} value={polo.id}>
      {polo.is_matriz ? 'Matriz' : 'Polo'} - {polo.nome}
      {polo.cidade ? ` (${polo.cidade}/${polo.estado || ''})` : ''}
    </option>
  );

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
          { label: 'Total Transferido', value: formatCurrency(kpis.total), color: 'text-[#001a33]' },
          { label: 'Quantidade', value: `${kpis.count} transferências`, color: 'text-indigo-600' },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1">{kpi.label}</p>
            <p className={`text-lg font-black ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs de período */}
      <div className="flex gap-2 border-b border-slate-100 pb-2">
        {[
          { id: 'current_month' as const, label: 'Mês Atual' },
          { id: 'all' as const, label: 'Todos' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setPeriodScope(tab.id)}
            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all border ${
              periodScope === tab.id
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                : 'text-slate-500 border-transparent hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

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

      <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center gap-3 py-20">
            <Loader2 className="animate-spin text-[#001a33]" size={22} />
            <span className="text-sm font-bold text-slate-500">Carregando transferências...</span>
          </div>
        ) : transferencias.length === 0 ? (
          <div className="py-20 text-center">
            <ArrowRightLeft className="mx-auto mb-3 text-slate-300" size={36} />
            <p className="text-sm font-black uppercase tracking-wider text-slate-500">Nenhuma transferência encontrada</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left">
              <thead className="bg-slate-50">
                <tr>
                  {['Data / descrição', 'Origem', 'Destino', 'Valor', 'Ações'].map((head) => (
                    <th key={head} className="px-5 py-4 text-[10px] font-black uppercase tracking-wider text-slate-500">
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageItems.map((transfer, index) => (
                  <tr
                    key={transfer.id}
                    className={`${
                      index % 2 === 0 ? 'bg-white' : 'bg-[#eef6ff]'
                    } transition-colors hover:bg-[#dfeeff]`}
                  >
                    <td className="px-5 py-4">
                      <p className="text-xs font-black text-[#001a33]">{formatDate(transfer.dataTransferencia)}</p>
                      <p className="mt-1 text-sm font-bold text-slate-700">{transfer.observacao || 'Transferência interna'}</p>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
                          <Landmark size={16} />
                        </span>
                        <div>
                          <p className="text-xs font-black uppercase text-[#001a33]">{transfer.contaOrigemNome}</p>
                          <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {transfer.poloNome || 'Polo não informado'}
                          </p>
                          <p className="text-[10px] font-bold text-slate-400">
                            Ag. {transfer.contaOrigemAgencia || '-'} / Conta {transfer.contaOrigemConta || '-'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                          <Landmark size={16} />
                        </span>
                        <div>
                          <p className="text-xs font-black uppercase text-[#001a33]">{transfer.contaDestinoNome}</p>
                          <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {transfer.poloDestinoNome || 'Polo não informado'}
                          </p>
                          <p className="text-[10px] font-bold text-slate-400">
                            Ag. {transfer.contaDestinoAgencia || '-'} / Conta {transfer.contaDestinoConta || '-'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-lg font-black text-[#001a33]">{formatCurrency(transfer.valor)}</p>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => openEditModal(transfer)}
                          className="inline-flex items-center gap-1 rounded-xl border border-blue-200 px-3 py-2 text-[10px] font-black uppercase text-blue-600 hover:bg-blue-50"
                        >
                          <Pencil size={13} /> Editar
                        </button>
                        <button
                          onClick={() => setDeleteTarget(transfer)}
                          className="inline-flex items-center gap-1 rounded-xl border border-rose-200 px-3 py-2 text-[10px] font-black uppercase text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 size={13} /> Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-bold text-slate-400">
            Mostrando {pageItems.length} de {transferencias.length} lançamento(s)
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={currentPage === 1}
              className="rounded-xl border border-slate-200 p-2 text-slate-500 disabled:opacity-40"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-black text-slate-500">{currentPage} / {totalPages}</span>
            <button
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={currentPage === totalPages}
              className="rounded-xl border border-slate-200 p-2 text-slate-500 disabled:opacity-40"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {isModalOpen && typeof document !== 'undefined' && createPortal((
        <div className="fixed inset-0 z-[9999] flex min-h-[100dvh] items-center justify-center bg-[#001a33]/70 p-4 backdrop-blur-sm">
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-5xl overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                  {editingTransfer ? 'Editar lançamento' : 'Nova transferência'}
                </p>
                <h4 className="text-xl font-black uppercase tracking-tight text-[#001a33]">Transferência entre contas</h4>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="rounded-xl bg-slate-100 p-2 text-slate-500 hover:bg-slate-200">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid gap-4 md:grid-cols-[1fr_1.2fr_0.8fr]">
                <label className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Data</span>
                  <input
                    type="date"
                    value={form.dataTransferencia}
                    onChange={(event) => setForm((current) => ({ ...current, dataTransferencia: event.target.value }))}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 outline-none focus:border-slate-400 focus:bg-white"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Descrição</span>
                  <input
                    value={form.observacao}
                    onChange={(event) => setForm((current) => ({ ...current, observacao: event.target.value }))}
                    placeholder="Ex.: Repasse para conta operacional"
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 outline-none focus:border-slate-400 focus:bg-white"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Valor</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form.valor}
                    onChange={(event) => setForm((current) => ({ ...current, valor: normalizeCurrencyInput(event.target.value) }))}
                    onBlur={() => setForm((current) => ({ ...current, valor: formatCurrencyInput(current.valor) }))}
                    placeholder="0,00"
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 outline-none focus:border-slate-400 focus:bg-white"
                  />
                </label>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-3xl border border-rose-100 bg-rose-50/50 p-4">
                  <div className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-rose-700">
                    <Landmark size={15} /> Origem
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Polo</span>
                      <select
                        value={form.poloOrigemId}
                        onChange={(event) => setForm((current) => ({
                          ...current,
                          poloOrigemId: event.target.value,
                          contaOrigemId: '',
                        }))}
                        className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 outline-none focus:border-rose-300"
                      >
                        <option value="">Selecione</option>
                        {polos.map(renderPoloOption)}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Conta bancária</span>
                      <select
                        value={form.contaOrigemId}
                        onChange={(event) => setForm((current) => ({ ...current, contaOrigemId: event.target.value }))}
                        className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 outline-none focus:border-rose-300"
                      >
                        <option value="">Selecione</option>
                        {originAccounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {accountOptionLabel(account)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

                <div className="rounded-3xl border border-emerald-100 bg-emerald-50/50 p-4">
                  <div className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-emerald-700">
                    <Landmark size={15} /> Destino
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Polo</span>
                      <select
                        value={form.poloDestinoId}
                        onChange={(event) => setForm((current) => ({
                          ...current,
                          poloDestinoId: event.target.value,
                          contaDestinoId: '',
                        }))}
                        className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-300"
                      >
                        <option value="">Selecione</option>
                        {polos.map(renderPoloOption)}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Conta bancária</span>
                      <select
                        value={form.contaDestinoId}
                        onChange={(event) => setForm((current) => ({ ...current, contaDestinoId: event.target.value }))}
                        className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-300"
                      >
                        <option value="">Selecione</option>
                        {destinationAccounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {accountOptionLabel(account)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-2xl border border-slate-200 px-5 py-3 text-xs font-black uppercase tracking-wider text-slate-500 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#001a33] px-6 py-3 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-slate-900/15 disabled:opacity-50"
                >
                  {saveMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                  {editingTransfer ? 'Salvar edição' : 'Salvar transferência'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ), document.body)}

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget?.id) deleteMutation.mutate(deleteTarget.id);
        }}
        title="Excluir transferência?"
        message="O lançamento será removido da movimentação interna."
        confirmText="Excluir"
        variant="warning"
      />
    </div>
  );
};

export default TransferenciasTab;
