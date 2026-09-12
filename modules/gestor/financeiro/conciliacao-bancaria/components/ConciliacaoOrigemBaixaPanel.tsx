import React from 'react';
import {
  Archive,
  Building2,
  CircleHelp,
  BookOpen,
  FileCheck,
  Globe,
  Wallet,
  Sparkles,
} from 'lucide-react';
import type {
  BaneseReceivable,
  CanalBaixaConciliacao,
  ConciliacaoChannelCounts,
  SourceSystemConciliacao,
} from '../conciliacao-bancaria.fetch';
import ConciliacaoPagination from './ConciliacaoPagination';
import ConciliacaoRecebimentoFilters from './ConciliacaoRecebimentoFilters';
import ConciliacaoRecebimentoRows from './ConciliacaoRecebimentoRows';

interface ConciliacaoOrigemBaixaPanelProps {
  rows: BaneseReceivable[];
  searchTerm: string;
  sourceSystemFilter: SourceSystemConciliacao;
  onChangeSourceSystem: (source: SourceSystemConciliacao) => void;
  refreshingIds: string[];
  isLoading: boolean;
  isError: boolean;
  onSearchTermChange: (value: string) => void;
  onRefresh: (receivableId: string) => void;
  // Pagination & Filter props
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  onPageChange: (newPage: number) => void;
  onPageSizeChange?: (newPageSize: number) => void;
  selectedCanal: CanalBaixaConciliacao | 'TODOS';
  onSelectCanal: (canal: CanalBaixaConciliacao | 'TODOS') => void;
  selectedStatus: string;
  onSelectStatus: (status: string) => void;
  settlementStartDate: string;
  settlementEndDate: string;
  onSettlementStartDateChange: (value: string) => void;
  onSettlementEndDateChange: (value: string) => void;
  onClearSettlementPeriod: () => void;
  channelCounts: ConciliacaoChannelCounts;
}

export const ConciliacaoOrigemBaixaPanel: React.FC<ConciliacaoOrigemBaixaPanelProps> = ({
  rows,
  searchTerm,
  sourceSystemFilter,
  onChangeSourceSystem,
  refreshingIds,
  isLoading,
  isError,
  onSearchTermChange,
  onRefresh,
  page,
  pageSize,
  totalItems,
  totalPages,
  onPageChange,
  onPageSizeChange,
  selectedCanal,
  onSelectCanal,
  selectedStatus,
  onSelectStatus,
  settlementStartDate,
  settlementEndDate,
  onSettlementStartDateChange,
  onSettlementEndDateChange,
  onClearSettlementPeriod,
  channelCounts,
}) => {
  return (
    <section className="space-y-6 rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
      {/* Informative Banner on API Automation */}
      <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-blue-600 p-2 text-white shadow-sm mt-0.5">
            <Sparkles size={18} />
          </div>
          <div className="flex-1">
            <h4 className="text-xs font-black uppercase tracking-wider text-blue-900">
              Conciliação automática · Banese e Proesc
            </h4>
            <p className="mt-1 text-xs leading-relaxed text-blue-800">
              Os pagamentos confirmados no <strong>Banese e no Proesc</strong> são consultados e conciliados automaticamente. Acompanhe aqui as cobranças e a origem de cada baixa.
            </p>
          </div>
        </div>
      </div>

      {/* Header & Title */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-black uppercase tracking-wide text-slate-800">
            Painel de Conciliação e Origem das Baixas
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Recebimentos Banese e Proesc, retornos CNAB240, baixas no Caixa e histórico migrado.
          </p>
        </div>


      </div>

      {/* KPI Cards por Canal de Baixa */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7">
        <button
          type="button"
          onClick={() => onSelectCanal('TODOS')}
          aria-pressed={selectedCanal === 'TODOS'}
          className={`flex flex-col rounded-2xl border p-4 text-left transition-all ${
            selectedCanal === 'TODOS'
              ? 'border-slate-800 bg-slate-900 text-white shadow-md'
              : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider opacity-80">Total Geral</span>
            <Wallet size={16} />
          </div>
          <span className="mt-2 text-2xl font-black">{channelCounts.totalCount}</span>
          <span className="text-[10px] opacity-75">
            {selectedStatus === 'PAGO' ? 'Recebimentos encontrados' : 'Títulos monitorados'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSelectCanal('API_BANESE')}
          aria-pressed={selectedCanal === 'API_BANESE'}
          className={`flex flex-col rounded-2xl border p-4 text-left transition-all ${
            selectedCanal === 'API_BANESE'
              ? 'border-blue-600 bg-blue-600 text-white shadow-md'
              : 'border-blue-100 bg-blue-50/50 text-blue-900 hover:border-blue-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider opacity-90">API Banese</span>
            <Globe size={16} />
          </div>
          <span className="mt-2 text-2xl font-black">{channelCounts.apiCount}</span>
          <span className="text-[10px] opacity-80">Conciliação via API</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectCanal('CNAB240')}
          aria-pressed={selectedCanal === 'CNAB240'}
          className={`flex flex-col rounded-2xl border p-4 text-left transition-all ${
            selectedCanal === 'CNAB240'
              ? 'border-purple-600 bg-purple-600 text-white shadow-md'
              : 'border-purple-100 bg-purple-50/50 text-purple-900 hover:border-purple-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider opacity-90">CNAB 240</span>
            <FileCheck size={16} />
          </div>
          <span className="mt-2 text-2xl font-black">{channelCounts.cnabCount}</span>
          <span className="text-[10px] opacity-80">Baixas por arquivo .RET</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectCanal('CAIXA_MANUAL')}
          aria-pressed={selectedCanal === 'CAIXA_MANUAL'}
          className={`flex flex-col rounded-2xl border p-4 text-left transition-all ${
            selectedCanal === 'CAIXA_MANUAL'
              ? 'border-emerald-600 bg-emerald-600 text-white shadow-md'
              : 'border-emerald-100 bg-emerald-50/50 text-emerald-900 hover:border-emerald-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider opacity-90">Caixa / Manual</span>
            <Building2 size={16} />
          </div>
          <span className="mt-2 text-2xl font-black">{channelCounts.caixaCount}</span>
          <span className="text-[10px] opacity-80">Baixa local / balcão</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectCanal('PROESC')}
          aria-pressed={selectedCanal === 'PROESC'}
          className={`flex flex-col rounded-2xl border p-4 text-left transition-all ${
            selectedCanal === 'PROESC'
              ? 'border-sky-600 bg-sky-600 text-white shadow-md'
              : 'border-sky-100 bg-sky-50/50 text-sky-900 hover:border-sky-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider opacity-90">Proesc</span>
            <BookOpen size={16} />
          </div>
          <span className="mt-2 text-2xl font-black">{channelCounts.proescCount}</span>
          <span className="text-[10px] opacity-80">Registros do Proesc</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectCanal('HISTORICO_MIGRADO')}
          aria-pressed={selectedCanal === 'HISTORICO_MIGRADO'}
          className={`flex flex-col rounded-2xl border p-4 text-left transition-all ${
            selectedCanal === 'HISTORICO_MIGRADO'
              ? 'border-slate-600 bg-slate-700 text-white shadow-md'
              : 'border-slate-200 bg-slate-100/70 text-slate-800 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider opacity-90">Histórico</span>
            <Archive size={16} aria-hidden="true" />
          </div>
          <span className="mt-2 text-2xl font-black">{channelCounts.historicoCount}</span>
          <span className="text-[10px] opacity-80">Migrado do sistema anterior</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectCanal('OUTRO')}
          aria-pressed={selectedCanal === 'OUTRO'}
          className={`flex flex-col rounded-2xl border p-4 text-left transition-all ${
            selectedCanal === 'OUTRO'
              ? 'border-amber-600 bg-amber-600 text-white shadow-md'
              : 'border-amber-100 bg-amber-50/50 text-amber-900 hover:border-amber-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider opacity-90">Outras</span>
            <CircleHelp size={16} aria-hidden="true" />
          </div>
          <span className="mt-2 text-2xl font-black">{channelCounts.outroCount}</span>
          <span className="text-[10px] opacity-80">Origem não classificada</span>
        </button>
      </div>

      <ConciliacaoRecebimentoFilters
        searchTerm={searchTerm}
        sourceSystemFilter={sourceSystemFilter}
        onChangeSourceSystem={onChangeSourceSystem}
        selectedStatus={selectedStatus}
        settlementStartDate={settlementStartDate}
        settlementEndDate={settlementEndDate}
        totalItems={totalItems}
        onSearchTermChange={onSearchTermChange}
        onSelectStatus={onSelectStatus}
        onSettlementStartDateChange={onSettlementStartDateChange}
        onSettlementEndDateChange={onSettlementEndDateChange}
        onClearSettlementPeriod={onClearSettlementPeriod}
      />

      <div className="overflow-hidden rounded-2xl border border-slate-100">
        <ConciliacaoRecebimentoRows
          rows={rows}
          refreshingIds={refreshingIds}
          isLoading={isLoading}
          isError={isError}
          isBatchSyncing={false}
          onRefresh={onRefresh}
        />

        {!isLoading && !isError && totalItems > 0 && (
          <ConciliacaoPagination
            page={page}
            pageSize={pageSize}
            totalItems={totalItems}
            totalPages={totalPages}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
          />
        )}
      </div>
    </section>
  );
};

export default ConciliacaoOrigemBaixaPanel;
