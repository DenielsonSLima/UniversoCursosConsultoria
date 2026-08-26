import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CreditCard, Loader2, RefreshCw } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';

import EadPaymentModal from '../../ead/components/EadPaymentModal';
import { invalidateAlunoCourseAccessQueries } from '../shared/aluno-course-access.queries';
import AlunoEadPaymentChoiceModal from './AlunoEadPaymentChoiceModal';
import AlunoFinanceiroFilters from './AlunoFinanceiroFilters';
import AlunoFinanceiroList from './AlunoFinanceiroList';
import AlunoFinanceiroReceiptModal from './AlunoFinanceiroReceiptModal';
import AlunoFinanceiroSummary from './AlunoFinanceiroSummary';
import BanesePaymentStatePage from './banese/BanesePaymentStatePage';
import type { BanesePaymentRecord } from './banese/banese-payment.types';
import { hasRegisteredBaneseBoleto } from './banese/banese-payment.utils';
import useBanesePaymentDetails from './banese/hooks/useBanesePaymentDetails';
import { alunoFinancialErrorMessage, isAlunoPaidThroughAsaas } from './financeiro.presentation';
import {
  alunoFinanceiroListOptions,
  alunoFinanceiroPaymentOptions,
} from './financeiro.queries';
import type {
  AlunoFinancialFilters,
  AlunoFinancialItem,
  AlunoFinancialModality,
  AlunoFinancialStatus,
  AlunoFinancialViewMode,
} from './financeiro.types';
import useAlunoEadPayment from './useAlunoEadPayment';

const BanesePaymentPage = React.lazy(() => import('./banese/BanesePaymentPage'));
const PAGE_SIZE = 8;

interface FinanceiroPageProps {
  alunoId: string;
}

const onlyDigits = (value?: string | null) => String(value || '').replace(/\D/g, '');

const hasSameBankTitle = (
  summary: AlunoFinancialItem,
  detail: BanesePaymentRecord,
) => (
  onlyDigits(summary.gateway_boleto_linha_digitavel)
    === onlyDigits(detail.gateway_boleto_linha_digitavel)
  && onlyDigits(summary.gateway_boleto_codigo_barras)
    === onlyDigits(detail.gateway_boleto_codigo_barras)
);

const FinanceiroPage: React.FC<FinanceiroPageProps> = ({ alunoId }) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const openedBaneseFromList = useRef(false);
  const noticeTimer = useRef<number | null>(null);
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [modality, setModality] = useState<AlunoFinancialModality>('TODOS');
  const [status, setStatus] = useState<AlunoFinancialStatus>('ABERTO');
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<AlunoFinancialViewMode>('cards');
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [receiptId, setReceiptId] = useState<string | null>(null);

  const filters = useMemo<AlunoFinancialFilters>(() => ({
    search: deferredSearch.trim(),
    startDate,
    endDate,
    modality,
    status,
    page,
    pageSize: PAGE_SIZE,
  }), [deferredSearch, endDate, modality, page, startDate, status]);
  const financeQuery = useQuery(alunoFinanceiroListOptions(alunoId, filters));

  const showNotice = useCallback((message: string, duration = 3500) => {
    setNotice(message);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(''), duration);
  }, []);

  const invalidateFinance = useCallback(() => {
    invalidateAlunoCourseAccessQueries(queryClient, alunoId);
  }, [alunoId, queryClient]);

  const eadPayment = useAlunoEadPayment({
    alunoId,
    queryClient,
    invalidateFinance,
    showNotice,
  });

  const selectedBaneseId = searchParams.get('banesePayment')
    || searchParams.get('baneseBoleto');
  const focusedPaymentQuery = useQuery(alunoFinanceiroPaymentOptions(
    alunoId,
    selectedBaneseId || '',
  ));
  const focusedPayment = focusedPaymentQuery.data || null;
  const registeredBaneseSummary = focusedPayment
    && hasRegisteredBaneseBoleto(focusedPayment) ? focusedPayment : null;
  const baneseDetailsQuery = useBanesePaymentDetails({
    alunoId,
    paymentId: selectedBaneseId,
    summary: registeredBaneseSummary,
  });
  const selectedBaneseDetail = selectedBaneseId
    ? (baneseDetailsQuery.data || []).find((item) => item.id === selectedBaneseId) || null
    : null;
  const selectedBanesePayment = registeredBaneseSummary && selectedBaneseDetail
    && hasSameBankTitle(registeredBaneseSummary, selectedBaneseDetail)
    ? {
      ...selectedBaneseDetail,
      status: registeredBaneseSummary.status,
      valor_pago: registeredBaneseSummary.valor_pago,
      data_pagamento: registeredBaneseSummary.data_pagamento,
      chargeKind: registeredBaneseSummary.chargeKind,
    }
    : null;
  const baneseInstallments = (baneseDetailsQuery.data || []).map((item) => (
    item.id === selectedBanesePayment?.id ? selectedBanesePayment : item
  ));

  useEffect(() => () => {
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
  }, []);

  useEffect(() => {
    if (!financeQuery.data || financeQuery.data.pagination.currentPage === page) return;
    setPage(financeQuery.data.pagination.currentPage);
  }, [financeQuery.data, page]);

  useEffect(() => {
    const legacyId = searchParams.get('baneseBoleto');
    if (!legacyId || searchParams.get('banesePayment')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('baneseBoleto');
    next.set('banesePayment', legacyId);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const syncView = () => {
      if (media.matches) setViewMode('cards');
    };
    syncView();
    media.addEventListener?.('change', syncView);
    return () => media.removeEventListener?.('change', syncView);
  }, []);

  const resetPage = useCallback(() => setPage(1), []);
  const closeBanese = useCallback(() => {
    if (openedBaneseFromList.current) {
      openedBaneseFromList.current = false;
      navigate(-1);
      return;
    }
    const next = new URLSearchParams(window.location.search);
    next.delete('banesePayment');
    next.delete('baneseBoleto');
    next.set('module', 'financeiro');
    setSearchParams(next, { replace: true });
  }, [navigate, setSearchParams]);

  const openBanese = useCallback((item: AlunoFinancialItem) => {
    if (!hasRegisteredBaneseBoleto(item)) return;
    openedBaneseFromList.current = true;
    const next = new URLSearchParams(window.location.search);
    next.set('module', 'financeiro');
    next.set('banesePayment', item.id);
    next.delete('baneseBoleto');
    setSearchParams(next);
  }, [setSearchParams]);

  const refreshBanese = useCallback(async () => {
    const [summaryResult, detailsResult] = await Promise.all([
      focusedPaymentQuery.refetch(),
      registeredBaneseSummary
        ? baneseDetailsQuery.refetch()
        : Promise.resolve({ error: null }),
    ]);
    if (summaryResult.error) throw summaryResult.error;
    if (detailsResult.error) throw detailsResult.error;
  }, [baneseDetailsQuery, focusedPaymentQuery, registeredBaneseSummary]);

  const copyPaymentLink = useCallback(async (url?: string | null) => {
    if (!url) {
      showNotice('Esta cobrança ainda não possui link de pagamento.', 4200);
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      showNotice('Link de pagamento copiado.');
    } catch {
      showNotice('Não foi possível copiar o link neste navegador.', 4200);
    }
  }, [showNotice]);

  const openReceipt = useCallback((item: AlunoFinancialItem) => {
    if (item.statusCode !== 'PAGO' || !item.receiptEligible) {
      showNotice('O recibo só fica disponível após a baixa do pagamento.', 4500);
      return;
    }
    if (isAlunoPaidThroughAsaas(item)) {
      if (!item.asaas_transaction_receipt_url) {
        showNotice('O comprovante oficial do gateway ainda não está disponível.', 4500);
        return;
      }
      window.open(item.asaas_transaction_receipt_url, '_blank', 'noopener,noreferrer');
      return;
    }
    setReceiptId(item.id);
  }, [showNotice]);

  if (selectedBaneseId) {
    if (focusedPaymentQuery.isPending
        || (registeredBaneseSummary && baneseDetailsQuery.isPending)) {
      return <BanesePaymentStatePage state="loading" onBack={closeBanese} />;
    }
    if (focusedPaymentQuery.isError || baneseDetailsQuery.isError) {
      return <BanesePaymentStatePage state="error" onBack={closeBanese} onRetry={refreshBanese} />;
    }
    if (!selectedBanesePayment) {
      return <BanesePaymentStatePage state="not-found" onBack={closeBanese} onRetry={refreshBanese} />;
    }
    return (
      <React.Suspense fallback={<BanesePaymentStatePage state="loading" onBack={closeBanese} />}>
        <BanesePaymentPage
          installment={selectedBanesePayment}
          installments={baneseInstallments}
          onBack={closeBanese}
          onRefresh={refreshBanese}
        />
      </React.Suspense>
    );
  }

  if (financeQuery.isPending) {
    return (
      <div className="flex min-h-[18rem] items-center justify-center rounded-3xl border border-slate-100 bg-white">
        <div className="text-center text-blue-700">
          <Loader2 className="mx-auto animate-spin" size={36} />
          <p className="mt-3 text-xs font-black uppercase tracking-widest">Carregando financeiro</p>
        </div>
      </div>
    );
  }

  if (financeQuery.isError || !financeQuery.data) {
    return (
      <div className="flex min-h-[18rem] items-center justify-center rounded-3xl border border-rose-100 bg-white p-6 text-center shadow-sm" role="alert">
        <div className="max-w-lg">
          <AlertTriangle className="mx-auto text-rose-600" size={38} />
          <h2 className="mt-4 text-lg font-black uppercase tracking-tight text-[#001a33]">Financeiro indisponível</h2>
          <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-500">{alunoFinancialErrorMessage(financeQuery.error)}</p>
          <button type="button" onClick={() => { void financeQuery.refetch(); }} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-xs font-black uppercase tracking-wider text-white">
            <RefreshCw size={15} /> Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  const payload = financeQuery.data;
  return (
    <div className="min-w-0 space-y-4 animate-fadeIn sm:space-y-6">
      <header className="flex items-start justify-between sm:items-center">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-black uppercase tracking-tight text-[#001a33] sm:text-2xl">
            <CreditCard className="shrink-0 text-blue-600" size={22} /> Financeiro
          </h2>
          <p className="mt-1 max-w-xl text-[11px] font-medium leading-relaxed text-slate-500 sm:text-xs">Parcelas, vencimentos e comprovantes em um só lugar.</p>
        </div>
      </header>

      {notice ? (
        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-bold text-blue-700" role="status">{notice}</div>
      ) : null}

      <AlunoFinanceiroSummary summary={payload.summary} />
      <section id="aluno-finance-charges" className="scroll-mt-4 rounded-[1.5rem] border border-slate-100 bg-white p-4 shadow-sm sm:rounded-[2rem] sm:p-6">
        <div className="mb-5">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-600">Cobranças</p>
          <h3 className="mt-1 text-lg font-black uppercase tracking-tight text-[#001a33]">Histórico financeiro</h3>
        </div>
        <AlunoFinanceiroFilters
          search={search}
          startDate={startDate}
          endDate={endDate}
          modality={modality}
          status={status}
          viewMode={viewMode}
          showMobileFilters={showMobileFilters}
          counts={payload.filters.counts}
          onSearchChange={(value) => { setSearch(value); resetPage(); }}
          onStartDateChange={(value) => { setStartDate(value); resetPage(); }}
          onEndDateChange={(value) => { setEndDate(value); resetPage(); }}
          onModalityChange={(value) => { setModality(value); resetPage(); }}
          onStatusChange={(value) => { setStatus(value); resetPage(); }}
          onViewModeChange={setViewMode}
          onToggleMobileFilters={() => setShowMobileFilters((current) => !current)}
          onClearAdvancedFilters={() => {
            setStartDate('');
            setEndDate('');
            setModality('TODOS');
            resetPage();
          }}
        />
        <AlunoFinanceiroList
          items={payload.items}
          pagination={payload.pagination}
          viewMode={viewMode}
          onPageChange={setPage}
          onCopyLink={copyPaymentLink}
          onOpenReceipt={openReceipt}
          onPayEad={eadPayment.open}
          onOpenBanese={openBanese}
        />
      </section>

      {eadPayment.selectedPayment ? (
        <AlunoEadPaymentChoiceModal
          item={eadPayment.selectedPayment}
          method={eadPayment.method}
          options={eadPayment.paymentOptions}
          isLoadingOptions={eadPayment.isLoadingPaymentOptions}
          optionsError={eadPayment.paymentOptionsError}
          isStarting={eadPayment.isStarting}
          onMethodChange={eadPayment.setMethod}
          onClose={eadPayment.close}
          onRetryOptions={eadPayment.retryPaymentOptions}
          onStart={() => { void eadPayment.start(); }}
        />
      ) : null}
      {eadPayment.panel ? (
        <EadPaymentModal panel={eadPayment.panel} onClose={() => eadPayment.setPanel(null)} />
      ) : null}
      {receiptId ? (
        <AlunoFinanceiroReceiptModal
          alunoId={alunoId}
          paymentId={receiptId}
          onClose={() => setReceiptId(null)}
        />
      ) : null}
    </div>
  );
};

export default FinanceiroPage;
