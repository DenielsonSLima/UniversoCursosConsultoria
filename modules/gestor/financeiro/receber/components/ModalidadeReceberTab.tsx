import React, { ReactNode, useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Clock3,
  Copy,
  LayoutGrid,
  Loader2,
  Search,
  Table2,
  Users,
  WalletCards,
  ExternalLink,
  RefreshCw,
  ReceiptText,
  X,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { financeiroService, ContasReceber } from '../../financeiro.service';
import { asaasIntegrationService } from '../../../../asaas/asaas.service';
import { formatMatricula } from '../../../../../lib/academicUtils';
import ToastNotification, { useToast } from '../../../components/ToastNotification';
import { financeiroQueryKeys } from '../../financeiro.queryKeys';
import { useFinanceiroRealtime } from '../../hooks/useFinanceiroRealtime';
import { useFinanceiroSharedQueries } from '../../hooks/useFinanceiroSharedQueries';
import { useModalidadeReceberQueries } from '../hooks/useModalidadeReceberQueries';
import { printReciboDespesa } from '../../../cadastros/modelos-documentos/recibo/ReciboDespesaPreview';

const today = () => new Date().toISOString().slice(0, 10);

type ViewMode = 'table' | 'cards';
type GroupMode = 'none' | 'student' | 'class' | 'polo';
type StatusScope = 'pending' | 'received' | 'canceled' | 'all';
type CourseModality = 'TECNICO' | 'EAD' | 'LIVRE' | 'ESPECIALIZACAO';

interface ModalidadeReceberTabProps {
  modality: CourseModality;
  title: string;
  description: string;
  icon: ReactNode;
  accentLabel: string;
}

export const ModalidadeReceberTab: React.FC<ModalidadeReceberTabProps> = ({
  modality,
  title,
  description,
  icon,
  accentLabel,
}) => {
  const queryClient = useQueryClient();
  const { toasts, removeToast, toast } = useToast();
  const [search, setSearch] = useState('');
  const [statusScope, setStatusScope] = useState<StatusScope>('pending');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [groupMode, setGroupMode] = useState<GroupMode>('student');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [dueStart, setDueStart] = useState('');
  const [dueEnd, setDueEnd] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [selected, setSelected] = useState<ContasReceber | null>(null);
  const [accountId, setAccountId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'PIX' | 'BOLETO' | 'CARTAO' | 'DINHEIRO'>('PIX');
  const [paymentDate, setPaymentDate] = useState(today());
  const [paidValue, setPaidValue] = useState('');
  const [reversalItem, setReversalItem] = useState<ContasReceber | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [recreateAsaas, setRecreateAsaas] = useState(true);

  useFinanceiroRealtime();

  const summaryFilters = useMemo(() => ({
    search,
    dueStart,
    dueEnd,
  }), [dueEnd, dueStart, search]);

  const {
    receivablesQuery,
    summaryQuery,
  } = useModalidadeReceberQueries(modality, summaryFilters);

  const { accountsQuery } = useFinanceiroSharedQueries({ accounts: true, polos: false, partners: false });
  const receivables = receivablesQuery.data || [];
  const accounts = accountsQuery.data || [];
  const isLoading = receivablesQuery.isLoading;

  const paymentMutation = useMutation({
    mutationFn: () => financeiroService.markReceivablePaid(selected!.id!, {
      contaBancariaId: accountId,
      valorPago: Number(paidValue),
      dataPagamento: paymentDate,
      formaPagamento: paymentMethod,
    }),
    onSuccess: async (result) => {
      const paidReceivable = selected;
      const shouldCancelAsaas = Boolean(
        paidReceivable?.asaasPaymentId &&
        !['RECEIVED', 'CONFIRMED'].includes((paidReceivable.asaasStatus || '').toUpperCase())
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['financeiro-tecnico-recebiveis'] }),
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.receivablesRoot }),
        queryClient.invalidateQueries({ queryKey: ['financeiro-aluno-receivables'] }),
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.resumoKpis }),
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.contasBancariasSaldos }),
        queryClient.invalidateQueries({ queryKey: ['aluno-financeiro'] }),
        selected?.turmaId
          ? queryClient.invalidateQueries({ queryKey: ['turma-financeiro', selected.turmaId] })
          : Promise.resolve(),
      ]);
      toast.success(
        'Recebimento confirmado',
        result.asaasCanceled || shouldCancelAsaas
          ? `Baixa manual registrada e cobrança ${result.asaasPaymentId || paidReceivable?.asaasPaymentId || ''} cancelada no Asaas.`
          : paidReceivable?.asaasPaymentId
            ? 'Baixa manual registrada. A cobrança Asaas já estava confirmada/recebida ou não exigia cancelamento.'
            : 'Baixa manual registrada na conta selecionada.',
      );
      setSelected(null);
    },
    onError: (error: any) => toast.error('Erro ao confirmar recebimento', error.message || 'Não foi possível registrar a baixa manual.'),
  });

  const syncMutation = useMutation({
    mutationFn: (receivableId: string) => asaasIntegrationService.syncReceivable(receivableId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.receivablesRoot }),
    onError: (error: any) => console.error('Não foi possível enviar a cobrança ao Asaas:', error),
  });

  const refreshMutation = useMutation({
    mutationFn: (receivableId: string) => asaasIntegrationService.refreshReceivableStatus(receivableId),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.receivablesRoot }),
        queryClient.invalidateQueries({ queryKey: ['financeiro-aluno-receivables'] }),
        queryClient.invalidateQueries({ queryKey: ['aluno-financeiro'] }),
        result.receivable?.turma_id
          ? queryClient.invalidateQueries({ queryKey: ['turma-financeiro', result.receivable.turma_id] })
          : Promise.resolve(),
      ]);
    },
    onError: (error: any) => console.error('Não foi possível atualizar status no Asaas:', error),
  });

  const reversalMutation = useMutation({
    mutationFn: () => financeiroService.reverseManualSettlement(reversalItem!.id!, {
      recreateAsaas,
      reason: reversalReason,
    }),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['financeiro-tecnico-recebiveis'] }),
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.receivablesRoot }),
        queryClient.invalidateQueries({ queryKey: ['financeiro-aluno-receivables'] }),
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.resumoKpis }),
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.contasBancariasSaldos }),
        queryClient.invalidateQueries({ queryKey: ['aluno-financeiro'] }),
        reversalItem?.turmaId
          ? queryClient.invalidateQueries({ queryKey: ['turma-financeiro', reversalItem.turmaId] })
          : Promise.resolve(),
      ]);
      toast.success(
        'Baixa manual estornada',
        result.asaasRecreated
          ? 'O recebível voltou para pendente e uma nova cobrança Asaas foi gerada.'
          : 'O recebível voltou para pendente para nova conferência.',
      );
      setReversalItem(null);
      setReversalReason('');
      setRecreateAsaas(true);
    },
    onError: (error: any) => toast.error('Erro ao estornar baixa', error.message || 'Não foi possível desfazer a baixa manual.'),
  });

  const baseFiltered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return receivables.filter((item) => {
      const matchesDueStart = !dueStart || item.dataVencimento >= dueStart;
      const matchesDueEnd = !dueEnd || item.dataVencimento <= dueEnd;
      const matchesSearch = !term || [
        item.clienteNome,
        item.clienteCpfCnpj,
        item.descricao,
        item.turmaNome,
        item.poloNome,
        item.poloCnpj,
        item.poloCidade,
        item.poloUf,
      ].some((value) => value?.toLocaleLowerCase('pt-BR').includes(term));
      return matchesDueStart && matchesDueEnd && matchesSearch;
    });
  }, [receivables, search, dueStart, dueEnd]);

  const statusCounts = {
    pending: summaryQuery.data?.pendingCount || 0,
    received: summaryQuery.data?.receivedCount || 0,
    canceled: summaryQuery.data?.canceledCount || 0,
    all: summaryQuery.data?.allCount || 0,
  };

  const kpis = useMemo(() => {
    const total = baseFiltered.reduce((s, i) => s + i.valor, 0);
    const recebido = baseFiltered.filter((i) => i.status === 'PAGO').reduce((s, i) => s + (i.valorPago ?? i.valor), 0);
    const aReceber = baseFiltered.filter((i) => ['PENDENTE', 'VENCIDO', 'SUSPENSO'].includes(i.status)).reduce((s, i) => s + i.valor, 0);
    const vencidos = baseFiltered.filter((i) => i.status === 'VENCIDO').length;
    return { total, recebido, aReceber, vencidos };
  }, [baseFiltered]);

  const filtered = useMemo(() => {
    if (statusScope === 'received') return baseFiltered.filter((item) => item.status === 'PAGO');
    if (statusScope === 'pending') return baseFiltered.filter((item) => ['PENDENTE', 'VENCIDO', 'SUSPENSO'].includes(item.status));
    if (statusScope === 'canceled') return baseFiltered.filter((item) => item.status === 'CANCELADO');
    return baseFiltered;
  }, [baseFiltered, statusScope]);

  const allGroups = useMemo(() => {
    if (groupMode === 'none') return [];

    const groups = new Map<string, ContasReceber[]>();
    filtered.forEach((item) => {
      const key = groupMode === 'student'
        ? item.clienteId || item.clienteNome || 'Aluno não informado'
        : groupMode === 'polo'
          ? item.poloId || item.poloNome || 'Polo não informado'
          : item.turmaId || item.turmaNome || 'Turma não informada';
      groups.set(key, [...(groups.get(key) || []), item]);
    });
    return Array.from(groups.entries()).map(([key, items]) => ({
      key,
      label: groupMode === 'student'
        ? items[0]?.clienteNome || 'Aluno não informado'
        : groupMode === 'polo'
          ? items[0]?.poloNome || 'Polo não informado'
          : items[0]?.turmaNome || 'Turma não informada',
      items,
    }));
  }, [filtered, groupMode]);

  const totalItems = groupMode === 'none' ? filtered.length : allGroups.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginated = useMemo(() => {
    const safePage = Math.min(page, totalPages);
    return filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  }, [filtered, page, totalPages]);

  const grouped = useMemo(() => {
    const safePage = Math.min(page, totalPages);
    if (groupMode === 'none') return [{ key: 'all', label: 'Todos os recebíveis', items: paginated }];
    return allGroups.slice((safePage - 1) * pageSize, safePage * pageSize);
  }, [allGroups, groupMode, page, paginated, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [search, dueStart, dueEnd, statusScope, groupMode, modality]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    setExpandedGroups(new Set());
  }, [search, dueStart, dueEnd, statusScope, groupMode, modality]);

  const openPayment = (item: ContasReceber) => {
    setSelected(item);
    setPaidValue(String(item.valor));
    setPaymentDate(today());
    setPaymentMethod('PIX');
    setAccountId(accounts.find((account) => account.poloId === item.poloId)?.id || accounts[0]?.id || '');
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const formatDate = (value: string) =>
    value ? new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR') : '—';

  const formatEnrollment = (item: ContasReceber) =>
    item.matriculaId ? formatMatricula(item.matriculaId, item.createdAt, item.poloId) : 'Sem matrícula';

  const paymentOriginLabel = (item: ContasReceber) => {
    if (item.origemPagamento === 'PRESENCIAL') {
      return item.asaasStatus === 'DELETED' ? 'Manual, Asaas cancelado' : 'Manual';
    }
    if (item.origemPagamento === 'ASAAS' || item.asaasPaymentId) return 'Asaas';
    return item.status === 'PAGO' ? 'Manual' : 'Aguardando';
  };

  const paymentMethodLabel = (item: ContasReceber) => {
    if (item.formaPagamento === 'CARTAO') return 'Cartão';
    if (item.formaPagamento === 'BOLETO') return 'Boleto';
    if (item.formaPagamento === 'PIX') return 'Pix';
    if (item.formaPagamento === 'DINHEIRO') return 'Dinheiro';
    return item.asaasPaymentId ? 'Link Asaas' : 'Não definido';
  };

  const copyInvoiceUrl = async (item: ContasReceber) => {
    if (!item.asaasInvoiceUrl) return;
    await navigator.clipboard.writeText(item.asaasInvoiceUrl);
    toast.success('Link copiado', 'O link da cobrança foi copiado para envio ao aluno.');
  };

  const asaasStatusLabel = (status?: string) => {
    const normalized = (status || '').toUpperCase();
    if (!normalized) return 'Não sincronizado';
    const labels: Record<string, string> = {
      PENDING: 'Pendente no Asaas',
      CONFIRMED: 'Confirmado no Asaas',
      RECEIVED: 'Recebido no Asaas',
      OVERDUE: 'Vencido no Asaas',
      DELETED: 'Cancelado no Asaas',
      REFUNDED: 'Estornado no Asaas',
      REFUND_REQUESTED: 'Estorno solicitado',
      AWAITING_RISK_ANALYSIS: 'Em análise no Asaas',
    };
    return labels[normalized] || normalized;
  };

  const asaasStatusClass = (status?: string) => {
    const normalized = (status || '').toUpperCase();
    if (['CONFIRMED', 'RECEIVED'].includes(normalized)) return 'text-emerald-600';
    if (normalized === 'DELETED') return 'text-rose-600';
    if (normalized === 'PENDING') return 'text-blue-600';
    if (normalized === 'OVERDUE') return 'text-amber-600';
    return 'text-slate-400';
  };

  const canReverseManualSettlement = (item: ContasReceber) =>
    item.status === 'PAGO' && item.origemPagamento === 'PRESENCIAL';

  const isPaidThroughAsaas = (item: ContasReceber) => {
    const asaasStatus = String(item.asaasStatus || '').toUpperCase();
    return item.status === 'PAGO' && (
      String(item.origemPagamento || '').toUpperCase() === 'ASAAS'
      || ['RECEIVED', 'CONFIRMED'].includes(asaasStatus)
      || Boolean(item.asaasTransactionReceiptUrl)
    );
  };

  const openAsaasReceipt = (item: ContasReceber) => {
    if (item.asaasTransactionReceiptUrl) {
      window.open(item.asaasTransactionReceiptUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    toast.info(
      'Comprovante Asaas indisponível',
      'O Asaas ainda não retornou o comprovante oficial desta cobrança. Use Atualizar Asaas para consultar novamente.',
    );
  };

  const printInstitutionalReceipt = (item: ContasReceber) => {
    printReciboDespesa({
      reciboTitulo: 'Recibo de Pagamento',
      reciboNumero: item.id ? item.id.slice(0, 8).toUpperCase() : undefined,
      contraparteLabel: 'Aluno / Pagador',
      assinaturaNome: 'Responsável Financeiro',
      empresaNome: 'Universo Cursos e Consultoria',
      empresaCnpj: item.poloCnpj,
      descricao: item.descricao,
      valor: item.valor,
      valorPago: item.valorPago ?? item.valor,
      dataVencimento: item.dataVencimento,
      dataPagamento: item.dataPagamento,
      fornecedorNome: item.clienteNome,
      fornecedorId: item.clienteCpfCnpj,
      categoriaNome: [item.cursoNome, item.turmaNome, item.tipoLancamento].filter(Boolean).join(' • '),
      formaPagamento: paymentMethodLabel(item),
      poloNome: item.poloNome,
      parcelaNumero: item.parcelaNumero,
      observacao: 'Pagamento manual registrado no sistema da Universo Cursos e Consultoria.',
      status: item.status,
    });
  };

  const openPaidReceipt = (item: ContasReceber) => {
    if (isPaidThroughAsaas(item)) {
      openAsaasReceipt(item);
      return;
    }

    printInstitutionalReceipt(item);
  };

  const openReversal = (item: ContasReceber) => {
    setReversalItem(item);
    setReversalReason('');
    setRecreateAsaas(Boolean(item.asaasPaymentId));
  };

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
    const pendingItems = items.filter((item) => ['PENDENTE', 'VENCIDO', 'SUSPENSO'].includes(item.status));
    const receivedItems = items.filter((item) => item.status === 'PAGO');
    const canceledItems = items.filter((item) => item.status === 'CANCELADO');
    const openItems = sortedByDue.filter((item) => item.status !== 'PAGO' && item.status !== 'CANCELADO');

    return {
      pendingCount: pendingItems.length,
      receivedCount: receivedItems.length,
      canceledCount: canceledItems.length,
      nextDue: openItems[0]?.dataVencimento || sortedByDue[0]?.dataVencimento || '',
      first: items[0],
    };
  };

  const StatusBadge = ({ item }: { item: ContasReceber }) => (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${
      item.status === 'PAGO'
        ? 'bg-emerald-50 text-emerald-700'
        : item.status === 'VENCIDO'
          ? 'bg-rose-50 text-rose-700'
          : item.status === 'SUSPENSO'
            ? 'bg-blue-50 text-blue-700'
            : item.status === 'CANCELADO'
              ? 'bg-slate-100 text-slate-500'
              : 'bg-amber-50 text-amber-700'
    }`}>
      {item.status === 'PAGO' ? <CheckCircle2 size={11} /> : <Clock3 size={11} />}
      {item.status}
    </span>
  );

  const ChargeActions = ({ item }: { item: ContasReceber }) => {
    if (item.status === 'PAGO') {
      const paidThroughAsaas = isPaidThroughAsaas(item);
      return (
        <div className="flex max-w-[190px] flex-col gap-2">
          <span className="text-[10px] font-bold text-slate-400">Recebido em {formatDate(item.dataPagamento || '')}</span>
          <button
            type="button"
            onClick={() => openPaidReceipt(item)}
            className={`inline-flex items-center justify-center gap-1 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-wider ${
              paidThroughAsaas
                ? 'border-blue-200 text-blue-600 hover:bg-blue-50'
                : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
            }`}
            title={paidThroughAsaas ? 'Abrir comprovante oficial do Asaas' : 'Imprimir recibo interno da Universo'}
          >
            {paidThroughAsaas ? <ExternalLink size={12} /> : <ReceiptText size={12} />}
            {paidThroughAsaas ? 'Comprovante Asaas' : 'Recibo Universo'}
          </button>
          {paidThroughAsaas && !item.asaasTransactionReceiptUrl && item.id && (
            <button
              type="button"
              onClick={() => refreshMutation.mutate(item.id!)}
              disabled={refreshMutation.isPending}
              className="inline-flex items-center justify-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-600 disabled:opacity-50"
              title="Consultar novamente o comprovante no Asaas"
            >
              <RefreshCw className={refreshMutation.isPending ? 'animate-spin' : ''} size={12} />
              Atualizar Asaas
            </button>
          )}
          {canReverseManualSettlement(item) && (
            <button
              type="button"
              onClick={() => openReversal(item)}
              className="rounded-xl border border-rose-200 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-rose-600 hover:bg-rose-50"
              title="Estornar baixa manual"
            >
              Estornar baixa
            </button>
          )}
        </div>
      );
    }

    if (!['PENDENTE', 'VENCIDO'].includes(item.status)) {
      return <span className="text-[10px] font-bold text-slate-400">Sem ação financeira</span>;
    }

    return (
      <div className="grid w-full max-w-[180px] grid-cols-2 gap-2">
        <button
          onClick={() => openPayment(item)}
          className="col-span-2 rounded-xl bg-[#001a33] px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-white hover:bg-emerald-700"
          title="Confirmar recebimento manual"
        >
          Receber
        </button>
        {item.asaasInvoiceUrl ? (
          <>
            <button
              type="button"
              onClick={() => copyInvoiceUrl(item)}
              className="flex items-center justify-center gap-1 rounded-xl border border-emerald-200 px-2 py-2 text-[10px] font-black uppercase text-emerald-700"
              title="Copiar link de cobrança"
            >
              <Copy size={12} /> Link
            </button>
            <a
              href={item.asaasInvoiceUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-1 rounded-xl border border-blue-200 px-2 py-2 text-[10px] font-black uppercase text-blue-600"
              title="Abrir cobrança"
            >
              <ExternalLink size={12} /> Abrir
            </a>
            <button
              type="button"
              onClick={() => refreshMutation.mutate(item.id!)}
              disabled={refreshMutation.isPending}
              className="col-span-2 flex items-center justify-center gap-1 rounded-xl border border-slate-200 px-2 py-2 text-[10px] font-black uppercase text-slate-600 disabled:opacity-50"
              title="Consultar status atual no Asaas"
            >
              <RefreshCw className={refreshMutation.isPending ? 'animate-spin' : ''} size={12} /> Atualizar
            </button>
          </>
        ) : (
          <button
            onClick={() => syncMutation.mutate(item.id!)}
            disabled={syncMutation.isPending}
            className="col-span-2 flex items-center justify-center gap-1 rounded-xl border border-slate-200 px-3 py-2.5 text-[10px] font-black uppercase text-slate-600 disabled:opacity-50"
          >
            <RefreshCw className={syncMutation.isPending ? 'animate-spin' : ''} size={12} />
            Enviar ao Asaas
          </button>
        )}
      </div>
    );
  };

  const renderReceivableRow = (item: ContasReceber, index: number, compactStudent = false) => (
    <tr
      key={item.id}
      className={`${
        index % 2 === 0 ? 'bg-white' : compactStudent ? 'bg-emerald-50/45' : 'bg-slate-50/55'
      } align-top transition-colors hover:bg-emerald-50/70`}
    >
      <td className="px-5 py-5">
        {compactStudent ? (
          <div className="space-y-1.5">
            <p className="text-xs font-black uppercase tracking-wider text-[#001a33]">
              {item.parcelaNumero !== undefined ? `Parcela ${item.parcelaNumero}` : item.tipoLancamento || 'Cobrança'}
            </p>
            <p className="text-[10px] font-bold text-slate-500">Venc.: {formatDate(item.dataVencimento)}</p>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Matrícula: {formatEnrollment(item)}</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <p className="break-words text-sm font-black leading-tight text-[#001a33]">{item.clienteNome}</p>
            <p className="whitespace-nowrap text-[10px] font-bold text-slate-400">CPF: {item.clienteCpfCnpj || 'não informado'}</p>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Matrícula: {formatEnrollment(item)}</p>
          </div>
        )}
      </td>
      <td className="px-5 py-5">
        <div className="space-y-1.5">
          <p className="break-words text-xs font-bold leading-snug text-slate-700">{item.descricao}</p>
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
            {item.tipoLancamento || 'Mensalidade'} {item.parcelaNumero !== undefined ? `· Parcela ${item.parcelaNumero}` : ''}
          </p>
          <p className="text-[10px] font-black uppercase tracking-wider text-blue-500">
            Asaas: <span className={asaasStatusClass(item.asaasStatus)}>{asaasStatusLabel(item.asaasStatus)}</span>
          </p>
        </div>
      </td>
      <td className="px-5 py-5">
        <div className="space-y-1.5">
          <p className="break-words text-xs font-bold leading-snug text-slate-700">{item.turmaNome || item.cursoNome || 'Turma não informada'}</p>
          <p className="break-words text-[10px] font-bold uppercase tracking-wide text-slate-500">{item.poloNome || 'Unidade não informada'}</p>
          <p className="text-[10px] font-medium leading-snug text-slate-400">
            CNPJ: {item.poloCnpj || 'não informado'} · {item.poloCidade || 'Cidade não informada'} / {item.poloUf || 'UF'}
          </p>
        </div>
      </td>
      <td className="px-5 py-5">
        <div className="space-y-2">
          <StatusBadge item={item} />
          <p className="text-[10px] font-bold text-slate-500">Forma: {paymentMethodLabel(item)}</p>
          <p className="text-[10px] font-bold text-slate-500">Origem: {paymentOriginLabel(item)}</p>
          {item.asaasStatus === 'DELETED' && (
            <p className="text-[10px] font-bold text-rose-600">
              Cobrança cancelada/excluída no Asaas após baixa manual.
            </p>
          )}
          <p className="text-[10px] font-bold text-slate-400">
            Venc.: {formatDate(item.dataVencimento)}
          </p>
          {item.status === 'PAGO' && (
            <p className="text-[10px] font-bold text-emerald-700">
              Pago: {formatDate(item.dataPagamento || '')}
            </p>
          )}
        </div>
      </td>
      <td className="px-5 py-5">
        <p className="whitespace-nowrap text-sm font-black text-[#001a33]">{formatCurrency(item.valor)}</p>
        {item.valorPago !== undefined && (
          <p className="mt-1 whitespace-nowrap text-[10px] font-bold text-emerald-700">
            Rec.: {formatCurrency(item.valorPago)}
          </p>
        )}
      </td>
      <td className="px-5 py-5"><ChargeActions item={item} /></td>
    </tr>
  );

  const ReceivableCard: React.FC<{ item: ContasReceber }> = ({ item }) => (
    <article className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-black text-[#001a33]">{item.clienteNome}</p>
          <p className="mt-1 text-[10px] font-bold text-slate-400">CPF: {item.clienteCpfCnpj || 'não informado'}</p>
        </div>
        <StatusBadge item={item} />
      </div>
      <div className="mt-4 rounded-2xl bg-slate-50 p-3">
        <p className="text-xs font-bold text-slate-700">{item.descricao}</p>
        <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-slate-400">{item.tipoLancamento || 'Mensalidade'}</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-[9px] font-black uppercase text-slate-400">Vencimento</p>
          <p className="font-bold text-slate-700">{formatDate(item.dataVencimento)}</p>
        </div>
        <div>
          <p className="text-[9px] font-black uppercase text-slate-400">Valor</p>
          <p className="font-black text-[#001a33]">{formatCurrency(item.valor)}</p>
        </div>
      </div>
      <div className="mt-4 border-t border-slate-100 pt-3">
        <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Unidade</p>
        <p className="text-xs font-bold text-slate-700">{item.poloNome}</p>
        <p className="text-[10px] font-semibold text-slate-400">
          CNPJ: {item.poloCnpj || 'não informado'} · {item.poloCidade || 'Cidade não informada'} / {item.poloUf || 'UF'}
        </p>
      </div>
      <div className="mt-4">
        <ChargeActions item={item} />
      </div>
    </article>
  );

  return (
    <div className="space-y-6 animate-fadeIn">
      <ToastNotification toasts={toasts} onRemove={removeToast} />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-emerald-600">
            {icon}
            <span className="text-xs font-black uppercase tracking-[0.18em]">{accentLabel}</span>
          </div>
          <h4 className="text-2xl font-black uppercase tracking-tight text-[#001a33]">{title}</h4>
          <p className="text-xs font-medium text-slate-500">
            {description}
          </p>
        </div>

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
          { id: 'pending' as const, label: 'Pendentes', count: statusCounts.pending },
          { id: 'received' as const, label: 'Recebidos', count: statusCounts.received },
          { id: 'canceled' as const, label: 'Cancelados', count: statusCounts.canceled },
          { id: 'all' as const, label: 'Todos', count: statusCounts.all },
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
            placeholder="Aluno, turma, CPF, cobrança ou unidade..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
          />
        </div>

        {/* Data Início */}
        <input
          type="date"
          value={dueStart}
          onChange={(e) => setDueStart(e.target.value)}
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
          title="Vencimento Inicial"
        />

        {/* Data Fim */}
        <input
          type="date"
          value={dueEnd}
          onChange={(e) => setDueEnd(e.target.value)}
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
          title="Vencimento Final"
        />

        {/* Agrupamento */}
        <select
          value={groupMode}
          onChange={(e) => setGroupMode(e.target.value as GroupMode)}
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
        >
          <option value="student">Agrupar por aluno</option>
          <option value="class">Agrupar por turma</option>
          <option value="polo">Agrupar por polo</option>
          <option value="none">Sem agrupamento</option>
        </select>

        {/* Limpar Filtros */}
        {(search || dueStart || dueEnd) && (
          <button
            onClick={() => {
              setSearch('');
              setDueStart('');
              setDueEnd('');
            }}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl text-xs font-bold uppercase transition-colors"
          >
            Limpar
          </button>
        )}

        {/* Toggles */}
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl ml-auto">
          <button
            onClick={() => setViewMode('table')}
            className={`p-2 rounded-lg transition-all ${viewMode === 'table' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}
            title="Tabela"
          >
            <Table2 size={15} />
          </button>
          <button
            onClick={() => setViewMode('cards')}
            className={`p-2 rounded-lg transition-all ${viewMode === 'cards' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}
            title="Cards"
          >
            <LayoutGrid size={15} />
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white">
        {isLoading ? (
          <div className="flex items-center justify-center gap-3 py-20 text-sm font-bold text-slate-500">
            <Loader2 className="animate-spin text-emerald-600" /> Carregando recebíveis...
          </div>
        ) : (
          viewMode === 'cards' ? (
            <div className="space-y-5 bg-slate-50/60 p-4">
              {filtered.length === 0 ? (
                <div className="py-16 text-center text-xs font-bold text-slate-400">Nenhuma cobrança encontrada.</div>
              ) : grouped.map((group) => (
                <section key={group.key} className="space-y-3">
                  {groupMode !== 'none' && (
                    <div className="flex items-center gap-2 px-1 text-xs font-black uppercase tracking-wider text-slate-500">
                      <Users size={14} /> {group.label}
                    </div>
                  )}
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {group.items.map((item) => <ReceivableCard key={item.id} item={item} />)}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] table-fixed text-left">
                <colgroup>
                  <col className="w-[17%]" />
                  <col className="w-[23%]" />
                  <col className="w-[24%]" />
                  <col className="w-[14%]" />
                  <col className="w-[10%]" />
                  <col className="w-[12%]" />
                </colgroup>
                <thead className="bg-slate-50">
                  <tr>
                    {['Aluno', 'Cobrança', 'Turma / unidade', 'Recebimento', 'Valor', 'Ações'].map((label) => (
                      <th key={label} className="px-5 py-4 text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</th>
                    ))}
                  </tr>
                </thead>
                {filtered.length === 0 ? (
                  <tbody><tr><td colSpan={6} className="py-16 text-center text-xs font-bold text-slate-400">Nenhuma cobrança encontrada.</td></tr></tbody>
                ) : groupMode === 'none' ? (
                  <tbody className="divide-y divide-slate-100">
                    {paginated.map((item, index) => renderReceivableRow(item, index))}
                  </tbody>
                ) : grouped.map((group) => {
                  const isExpanded = expandedGroups.has(group.key);
                  const summary = getGroupSummary(group.items);
                  const first = summary.first;

                  return (
                    <tbody key={group.key} className="divide-y divide-slate-100">
                      <tr className="bg-slate-50/80 transition-colors hover:bg-blue-50/70">
                        <td colSpan={6} className="p-0">
                          <button
                            type="button"
                            onClick={() => toggleGroup(group.key)}
                            className="grid w-full grid-cols-[minmax(260px,1.5fr)_minmax(180px,0.9fr)_minmax(180px,0.9fr)_minmax(140px,0.7fr)] items-center gap-4 px-5 py-4 text-left"
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
                                  {groupMode === 'student'
                                    ? `CPF: ${first?.clienteCpfCnpj || 'não informado'} · Matrícula: ${first ? formatEnrollment(first) : 'sem matrícula'}`
                                    : groupMode === 'polo'
                                      ? `${first?.poloCnpj || 'CNPJ não informado'} · ${first?.poloCidade || 'Cidade não informada'} / ${first?.poloUf || 'UF'}`
                                      : first?.cursoNome || 'Curso não informado'}
                                </span>
                              </span>
                            </span>

                            <span className="text-xs font-bold text-slate-600">
                              <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">Parcelas</span>
                              {group.items.length} cobrança(s)
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
                      {isExpanded && group.items.map((item, index) => renderReceivableRow(item, index, groupMode === 'student'))}
                    </tbody>
                  );
                })}
              </table>
            </div>
          )
        )}
      </div>

      {!isLoading && filtered.length > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 text-xs font-bold text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>
            {groupMode === 'none'
              ? `Mostrando ${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, filtered.length)} de ${filtered.length} cobrança(s)`
              : `Mostrando ${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, allGroups.length)} de ${allGroups.length} grupo(s), ${filtered.length} cobrança(s)`}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
              className="rounded-xl border border-slate-200 px-3 py-2 font-black uppercase disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="rounded-xl bg-slate-50 px-3 py-2 font-black text-[#001a33]">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page >= totalPages}
              className="rounded-xl border border-slate-200 px-3 py-2 font-black uppercase disabled:opacity-40"
            >
              Próxima
            </button>
          </div>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-[2rem] bg-white p-7 shadow-2xl">
            <button onClick={() => setSelected(null)} className="absolute right-5 top-5 rounded-full p-2 text-slate-400 hover:bg-slate-100">
              <X size={18} />
            </button>
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-600"><WalletCards size={22} /></div>
              <div>
                <h5 className="font-black uppercase text-[#001a33]">Confirmar recebimento</h5>
                <p className="text-xs text-slate-500">{selected.clienteNome} · {selected.descricao}</p>
              </div>
            </div>

            {selected.tipoLancamento === 'MATRICULA' && (
              <div className="mb-5 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs font-semibold text-blue-800">
                Ao confirmar esta matrícula, o sistema criará automaticamente as parcelas futuras do cronograma da turma.
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-[10px] font-black uppercase text-slate-500">
                Conta bancária
                <select value={accountId} onChange={(event) => setAccountId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-xs font-bold text-slate-700">
                  <option value="">Selecione...</option>
                  {accounts.filter((account) => account.ativo !== false).map((account) => (
                    <option key={account.id} value={account.id}>{account.banco} · {account.conta}</option>
                  ))}
                </select>
              </label>
              <label className="text-[10px] font-black uppercase text-slate-500">
                Forma de pagamento
                <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as typeof paymentMethod)} className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-xs font-bold text-slate-700">
                  <option value="PIX">PIX</option>
                  <option value="BOLETO">Boleto</option>
                  <option value="CARTAO">Cartão</option>
                  <option value="DINHEIRO">Dinheiro</option>
                </select>
              </label>
              <label className="text-[10px] font-black uppercase text-slate-500">
                Data do pagamento
                <input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-xs font-bold text-slate-700" />
              </label>
              <label className="text-[10px] font-black uppercase text-slate-500">
                Valor recebido
                <input type="number" min="0" step="0.01" value={paidValue} onChange={(event) => setPaidValue(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-xs font-bold text-slate-700" />
              </label>
            </div>

            {paymentMutation.isError && (
              <p className="mt-4 text-xs font-bold text-rose-600">Não foi possível confirmar o recebimento.</p>
            )}

            <button
              onClick={() => paymentMutation.mutate()}
              disabled={!accountId || !paymentDate || Number(paidValue) <= 0 || paymentMutation.isPending}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3.5 text-xs font-black uppercase tracking-wider text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {paymentMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
              {paymentMutation.isPending ? 'Confirmando...' : 'Confirmar e registrar'}
            </button>
          </div>
        </div>
      )}

      {reversalItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-xl rounded-[2rem] bg-white p-7 shadow-2xl">
            <button onClick={() => setReversalItem(null)} className="absolute right-5 top-5 rounded-full p-2 text-slate-400 hover:bg-slate-100">
              <X size={18} />
            </button>
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-2xl bg-rose-50 p-3 text-rose-600"><RefreshCw size={22} /></div>
              <div>
                <h5 className="font-black uppercase text-[#001a33]">Estornar baixa manual</h5>
                <p className="text-xs text-slate-500">{reversalItem.clienteNome} · {reversalItem.descricao}</p>
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-amber-100 bg-amber-50 p-4 text-xs font-semibold text-amber-800">
              <p>Essa ação desfaz somente a baixa lançada manualmente no sistema.</p>
              <p>O recebível volta para pendente, os dados de pagamento local são limpos e ele volta para conferência.</p>
              {reversalItem.asaasPaymentId && (
                <p>Como a cobrança anterior do Asaas foi cancelada/excluída, o sistema não reativa o mesmo ID. Ele gera uma nova cobrança com novo link.</p>
              )}
            </div>

            {reversalItem.asaasPaymentId && (
              <label className="mt-5 flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <input
                  type="checkbox"
                  checked={recreateAsaas}
                  onChange={(event) => setRecreateAsaas(event.target.checked)}
                  className="mt-1 h-4 w-4 accent-emerald-600"
                />
                <span>
                  <span className="block text-xs font-black uppercase tracking-wider text-[#001a33]">Gerar nova cobrança Asaas</span>
                  <span className="mt-1 block text-xs font-medium text-slate-500">
                    Recomendado quando a baixa manual cancelou a cobrança original no Asaas.
                  </span>
                </span>
              </label>
            )}

            <label className="mt-5 block text-[10px] font-black uppercase text-slate-500">
              Motivo do estorno
              <textarea
                value={reversalReason}
                onChange={(event) => setReversalReason(event.target.value)}
                placeholder="Ex.: baixa lançada no aluno errado"
                className="mt-2 min-h-[92px] w-full resize-none rounded-xl border border-slate-200 p-3 text-xs font-bold text-slate-700 outline-none focus:border-rose-300"
              />
            </label>

            <button
              onClick={() => reversalMutation.mutate()}
              disabled={reversalMutation.isPending}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 py-3.5 text-xs font-black uppercase tracking-wider text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {reversalMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
              {reversalMutation.isPending ? 'Estornando...' : 'Confirmar estorno da baixa'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
