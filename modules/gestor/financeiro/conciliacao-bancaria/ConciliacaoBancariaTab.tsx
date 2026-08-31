import React, { useEffect, useState } from 'react';
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  FileSpreadsheet,
  Layers,
  RefreshCw,
} from 'lucide-react';
import { integracaoBancariaService } from '../../configuracoes/integracao-bancaria/integracao-bancaria.service';
import BaneseCnabRemittancePanel from './BaneseCnabRemittancePanel';
import ConciliacaoBancariaResumo from './ConciliacaoBancariaResumo';
import BaneseCnabReturnPanel from './components/BaneseCnabReturnPanel';
import ConciliacaoOrigemBaixaPanel from './components/ConciliacaoOrigemBaixaPanel';
import ConciliacaoTransactionsPanel from './components/ConciliacaoTransactionsPanel';
import type { CanalBaixaConciliacao } from './conciliacao-bancaria.fetch';
import { useBaneseCnabReturn } from './hooks/useBaneseCnabReturn';
import { useBaneseConciliacaoQueries } from './hooks/useBaneseConciliacaoQueries';
import FinancialUnderlineTabs from '../components/FinancialUnderlineTabs';

interface ConciliacaoBancariaTabProps {
  poloId?: string | null;
}

export type SubTabConciliacao = 'remessas' | 'retorno' | 'conciliacao' | 'diagnostico';

const ConciliacaoBancariaTab: React.FC<ConciliacaoBancariaTabProps> = ({ poloId }) => {
  const [activeSubTab, setActiveSubTab] = useState<SubTabConciliacao>('conciliacao');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedCanal, setSelectedCanal] = useState<CanalBaixaConciliacao | 'TODOS'>('TODOS');
  const [selectedStatus, setSelectedStatus] = useState<string>('PAGO');
  const [settlementStartDate, setSettlementStartDate] = useState('');
  const [settlementEndDate, setSettlementEndDate] = useState('');
  const [refreshingIds, setRefreshingIds] = useState<string[]>([]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  const queries = useBaneseConciliacaoQueries({
    page,
    pageSize,
    search: debouncedSearch,
    status: selectedStatus,
    canal: selectedCanal,
    poloId,
    settlementStartDate,
    settlementEndDate,
    diagnosticsEnabled: activeSubTab === 'diagnostico',
  });

  const cnabReady = queries.cnabOverviewQuery.data?.edi7Configured === true;

  const overviewError = queries.cnabOverviewQuery.isError
    ? (queries.cnabOverviewQuery.error as Error)?.message || 'Falha ao carregar o resumo CNAB240.'
    : queries.cnabOverviewQuery.data && !cnabReady
      ? 'Código EDI7 do Banese ainda não foi confirmado pelo servidor.'
      : null;

  const cnabReturn = useBaneseCnabReturn({
    activeEnvironment: queries.activeEnvironment,
    overview: cnabReady ? queries.cnabOverviewQuery.data : undefined,
    overviewError,
    invalidateAll: queries.invalidateAll,
  });

  const eligibleCount = queries.cnabOverviewQuery.data?.eligibleReceivables?.length || 0;
  const recentReturnsCount = cnabReturn.recentReturnFiles?.length || 0;

  const handleRefresh = async (receivableId: string) => {
    cnabReturn.setFeedback(null);
    setRefreshingIds((current) => [...current, receivableId]);
    try {
      await integracaoBancariaService.reconcileBaneseReceivable(receivableId);
      cnabReturn.setFeedback({
        type: 'success',
        message: 'Status de cobrança atualizado com sucesso via API Banese.',
      });
      await queries.invalidateConciliacao();
    } catch (error: any) {
      cnabReturn.setFeedback({
        type: 'error',
        message: error?.message || 'Falha ao atualizar conciliação via API.',
      });
    } finally {
      setRefreshingIds((current) => current.filter((id) => id !== receivableId));
    }
  };

  const handleSelectCanal = (canal: CanalBaixaConciliacao | 'TODOS') => {
    setSelectedCanal(canal);
    if (canal !== 'TODOS' && canal !== 'PENDENTE') {
      setSelectedStatus('PAGO');
    }
    setPage(1);
  };

  const handleSelectStatus = (status: string) => {
    setSelectedStatus(status);
    if (status !== 'PAGO') {
      setSelectedCanal('TODOS');
      setSettlementStartDate('');
      setSettlementEndDate('');
    }
    setPage(1);
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    setPage(1);
  };

  const handleSettlementStartDateChange = (value: string) => {
    setSelectedStatus('PAGO');
    setSettlementStartDate(value);
    setPage(1);
  };

  const handleSettlementEndDateChange = (value: string) => {
    setSelectedStatus('PAGO');
    setSettlementEndDate(value);
    setPage(1);
  };

  const handleClearSettlementPeriod = () => {
    setSettlementStartDate('');
    setSettlementEndDate('');
    setPage(1);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Banner & Navigation Sub-Tabs */}
      <div className="rounded-[2.5rem] border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-xl bg-blue-50 p-2 text-blue-600">
                <FileSpreadsheet size={20} />
              </span>
              <div>
                <h2 className="text-xl font-black tracking-tight text-slate-800">
                  Conciliação Bancária & CNAB240 Banese
                </h2>
                <p className="text-xs font-semibold text-slate-500">
                  Gestão integrada de remessas, retornos e origens de baixa (API Online, CNAB240, Caixa e Mercado Pago)
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { void queries.invalidateAll(); }}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <RefreshCw size={14} className={queries.dataQuery.isFetching ? 'animate-spin' : ''} />
              Atualizar Dados
            </button>
          </div>
        </div>

        <div className="mt-6">
          <FinancialUnderlineTabs
            items={[
              {
                id: 'conciliacao' as const,
                label: 'Conciliação & Baixas',
                icon: <Layers size={16} />,
                badge: queries.channelCounts.totalCount || queries.totalCount || undefined,
                activeIconClassName: 'text-blue-600',
                badgeClassName: 'bg-blue-50 text-blue-700',
              },
              {
                id: 'remessas' as const,
                label: 'Remessas Pendentes',
                icon: <ArrowUpRight size={16} />,
                badge: eligibleCount > 0 ? eligibleCount : undefined,
                activeIconClassName: 'text-amber-600',
                badgeClassName: 'bg-amber-50 text-amber-700',
              },
              {
                id: 'retorno' as const,
                label: 'Retorno Pendente',
                icon: <ArrowDownLeft size={16} />,
                badge: recentReturnsCount > 0 ? recentReturnsCount : undefined,
                activeIconClassName: 'text-purple-600',
                badgeClassName: 'bg-purple-50 text-purple-700',
              },
              {
                id: 'diagnostico' as const,
                label: 'Diagnóstico & API',
                icon: <Activity size={16} />,
                activeIconClassName: 'text-emerald-600',
              },
            ]}
            value={activeSubTab}
            onChange={setActiveSubTab}
            ariaLabel="Áreas da conciliação bancária"
            indicatorClassName="bg-blue-600"
            equalWidth
          />
        </div>
      </div>

      {/* Global Feedback Banner */}
      {cnabReturn.feedback ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-medium ${
            cnabReturn.feedback.type === 'success'
              ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
              : cnabReturn.feedback.type === 'warning'
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-rose-100 bg-rose-50 text-rose-700'
          }`}
        >
          <p>{cnabReturn.feedback.message}</p>
        </div>
      ) : null}

      {/* Polo Scope Banner */}
      {poloId ? (
        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-800">
          <strong>Escopos protegidos:</strong> a troca de arquivos CNAB usa o
          convênio empresarial global; a visão de recebimentos respeita o polo
          selecionado e as permissões financeiras do gestor.
        </div>
      ) : null}

      {/* Sub-Tab 1: Conciliação & Baixas */}
      {activeSubTab === 'conciliacao' && (
        <div className="space-y-6">
          {queries.overviewError ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">
              <p className="font-black uppercase tracking-wide">Indicadores temporariamente indisponíveis</p>
              <p className="mt-1">{queries.overviewError}</p>
            </div>
          ) : null}
          <ConciliacaoOrigemBaixaPanel
            rows={queries.receivables}
            searchTerm={searchTerm}
            refreshingIds={refreshingIds}
            isLoading={queries.bankingOverviewQuery.isLoading || queries.dataQuery.isLoading}
            isError={queries.bankingOverviewQuery.isError || queries.dataQuery.isError}
            onSearchTermChange={setSearchTerm}
            onRefresh={(receivableId) => { void handleRefresh(receivableId); }}
            page={page}
            pageSize={pageSize}
            totalItems={queries.totalCount}
            onPageChange={setPage}
            onPageSizeChange={handlePageSizeChange}
            selectedCanal={selectedCanal}
            onSelectCanal={handleSelectCanal}
            selectedStatus={selectedStatus}
            onSelectStatus={handleSelectStatus}
            channelCounts={queries.channelCounts}
            settlementStartDate={settlementStartDate}
            settlementEndDate={settlementEndDate}
            onSettlementStartDateChange={handleSettlementStartDateChange}
            onSettlementEndDateChange={handleSettlementEndDateChange}
            onClearSettlementPeriod={handleClearSettlementPeriod}
          />
        </div>
      )}

      {/* Sub-Tab 2: Remessas Pendentes (CNAB240) */}
      {activeSubTab === 'remessas' && (
        <div className="space-y-6">
          <BaneseCnabRemittancePanel
            overview={cnabReady ? queries.cnabOverviewQuery.data : undefined}
            isLoading={queries.cnabOverviewQuery.isLoading || queries.cnabOverviewQuery.isFetching}
            error={overviewError}
            onRefresh={() => { void queries.cnabOverviewQuery.refetch(); }}
            onChanged={queries.invalidateAll}
          />
        </div>
      )}

      {/* Sub-Tab 3: Retorno Pendente (CNAB240) */}
      {activeSubTab === 'retorno' && (
        <div className="space-y-6">
          <BaneseCnabReturnPanel
            controller={cnabReturn}
            cnabReady={cnabReady}
            overviewError={overviewError}
          />
        </div>
      )}

      {/* Sub-Tab 4: Diagnóstico & Resumo API */}
      {activeSubTab === 'diagnostico' && (
        <div className="space-y-6">
          {queries.overviewError ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">
              <p className="font-black uppercase tracking-wide">Indicadores temporariamente indisponíveis</p>
              <p className="mt-1">{queries.overviewError}</p>
            </div>
          ) : null}
          {queries.diagnosticsError ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">
              <p className="font-black uppercase tracking-wide">Diagnóstico parcialmente indisponível</p>
              <p className="mt-1">{queries.diagnosticsError}</p>
            </div>
          ) : null}
          <ConciliacaoBancariaResumo
            totalPendentes={queries.summary.totalPendentes}
            valorPendentes={queries.summary.valorPendentes}
            totalPagoHoje={queries.summary.totalPagoHoje}
            totalComErro={queries.summary.totalComErro}
            apiSync={queries.summary.apiSync}
            cnab240Sync={queries.summary.cnab240Sync}
          />

          <ConciliacaoTransactionsPanel
            transactions={queries.transactions}
            isUnavailable={Boolean(queries.transactionsError)}
          />
        </div>
      )}

      {/* Footer / Observação do Fluxo */}
      <div className="rounded-[2rem] border border-emerald-100 bg-emerald-50 px-5 py-4 text-xs text-emerald-700">
        <p className="font-black uppercase tracking-wide">Observação do fluxo</p>
        <p className="mt-1 leading-relaxed">
          A API Banese é o canal principal para geração e retorno das cobranças. O CNAB240 permanece como contingência controlada, com prévia e confirmação explícita; a tela apresenta somente identificadores, status e resultados operacionais, sem expor payloads internos.
        </p>
      </div>
    </div>
  );
};

export default ConciliacaoBancariaTab;
