import React, { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { CalendarDays, CheckCircle, Clock, CreditCard, ExternalLink, Filter, Search, TrendingUp, X, BadgeAlert, FileText, LayoutGrid, List, Download, Zap, RotateCcw } from 'lucide-react';
import FinanceiroCardItem from './FinanceiroCardItem';
import ReciboDespesaPreview, { ReciboData } from '../../gestor/cadastros/modelos-documentos/recibo/ReciboDespesaPreview';
import { paymentCheckoutService } from '../../asaas/asaas.service';
import EadPaymentModal, { EadPaymentPanelData } from '../../ead/components/EadPaymentModal';
import {
  invalidateAlunoEadPaymentQueries,
  useEadPaymentConfirmationWatcher,
} from '../../ead/hooks/useEadPaymentConfirmationWatcher';
import { getBanesePaymentActionLabel, hasRegisteredBaneseBoleto } from './banese/banese-payment.utils';
import BanesePaymentStatePage from './banese/BanesePaymentStatePage';
import useBanesePaymentDetails from './banese/hooks/useBanesePaymentDetails';
import {
  navigatePaymentWindow,
  preparePaymentWindow,
  renderPaymentWindowError,
} from '../shared/paymentWindow';

const BanesePaymentPage = React.lazy(() => import('./banese/BanesePaymentPage'));

interface FinanceiroPageProps {
  alunoId: string;
}

const FinanceiroPage: React.FC<FinanceiroPageProps> = ({ alunoId }) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const openedBaneseFromFinanceiroRef = useRef(false);
  const [selectedReceipt, setSelectedReceipt] = useState<any | null>(null);
  const [selectedEadPayment, setSelectedEadPayment] = useState<any | null>(null);
  const [eadPaymentMethod, setEadPaymentMethod] = useState<'PIX' | 'BOLETO' | 'CREDIT_CARD'>('PIX');
  const [isStartingEadPayment, setIsStartingEadPayment] = useState(false);
  const [eadPaymentPanel, setEadPaymentPanel] = useState<EadPaymentPanelData | null>(null);
  const [isGeneratingReceiptPdf, setIsGeneratingReceiptPdf] = useState(false);
  const [notice, setNotice] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [modalityFilter, setModalityFilter] = useState<'TODOS' | 'EAD' | 'TECNICO' | 'LIVRE' | 'ESPECIALIZACAO'>('TODOS');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('cards');
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [statusTab, setStatusTab] = useState<'ABERTO' | 'ATRASADO' | 'PAGO' | 'TODOS'>('ABERTO');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;
  const receiptRef = useRef<HTMLDivElement>(null);

  const invalidateAlunoPaymentQueries = React.useCallback(() => {
    invalidateAlunoEadPaymentQueries(queryClient, alunoId);
  }, [alunoId, queryClient]);

  const confirmEadPayment = React.useCallback(() => {
    setEadPaymentPanel(null);
    setNotice('Pagamento confirmado automaticamente. Curso liberado em Meus Cursos.');
    invalidateAlunoPaymentQueries();
    window.setTimeout(() => setNotice(''), 6500);
  }, [invalidateAlunoPaymentQueries]);

  useEadPaymentConfirmationWatcher({
    alunoId,
    panel: eadPaymentPanel,
    queryClient,
    onConfirmed: confirmEadPayment,
  });

  // O backend devolve o extrato e os valores financeiros canonicos.
  const {
    data: financeiroData,
    isLoading,
    isError: isFinanceiroError,
    refetch: refetchFinanceiro,
  } = useQuery<{
    rows: any[];
    summary: {
      totalPaid: number;
      totalPending: number;
      openByModality: Array<{ modality: string; count: number; total: number }>;
    };
  }>({
    queryKey: ['aluno-financeiro', alunoId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        'get_aluno_financeiro_portal_secure',
        { p_aluno_id: alunoId },
      );
      
      if (error) throw error;
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return {
          rows: [],
          summary: { totalPaid: 0, totalPending: 0, openByModality: [] },
        };
      }
      const payload = data as Record<string, any>;
      return {
        rows: Array.isArray(payload.rows) ? payload.rows : [],
        summary: {
          totalPaid: Number(payload.summary?.totalPaid || 0),
          totalPending: Number(payload.summary?.totalPending || 0),
          openByModality: Array.isArray(payload.summary?.openByModality)
            ? payload.summary.openByModality.map((item: any) => ({
                modality: String(item.modality || 'OUTROS'),
                count: Number(item.count || 0),
                total: Number(item.total || 0),
              }))
            : [],
        },
      };
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  const dbRecords = financeiroData?.rows || [];
  const canonicalSummary = financeiroData?.summary || {
    totalPaid: 0,
    totalPending: 0,
    openByModality: [],
  };

  useEffect(() => {
    const channel = supabase
      .channel(`aluno_financeiro_realtime_${alunoId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'finance_realtime_events',
          filter: `aluno_id=eq.${alunoId}`,
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: ['aluno-financeiro', alunoId],
            exact: true,
            refetchType: 'active',
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [alunoId, queryClient]);

  const hiddenStatuses = ['CANCELADO', 'ESTORNADO'];
  const installments = dbRecords.filter((record) => !hiddenStatuses.includes(String(record.status || '').toUpperCase()));
  const modalityOrder: string[] = ['EAD', 'TECNICO', 'LIVRE', 'ESPECIALIZACAO', 'OUTROS'];

  const getInstallmentTurma = (inst: any) =>
    Array.isArray(inst.turmas) ? inst.turmas[0] : inst.turmas;

  const getInstallmentModality = (inst: any) => {
    const turma = getInstallmentTurma(inst);
    const curso = turma && (Array.isArray(turma.cursos) ? turma.cursos[0] : turma.cursos);
    const rawModality = String(inst.modalidade || inst.courseModality || curso?.modalidade || '').toUpperCase();

    if (['EAD', 'TECNICO', 'LIVRE', 'ESPECIALIZACAO'].includes(rawModality)) {
      return rawModality;
    }

    return 'OUTROS';
  };

  const getInstallmentCourseName = (inst: any) => {
    const turma = getInstallmentTurma(inst);
    const curso = turma && (Array.isArray(turma.cursos) ? turma.cursos[0] : turma.cursos);
    return inst.cursoNome || inst.courseName || curso?.nome || 'Sem curso vinculado';
  };

  const getInstallmentCourseId = (inst: any) => {
    const turma = getInstallmentTurma(inst);
    const curso = turma && (Array.isArray(turma.cursos) ? turma.cursos[0] : turma.cursos);
    return inst.curso_id || turma?.curso_id || curso?.id || null;
  };

  const getRelatedPartner = (inst: any) =>
    Array.isArray(inst.parceiros) ? inst.parceiros[0] : inst.parceiros;

  const getInstallmentClassName = (modality: string) => {
    const palette = {
      EAD: 'bg-sky-50 text-sky-700 border-sky-100',
      TECNICO: 'bg-violet-50 text-violet-700 border-violet-100',
      LIVRE: 'bg-emerald-50 text-emerald-700 border-emerald-100',
      ESPECIALIZACAO: 'bg-amber-50 text-amber-700 border-amber-100',
      OUTROS: 'bg-slate-50 text-slate-700 border-slate-100'
    };

    return `${palette[modality as keyof typeof palette] || palette.OUTROS}`;
  };

  const getModalityAccent = (modality: string) => {
    const palette = {
      EAD: {
        line: 'border-l-sky-500',
        group: 'bg-sky-50/80 text-sky-800 border-sky-100',
        card: 'border-sky-100 bg-sky-50/25',
        action: 'bg-sky-600 hover:bg-sky-700 text-white shadow-sky-600/20',
        soft: 'bg-sky-50 text-sky-700 border-sky-100'
      },
      TECNICO: {
        line: 'border-l-violet-500',
        group: 'bg-violet-50/80 text-violet-800 border-violet-100',
        card: 'border-violet-100 bg-violet-50/25',
        action: 'bg-violet-600 hover:bg-violet-700 text-white shadow-violet-600/20',
        soft: 'bg-violet-50 text-violet-700 border-violet-100'
      },
      LIVRE: {
        line: 'border-l-emerald-500',
        group: 'bg-emerald-50/80 text-emerald-800 border-emerald-100',
        card: 'border-emerald-100 bg-emerald-50/25',
        action: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20',
        soft: 'bg-emerald-50 text-emerald-700 border-emerald-100'
      },
      ESPECIALIZACAO: {
        line: 'border-l-amber-500',
        group: 'bg-amber-50/80 text-amber-800 border-amber-100',
        card: 'border-amber-100 bg-amber-50/25',
        action: 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/20',
        soft: 'bg-amber-50 text-amber-700 border-amber-100'
      },
      OUTROS: {
        line: 'border-l-slate-400',
        group: 'bg-slate-50 text-slate-700 border-slate-100',
        card: 'border-slate-100 bg-slate-50/30',
        action: 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20',
        soft: 'bg-slate-50 text-slate-700 border-slate-100'
      }
    };

    return palette[modality as keyof typeof palette] || palette.OUTROS;
  };

  const parseDate = (value?: string | null) => {
    if (!value) return null;
    const parsed = new Date(`${value}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const getChargeKind = (inst: any, modality: string) => {
    const raw = String(inst.tipo_lancamento || '').toUpperCase();
    const description = String(inst.descricao || '').toLowerCase();

    if (modality === 'EAD' && description.includes('inscricao')) return 'Inscrição EAD';
    if (raw === 'MATRICULA' || description.includes('matricula') || description.includes('matrícula')) return 'Matrícula';
    if (raw === 'PARCELA' || description.includes('mensalidade')) return `Mensalidade${inst.parcela_numero ? ` ${inst.parcela_numero}` : ''}`;
    if (raw === 'REMATRICULA' || description.includes('rematricula') || description.includes('rematrícula')) return 'Rematrícula';
    return modality === 'EAD' ? 'Cobrança EAD' : 'Cobrança';
  };

  const toInstallmentRow = (inst: any) => {
    const modality = getInstallmentModality(inst);
    const turma = getInstallmentTurma(inst);
    const dueDate = parseDate(inst.data_vencimento);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isOverdue = String(inst.status || '').toUpperCase() === 'VENCIDO' || (String(inst.status || '').toUpperCase() === 'PENDENTE' && Boolean(dueDate) && dueDate < today);
    const financialSummary = inst.financial_summary;
    return {
      ...inst,
      modalidade: modality,
      cursoId: getInstallmentCourseId(inst),
      cursoNome: getInstallmentCourseName(inst),
      turmaNome: turma?.nome || 'N/A',
      chargeKind: getChargeKind(inst, modality),
      financialSummary,
      modalityAccent: getModalityAccent(modality),
      isOverdue
    };
  };
  const allInstallmentRows = dbRecords.map(toInstallmentRow);
  const installmentRows = allInstallmentRows.filter((record) => (
    !hiddenStatuses.includes(String(record.status || '').toUpperCase())
  ));

  const selectedBanesePaymentId = searchParams.get('banesePayment') || searchParams.get('baneseBoleto');
  const selectedBanesePaymentSummary = selectedBanesePaymentId
    ? allInstallmentRows.find((record) => record.id === selectedBanesePaymentId && hasRegisteredBaneseBoleto(record)) || null
    : null;
  const {
    data: banesePaymentDetails = [],
    isLoading: isBanesePaymentLoading,
    isError: isBanesePaymentError,
    refetch: refetchBanesePayment,
  } = useBanesePaymentDetails({
    alunoId,
    paymentId: selectedBanesePaymentId,
    summary: selectedBanesePaymentSummary,
  });
  const banesePaymentRows = selectedBanesePaymentSummary
    ? banesePaymentDetails.flatMap((detail) => {
      const summary = allInstallmentRows.find((record) => (
        record.id === detail.id && hasRegisteredBaneseBoleto(record)
      ));
      const sameBankTitle = summary
        && String(summary.gateway_boleto_linha_digitavel || '').replace(/\D/g, '')
          === String(detail.gateway_boleto_linha_digitavel || '').replace(/\D/g, '')
        && String(summary.gateway_boleto_codigo_barras || '').replace(/\D/g, '')
          === String(detail.gateway_boleto_codigo_barras || '').replace(/\D/g, '');
      if (!summary || !sameBankTitle) return [];
      return [toInstallmentRow({
        ...detail,
        turmas: summary.turmas,
        modalidade: detail.modalidade || summary.modalidade,
        cursoNome: detail.cursoNome || summary.cursoNome,
        turmaNome: detail.turmaNome || summary.turmaNome,
        curso_id: detail.curso_id || summary.cursoId,
        turma_id: detail.turma_id || summary.turma_id,
        matricula_id: detail.matricula_id || summary.matricula_id,
        status: summary.status,
        gateway_status: summary.gateway_status,
        valor_pago: summary.valor_pago,
        data_pagamento: summary.data_pagamento,
        financial_summary: summary.financial_summary,
      })];
    })
    : [];
  const selectedBanesePayment = selectedBanesePaymentId
    ? banesePaymentRows.find((record) => record.id === selectedBanesePaymentId && hasRegisteredBaneseBoleto(record)) || null
    : null;

  const openBanesePayment = React.useCallback((record: any) => {
    if (!hasRegisteredBaneseBoleto(record)) return;
    openedBaneseFromFinanceiroRef.current = true;
    const next = new URLSearchParams(window.location.search);
    next.set('module', 'financeiro');
    next.set('banesePayment', record.id);
    next.delete('baneseBoleto');
    setSearchParams(next);
  }, [setSearchParams]);

  const closeBanesePayment = React.useCallback(() => {
    if (openedBaneseFromFinanceiroRef.current) {
      openedBaneseFromFinanceiroRef.current = false;
      navigate(-1);
      return;
    }
    const next = new URLSearchParams(window.location.search);
    next.delete('banesePayment');
    next.delete('baneseBoleto');
    next.set('module', 'financeiro');
    setSearchParams(next, { replace: true });
  }, [navigate, setSearchParams]);

  useEffect(() => {
    const legacyId = searchParams.get('baneseBoleto');
    if (!legacyId || searchParams.get('banesePayment')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('baneseBoleto');
    next.set('banesePayment', legacyId);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const refreshBanesePayment = React.useCallback(async () => {
    const financeiroResult = await refetchFinanceiro();
    if (financeiroResult.error) throw financeiroResult.error;
    if (selectedBanesePaymentSummary) {
      const detailResult = await refetchBanesePayment();
      if (detailResult.error) throw detailResult.error;
    }
  }, [refetchBanesePayment, refetchFinanceiro, selectedBanesePaymentSummary]);

  const filteredBySearchDateModality = installmentRows.filter((inst) => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const matchesSearch = !normalizedSearch || [
      inst.descricao,
      inst.cursoNome,
      inst.turmaNome,
      inst.status,
      inst.forma_pagamento
    ].some((item) => String(item || '').toLowerCase().includes(normalizedSearch));

    const dueDate = parseDate(inst.data_vencimento);
    const start = startDate ? parseDate(startDate) : null;
    const end = endDate ? parseDate(endDate) : null;
    const matchesDate = (() => {
      if (!dueDate) return true;
      if (start && dueDate < start) return false;
      if (end && dueDate > end) return false;
      return true;
    })();

    const matchesModality = modalityFilter === 'TODOS' ? true : inst.modalidade === modalityFilter;

    return matchesSearch && matchesDate && matchesModality;
  });

  const tabCounts = {
    ABERTO: filteredBySearchDateModality.filter((inst) => String(inst.status || '').toUpperCase() === 'PENDENTE' && !inst.isOverdue).length,
    ATRASADO: filteredBySearchDateModality.filter((inst) => inst.isOverdue).length,
    PAGO: filteredBySearchDateModality.filter((inst) => String(inst.status || '').toUpperCase() === 'PAGO').length,
    TODOS: filteredBySearchDateModality.length
  };

  const openSummaryByModality = modalityOrder
    .map((modality) => canonicalSummary.openByModality.find((item) => item.modality === modality))
    .filter((item): item is { modality: string; count: number; total: number } => Boolean(item));

  const filteredInstallments = filteredBySearchDateModality.filter((inst) => {
    const status = String(inst.status || '').toUpperCase();
    const matchesStatus = (() => {
      if (statusTab === 'ABERTO') return status === 'PENDENTE' && !inst.isOverdue;
      if (statusTab === 'ATRASADO') return inst.isOverdue;
      if (statusTab === 'PAGO') return status === 'PAGO';
      return true;
    })();

    return matchesStatus;
  }).sort((a, b) => {
    const modalityDiff = modalityOrder.indexOf(a.modalidade) - modalityOrder.indexOf(b.modalidade);
    if (modalityDiff !== 0) return modalityDiff;
    return String(a.data_vencimento || '').localeCompare(String(b.data_vencimento || ''))
      || String(a.descricao || '').localeCompare(String(b.descricao || ''), 'pt-BR');
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, startDate, endDate, modalityFilter, statusTab, viewMode]);

  useEffect(() => {
    const mobileQuery = window.matchMedia('(max-width: 639px)');
    const keepMobileCards = () => {
      if (mobileQuery.matches) setViewMode('cards');
    };
    keepMobileCards();
    mobileQuery.addEventListener('change', keepMobileCards);
    return () => mobileQuery.removeEventListener('change', keepMobileCards);
  }, []);

  useEffect(() => {
    const hasOpenModal = Boolean(selectedReceipt || selectedEadPayment);
    if (!hasOpenModal) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (selectedReceipt) closeReceipt();
        if (selectedEadPayment) closeEadPaymentChoice();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedReceipt, selectedEadPayment]);

  useEffect(() => {
    const hasOpenOverlay = Boolean(selectedReceipt || selectedEadPayment);
    if (!hasOpenOverlay) return;

    const bodyOverflow = document.body.style.overflow;
    const rootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = rootOverflow;
    };
  }, [selectedReceipt, selectedEadPayment]);

  const totalPages = Math.max(1, Math.ceil(filteredInstallments.length / pageSize));
  const currentPageSafe = Math.min(currentPage, totalPages);
  const pageOffset = (currentPageSafe - 1) * pageSize;
  const visibleInstallments = filteredInstallments.slice(pageOffset, pageOffset + pageSize);
  const groupedVisibleInstallments = visibleInstallments.reduce<Record<string, any[]>>((acc, inst) => {
    const modality = inst.modalidade || 'OUTROS';
    if (!acc[modality]) acc[modality] = [];
    acc[modality].push(inst);
    return acc;
  }, {});

  const safeSetPage = (page: number) => {
    if (page < 1) return;
    if (page > totalPages) return;
    setCurrentPage(page);
  };

  const totalPaid = canonicalSummary.totalPaid;
  const totalPending = canonicalSummary.totalPending;

  const copyPaymentLink = async (url?: string | null) => {
    if (!url) {
      setNotice('Esta cobrança ainda não possui link de pagamento. Fale com a secretaria para reenviar a cobrança.');
      return;
    }
    await navigator.clipboard.writeText(url);
    setNotice('Link de pagamento copiado.');
    setTimeout(() => setNotice(''), 2500);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateStr;
  };

  const formatPaymentMethod = (method?: string | null) => {
    const normalized = String(method || '').trim();
    return normalized || 'Forma não informada';
  };

  const normalizeEadPaymentMethod = (method?: string | null): 'PIX' | 'BOLETO' | 'CREDIT_CARD' => {
    const normalized = String(method || '').trim().toUpperCase();
    if (normalized === 'BOLETO') return 'BOLETO';
    if (normalized === 'CARTAO' || normalized === 'CARTÃO' || normalized === 'CREDIT_CARD') return 'CREDIT_CARD';
    return 'PIX';
  };

  const openEadPaymentChoice = (inst: any) => {
    const courseId = inst.cursoId || getInstallmentCourseId(inst);
    if (!courseId) {
      setNotice('Não foi possível localizar o curso desta cobrança EAD. Fale com a secretaria.');
      setTimeout(() => setNotice(''), 4500);
      return;
    }
    setSelectedEadPayment(inst);
    setEadPaymentMethod(normalizeEadPaymentMethod(inst.forma_pagamento));
  };

  const closeEadPaymentChoice = () => {
    if (isStartingEadPayment) return;
    setSelectedEadPayment(null);
  };

  const startEadPayment = async () => {
    if (!selectedEadPayment) return;
    const courseId = selectedEadPayment.cursoId || getInstallmentCourseId(selectedEadPayment);
    const turmaId = selectedEadPayment.turma_id || null;
    if (!courseId) {
      setNotice('Não foi possível localizar o curso desta cobrança EAD. Fale com a secretaria.');
      setTimeout(() => setNotice(''), 4500);
      return;
    }

    const paymentWindow = eadPaymentMethod === 'BOLETO'
      ? preparePaymentWindow()
      : null;
    setIsStartingEadPayment(true);
    try {
      const result = await paymentCheckoutService.getPublicCheckout(
        courseId,
        alunoId,
        turmaId || undefined,
        { method: eadPaymentMethod } as any
      );

      const checkoutResult = result as any;
      const provider = String(checkoutResult?.payment?.provider || '').toLowerCase();
      const checkoutUrl = checkoutResult?.url || checkoutResult?.payment?.invoiceUrl || checkoutResult?.paymentLinkUrl;
      const hasPixQrCode = Boolean(checkoutResult?.payment?.pixQrCode?.payload || checkoutResult?.payment?.pixQrCode?.encodedImage);
      if (eadPaymentMethod === 'PIX' && hasPixQrCode) {
        setSelectedEadPayment(null);
        setEadPaymentPanel(result as EadPaymentPanelData);
        invalidateAlunoPaymentQueries();
        return;
      }

      if (eadPaymentMethod === 'CREDIT_CARD') {
        if (!checkoutUrl) throw new Error('O gateway não retornou o link do checkout do cartão.');
        if (provider === 'mercado_pago') {
          invalidateAlunoPaymentQueries();
          window.location.assign(checkoutUrl);
        } else {
          window.open(checkoutUrl, '_blank', 'noopener,noreferrer');
        }
        setSelectedEadPayment(null);
        return;
      }

      if (eadPaymentMethod === 'BOLETO' && !checkoutUrl) {
        throw new Error('O Banese registrou a cobrança, mas não retornou a rota autenticada do boleto.');
      }

      if (eadPaymentMethod === 'BOLETO' && checkoutUrl) {
        invalidateAlunoPaymentQueries();
        setSelectedEadPayment(null);
        if (!navigatePaymentWindow(paymentWindow, checkoutUrl)) {
          setEadPaymentPanel(result as EadPaymentPanelData);
          setNotice('O navegador bloqueou a nova aba. Use “Abrir boleto” para continuar sem sair do portal.');
          setTimeout(() => setNotice(''), 5500);
        }
        return;
      }

      const isHostedMercadoPagoCheckout = provider === 'mercado_pago'
        || String(checkoutUrl || '').includes('mercadopago.com');
      if (isHostedMercadoPagoCheckout && checkoutUrl) {
        window.open(checkoutUrl, '_blank', 'noopener,noreferrer');
        setSelectedEadPayment(null);
        return;
      }

      setSelectedEadPayment(null);
      setEadPaymentPanel(result as EadPaymentPanelData);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível preparar o pagamento EAD.';
      renderPaymentWindowError(paymentWindow, message);
      setNotice(message);
      setTimeout(() => setNotice(''), 5500);
    } finally {
      setIsStartingEadPayment(false);
    }
  };

  const isPaidThroughAsaas = (inst: any) => {
    const status = String(inst.status || '').toUpperCase();
    const asaasStatus = String(inst.asaas_status || '').toUpperCase();
    return status === 'PAGO' && (
      String(inst.origem_pagamento || '').toUpperCase() === 'ASAAS'
      || ['RECEIVED', 'CONFIRMED'].includes(asaasStatus)
      || Boolean(inst.asaas_transaction_receipt_url)
    );
  };

  const getPaidReceiptLabel = (inst: any) =>
    isPaidThroughAsaas(inst) ? 'Comprovante' : 'Recibo Universo';

  const hasAdvancedFilters = Boolean(startDate || endDate || modalityFilter !== 'TODOS');
  const clearAdvancedFilters = () => {
    setStartDate('');
    setEndDate('');
    setModalityFilter('TODOS');
  };

  const openReceipt = (inst: any) => {
    if (String(inst.status || '').toUpperCase() !== 'PAGO') {
      setNotice('O recibo fica disponível somente para cobranças pagas.');
      return;
    }

    if (isPaidThroughAsaas(inst)) {
      const receiptUrl = inst.asaas_transaction_receipt_url;
      if (receiptUrl) {
        const opened = window.open(receiptUrl, '_blank');
        if (!opened) {
          setNotice('O Asaas não permite abrir o comprovante dentro da plataforma. Libere pop-ups ou clique no link para abrir o comprovante oficial.');
          setTimeout(() => setNotice(''), 6500);
        } else {
          opened.opener = null;
        }
        return;
      }
      setNotice('O comprovante ainda não foi retornado. Aguarde a atualização do pagamento ou fale com a secretaria.');
      setTimeout(() => setNotice(''), 4500);
      return;
    }

    setSelectedReceipt(inst);
  };

  const closeReceipt = () => {
    setSelectedReceipt(null);
  };

  const downloadReceiptPdf = async () => {
    if (!selectedReceipt || !receiptRef.current) return;
    const originalNotice = notice;
    setIsGeneratingReceiptPdf(true);

    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      const canvas = await html2canvas(receiptRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff'
      });

      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 190;
      const pageHeight = 277;
      const ratio = imgWidth / canvas.width;
      let remainingHeight = canvas.height;
      const pagePixelHeight = pageHeight / ratio;
      let position = 0;
      let pageIndex = 0;

      while (remainingHeight > 0) {
        const sliceHeight = Math.min(pagePixelHeight, remainingHeight);
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = sliceHeight;
        const ctx = sliceCanvas.getContext('2d');

        if (!ctx) {
          throw new Error('Não foi possível preparar o canvas do recibo.');
        }

        ctx.drawImage(
          canvas,
          0,
          position,
          canvas.width,
          sliceHeight,
          0,
          0,
          canvas.width,
          sliceHeight
        );

        const sliceData = sliceCanvas.toDataURL('image/png');
        const sliceHeightMm = sliceHeight * ratio;

        if (pageIndex > 0) {
          pdf.addPage();
        }

        pdf.addImage(sliceData, 'PNG', 10, 10, imgWidth, sliceHeightMm);
        remainingHeight -= sliceHeight;
        position += sliceHeight;
        pageIndex += 1;
      }

      const fileName = `recibo-${String(selectedReceipt.id || '').slice(0, 8).toUpperCase() || 'PAGO'}-${new Date().toISOString().slice(0, 10)}.pdf`;
      pdf.save(fileName);
      setNotice('Recibo baixado com sucesso.');
      setTimeout(() => setNotice(originalNotice), 2000);
    } catch {
      setNotice('Não foi possível gerar o PDF do recibo. Tente novamente.');
      setTimeout(() => setNotice(''), 2000);
    } finally {
      setIsGeneratingReceiptPdf(false);
    }
  };

  const getReceiptPayload = (inst: any): ReciboData => {
    const receiptNumber = String(inst?.id || '').slice(0, 8).toUpperCase() || 'RECIBO';
    const parceiro = getRelatedPartner(inst);
    const payerName = parceiro?.nome || 'Aluno';
    const payerDocument = parceiro?.cpf_cnpj || '';
    const courseName = inst?.cursoNome || getInstallmentCourseName(inst);
    const turmaNome = inst?.turmaNome || 'N/A';
    return {
      reciboTitulo: 'Recibo de Pagamento',
      reciboNumero: receiptNumber,
      contraparteLabel: 'Aluno / Pagador',
      assinaturaNome: 'Universo Cursos e Consultoria',
      empresaNome: 'Universo Cursos e Consultoria',
      descricao: inst?.descricao || 'Recibo de pagamento',
      valor: Number(inst?.valor || 0),
      valorPago: Number(inst?.valor_pago || inst?.valor || 0),
      dataVencimento: inst?.data_vencimento || new Date().toISOString().slice(0, 10),
      dataPagamento: inst?.data_pagamento || String(inst?.updated_at || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
      fornecedorNome: payerName,
      fornecedorId: payerDocument,
      categoriaNome: courseName ? `${courseName}${turmaNome && turmaNome !== 'N/A' ? ` - Turma ${turmaNome}` : ''}` : undefined,
      formaPagamento: inst?.forma_pagamento || inst?.origem_pagamento || 'Recebimento manual',
      status: String(inst?.status || 'PAGO').toUpperCase(),
      observacao: 'Recibo interno emitido para pagamento registrado manualmente no financeiro.'
    };
  };

  const receiptPayload = selectedReceipt ? getReceiptPayload(selectedReceipt) : null;

  const getInstallmentStatusBadge = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'PAGO':
        return (
          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-emerald-100">
            <CheckCircle size={10} /> Pago
          </span>
        );
      case 'PENDENTE':
        return (
          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-amber-100">
            <Clock size={10} /> Pendente
          </span>
        );
      case 'VENCIDO':
        return (
          <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-red-100">
            <BadgeAlert size={10} /> Vencido
          </span>
        );
      case 'SUSPENSO':
        return (
          <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-blue-100">
            <Clock size={10} /> Suspenso
          </span>
        );
      default:
        return null;
    }
  };

  const getModalityLabel = (modality: string) => {
    const map: Record<string, string> = {
      EAD: 'EAD',
      TECNICO: 'Técnico',
      LIVRE: 'Livre',
      ESPECIALIZACAO: 'Especialização',
      OUTROS: 'Outros'
    };

    return map[modality] || 'Outros';
  };

  const renderActions = (inst: any) => {
    const status = String(inst.status || '').toUpperCase();
    const isBaneseBoleto = hasRegisteredBaneseBoleto(inst);

    if (['PENDENTE', 'VENCIDO'].includes(status) || inst.isOverdue) {
      if (isBaneseBoleto) {
        return (
          <button
            onClick={() => openBanesePayment(inst)}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 transition-colors hover:bg-emerald-100"
          >
            <FileText size={12} /> {getBanesePaymentActionLabel(inst)}
          </button>
        );
      }
      if (inst.modalidade === 'EAD') {
        return (
          <div className="flex justify-start gap-2">
            <button
              onClick={() => openEadPaymentChoice(inst)}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold text-[10px] uppercase tracking-wider rounded-lg transition-colors"
            >
              <CreditCard size={12} /> Pagar agora
            </button>
            {inst.asaas_invoice_url && (
              <button
                onClick={() => copyPaymentLink(inst.asaas_invoice_url)}
                className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold text-[10px] uppercase tracking-wider rounded-lg transition-colors"
              >
                Copiar link
              </button>
            )}
          </div>
        );
      }

      if (inst.asaas_invoice_url) {
        return (
          <div className="flex justify-start gap-2">
            <a
              href={inst.asaas_invoice_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold text-[10px] uppercase tracking-wider rounded-lg transition-colors"
            >
              <ExternalLink size={12} /> Pagar agora
            </a>
            <button
              onClick={() => copyPaymentLink(inst.asaas_invoice_url)}
              className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold text-[10px] uppercase tracking-wider rounded-lg transition-colors"
            >
              Copiar link
            </button>
          </div>
        );
      }

      return (
        <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-50 text-slate-500 font-bold text-[10px] uppercase tracking-wider rounded-lg border border-slate-100">
          <Clock size={12} /> Cobrança em emissão
        </span>
      );
    }

    if (status === 'PAGO') {
      return (
        <button
          onClick={() => openReceipt(inst)}
          className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 font-bold text-[10px] uppercase tracking-wider rounded-lg transition-colors"
        >
          {getPaidReceiptLabel(inst)}
        </button>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-50 text-slate-500 font-bold text-[10px] uppercase tracking-wider rounded-lg border border-slate-100">
        Sem comprovante
      </span>
    );
  };

  if (selectedBanesePaymentId) {
    if (isLoading || (selectedBanesePaymentSummary && isBanesePaymentLoading)) {
      return <BanesePaymentStatePage state="loading" onBack={closeBanesePayment} />;
    }
    if (isFinanceiroError || isBanesePaymentError) {
      return (
        <BanesePaymentStatePage
          state="error"
          onBack={closeBanesePayment}
          onRetry={refreshBanesePayment}
        />
      );
    }
    if (!selectedBanesePayment) {
      return (
        <BanesePaymentStatePage
          state="not-found"
          onBack={closeBanesePayment}
          onRetry={refreshBanesePayment}
        />
      );
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-5 animate-fadeIn sm:space-y-6">
      {/* Header Panel */}
      <div className="mb-5 flex items-start justify-between sm:mb-6 sm:items-center">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-xl font-black uppercase tracking-tight text-[#001a33] sm:text-2xl">
            <CreditCard className="shrink-0 text-blue-600" size={22} />
            <span>Financeiro</span>
          </h2>
          <p className="mt-1 max-w-xl text-xs font-medium leading-relaxed text-slate-500">Acompanhe parcelas, vencimentos e comprovantes em um só lugar.</p>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-5">
        <div className="flex items-center justify-between rounded-3xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6">
          <div className="space-y-1">
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Total Pago</p>
            <p className="text-2xl font-black text-emerald-600">{formatCurrency(totalPaid)}</p>
            <p className="text-[10px] text-slate-500 font-medium">Lançamentos compensados</p>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 sm:h-12 sm:w-12">
            <TrendingUp size={22} />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-3xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6">
          <div className="space-y-1">
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">A pagar / Aberto</p>
            <p className="text-2xl font-black text-[#001a33]">{formatCurrency(totalPending)}</p>
            <p className="text-[10px] text-slate-500 font-medium">Mensalidades futuras e pendentes</p>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 sm:h-12 sm:w-12">
            <Clock size={22} />
          </div>
        </div>
      </div>

      {openSummaryByModality.length > 0 && (
        <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm sm:rounded-[2rem]">
          <div className="mb-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-600">Em aberto por tipo</p>
              <p className="text-xs font-bold leading-relaxed text-slate-500">Valores pendentes organizados por modalidade.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {openSummaryByModality.map((item) => (
              <div key={item.modality} className={`rounded-2xl border px-4 py-3 ${getModalityAccent(item.modality).group}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-black uppercase tracking-widest">{getModalityLabel(item.modality)}</span>
                  <span className="rounded-full bg-white/70 px-2 py-1 text-[10px] font-black uppercase tracking-widest">
                    {item.count} item{item.count === 1 ? '' : 's'}
                  </span>
                </div>
                <p className="mt-2 text-xl font-black">{formatCurrency(item.total)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter + List + Views */}
      <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6 md:rounded-[2.5rem] md:p-8">
        <div className="mb-5 flex items-center gap-2 sm:mb-6">
          <FileText size={16} className="text-blue-500" />
          <h3 className="font-bold text-xs uppercase tracking-wider text-[#001a33]">Histórico de Cobranças</h3>
        </div>

        {notice && (
          <div className="mb-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-bold text-blue-700">
            {notice}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:gap-4">
          <div className="lg:col-span-4">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2 block">
              <span className="inline-flex items-center gap-1"><Search size={12} /> Buscar</span>
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por descrição, curso ou status"
              className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowMobileFilters((current) => !current)}
            className="flex h-12 items-center justify-between rounded-xl border border-slate-200 bg-white px-4 text-xs font-black uppercase tracking-wider text-slate-600 lg:hidden"
            aria-expanded={showMobileFilters}
          >
            <span className="inline-flex items-center gap-2"><Filter size={15} /> Mais filtros</span>
            <span className="rounded-full bg-blue-50 px-2 py-1 text-[9px] text-blue-700">{hasAdvancedFilters ? 'Ativos' : showMobileFilters ? 'Fechar' : 'Abrir'}</span>
          </button>

          <div className={`${showMobileFilters ? 'grid' : 'hidden'} grid-cols-1 gap-3 rounded-2xl bg-slate-50 p-3 lg:contents`}>
          <div className="lg:col-span-2">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2 block">
              <span className="inline-flex items-center gap-1"><CalendarDays size={12} /> Data inicial</span>
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 lg:bg-slate-50"
            />
          </div>

          <div className="lg:col-span-2">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2 block">
              <span className="inline-flex items-center gap-1"><CalendarDays size={12} /> Data final</span>
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 lg:bg-slate-50"
            />
          </div>

          <div className="lg:col-span-2">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2 block">
              <span className="inline-flex items-center gap-1"><Filter size={12} /> Tipo</span>
            </label>
            <select
              value={modalityFilter}
              onChange={(e) => setModalityFilter(e.target.value as 'TODOS' | 'EAD' | 'TECNICO' | 'LIVRE' | 'ESPECIALIZACAO')}
              className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 lg:bg-slate-50"
            >
              <option value="TODOS">Todos os tipos</option>
              <option value="EAD">EAD</option>
              <option value="TECNICO">Técnico</option>
              <option value="LIVRE">Livre</option>
              <option value="ESPECIALIZACAO">Especialização</option>
            </select>
          </div>

          <div className="hidden sm:block lg:col-span-2">
            <label className="sr-only">Visualização</label>
            <div className="grid h-12 grid-cols-2 gap-2">
              <button
                type="button"
                title="Visualização em tabela"
                aria-label="Exibir cobranças em tabela"
                onClick={() => setViewMode('table')}
                className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors inline-flex items-center justify-center ${
                  viewMode === 'table'
                    ? 'bg-blue-600 text-white shadow'
                    : 'bg-slate-50 text-slate-600 border border-slate-200'
                }`}
              >
                <List size={16} />
              </button>
              <button
                type="button"
                title="Visualização em cards"
                aria-label="Exibir cobranças em cartões"
                onClick={() => setViewMode('cards')}
                className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors inline-flex items-center justify-center ${
                  viewMode === 'cards'
                    ? 'bg-blue-600 text-white shadow'
                    : 'bg-slate-50 text-slate-600 border border-slate-200'
                }`}
              >
                <LayoutGrid size={16} />
              </button>
            </div>
          </div>
          {hasAdvancedFilters && (
            <button type="button" onClick={clearAdvancedFilters} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-[10px] font-black uppercase tracking-wider text-slate-600 lg:hidden">
              <RotateCcw size={13} /> Limpar filtros
            </button>
          )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {[
            { key: 'ABERTO', label: 'Em aberto', count: tabCounts.ABERTO },
            { key: 'ATRASADO', label: 'Atrasado', count: tabCounts.ATRASADO },
            { key: 'PAGO', label: 'Pagos', count: tabCounts.PAGO },
            { key: 'TODOS', label: 'Todos', count: tabCounts.TODOS }
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusTab(tab.key as 'ABERTO' | 'ATRASADO' | 'PAGO' | 'TODOS')}
              className={`min-h-11 rounded-xl px-3 py-2.5 text-[10px] font-black uppercase tracking-wider transition-colors sm:rounded-full ${
                statusTab === tab.key
                  ? 'bg-blue-600 text-white shadow'
                  : 'bg-slate-100 text-slate-600 border border-slate-200'
              }`}
            >
              <span className="inline-flex items-center gap-1">
                {tab.label}
                <span className="px-1.5 py-0.5 rounded-full bg-white/20 text-[9px] font-black">{tab.count}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-1 text-[11px] font-bold text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Exibindo <strong className="font-black">{filteredInstallments.length}</strong> cobranças
            {filteredInstallments.length !== installments.length && (
              <span> de <strong className="font-black">{installments.length}</strong> no total</span>
            )}
          </span>
          {modalityFilter !== 'TODOS' && <span className="uppercase text-blue-600">Tipo: {getModalityLabel(modalityFilter)}</span>}
        </div>

        {viewMode === 'table' ? (
          <div className="overflow-x-auto mt-4">
            <table className="w-full min-w-[980px] text-left text-xs font-medium text-slate-500">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] text-slate-400 font-black uppercase tracking-wider">
                  <th className="py-4 px-4">Descrição</th>
                  <th className="py-4 px-4">Tipo</th>
                  <th className="py-4 px-4">Vencimento</th>
                  <th className="py-4 px-4">Status</th>
                  <th className="py-4 px-4">Total</th>
                  <th className="py-4 px-4">Pagamento</th>
                  <th className="py-4 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {visibleInstallments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-xs font-bold text-slate-400">
                      Nenhuma cobrança encontrada com os filtros atuais.
                    </td>
                  </tr>
                ) : modalityOrder.map((modality) => {
                  const installmentsByModality = groupedVisibleInstallments[modality] || [];
                  if (installmentsByModality.length === 0) return null;

                  return (
                    <React.Fragment key={modality}>
                      <tr>
                        <td colSpan={7} className="px-4 pb-2 pt-5">
                          <div className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${getModalityAccent(modality).group}`}>
                            <span className="text-[10px] font-black uppercase tracking-[0.24em]">
                              {getModalityLabel(modality)}
                            </span>
                            <span className="text-[10px] font-black uppercase tracking-widest">
                              {installmentsByModality.length} cobrança{installmentsByModality.length === 1 ? '' : 's'}
                            </span>
                          </div>
                        </td>
                      </tr>
                      {installmentsByModality.map((inst) => {
                        const summary = inst.financialSummary;
                        const statusForBadge = inst.isOverdue ? 'VENCIDO' : inst.status;

                        return (
                          <React.Fragment key={inst.id}>
                            <tr className={`border-l-4 border-b border-slate-100 ${inst.modalityAccent.line} transition-colors hover:bg-slate-50/70`}>
                              <td className="py-4 px-4">
                                <p className="font-black leading-snug text-slate-800">{inst.descricao}</p>
                                <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                  {inst.cursoNome} • {inst.turmaNome}
                                </p>
                              </td>
                              <td className="py-4 px-4">
                                <span className={`inline-flex items-center text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border ${getInstallmentClassName(inst.modalidade)}`}>
                                  {getModalityLabel(inst.modalidade)}
                                </span>
                                <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-slate-400">
                                  {inst.chargeKind}
                                </p>
                              </td>
                              <td className="py-4 px-4 font-bold text-slate-600">{formatDate(inst.data_vencimento)}</td>
                              <td className="py-4 px-4">{getInstallmentStatusBadge(statusForBadge)}</td>
                              <td className="py-4 px-4">
                                <p className={`text-base font-black ${inst.isOverdue ? 'text-rose-600' : 'text-[#001a33]'}`}>
                                  {formatCurrency(summary.highlightValue)}
                                </p>
                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                                  {summary.highlightLabel}
                                </p>
                              </td>
                              <td className="py-4 px-4">
                                {String(inst.status || '').toUpperCase() === 'PAGO' ? (
                                  <span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">
                                    {formatDate(inst.data_pagamento)} via {formatPaymentMethod(inst.forma_pagamento)}
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-bold text-slate-400">Aguardando pagamento</span>
                                )}
                              </td>
                              <td className="py-4 px-4 text-right">{renderActions(inst)}</td>
                            </tr>
                            <tr className="border-b border-slate-100 bg-slate-50/45">
                              <td colSpan={7} className="px-4 py-3">
                                <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
                                  <div className="rounded-2xl bg-white px-3 py-2">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Valor da parcela</p>
                                    <p className="mt-1 text-sm font-black text-[#001a33]">{formatCurrency(summary.baseValue)}</p>
                                  </div>
                                  <div className="rounded-2xl bg-white px-3 py-2">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Desconto em dia</p>
                                    <p className={`mt-1 text-sm font-black ${summary.hasDiscount ? 'text-emerald-600' : 'text-slate-400'}`}>
                                      {summary.hasDiscount ? `- ${formatCurrency(summary.punctualDiscount)}` : formatCurrency(0)}
                                    </p>
                                  </div>
                                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-emerald-700">Total até vencimento</p>
                                    <p className="mt-1 text-base font-black text-emerald-700">{formatCurrency(summary.totalUntilDue)}</p>
                                  </div>
                                  <div className="rounded-2xl bg-white px-3 py-2">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                                      Juros {summary.interestPercent > 0 ? `(${summary.interestPercent}%)` : ''}
                                    </p>
                                    <p className={`mt-1 text-sm font-black ${summary.interestValue > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                                      {formatCurrency(summary.interestValue)}
                                    </p>
                                  </div>
                                  <div className="rounded-2xl bg-white px-3 py-2">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Multa</p>
                                    <p className={`mt-1 text-sm font-black ${summary.lateFeeValue > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                                      {formatCurrency(summary.lateFeeValue)}
                                    </p>
                                  </div>
                                  <div className={`rounded-2xl px-3 py-2 ${inst.isOverdue ? 'border border-rose-100 bg-rose-50' : 'bg-white'}`}>
                                    <p className={`text-[9px] font-black uppercase tracking-widest ${inst.isOverdue ? 'text-rose-700' : 'text-slate-400'}`}>
                                      Total em atraso
                                    </p>
                                    <p className={`mt-1 text-base font-black ${inst.isOverdue ? 'text-rose-700' : 'text-slate-400'}`}>
                                      {inst.isOverdue ? formatCurrency(summary.totalWithLate) : '—'}
                                    </p>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          </React.Fragment>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4 space-y-6">
            {visibleInstallments.length === 0 ? (
              <div className="px-4 py-12 text-center text-xs font-bold text-slate-400">
                Nenhuma cobrança encontrada com os filtros atuais.
              </div>
            ) : modalityOrder.map((modality) => {
              const installmentsByModality = groupedVisibleInstallments[modality] || [];
              if (installmentsByModality.length === 0) return null;

              return (
                <div key={modality} className="space-y-3">
                  <div className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${getModalityAccent(modality).group}`}>
                    <h4 className="text-sm font-black uppercase tracking-wider">
                      {getModalityLabel(modality)}
                    </h4>
                    <span className="text-[10px] font-black uppercase tracking-wider opacity-80">
                      {installmentsByModality.length} item{installmentsByModality.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {installmentsByModality.map((inst) => (
                      <FinanceiroCardItem
                        key={inst.id}
                        installment={inst}
                        formatCurrency={formatCurrency}
                        formatDate={formatDate}
                        getModalityLabel={getModalityLabel}
                        getModalityClassName={getInstallmentClassName}
                        getInstallmentStatusBadge={getInstallmentStatusBadge}
                        onCopyLink={copyPaymentLink}
                        onOpenReceipt={openReceipt}
                        onPayNow={openEadPaymentChoice}
                        onOpenBanesePayment={openBanesePayment}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-5 flex flex-col sm:flex-row justify-between items-center gap-3">
          <p className="text-[11px] text-slate-500 font-bold">
            Página {currentPageSafe} de {totalPages}
          </p>
          <div className="inline-flex items-center gap-2">
            <button
              onClick={() => safeSetPage(currentPageSafe - 1)}
              disabled={currentPageSafe === 1}
              className="px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wider bg-slate-100 text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Anterior
            </button>
            <button
              onClick={() => safeSetPage(currentPageSafe + 1)}
              disabled={currentPageSafe === totalPages}
              className="px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wider bg-slate-100 text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Próxima
            </button>
          </div>
        </div>
      </div>

      {selectedEadPayment && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed left-0 top-0 right-0 bottom-0 z-[9999] flex h-dvh w-screen items-center justify-center overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm pointer-events-auto"
          onClick={closeEadPaymentChoice}
        >
          <div
            className="w-full max-w-xl overflow-hidden rounded-[1.75rem] border border-white/20 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-600">Pagamento EAD</p>
                <h3 className="mt-1 text-xl font-black uppercase tracking-tight text-[#001a33]">
                  Escolha como pagar
                </h3>
                <p className="mt-1 text-xs font-bold leading-relaxed text-slate-500">
                  O curso será liberado somente após a confirmação bancária canônica do pagamento.
                </p>
              </div>
              <button
                type="button"
                onClick={closeEadPaymentChoice}
                disabled={isStartingEadPayment}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-100 text-slate-400 hover:text-slate-700 disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Curso</p>
                <p className="mt-1 text-sm font-black text-[#001a33]">{selectedEadPayment.cursoNome || selectedEadPayment.descricao}</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Valor</p>
                    <p className="mt-1 text-lg font-black text-[#001a33]">{formatCurrency(Number(selectedEadPayment.valor || 0))}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Vencimento</p>
                    <p className="mt-1 text-lg font-black text-[#001a33]">{formatDate(selectedEadPayment.data_vencimento)}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {[
                  { method: 'PIX' as const, label: 'Pix', icon: Zap },
                  { method: 'BOLETO' as const, label: 'Boleto', icon: FileText },
                  { method: 'CREDIT_CARD' as const, label: 'Cartão', icon: CreditCard }
                ].map((option) => {
                  const Icon = option.icon;
                  const active = eadPaymentMethod === option.method;
                  return (
                    <button
                      key={option.method}
                      type="button"
                      onClick={() => setEadPaymentMethod(option.method)}
                      disabled={isStartingEadPayment}
                      className={`inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-colors disabled:opacity-60 ${
                        active
                          ? 'border-emerald-600 bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50'
                      }`}
                    >
                      <Icon size={15} />
                      {option.label}
                    </button>
                  );
                })}
              </div>

              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3 text-xs font-bold leading-relaxed text-blue-700">
                A forma escolhida usa a rota bancária configurada para este curso. Cartão pode abrir o checkout seguro em nova aba.
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeEadPaymentChoice}
                  disabled={isStartingEadPayment}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={startEadPayment}
                  disabled={isStartingEadPayment}
                  className="rounded-xl bg-emerald-600 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {isStartingEadPayment ? 'Preparando...' : 'Continuar pagamento'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {eadPaymentPanel && (
        <EadPaymentModal
          panel={eadPaymentPanel}
          onClose={() => setEadPaymentPanel(null)}
        />
      )}

      {selectedBanesePayment && (
        <React.Suspense fallback={(
          <div className="fixed inset-0 z-[99999] grid place-items-center bg-[#001a33] text-white">
            <div className="text-center">
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-emerald-300" />
              <p className="mt-4 text-[10px] font-black uppercase tracking-[0.2em]">Preparando cobrança Banese</p>
            </div>
          </div>
        )}>
          <BanesePaymentPage
            installment={selectedBanesePayment}
            installments={banesePaymentRows}
            onBack={closeBanesePayment}
            onRefresh={refreshBanesePayment}
          />
        </React.Suspense>
      )}

      {/* Recibo Modal Overlay */}
      {selectedReceipt && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed left-0 top-0 right-0 bottom-0 bg-black/60 backdrop-blur-sm z-[9999] pointer-events-auto flex h-dvh w-screen items-center justify-center p-4 overflow-y-auto"
          onClick={closeReceipt}
        >
          <div
            className="bg-white rounded-[1.75rem] p-5 sm:p-6 max-w-2xl w-full border border-slate-100 shadow-2xl relative animate-fadeIn overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <button
              onClick={closeReceipt}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-full transition-colors"
            >
              <X size={16} />
            </button>

            <div
              ref={receiptRef}
              className="print-area"
            >
              <ReciboDespesaPreview data={receiptPayload || undefined} />
            </div>

            <div className="mt-6 flex flex-col sm:flex-row justify-end gap-3">
              <button
                onClick={closeReceipt}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-[10px] uppercase tracking-wider rounded-xl transition-colors"
              >
                Fechar
              </button>
              <button
                onClick={downloadReceiptPdf}
                disabled={isGeneratingReceiptPdf}
                className={`px-4 py-2.5 font-bold text-[10px] uppercase tracking-wider rounded-xl transition-colors shadow-md inline-flex items-center gap-2 justify-center ${
                  isGeneratingReceiptPdf
                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                <Download size={16} />
                {isGeneratingReceiptPdf ? 'Gerando PDF...' : 'Baixar PDF'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

    </div>
  );
};

export default FinanceiroPage;
