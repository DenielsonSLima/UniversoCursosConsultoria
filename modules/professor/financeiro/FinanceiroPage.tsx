import React, {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CreditCard, Loader2, RefreshCw } from 'lucide-react';

import FinanceiroFilters from './FinanceiroFilters';
import FinanceiroPaymentsList from './FinanceiroPaymentsList';
import ProfessorFinanceiroReceiptModal from './ProfessorFinanceiroReceiptModal';
import FinanceiroSummaryCards from './FinanceiroSummaryCards';
import { professorFinanceiroListOptions } from './financeiro.queries';
import { professorFinancialErrorMessage } from './financeiro.presentation';
import type {
  ProfessorFinancialFilters,
  ProfessorFinancialStatus,
  ProfessorFinancialViewMode,
} from './financeiro.types';

interface FinanceiroPageProps {
  professorId: string;
  poloId: string;
}

const PAGE_SIZE = 8;

const FinanceiroPage: React.FC<FinanceiroPageProps> = ({ professorId, poloId }) => {
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [category, setCategory] = useState('TODOS');
  const [status, setStatus] = useState<ProfessorFinancialStatus>('ABERTO');
  const [viewMode, setViewMode] = useState<ProfessorFinancialViewMode>('cards');
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search.trim());
  const filters = useMemo<ProfessorFinancialFilters>(() => ({
    search: deferredSearch,
    startDate,
    endDate,
    category,
    status,
    page,
    pageSize: PAGE_SIZE,
  }), [category, deferredSearch, endDate, page, startDate, status]);
  const financeQuery = useQuery(professorFinanceiroListOptions(professorId, poloId, filters));

  useEffect(() => {
    setSelectedPaymentId(null);
    setSearch('');
    setStartDate('');
    setEndDate('');
    setCategory('TODOS');
    setStatus('ABERTO');
    setPage(1);
  }, [poloId]);

  useEffect(() => {
    const canonicalPage = financeQuery.data?.pagination.currentPage;
    if (canonicalPage && canonicalPage !== page) setPage(canonicalPage);
  }, [financeQuery.data?.pagination.currentPage, page]);

  const changeSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };
  const changeStartDate = (value: string) => {
    setStartDate(value);
    setPage(1);
  };
  const changeEndDate = (value: string) => {
    setEndDate(value);
    setPage(1);
  };
  const changeCategory = (value: string) => {
    setCategory(value);
    setPage(1);
  };
  const changeStatus = (value: ProfessorFinancialStatus) => {
    setStatus(value);
    setPage(1);
  };

  if (!professorId || !poloId) {
    return (
      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center text-amber-800">
        <AlertTriangle className="mx-auto" size={32} />
        <p className="mt-3 text-sm font-black uppercase tracking-wide">Contexto financeiro indisponível</p>
        <p className="mt-1 text-xs font-medium">Selecione um perfil e um polo válidos para continuar.</p>
      </div>
    );
  }

  if (financeQuery.isPending) {
    return (
      <div className="flex items-center justify-center gap-3 py-20 text-sm font-bold text-slate-500">
        <Loader2 className="animate-spin text-purple-600" size={28} />
        Carregando dados financeiros autorizados...
      </div>
    );
  }

  if (financeQuery.isError || !financeQuery.data) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-rose-50 p-8 text-center text-rose-800">
        <AlertTriangle className="mx-auto" size={34} />
        <p className="mt-3 text-sm font-black uppercase tracking-wide">Financeiro indisponível</p>
        <p className="mx-auto mt-2 max-w-xl text-xs font-medium leading-relaxed">
          {professorFinancialErrorMessage(financeQuery.error)}
        </p>
        <button
          type="button"
          onClick={() => { void financeQuery.refetch(); }}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-rose-700 px-4 py-2.5 text-xs font-black uppercase tracking-wide text-white transition-colors hover:bg-rose-800"
        >
          <RefreshCw size={15} /> Tentar novamente
        </button>
      </div>
    );
  }

  const payload = financeQuery.data;

  return (
    <div className="animate-fadeIn space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-black uppercase tracking-tight text-[#001a33]">
            <CreditCard className="text-purple-600" /> Financeiro Docente
          </h2>
          <p className="text-xs font-medium text-slate-500">
            Consulte honorários, vencimentos e recibos dos lançamentos pagos.
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-purple-100 bg-purple-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-purple-700">
          {payload.summary.recordCount} lançamento{payload.summary.recordCount === 1 ? '' : 's'}
          {financeQuery.isFetching ? <Loader2 size={11} className="animate-spin" /> : null}
        </span>
      </div>

      <FinanceiroSummaryCards summary={payload.summary} />

      <section className="rounded-[2.5rem] border border-slate-100 bg-white p-6 shadow-sm md:p-8">
        <FinanceiroFilters
          search={search}
          startDate={startDate}
          endDate={endDate}
          category={category}
          status={status}
          viewMode={viewMode}
          categories={payload.filters.categories}
          counts={payload.filters.counts}
          onSearchChange={changeSearch}
          onStartDateChange={changeStartDate}
          onEndDateChange={changeEndDate}
          onCategoryChange={changeCategory}
          onStatusChange={changeStatus}
          onViewModeChange={setViewMode}
        />
        <FinanceiroPaymentsList
          items={payload.items}
          pagination={payload.pagination}
          viewMode={viewMode}
          onPageChange={setPage}
          onOpenReceipt={setSelectedPaymentId}
        />
      </section>

      {selectedPaymentId ? (
        <ProfessorFinanceiroReceiptModal
          professorId={professorId}
          poloId={poloId}
          paymentId={selectedPaymentId}
          onClose={() => setSelectedPaymentId(null)}
        />
      ) : null}
    </div>
  );
};

export default FinanceiroPage;
