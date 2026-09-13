import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { financeiroService, type ContasReceber, isContaDisponivelNoPolo } from '../financeiro.service';
import { asaasIntegrationService } from '../../../asaas/asaas.service';
import { useToast } from '../../components/ToastNotification';
import { financeiroQueryKeys } from '../financeiro.queryKeys';
import { useFinanceiroRealtime } from '../hooks/useFinanceiroRealtime';
import { useFinanceiroSharedQueries } from '../hooks/useFinanceiroSharedQueries';
import { useOutrosCreditosQueries } from './hooks/useOutrosCreditosQueries';
import type { ManualSettlementPayload } from '../receber/components/manual-settlement/useManualSettlementForm';
import { generateSafeUuid } from '../../../../lib/randomUuid';
import { textMatchesSearch } from '../../../../lib/search';
import type { DespesaCredorTipo } from '../despesas/components/DespesaCredorPicker';
import { useCategoriasFinanceirasQuery } from '../despesas/hooks/useCategoriasFinanceirasQuery';
import { today, parseCurrencyInput, isPendingOutrosCredito, type StatusScope, type CreditMode, type OtherCreditGroupMode } from './outros-creditos.presentation';

export const useOutrosCreditos = (scopedPoloId?: string | null) => {
  const queryClient = useQueryClient();
  const { toasts, removeToast, toast } = useToast();
  const [statusScope, setStatusScope] = useState<StatusScope>('pending');
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [categoryFilterId, setCategoryFilterId] = useState('');
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
  const [categoryId, setCategoryId] = useState('');
  const [partnerType, setPartnerType] = useState<DespesaCredorTipo | ''>('');
  const [partnerId, setPartnerId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'PIX' | 'BOLETO' | 'CARTAO' | 'DINHEIRO'>('PIX');
  const [receiveItem, setReceiveItem] = useState<ContasReceber | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [creationAttemptId, setCreationAttemptId] = useState(generateSafeUuid);

  useFinanceiroRealtime(scopedPoloId || poloId);

  const summaryFilters = useMemo(() => ({
    poloId: scopedPoloId || undefined,
    search,
    dueStart: startDate,
    dueEnd: endDate,
    categoryId: categoryFilterId,
  }), [categoryFilterId, endDate, scopedPoloId, search, startDate]);

  const { creditsQuery, summaryQuery } = useOutrosCreditosQueries(summaryFilters, scopedPoloId);
  const { accountsQuery, polosQuery, partnersQuery } = useFinanceiroSharedQueries({
    poloId: scopedPoloId || poloId,
  });
  const categoriesQuery = useCategoriasFinanceirasQuery('OUTRO_CREDITO');

  const credits = creditsQuery.data || [];
  const polos = polosQuery.data || [];
  const accounts = accountsQuery.data || [];
  const partners = partnersQuery.data || [];
  const categories = categoriesQuery.data || [];
  const isLoading = creditsQuery.isLoading;
  const effectivePoloId = scopedPoloId || poloId || '';
  const activePolo = polos.find((polo: any) => polo.id === effectivePoloId);
  const activeAccounts = useMemo(
    () => accounts.filter(
      (account) => account.ativo !== false
        && isContaDisponivelNoPolo(account, effectivePoloId),
    ),
    [accounts, effectivePoloId],
  );
  const receiveAccounts = useMemo(() => {
    const receivePoloId = receiveItem?.poloId || effectivePoloId;
    return accounts.filter(
      (account) => account.ativo !== false
        && isContaDisponivelNoPolo(account, receivePoloId),
    );
  }, [accounts, effectivePoloId, receiveItem?.poloId]);

  const createMutation = useMutation({
    mutationFn: () => financeiroService.createOtherCredit({
      idempotencyKey: creationAttemptId,
      poloId: effectivePoloId,
      descricao: description.trim(),
      valor: parseCurrencyInput(value),
      dataVencimento: dueDate,
      clienteId: partnerId || undefined,
      categoriaFinanceiraId: categoryId || undefined,
      formaPagamento: mode === 'LOCAL_PAGO' || mode === 'GATEWAY' ? paymentMethod : undefined,
      contaBancariaId: mode === 'LOCAL_PAGO' ? accountId : undefined,
      mode,
    }),
    onSuccess: async (created) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.outrosCreditosRoot }),
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.resumoKpis }),
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.contasBancariasSaldos }),
      ]);
      setIsModalOpen(false);
      resetForm();
      setCreationAttemptId(generateSafeUuid());
      toast.success(
        mode === 'GATEWAY' ? 'Crédito e link criados' : 'Crédito registrado',
        mode === 'GATEWAY' && created.asaasInvoiceUrl
          ? 'A cobrança foi enviada para a rota bancária configurada e o link já está disponível.'
          : 'O lançamento foi salvo em Outros Créditos.',
      );
    },
    onError: (error: any) => toast.error('Erro ao criar crédito', error.message),
  });

  const syncMutation = useMutation({
    mutationFn: (id: string) => asaasIntegrationService.syncReceivable(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.outrosCreditosRoot });
      toast.success('Cobrança enviada', 'O link bancário foi gerado ou atualizado.');
    },
    onError: (error: any) => toast.error('Erro no link bancário', error.message),
  });

  const refreshMutation = useMutation({
    mutationFn: (id: string) => asaasIntegrationService.refreshReceivableStatus(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.outrosCreditosRoot });
      toast.success('Status atualizado', 'A cobrança bancária foi consultada.');
    },
    onError: (error: any) => toast.error('Erro ao atualizar', error.message),
  });

  const receiveMutation = useMutation({
    mutationFn: (payload: ManualSettlementPayload) =>
      financeiroService.markReceivablePaid(receiveItem!.id!, payload),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.outrosCreditosRoot }),
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.resumoKpis }),
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.contasBancariasSaldos }),
      ]);
      toast.success(
        'Recebimento confirmado',
        result.gatewayCanceled
          ? 'A baixa manual foi registrada somente após a integração confirmar o cancelamento da cobrança bancária.'
          : 'O crédito foi baixado na conta/caixa selecionada.',
      );
      setReceiveItem(null);
    },
    onError: (error: any) => toast.error('Erro ao confirmar recebimento', error.message),
  });

  const resetForm = () => {
    setMode('LOCAL_PAGO');
    setDescription('');
    setValue('');
    setDueDate(today());
    setPoloId(effectivePoloId);
    setCategoryId('');
    setPartnerType('');
    setPartnerId('');
    setAccountId('');
    setPaymentMethod('PIX');
    setShowCategoryModal(false);
  };

  const openCreateModal = () => {
    resetForm();
    setCreationAttemptId(generateSafeUuid());
    setIsModalOpen(true);
  };

  const closeCreateModal = () => {
    if (createMutation.isPending) return;
    setIsModalOpen(false);
    resetForm();
    setCreationAttemptId(generateSafeUuid());
  };

  const baseFiltered = useMemo(() => {
    return credits.filter((item) => {
      const matchesStart = !startDate || item.dataVencimento >= startDate;
      const matchesEnd = !endDate || item.dataVencimento <= endDate;
      const matchesCategory = !categoryFilterId
        || item.categoriaFinanceiraId === categoryFilterId;
      const matchesSearch = textMatchesSearch(search, [
        item.descricao,
        item.categoriaFinanceiraNome,
        item.clienteNome,
        item.clienteCpfCnpj,
        item.poloNome,
        item.poloCnpj,
        item.poloCidade,
        item.poloUf,
        item.formaPagamento,
        item.asaasStatus,
      ]);

      return matchesStart && matchesEnd && matchesCategory && matchesSearch;
    });
  }, [categoryFilterId, credits, search, startDate, endDate]);

  const filtered = useMemo(() => {
    if (statusScope === 'received') return baseFiltered.filter((item) => item.status === 'PAGO');
    if (statusScope === 'pending') return baseFiltered.filter((item) => isPendingOutrosCredito(item.status));
    if (statusScope === 'canceled') return baseFiltered.filter((item) => ['CANCELADO', 'ESTORNADO'].includes(item.status));
    return baseFiltered;
  }, [baseFiltered, statusScope]);

  const receivedItems = useMemo(() => baseFiltered.filter((item) => item.status === 'PAGO'), [baseFiltered]);
  const pendingItems = useMemo(() => baseFiltered.filter((item) => isPendingOutrosCredito(item.status)), [baseFiltered]);
  const canceledItems = useMemo(() => baseFiltered.filter((item) => ['CANCELADO', 'ESTORNADO'].includes(item.status)), [baseFiltered]);
  const totals = {
    received: summaryQuery.data?.receivedCount ?? receivedItems.length,
    pending: summaryQuery.data?.pendingCount ?? pendingItems.length,
    canceled: summaryQuery.data?.canceledCount ?? canceledItems.length,
    all: summaryQuery.data?.allCount ?? baseFiltered.length,
    receivedValue: summaryQuery.data?.receivedValue ?? 0,
    pendingValue: summaryQuery.data?.pendingValue ?? 0,
  };

  const kpis = {
    total: summaryQuery.data?.allValue ?? 0,
    recebido: summaryQuery.data?.receivedValue ?? 0,
    aReceber: summaryQuery.data?.pendingValue ?? 0,
    vencidos: summaryQuery.data?.overdueCount ?? 0,
  };

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
  }, [statusScope, search, startDate, endDate, categoryFilterId, groupMode]);

  useEffect(() => {
    setExpandedGroups(new Set());
  }, [statusScope, search, startDate, endDate, categoryFilterId, groupMode]);

  useEffect(() => {
    const nextPoloId = scopedPoloId || '';
    if (nextPoloId && poloId !== nextPoloId) setPoloId(nextPoloId);
  }, [poloId, scopedPoloId]);

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
    if (mode === 'GATEWAY' && paymentMethod !== 'BOLETO') {
      setPaymentMethod('BOLETO');
    }
  }, [mode, paymentMethod]);

  const validateAndSubmit = (event: FormEvent) => {
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
    if (mode === 'GATEWAY' && (!partnerType || !partnerId)) {
      toast.warning(
        'Parceiro obrigatório',
        'Selecione o tipo e o parceiro para o Banese emitir a cobrança BolePix.',
      );
      return;
    }
    if (mode === 'GATEWAY' && paymentMethod !== 'BOLETO') {
      toast.warning('Forma inválida', 'O link bancário de Outros Créditos usa somente BolePix do Banese.');
      return;
    }
    createMutation.mutate();
  };

  const copyLink = async (item: ContasReceber) => {
    if (!item.asaasInvoiceUrl) {
      toast.info('Sem link', 'Gere ou atualize a cobrança bancária primeiro.');
      return;
    }
    await navigator.clipboard.writeText(item.asaasInvoiceUrl);
    toast.success('Link copiado', 'Envie o link ao parceiro pelo canal de atendimento.');
  };

  const openReceiveModal = (item: ContasReceber) => {
    setReceiveItem(item);
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
    const pendingItems = items.filter((item) => isPendingOutrosCredito(item.status));
    const receivedItems = items.filter((item) => item.status === 'PAGO');
    const canceledItems = items.filter((item) => ['CANCELADO', 'ESTORNADO'].includes(item.status));

    return {
      pendingCount: pendingItems.length,
      receivedCount: receivedItems.length,
      canceledCount: canceledItems.length,
      nextDue: sortedByDue.find((item) => item.status !== 'PAGO' && !['CANCELADO', 'ESTORNADO'].includes(item.status))?.dataVencimento || '',
      first: items[0],
    };
  };

  return {
    isModalOpen,
    toasts, removeToast, statusScope, setStatusScope, search, setSearch,
    startDate, setStartDate, endDate, setEndDate, categoryFilterId, setCategoryFilterId,
    setPage, groupMode, setGroupMode, expandedGroups, mode, setMode,
    description, setDescription, value, setValue, dueDate, setDueDate,
    categoryId, setCategoryId, partnerType, setPartnerType, partnerId, setPartnerId,
    accountId, setAccountId, paymentMethod, setPaymentMethod, receiveItem, setReceiveItem,
    showCategoryModal, setShowCategoryModal, accounts, partners, categories, isLoading,
    activePolo, activeAccounts, receiveAccounts, createMutation, syncMutation, refreshMutation,
    receiveMutation, openCreateModal, closeCreateModal, filtered, totals, kpis,
    allGroups, totalItems, totalPages, currentPage, pageItems, pageGroups,
    validateAndSubmit, copyLink, openReceiveModal, toggleGroup, getGroupSummary,
  };
};

export type OutrosCreditosModel = ReturnType<typeof useOutrosCreditos>;
