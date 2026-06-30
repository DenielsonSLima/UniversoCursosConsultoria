// File: modules/gestor/financeiro/outros-creditos/OutrosCreditosTab.tsx

import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Landmark,
  Link as LinkIcon,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  WalletCards,
  X,
} from 'lucide-react';
import { financeiroService, ContasReceber } from '../financeiro.service';
import { asaasIntegrationService } from '../../../asaas/asaas.service';
import ToastNotification, { useToast } from '../../components/ToastNotification';
import { financeiroQueryKeys } from '../financeiro.queryKeys';
import { useFinanceiroRealtime } from '../hooks/useFinanceiroRealtime';
import { useFinanceiroSharedQueries } from '../hooks/useFinanceiroSharedQueries';
import { useOutrosCreditosQueries } from './hooks/useOutrosCreditosQueries';

type StatusScope = 'received' | 'pending' | 'canceled' | 'all';
type CreditMode = 'LOCAL_PAGO' | 'LOCAL_RECEBER' | 'ASAAS';
type OtherCreditGroupMode = 'partner' | 'polo' | 'none';

interface OutrosCreditosTabProps {
  poloId?: string | null;
}

const today = () => new Date().toISOString().slice(0, 10);

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

const statusClass = (status: string) => {
  if (status === 'PAGO') return 'bg-emerald-50 text-emerald-700';
  if (status === 'VENCIDO') return 'bg-rose-50 text-rose-700';
  if (status === 'CANCELADO' || status === 'ESTORNADO') return 'bg-slate-100 text-slate-500';
  return 'bg-amber-50 text-amber-700';
};

const origemLabel = (item: ContasReceber) => {
  if (item.origemPagamento === 'ASAAS' || item.asaasPaymentId || item.asaasPaymentLinkId) return 'Asaas';
  if (item.origemPagamento === 'PRESENCIAL') return 'Local/Caixa';
  return 'Conta local';
};

const OutrosCreditosTab: React.FC<OutrosCreditosTabProps> = ({ poloId: scopedPoloId }) => {
  const queryClient = useQueryClient();
  const { toasts, removeToast, toast } = useToast();
  const [statusScope, setStatusScope] = useState<StatusScope>('pending');
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [groupMode, setGroupMode] = useState<OtherCreditGroupMode>('partner');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const pageSize = 8;

  const [mode, setMode] = useState<CreditMode>('LOCAL_PAGO');
  const [description, setDescription] = useState('');
  const [value, setValue] = useState('');
  const [dueDate, setDueDate] = useState(today());
  const [poloId, setPoloId] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'PIX' | 'BOLETO' | 'CARTAO' | 'DINHEIRO'>('PIX');
  const [receiveItem, setReceiveItem] = useState<ContasReceber | null>(null);
  const [receiveAccountId, setReceiveAccountId] = useState('');
  const [receiveMethod, setReceiveMethod] = useState<'PIX' | 'BOLETO' | 'CARTAO' | 'DINHEIRO'>('PIX');
  const [receiveDate, setReceiveDate] = useState(today());
  const [receiveValue, setReceiveValue] = useState('');

  useFinanceiroRealtime();

  const summaryFilters = useMemo(() => ({
    search,
    dueStart: startDate,
    dueEnd: endDate,
  }), [endDate, search, startDate]);

  const { creditsQuery, summaryQuery } = useOutrosCreditosQueries(summaryFilters);
  const { accountsQuery, polosQuery, partnersQuery } = useFinanceiroSharedQueries();

  const credits = creditsQuery.data || [];
  const polos = polosQuery.data || [];
  const accounts = accountsQuery.data || [];
  const partners = partnersQuery.data || [];
  const isLoading = creditsQuery.isLoading;
  const sessionPoloId = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return sessionStorage.getItem('current_polo_id') || sessionStorage.getItem('active_polo_id') || '';
  }, []);
  const effectivePoloId = scopedPoloId || poloId || sessionPoloId || polos[0]?.id || '';
  const activePolo = polos.find((polo: any) => polo.id === effectivePoloId);
  const activeAccounts = useMemo(
    () => accounts.filter((account) => account.ativo !== false && (!effectivePoloId || account.poloId === effectivePoloId)),
    [accounts, effectivePoloId],
  );
  const receiveAccounts = useMemo(() => {
    const receivePoloId = receiveItem?.poloId || effectivePoloId;
    return accounts.filter((account) => account.ativo !== false && (!receivePoloId || account.poloId === receivePoloId));
  }, [accounts, effectivePoloId, receiveItem?.poloId]);

  const createMutation = useMutation({
    mutationFn: () => financeiroService.createOtherCredit({
      poloId: effectivePoloId,
      descricao: description.trim(),
      valor: parseCurrencyInput(value),
      dataVencimento: dueDate,
      clienteId: partnerId || undefined,
      formaPagamento: mode === 'LOCAL_PAGO' ? paymentMethod : undefined,
      contaBancariaId: mode === 'LOCAL_PAGO' ? accountId : undefined,
      markAsPaid: mode === 'LOCAL_PAGO',
      generateAsaas: mode === 'ASAAS',
    }),
    onSuccess: async (created) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.outrosCreditosRoot }),
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.resumoKpis }),
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.contasBancariasSaldos }),
      ]);
      setIsModalOpen(false);
      resetForm();
      toast.success(
        mode === 'ASAAS' ? 'Crédito e link criados' : 'Crédito registrado',
        mode === 'ASAAS' && created.asaasInvoiceUrl
          ? 'A cobrança foi enviada ao Asaas e o link já está disponível.'
          : 'O lançamento foi salvo em Outros Créditos.',
      );
    },
    onError: (error: any) => toast.error('Erro ao criar crédito', error.message),
  });

  const syncMutation = useMutation({
    mutationFn: (id: string) => asaasIntegrationService.syncReceivable(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.outrosCreditosRoot });
      toast.success('Cobrança enviada', 'O link Asaas foi gerado ou atualizado.');
    },
    onError: (error: any) => toast.error('Erro no Asaas', error.message),
  });

  const refreshMutation = useMutation({
    mutationFn: (id: string) => asaasIntegrationService.refreshReceivableStatus(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.outrosCreditosRoot });
      toast.success('Status atualizado', 'A cobrança foi consultada no Asaas.');
    },
    onError: (error: any) => toast.error('Erro ao atualizar', error.message),
  });

  const receiveMutation = useMutation({
    mutationFn: () => financeiroService.markReceivablePaid(receiveItem!.id!, {
      contaBancariaId: receiveAccountId,
      valorPago: parseCurrencyInput(receiveValue || String(receiveItem?.valor || 0)),
      dataPagamento: receiveDate,
      formaPagamento: receiveMethod,
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.outrosCreditosRoot }),
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.resumoKpis }),
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.contasBancariasSaldos }),
      ]);
      toast.success(
        'Recebimento confirmado',
        receiveItem?.asaasPaymentId || receiveItem?.asaasPaymentLinkId
          ? 'A baixa manual foi registrada e a cobrança no Asaas foi cancelada.'
          : 'O crédito foi baixado na conta/caixa selecionada.',
      );
      setReceiveItem(null);
      setReceiveAccountId('');
      setReceiveMethod('PIX');
      setReceiveDate(today());
      setReceiveValue('');
    },
    onError: (error: any) => toast.error('Erro ao confirmar recebimento', error.message),
  });

  const resetForm = () => {
    setMode('LOCAL_PAGO');
    setDescription('');
    setValue('');
    setDueDate(today());
    setPoloId(effectivePoloId);
    setPartnerId('');
    setAccountId('');
    setPaymentMethod('PIX');
  };

  const baseFiltered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return credits.filter((item) => {
      const matchesStart = !startDate || item.dataVencimento >= startDate;
      const matchesEnd = !endDate || item.dataVencimento <= endDate;
      const matchesSearch = !term || [
        item.descricao,
        item.clienteNome,
        item.clienteCpfCnpj,
        item.poloNome,
        item.poloCnpj,
        item.poloCidade,
        item.poloUf,
        item.formaPagamento,
        item.asaasStatus,
      ].some((field) => field?.toLocaleLowerCase('pt-BR').includes(term));

      return matchesStart && matchesEnd && matchesSearch;
    });
  }, [credits, search, startDate, endDate]);

  const filtered = useMemo(() => {
    if (statusScope === 'received') return baseFiltered.filter((item) => item.status === 'PAGO');
    if (statusScope === 'pending') return baseFiltered.filter((item) => ['PENDENTE', 'VENCIDO'].includes(item.status));
    if (statusScope === 'canceled') return baseFiltered.filter((item) => ['CANCELADO', 'ESTORNADO'].includes(item.status));
    return baseFiltered;
  }, [baseFiltered, statusScope]);

  const totals = {
    received: summaryQuery.data?.receivedCount || 0,
    pending: summaryQuery.data?.pendingCount || 0,
    canceled: summaryQuery.data?.canceledCount || 0,
    all: summaryQuery.data?.allCount || 0,
    receivedValue: summaryQuery.data?.receivedValue || 0,
    pendingValue: summaryQuery.data?.pendingValue || 0,
  };

  const kpis = useMemo(() => {
    const total = baseFiltered.reduce((s, i) => s + i.valor, 0);
    const recebido = baseFiltered.filter((i) => i.status === 'PAGO').reduce((s, i) => s + (i.valorPago ?? i.valor), 0);
    const aReceber = baseFiltered.filter((i) => ['PENDENTE', 'VENCIDO'].includes(i.status)).reduce((s, i) => s + i.valor, 0);
    const vencidos = baseFiltered.filter((i) => i.status === 'VENCIDO').length;
    return { total, recebido, aReceber, vencidos };
  }, [baseFiltered]);

  const allGroups = useMemo(() => {
    if (groupMode === 'none') return [];

    const groups = new Map<string, ContasReceber[]>();
    filtered.forEach((item) => {
      const key = groupMode === 'partner'
        ? item.clienteId || item.clienteNome || item.descricao || 'Entrada sem parceiro'
        : item.poloId || item.poloNome || 'Polo não informado';
      groups.set(key, [...(groups.get(key) || []), item]);
    });

    return Array.from(groups.entries()).map(([key, items]) => ({
      key,
      label: groupMode === 'partner'
        ? items[0]?.clienteNome || 'Entrada sem parceiro'
        : items[0]?.poloNome || 'Polo não informado',
      items,
    }));
  }, [filtered, groupMode]);

  const totalItems = groupMode === 'none' ? filtered.length : allGroups.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = groupMode === 'none'
    ? filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    : [];
  const pageGroups = groupMode === 'none'
    ? []
    : allGroups.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [statusScope, search, startDate, endDate, groupMode]);

  useEffect(() => {
    setExpandedGroups(new Set());
  }, [statusScope, search, startDate, endDate, groupMode]);

  useEffect(() => {
    const nextPoloId = scopedPoloId || sessionPoloId || polos[0]?.id || '';
    if (nextPoloId && poloId !== nextPoloId) setPoloId(nextPoloId);
  }, [polos, poloId, scopedPoloId, sessionPoloId]);

  useEffect(() => {
    if (mode !== 'LOCAL_PAGO') {
      if (accountId) setAccountId('');
      return;
    }
    if (accountId && !activeAccounts.some((account) => account.id === accountId)) {
      setAccountId('');
    }
  }, [accountId, activeAccounts, mode]);

  useEffect(() => {
    if (receiveAccountId && !receiveAccounts.some((account) => account.id === receiveAccountId)) {
      setReceiveAccountId('');
    }
  }, [receiveAccountId, receiveAccounts]);

  const validateAndSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const numericValue = parseCurrencyInput(value);
    if (!description.trim()) {
      toast.warning('Descrição obrigatória', 'Informe a origem do crédito.');
      return;
    }
    if (!numericValue || numericValue <= 0) {
      toast.warning('Valor inválido', 'Informe um valor maior que zero.');
      return;
    }
    if (!effectivePoloId) {
      toast.warning('Polo ativo obrigatório', 'Selecione uma unidade no topo do portal antes de lançar o crédito.');
      return;
    }
    if (mode === 'LOCAL_PAGO' && !accountId) {
      toast.warning('Conta obrigatória', 'Selecione a conta/caixa onde o valor entrou.');
      return;
    }
    createMutation.mutate();
  };

  const copyLink = async (item: ContasReceber) => {
    if (!item.asaasInvoiceUrl) {
      toast.info('Sem link', 'Gere ou atualize a cobrança no Asaas primeiro.');
      return;
    }
    await navigator.clipboard.writeText(item.asaasInvoiceUrl);
    toast.success('Link copiado', 'Envie o link ao parceiro pelo canal de atendimento.');
  };

  const openReceiveModal = (item: ContasReceber) => {
    setReceiveItem(item);
    setReceiveValue(formatCurrencyInput(String(item.valor)));
    setReceiveDate(today());
    setReceiveMethod('PIX');
    setReceiveAccountId('');
  };

  const confirmReceive = (event: React.FormEvent) => {
    event.preventDefault();
    const numericValue = parseCurrencyInput(receiveValue);
    if (!receiveItem) return;
    if (!receiveAccountId) {
      toast.warning('Conta obrigatória', 'Selecione a conta/caixa que recebeu o valor.');
      return;
    }
    if (!numericValue || numericValue <= 0) {
      toast.warning('Valor inválido', 'Informe um valor recebido maior que zero.');
      return;
    }
    receiveMutation.mutate();
  };

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const toggleGroup = (key: string) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const getGroupSummary = (items: ContasReceber[]) => {
    const sortedByDue = [...items].sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento));
    const pendingItems = items.filter((item) => ['PENDENTE', 'VENCIDO'].includes(item.status));
    const receivedItems = items.filter((item) => item.status === 'PAGO');
    const canceledItems = items.filter((item) => ['CANCELADO', 'ESTORNADO'].includes(item.status));

    return {
      pendingCount: pendingItems.length,
      receivedCount: receivedItems.length,
      canceledCount: canceledItems.length,
      nextDue: sortedByDue.find((item) => item.status !== 'PAGO' && !['CANCELADO', 'ESTORNADO'].includes(item.status))?.dataVencimento || sortedByDue[0]?.dataVencimento || '',
      first: items[0],
    };
  };

  const renderCreditRow = (item: ContasReceber, index: number) => (
    <tr key={item.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-emerald-50/45'} transition-colors hover:bg-emerald-50/75`}>
      <td className="px-5 py-4">
        <p className="text-sm font-black text-[#001a33]">{item.descricao}</p>
        <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-slate-400">Outros créditos</p>
      </td>
      <td className="px-5 py-4">
        <p className="text-xs font-bold text-slate-700">{item.clienteNome || 'Entrada sem parceiro'}</p>
        <p className="text-[10px] font-bold text-slate-400">{item.clienteCpfCnpj || 'CPF/CNPJ não vinculado'}</p>
        <p className="mt-1 text-[10px] font-bold uppercase text-slate-500">
          {item.poloNome} {item.poloCidade ? `- ${item.poloCidade}/${item.poloUf}` : ''}
        </p>
      </td>
      <td className="px-5 py-4 text-xs font-bold text-slate-600">
        {formatDate(item.dataVencimento)}
        {item.dataPagamento && <p className="mt-1 text-[10px] text-emerald-700">Recebido: {formatDate(item.dataPagamento)}</p>}
      </td>
      <td className="px-5 py-4">
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${statusClass(item.status)}`}>
          {item.status === 'PAGO' ? <CheckCircle2 size={12} /> : <Banknote size={12} />}
          {item.status}
        </span>
        <p className="mt-1 text-[10px] font-bold text-slate-500">Origem: {origemLabel(item)}</p>
        <p className="text-[10px] font-bold text-slate-500">Forma: {item.formaPagamento || (item.asaasPaymentId || item.asaasPaymentLinkId ? 'Link Asaas' : 'Não definida')}</p>
        {item.asaasStatus && <p className="text-[10px] font-black uppercase text-blue-500">Asaas: {item.asaasStatus}</p>}
      </td>
      <td className="px-5 py-4">
        <p className="text-lg font-black text-[#001a33]">{formatCurrency(item.valor)}</p>
        {item.valorPago !== undefined && <p className="text-[10px] font-bold text-emerald-700">Recebido: {formatCurrency(item.valorPago)}</p>}
      </td>
      <td className="px-5 py-4">
        <div className="flex flex-wrap gap-2">
          {item.status !== 'PAGO' && !['CANCELADO', 'ESTORNADO'].includes(item.status) && (
            <button
              onClick={() => openReceiveModal(item)}
              className="inline-flex items-center gap-1 rounded-xl bg-[#001a33] px-3 py-2 text-[10px] font-black uppercase text-white hover:bg-[#062849]"
            >
              <CheckCircle2 size={13} /> Receber
            </button>
          )}
          {!item.asaasPaymentId && !item.asaasPaymentLinkId && item.status !== 'PAGO' && !['CANCELADO', 'ESTORNADO'].includes(item.status) && (
            <button
              onClick={() => syncMutation.mutate(item.id!)}
              disabled={syncMutation.isPending}
              className="inline-flex items-center gap-1 rounded-xl border border-blue-200 px-3 py-2 text-[10px] font-black uppercase text-blue-600 hover:bg-blue-50 disabled:opacity-50"
            >
              <LinkIcon size={13} /> Gerar link
            </button>
          )}
          {(item.asaasPaymentId || item.asaasPaymentLinkId) && item.status !== 'PAGO' && !['CANCELADO', 'ESTORNADO'].includes(item.status) && (
            <button
              onClick={() => refreshMutation.mutate(item.id!)}
              disabled={refreshMutation.isPending}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black uppercase text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw size={13} /> Atualizar
            </button>
          )}
          <button
            onClick={() => copyLink(item)}
            className="rounded-xl border border-emerald-200 p-2 text-emerald-700 hover:bg-emerald-50"
            title="Copiar link Asaas"
          >
            <Copy size={14} />
          </button>
          {item.asaasInvoiceUrl && (
            <a
              href={item.asaasInvoiceUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-blue-200 p-2 text-blue-600 hover:bg-blue-50"
              title="Abrir cobrança"
            >
              <ExternalLink size={14} />
            </a>
          )}
        </div>
      </td>
    </tr>
  );

  return (
    <div className="animate-fadeIn space-y-6">
      <ToastNotification toasts={toasts} onRemove={removeToast} />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-emerald-600">
            <Banknote size={16} /> Entradas avulsas
          </p>
          <h3 className="text-2xl font-black uppercase tracking-tight text-[#001a33]">Outros Créditos</h3>
          <p className="mt-1 max-w-2xl text-sm font-medium text-slate-500">
            Registre juros recebidos, rendimentos, entradas de caixa e créditos avulsos, com opção local ou link Asaas.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-emerald-900/15 hover:bg-emerald-700"
        >
          <Plus size={16} /> Novo crédito
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Previsto', value: formatCurrency(kpis.total), color: 'text-[#001a33]' },
          { label: 'Recebido', value: formatCurrency(kpis.recebido), color: 'text-emerald-600' },
          { label: 'A Receber', value: formatCurrency(kpis.aReceber), color: 'text-amber-600' },
          { label: 'Vencidos', value: `${kpis.vencidos}`, color: 'text-rose-600' },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1">{kpi.label}</p>
            <p className={`text-lg font-black ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs de status */}
      <div className="flex gap-2 border-b border-slate-100 pb-2">
        {[
          { id: 'pending' as const, label: 'A receber', count: totals.pending },
          { id: 'received' as const, label: 'Recebidos', count: totals.received },
          { id: 'canceled' as const, label: 'Cancelados', count: totals.canceled },
          { id: 'all' as const, label: 'Todos', count: totals.all },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setStatusScope(tab.id)}
            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all border flex items-center gap-2 ${
              statusScope === tab.id
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                : 'text-slate-500 border-transparent hover:bg-slate-50'
            }`}
          >
            <span>{tab.label}</span>
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${statusScope === tab.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
              {tab.count}
            </span>
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
            placeholder="Buscar descrição, parceiro, CPF, polo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
          />
        </div>

        {/* Data Início */}
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
          title="Vencimento Inicial"
        />

        {/* Data Fim */}
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
          title="Vencimento Final"
        />

        {/* Agrupamento */}
        <select
          value={groupMode}
          onChange={(e) => setGroupMode(e.target.value as OtherCreditGroupMode)}
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
        >
          <option value="partner">Agrupar por parceiro</option>
          <option value="polo">Agrupar por polo</option>
          <option value="none">Sem agrupamento</option>
        </select>

        {/* Limpar Filtros */}
        {(search || startDate || endDate) && (
          <button
            onClick={() => {
              setSearch('');
              setStartDate('');
              setEndDate('');
            }}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl text-xs font-bold uppercase transition-colors"
          >
            Limpar
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center gap-3 py-16">
            <Loader2 className="animate-spin text-emerald-600" size={22} />
            <span className="text-sm font-bold text-slate-500">Carregando outros créditos...</span>
          </div>
        ) : totalItems === 0 ? (
          <div className="py-16 text-center">
            <WalletCards className="mx-auto mb-3 text-slate-300" size={34} />
            <p className="text-sm font-black uppercase tracking-wider text-slate-500">Nenhum crédito encontrado</p>
            <p className="mt-1 text-xs font-medium text-slate-400">Ajuste os filtros ou registre uma nova entrada.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left">
              <thead className="bg-slate-50">
                <tr>
                  {['Crédito', 'Parceiro / Polo', 'Vencimento', 'Origem', 'Valor', 'Ações'].map((header) => (
                    <th key={header} className="px-5 py-4 text-[10px] font-black uppercase tracking-wider text-slate-500">{header}</th>
                  ))}
                </tr>
              </thead>
              {groupMode === 'none' ? (
                <tbody className="divide-y divide-slate-100">
                  {pageItems.map((item, index) => renderCreditRow(item, index))}
                </tbody>
              ) : pageGroups.map((group) => {
                const isExpanded = expandedGroups.has(group.key);
                const summary = getGroupSummary(group.items);
                const first = summary.first;

                return (
                  <tbody key={group.key} className="divide-y divide-slate-100">
                    <tr className="bg-slate-50/80 transition-colors hover:bg-emerald-50/65">
                      <td colSpan={6} className="p-0">
                        <button
                          type="button"
                          onClick={() => toggleGroup(group.key)}
                          className="grid w-full grid-cols-[minmax(260px,1.5fr)_minmax(160px,0.8fr)_minmax(170px,0.9fr)_minmax(130px,0.7fr)] items-center gap-4 px-5 py-4 text-left"
                        >
                          <span className="flex min-w-0 items-center gap-3">
                            <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl ${
                              isExpanded ? 'bg-[#001a33] text-white' : 'bg-white text-slate-500'
                            }`}>
                              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-black text-[#001a33]">{group.label}</span>
                              <span className="mt-1 block truncate text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                {groupMode === 'partner'
                                  ? first?.clienteCpfCnpj || 'CPF/CNPJ não vinculado'
                                  : `${first?.poloCnpj || 'CNPJ não informado'} · ${first?.poloCidade || 'Cidade não informada'} / ${first?.poloUf || 'UF'}`}
                              </span>
                            </span>
                          </span>

                          <span className="text-xs font-bold text-slate-600">
                            <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">Lançamentos</span>
                            {group.items.length} crédito(s)
                          </span>

                          <span className="text-xs font-bold text-slate-600">
                            <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">Situação</span>
                            {summary.pendingCount} pend. · {summary.receivedCount} rec. · {summary.canceledCount} canc.
                          </span>

                          <span className="text-right text-xs font-bold text-slate-600">
                            <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">Próximo vencimento</span>
                            <span className="text-[10px] text-slate-400">{summary.nextDue ? formatDate(summary.nextDue) : '—'}</span>
                          </span>
                        </button>
                      </td>
                    </tr>
                    {isExpanded && group.items.map((item, index) => renderCreditRow(item, index))}
                  </tbody>
                );
              })}
            </table>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-bold text-slate-400">
            {groupMode === 'none'
              ? `Mostrando ${pageItems.length} de ${filtered.length} crédito(s)`
              : `Mostrando ${pageGroups.length} de ${allGroups.length} grupo(s), ${filtered.length} crédito(s)`}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={currentPage <= 1}
              className="rounded-xl border border-slate-200 p-2 text-slate-500 disabled:opacity-40"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-black text-slate-600">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              disabled={currentPage >= totalPages}
              className="rounded-xl border border-slate-200 p-2 text-slate-500 disabled:opacity-40"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[120] flex min-h-screen items-center justify-center bg-[#001a33]/65 p-4 backdrop-blur-sm">
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-4xl overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-600">Novo crédito</p>
                <h4 className="text-xl font-black uppercase tracking-tight text-[#001a33]">Registrar entrada avulsa</h4>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="rounded-xl bg-slate-100 p-2 text-slate-500 hover:bg-slate-200">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={validateAndSubmit} className="space-y-5">
              <div className="grid gap-3 md:grid-cols-3">
                {[
                  { id: 'LOCAL_PAGO' as const, label: 'Receber agora', desc: 'Entrada local no caixa/conta', icon: Landmark },
                  { id: 'LOCAL_RECEBER' as const, label: 'A receber local', desc: 'Cria conta pendente sem Asaas', icon: WalletCards },
                  { id: 'ASAAS' as const, label: 'Link Asaas', desc: 'Exige parceiro cadastrado', icon: LinkIcon },
                ].map((option) => {
                  const Icon = option.icon;
                  const active = mode === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setMode(option.id)}
                      className={`rounded-2xl border p-4 text-left transition-all ${
                        active ? 'border-emerald-300 bg-emerald-50 ring-2 ring-emerald-100' : 'border-slate-100 bg-slate-50 hover:bg-white'
                      }`}
                    >
                      <Icon className={active ? 'text-emerald-700' : 'text-slate-400'} size={20} />
                      <p className="mt-3 text-sm font-black text-[#001a33]">{option.label}</p>
                      <p className="mt-1 text-[11px] font-medium text-slate-500">{option.desc}</p>
                    </button>
                  );
                })}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1 md:col-span-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Descrição</span>
                  <input
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Ex.: Juros de aplicação, rendimento de conta, entrada eventual..."
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-400 focus:bg-white"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Valor</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={value}
                    onChange={(event) => setValue(normalizeCurrencyInput(event.target.value))}
                    onBlur={() => setValue((current) => formatCurrencyInput(current))}
                    placeholder="0,00"
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-400 focus:bg-white"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    {mode === 'LOCAL_PAGO' ? 'Data do recebimento' : 'Vencimento'}
                  </span>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-400 focus:bg-white"
                  />
                </label>
                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Unidade atual</span>
                  <div className="min-h-12 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                    <p className="text-sm font-black uppercase text-[#001a33]">
                      {activePolo?.nome || 'Unidade selecionada no topo'}
                    </p>
                    <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                      {activePolo?.cnpj ? `CNPJ: ${activePolo.cnpj}` : 'Polo vinculado ao usuário'}
                      {activePolo?.cidade ? ` - ${activePolo.cidade}/${activePolo.estado || activePolo.uf || ''}` : ''}
                    </p>
                  </div>
                </div>
                <label className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Parceiro (opcional)
                  </span>
                  <select
                    value={partnerId}
                    onChange={(event) => setPartnerId(event.target.value)}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-400"
                  >
                    <option value="">Sem parceiro vinculado</option>
                    {partners.map((partner: any) => (
                      <option key={partner.id} value={partner.id}>
                        {partner.nome} {partner.cpf_cnpj ? `- ${partner.cpf_cnpj}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                {mode === 'LOCAL_PAGO' && (
                  <>
                    <label className="space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Conta / caixa de entrada</span>
                      <select
                        value={accountId}
                        onChange={(event) => setAccountId(event.target.value)}
                        className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-400"
                      >
                        <option value="">Selecione a conta</option>
                        {activeAccounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.banco} - {account.conta} - Saldo: {formatCurrency(account.saldoAtual || 0)}
                          </option>
                        ))}
                      </select>
                      {activeAccounts.length === 0 && (
                        <p className="text-[10px] font-bold text-amber-600">Nenhuma conta ativa vinculada à unidade atual.</p>
                      )}
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Forma de recebimento</span>
                      <select
                        value={paymentMethod}
                        onChange={(event) => setPaymentMethod(event.target.value as any)}
                        className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-400"
                      >
                        <option value="PIX">Pix</option>
                        <option value="DINHEIRO">Dinheiro</option>
                        <option value="CARTAO">Cartão</option>
                        <option value="BOLETO">Boleto</option>
                      </select>
                    </label>
                  </>
                )}
              </div>

              {mode === 'ASAAS' && (
                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs font-semibold text-blue-700">
                  Para gerar link Asaas, o parceiro precisa estar cadastrado com CPF/CNPJ válido. O link ficará disponível na lista após salvar.
                </div>
              )}

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
                  disabled={createMutation.isPending}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-6 py-3 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-emerald-900/15 disabled:opacity-50"
                >
                  {createMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                  Salvar crédito
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {receiveItem && (
        <div className="fixed inset-0 z-[120] flex min-h-screen items-center justify-center bg-[#001a33]/65 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-600">Baixa manual</p>
                <h4 className="text-xl font-black uppercase tracking-tight text-[#001a33]">Confirmar recebimento</h4>
                <p className="mt-1 text-sm font-semibold text-slate-500">{receiveItem.descricao}</p>
              </div>
              <button onClick={() => setReceiveItem(null)} className="rounded-xl bg-slate-100 p-2 text-slate-500 hover:bg-slate-200">
                <X size={18} />
              </button>
            </div>

            {(receiveItem.asaasPaymentId || receiveItem.asaasPaymentLinkId) && (
              <div className="mb-4 rounded-2xl border border-amber-100 bg-amber-50 p-4 text-xs font-semibold text-amber-700">
                Esta cobrança possui link Asaas. Ao confirmar uma baixa manual, o sistema registra o recebimento local e cancela a cobrança no Asaas para evitar cobrança duplicada.
              </div>
            )}

            <form onSubmit={confirmReceive} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Valor recebido</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={receiveValue}
                    onChange={(event) => setReceiveValue(normalizeCurrencyInput(event.target.value))}
                    onBlur={() => setReceiveValue((current) => formatCurrencyInput(current))}
                    placeholder="0,00"
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-400 focus:bg-white"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Data do recebimento</span>
                  <input
                    type="date"
                    value={receiveDate}
                    onChange={(event) => setReceiveDate(event.target.value)}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-400 focus:bg-white"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Conta / caixa de entrada</span>
                  <select
                    value={receiveAccountId}
                    onChange={(event) => setReceiveAccountId(event.target.value)}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-400"
                  >
                    <option value="">Selecione a conta</option>
                    {receiveAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.banco} - {account.conta} - Saldo: {formatCurrency(account.saldoAtual || 0)}
                      </option>
                    ))}
                  </select>
                  {receiveAccounts.length === 0 && (
                    <p className="text-[10px] font-bold text-amber-600">Nenhuma conta ativa vinculada à unidade do lançamento.</p>
                  )}
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Forma de recebimento</span>
                  <select
                    value={receiveMethod}
                    onChange={(event) => setReceiveMethod(event.target.value as any)}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-400"
                  >
                    <option value="PIX">Pix</option>
                    <option value="DINHEIRO">Dinheiro</option>
                    <option value="CARTAO">Cartão</option>
                    <option value="BOLETO">Boleto</option>
                  </select>
                </label>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setReceiveItem(null)}
                  className="rounded-2xl border border-slate-200 px-5 py-3 text-xs font-black uppercase tracking-wider text-slate-500 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={receiveMutation.isPending}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#001a33] px-6 py-3 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-slate-900/15 disabled:opacity-50"
                >
                  {receiveMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                  Confirmar recebimento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default OutrosCreditosTab;
