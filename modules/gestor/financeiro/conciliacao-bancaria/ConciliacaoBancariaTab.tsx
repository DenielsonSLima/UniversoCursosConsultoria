import React, { useMemo, useState } from 'react';
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  FileCheck2,
  FileSpreadsheet,
  Globe,
  Layers,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { integracaoBancariaService } from '../../configuracoes/integracao-bancaria/integracao-bancaria.service';
import BaneseCnabRemittancePanel from './BaneseCnabRemittancePanel';
import ConciliacaoBancariaResumo from './ConciliacaoBancariaResumo';
import BaneseCnabReturnPanel from './components/BaneseCnabReturnPanel';
import ConciliacaoOrigemBaixaPanel from './components/ConciliacaoOrigemBaixaPanel';
import ConciliacaoTransactionsPanel from './components/ConciliacaoTransactionsPanel';
import { useBaneseCnabReturn } from './hooks/useBaneseCnabReturn';
import { useBaneseConciliacaoQueries } from './hooks/useBaneseConciliacaoQueries';

interface ConciliacaoBancariaTabProps {
  poloId?: string | null;
}

export type SubTabConciliacao = 'remessas' | 'retorno' | 'conciliacao' | 'diagnostico';

const ConciliacaoBancariaTab: React.FC<ConciliacaoBancariaTabProps> = ({ poloId }) => {
  const [activeSubTab, setActiveSubTab] = useState<SubTabConciliacao>('conciliacao');
  const [searchTerm, setSearchTerm] = useState('');
  const [refreshingIds, setRefreshingIds] = useState<string[]>([]);
  const queries = useBaneseConciliacaoQueries();
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

        {/* Sub-Tabs Nav Pill */}
        <div className="mt-6 flex flex-wrap gap-2 rounded-2xl bg-slate-100/80 p-1.5">
          <button
            type="button"
            onClick={() => setActiveSubTab('conciliacao')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-extrabold transition-all ${
              activeSubTab === 'conciliacao'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <Layers size={16} className={activeSubTab === 'conciliacao' ? 'text-blue-600' : 'text-slate-400'} />
            <span>Conciliação & Baixas</span>
            <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-black text-slate-700">
              {queries.receivables.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('remessas')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-extrabold transition-all ${
              activeSubTab === 'remessas'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <ArrowUpRight size={16} className={activeSubTab === 'remessas' ? 'text-amber-600' : 'text-slate-400'} />
            <span>Remessas Pendentes</span>
            {eligibleCount > 0 ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800">
                {eligibleCount}
              </span>
            ) : null}
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('retorno')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-extrabold transition-all ${
              activeSubTab === 'retorno'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <ArrowDownLeft size={16} className={activeSubTab === 'retorno' ? 'text-purple-600' : 'text-slate-400'} />
            <span>Retorno Pendente</span>
            {recentReturnsCount > 0 ? (
              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-black text-purple-800">
                {recentReturnsCount}
              </span>
            ) : null}
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('diagnostico')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-extrabold transition-all ${
              activeSubTab === 'diagnostico'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <Activity size={16} className={activeSubTab === 'diagnostico' ? 'text-emerald-600' : 'text-slate-400'} />
            <span>Diagnóstico & API</span>
          </button>
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
          <strong>Escopo global:</strong> a troca de arquivos CNAB usa um único convênio empresarial. O polo selecionado não restringe títulos, arquivos ou históricos nesta aba.
        </div>
      ) : null}

      {/* Sub-Tab 1: Conciliação & Baixas */}
      {activeSubTab === 'conciliacao' && (
        <div className="space-y-6">
          <ConciliacaoOrigemBaixaPanel
            rows={queries.receivables}
            searchTerm={searchTerm}
            refreshingIds={refreshingIds}
            isLoading={queries.bankingOverviewQuery.isLoading || queries.dataQuery.isLoading}
            isError={queries.bankingOverviewQuery.isError || queries.dataQuery.isError}
            onSearchTermChange={setSearchTerm}
            onRefresh={(receivableId) => { void handleRefresh(receivableId); }}
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
          <ConciliacaoBancariaResumo
            totalPendentes={queries.summary.totalPendentes}
            valorPendentes={queries.summary.valorPendentes}
            totalPagoHoje={queries.summary.totalPagoHoje}
            totalComErro={queries.summary.totalComErro}
            apiSync={queries.summary.apiSync}
            cnab240Sync={queries.summary.cnab240Sync}
          />

          <ConciliacaoTransactionsPanel transactions={queries.transactions} />
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
