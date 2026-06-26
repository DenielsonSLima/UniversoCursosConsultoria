// File: modules/gestor/financeiro/outros-creditos/OutrosCreditosTab.tsx

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  CheckCircle2,
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

type StatusScope = 'received' | 'pending' | 'all';
type CreditMode = 'LOCAL_PAGO' | 'LOCAL_RECEBER' | 'ASAAS';

const today = () => new Date().toISOString().slice(0, 10);

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

const formatDate = (value?: string) =>
  value ? new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR') : '-';

const statusClass = (status: string) => {
  if (status === 'PAGO') return 'bg-emerald-50 text-emerald-700';
  if (status === 'VENCIDO') return 'bg-rose-50 text-rose-700';
  if (status === 'CANCELADO' || status === 'ESTORNADO') return 'bg-slate-100 text-slate-500';
  return 'bg-amber-50 text-amber-700';
};

const origemLabel = (item: ContasReceber) => {
  if (item.origemPagamento === 'ASAAS' || item.asaasPaymentId) return 'Asaas';
  if (item.origemPagamento === 'PRESENCIAL') return 'Local/Caixa';
  return 'Conta local';
};

const OutrosCreditosTab: React.FC = () => {
  const queryClient = useQueryClient();
  const { toasts, removeToast, toast } = useToast();
  const [statusScope, setStatusScope] = useState<StatusScope>('pending');
  const [search, setSearch] = useState('');
  const [poloFilter, setPoloFilter] = useState('todos');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
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

  const { data: credits = [], isLoading } = useQuery({
    queryKey: ['financeiro-outros-creditos'],
    queryFn: () => financeiroService.getOutrosCreditos(),
    staleTime: 15_000,
  });

  const { data: polos = [] } = useQuery({
    queryKey: ['financeiro-polos'],
    queryFn: () => financeiroService.getPolos(),
    staleTime: 60_000,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['financeiro-contas-bancarias-saldos'],
    queryFn: () => financeiroService.getContasBancariasSaldos(),
    staleTime: 60_000,
  });

  const { data: partners = [] } = useQuery({
    queryKey: ['financeiro-parceiros'],
    queryFn: () => financeiroService.getParceiros(),
    staleTime: 60_000,
  });

  const createMutation = useMutation({
    mutationFn: () => financeiroService.createOtherCredit({
      poloId,
      descricao: description.trim(),
      valor: Number(value),
      dataVencimento: dueDate,
      clienteId: partnerId || undefined,
      formaPagamento: mode === 'LOCAL_PAGO' ? paymentMethod : undefined,
      contaBancariaId: mode === 'LOCAL_PAGO' ? accountId : undefined,
      markAsPaid: mode === 'LOCAL_PAGO',
      generateAsaas: mode === 'ASAAS',
    }),
    onSuccess: async (created) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['financeiro-outros-creditos'] }),
        queryClient.invalidateQueries({ queryKey: ['financeiro-resumo-kpis'] }),
        queryClient.invalidateQueries({ queryKey: ['financeiro-contas-bancarias-saldos'] }),
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
      await queryClient.invalidateQueries({ queryKey: ['financeiro-outros-creditos'] });
      toast.success('Cobrança enviada', 'O link Asaas foi gerado ou atualizado.');
    },
    onError: (error: any) => toast.error('Erro no Asaas', error.message),
  });

  const refreshMutation = useMutation({
    mutationFn: (id: string) => asaasIntegrationService.refreshReceivableStatus(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['financeiro-outros-creditos'] });
      toast.success('Status atualizado', 'A cobrança foi consultada no Asaas.');
    },
    onError: (error: any) => toast.error('Erro ao atualizar', error.message),
  });

  const receiveMutation = useMutation({
    mutationFn: () => financeiroService.markReceivablePaid(receiveItem!.id!, {
      contaBancariaId: receiveAccountId,
      valorPago: Number(receiveValue || receiveItem?.valor || 0),
      dataPagamento: receiveDate,
      formaPagamento: receiveMethod,
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['financeiro-outros-creditos'] }),
        queryClient.invalidateQueries({ queryKey: ['financeiro-resumo-kpis'] }),
        queryClient.invalidateQueries({ queryKey: ['financeiro-contas-bancarias-saldos'] }),
      ]);
      toast.success(
        'Recebimento confirmado',
        receiveItem?.asaasPaymentId
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
    setPoloId('');
    setPartnerId('');
    setAccountId('');
    setPaymentMethod('PIX');
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return credits.filter((item) => {
      const matchesStatus =
        statusScope === 'all'
        || (statusScope === 'received' && item.status === 'PAGO')
        || (statusScope === 'pending' && ['PENDENTE', 'VENCIDO'].includes(item.status));
      const matchesPolo = poloFilter === 'todos' || item.poloId === poloFilter;
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

      return matchesStatus && matchesPolo && matchesStart && matchesEnd && matchesSearch;
    });
  }, [credits, statusScope, search, poloFilter, startDate, endDate]);

  const totals = useMemo(() => ({
    received: credits.filter((item) => item.status === 'PAGO').length,
    pending: credits.filter((item) => ['PENDENTE', 'VENCIDO'].includes(item.status)).length,
    all: credits.length,
    receivedValue: credits
      .filter((item) => item.status === 'PAGO')
      .reduce((sum, item) => sum + Number(item.valorPago ?? item.valor), 0),
    pendingValue: credits
      .filter((item) => ['PENDENTE', 'VENCIDO'].includes(item.status))
      .reduce((sum, item) => sum + Number(item.valor), 0),
  }), [credits]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  React.useEffect(() => {
    setPage(1);
  }, [statusScope, search, poloFilter, startDate, endDate]);

  React.useEffect(() => {
    if (!poloId && polos.length > 0) setPoloId(polos[0].id);
  }, [polos, poloId]);

  const validateAndSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!description.trim()) {
      toast.warning('Descrição obrigatória', 'Informe a origem do crédito.');
      return;
    }
    if (!Number(value) || Number(value) <= 0) {
      toast.warning('Valor inválido', 'Informe um valor maior que zero.');
      return;
    }
    if (!poloId) {
      toast.warning('Polo obrigatório', 'Selecione a unidade vinculada ao crédito.');
      return;
    }
    if (mode === 'LOCAL_PAGO' && !accountId) {
      toast.warning('Conta obrigatória', 'Selecione a conta/caixa onde o valor entrou.');
      return;
    }
    if (mode === 'ASAAS' && !partnerId) {
      toast.warning('Parceiro obrigatório', 'Para gerar link Asaas, selecione um parceiro cadastrado.');
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
    setReceiveValue(String(item.valor));
    setReceiveDate(today());
    setReceiveMethod('PIX');
    setReceiveAccountId('');
  };

  const confirmReceive = (event: React.FormEvent) => {
    event.preventDefault();
    if (!receiveItem) return;
    if (!receiveAccountId) {
      toast.warning('Conta obrigatória', 'Selecione a conta/caixa que recebeu o valor.');
      return;
    }
    if (!Number(receiveValue) || Number(receiveValue) <= 0) {
      toast.warning('Valor inválido', 'Informe um valor recebido maior que zero.');
      return;
    }
    receiveMutation.mutate();
  };

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

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
          <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Recebido em outros créditos</p>
          <p className="mt-2 text-2xl font-black text-emerald-700">{formatCurrency(totals.receivedValue)}</p>
        </div>
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5">
          <p className="text-[10px] font-black uppercase tracking-wider text-amber-700">A receber em aberto</p>
          <p className="mt-2 text-2xl font-black text-amber-700">{formatCurrency(totals.pendingValue)}</p>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr_0.8fr]">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar descrição, parceiro, CPF, polo ou origem..."
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-400 focus:bg-white"
            />
          </div>
          <select
            value={poloFilter}
            onChange={(event) => setPoloFilter(event.target.value)}
            className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-600 outline-none focus:border-emerald-400"
          >
            <option value="todos">Todos os polos</option>
            {polos.map((polo: any) => (
              <option key={polo.id} value={polo.id}>
                {polo.nome} {polo.cidade ? `- ${polo.cidade}/${polo.estado}` : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setPoloFilter('todos');
              setStartDate('');
              setEndDate('');
            }}
            className="h-12 rounded-2xl bg-slate-100 px-4 text-xs font-black uppercase tracking-wider text-slate-500 hover:bg-slate-200"
          >
            Limpar filtros
          </button>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Vencimento inicial</span>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 outline-none focus:border-emerald-400"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Vencimento final</span>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 outline-none focus:border-emerald-400"
            />
          </label>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-100 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'pending' as const, label: 'A receber', count: totals.pending },
            { id: 'received' as const, label: 'Recebidos', count: totals.received },
            { id: 'all' as const, label: 'Todos', count: totals.all },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusScope(tab.id)}
              className={`inline-flex items-center gap-3 rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-wider transition-all ${
                statusScope === tab.id
                  ? 'bg-[#001a33] text-white shadow-md'
                  : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
              }`}
            >
              {tab.label}
              <span className={`rounded-full px-2 py-0.5 text-[10px] ${
                statusScope === tab.id ? 'bg-white/15 text-white' : 'bg-white text-slate-500'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center gap-3 py-16">
            <Loader2 className="animate-spin text-emerald-600" size={22} />
            <span className="text-sm font-bold text-slate-500">Carregando outros créditos...</span>
          </div>
        ) : pageItems.length === 0 ? (
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
              <tbody className="divide-y divide-slate-100">
                {pageItems.map((item, index) => (
                  <tr key={item.id} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
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
                      <p className="text-[10px] font-bold text-slate-500">Forma: {item.formaPagamento || (item.asaasPaymentId ? 'Link Asaas' : 'Não definida')}</p>
                      {item.asaasStatus && <p className="text-[10px] font-black uppercase text-blue-500">Asaas: {item.asaasStatus}</p>}
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-lg font-black text-[#001a33]">{formatCurrency(item.valor)}</p>
                      {item.valorPago !== undefined && <p className="text-[10px] font-bold text-emerald-700">Recebido: {formatCurrency(item.valorPago)}</p>}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        {item.status !== 'PAGO' && (
                          <button
                            onClick={() => openReceiveModal(item)}
                            className="inline-flex items-center gap-1 rounded-xl bg-[#001a33] px-3 py-2 text-[10px] font-black uppercase text-white hover:bg-[#062849]"
                          >
                            <CheckCircle2 size={13} /> Receber
                          </button>
                        )}
                        {!item.asaasPaymentId && item.status !== 'PAGO' && item.clienteId && (
                          <button
                            onClick={() => syncMutation.mutate(item.id!)}
                            disabled={syncMutation.isPending}
                            className="inline-flex items-center gap-1 rounded-xl border border-blue-200 px-3 py-2 text-[10px] font-black uppercase text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                          >
                            <LinkIcon size={13} /> Gerar link
                          </button>
                        )}
                        {item.asaasPaymentId && item.status !== 'PAGO' && (
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
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-bold text-slate-400">
            Mostrando {pageItems.length} de {filtered.length} crédito(s)
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#001a33]/60 p-4">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl">
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
                    type="number"
                    min="0"
                    step="0.01"
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
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
                <label className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Polo / unidade</span>
                  <select
                    value={poloId}
                    onChange={(event) => setPoloId(event.target.value)}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-400"
                  >
                    {polos.map((polo: any) => (
                      <option key={polo.id} value={polo.id}>
                        {polo.nome} {polo.cidade ? `- ${polo.cidade}/${polo.estado}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Parceiro {mode === 'ASAAS' ? '(obrigatório)' : '(opcional)'}
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
                        {accounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.banco} - {account.conta} ({account.poloNome})
                          </option>
                        ))}
                      </select>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#001a33]/60 p-4">
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

            {receiveItem.asaasPaymentId && (
              <div className="mb-4 rounded-2xl border border-amber-100 bg-amber-50 p-4 text-xs font-semibold text-amber-700">
                Esta cobrança possui link Asaas. Ao confirmar uma baixa manual, o sistema registra o recebimento local e cancela a cobrança no Asaas para evitar cobrança duplicada.
              </div>
            )}

            <form onSubmit={confirmReceive} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Valor recebido</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={receiveValue}
                    onChange={(event) => setReceiveValue(event.target.value)}
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
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.banco} - {account.conta} ({account.poloNome})
                      </option>
                    ))}
                  </select>
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
