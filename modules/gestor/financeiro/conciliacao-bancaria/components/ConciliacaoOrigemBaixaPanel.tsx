import React, { useMemo, useState } from 'react';
import {
  Zap,
  Building2,
  CheckCircle2,
  CreditCard,
  FileCheck,
  Globe,
  HelpCircle,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  Wallet,
  Sparkles,
} from 'lucide-react';
import type { BaneseReceivable, CanalBaixaConciliacao } from '../conciliacao-bancaria.fetch';
import {
  conciliacaoStatusClass,
  formatConciliacaoCurrency,
  formatConciliacaoDate,
} from '../conciliacao-bancaria.formatters';
import { textMatchesSearch } from '../../../../../lib/search';

interface ConciliacaoOrigemBaixaPanelProps {
  rows: BaneseReceivable[];
  searchTerm: string;
  refreshingIds: string[];
  isLoading: boolean;
  isError: boolean;
  onSearchTermChange: (value: string) => void;
  onRefresh: (receivableId: string) => void;
  onBatchRefresh?: (ids: string[]) => Promise<void>;
}

export const ConciliacaoOrigemBaixaPanel: React.FC<ConciliacaoOrigemBaixaPanelProps> = ({
  rows,
  searchTerm,
  refreshingIds,
  isLoading,
  isError,
  onSearchTermChange,
  onRefresh,
  onBatchRefresh,
}) => {
  const [selectedCanal, setSelectedCanal] = useState<CanalBaixaConciliacao | 'TODOS'>('TODOS');
  const [selectedStatus, setSelectedStatus] = useState<string>('TODOS');
  const [isBatchSyncing, setIsBatchSyncing] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);

  // KPI counters by channel
  const counters = useMemo(() => {
    let apiCount = 0;
    let cnabCount = 0;
    let caixaCount = 0;
    let mpCount = 0;
    let pendenteCount = 0;

    rows.forEach((r) => {
      if (r.status !== 'PAGO') {
        pendenteCount += 1;
      } else if (r.canalBaixa === 'API_BANESE') {
        apiCount += 1;
      } else if (r.canalBaixa === 'CNAB240') {
        cnabCount += 1;
      } else if (r.canalBaixa === 'MERCADO_PAGO') {
        mpCount += 1;
      } else {
        caixaCount += 1;
      }
    });

    return {
      apiCount,
      cnabCount,
      caixaCount,
      mpCount,
      pendenteCount,
      totalCount: rows.length,
    };
  }, [rows]);

  const pendingReceivableIds = useMemo(() => {
    return rows.filter((r) => r.status !== 'PAGO').map((r) => r.id);
  }, [rows]);

  const handleBatchSync = async () => {
    if (pendingReceivableIds.length === 0 || isBatchSyncing) return;
    setIsBatchSyncing(true);
    setBatchProgress({ current: 0, total: pendingReceivableIds.length });

    try {
      if (onBatchRefresh) {
        await onBatchRefresh(pendingReceivableIds);
      } else {
        // Execute sequentially or in small chunks
        for (let i = 0; i < pendingReceivableIds.length; i += 1) {
          const id = pendingReceivableIds[i];
          setBatchProgress({ current: i + 1, total: pendingReceivableIds.length });
          try {
            await onRefresh(id);
          } catch {
            // continue batch
          }
        }
      }
    } finally {
      setIsBatchSyncing(false);
      setBatchProgress(null);
    }
  };

  const filteredRows = useMemo(() => {
    let result = rows;

    if (selectedCanal !== 'TODOS') {
      if (selectedCanal === 'PENDENTE') {
        result = result.filter((r) => r.status !== 'PAGO');
      } else {
        result = result.filter((r) => r.status === 'PAGO' && r.canalBaixa === selectedCanal);
      }
    }

    if (selectedStatus !== 'TODOS') {
      result = result.filter((r) => r.status === selectedStatus);
    }

    if (searchTerm.trim()) {
      result = result.filter((row) => textMatchesSearch(searchTerm, [
        row.descricao,
        row.nossoNumero,
        row.status,
      ]));
    }

    return result;
  }, [rows, selectedCanal, selectedStatus, searchTerm]);

  const renderOrigemBadge = (row: BaneseReceivable) => {
    if (row.status !== 'PAGO') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-800">
          <HelpCircle size={12} className="text-amber-600" />
          Aguardando Baixa
        </span>
      );
    }

    switch (row.canalBaixa) {
      case 'API_BANESE':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-extrabold text-blue-700">
            <Globe size={12} className="text-blue-600" />
            API Banese (Online)
          </span>
        );
      case 'CNAB240':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-[10px] font-extrabold text-purple-700">
            <FileCheck size={12} className="text-purple-600" />
            CNAB240 (Retorno)
          </span>
        );
      case 'MERCADO_PAGO':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-extrabold text-sky-700">
            <CreditCard size={12} className="text-sky-600" />
            Mercado Pago (Cartão)
          </span>
        );
      case 'CAIXA_MANUAL':
      default:
        return (
          <span className="inline-flex flex-col items-start gap-1">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-extrabold text-emerald-800">
              <Building2 size={12} className="text-emerald-600" />
              Caixa / Manual
            </span>
            {['CANCELED', 'CANCELLED', 'DELETED'].includes(String(row.gatewayStatus || '').toUpperCase()) ? (
              <span className="text-[9px] font-bold text-slate-500">Título Banese cancelado</span>
            ) : null}
          </span>
        );
    }
  };

  const formatErrorText = (err?: string) => {
    if (!err || err === '-' || err === '[object Object]') return null;
    return err;
  };

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
              Sincronização 100% Automática em Segundo Plano
            </h4>
            <p className="mt-1 text-xs leading-relaxed text-blue-800">
              A API Banese consulta os retornos e aplica as baixas financeiras automaticamente via <strong>Webhooks</strong> e <strong>Worker de Conciliação em Background</strong>. Não é necessário clicar de aluno em aluno! O botão abaixo serve apenas como recurso opcional para forçar a verificação imediata em lote de todas as parcelas pendentes.
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
            Rastreamento unificado de lançamentos conciliados via API Banese, Arquivo CNAB240, Caixa e Mercado Pago.
          </p>
        </div>

        {/* Batch Sync All Button */}
        {pendingReceivableIds.length > 0 ? (
          <button
            type="button"
            onClick={() => { void handleBatchSync(); }}
            disabled={isBatchSyncing}
            className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-md hover:bg-blue-700 disabled:opacity-50 transition-all"
          >
            {isBatchSyncing ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>
                  Sincronizando {batchProgress ? `${batchProgress.current}/${batchProgress.total}` : 'Lote'}...
                </span>
              </>
            ) : (
              <>
                <Zap size={16} className="text-amber-300" />
                <span>Sincronizar Todos em Lote ({pendingReceivableIds.length})</span>
              </>
            )}
          </button>
        ) : null}
      </div>

      {/* KPI Cards por Canal de Baixa */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <button
          type="button"
          onClick={() => setSelectedCanal('TODOS')}
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
          <span className="mt-2 text-2xl font-black">{counters.totalCount}</span>
          <span className="text-[10px] opacity-75">Títulos monitorados</span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedCanal('API_BANESE')}
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
          <span className="mt-2 text-2xl font-black">{counters.apiCount}</span>
          <span className="text-[10px] opacity-80">Baixas online diretas</span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedCanal('CNAB240')}
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
          <span className="mt-2 text-2xl font-black">{counters.cnabCount}</span>
          <span className="text-[10px] opacity-80">Baixas por arquivo .RET</span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedCanal('CAIXA_MANUAL')}
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
          <span className="mt-2 text-2xl font-black">{counters.caixaCount}</span>
          <span className="text-[10px] opacity-80">Baixa local / balcão</span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedCanal('MERCADO_PAGO')}
          className={`flex flex-col rounded-2xl border p-4 text-left transition-all ${
            selectedCanal === 'MERCADO_PAGO'
              ? 'border-sky-600 bg-sky-600 text-white shadow-md'
              : 'border-sky-100 bg-sky-50/50 text-sky-900 hover:border-sky-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider opacity-90">Mercado Pago</span>
            <CreditCard size={16} />
          </div>
          <span className="mt-2 text-2xl font-black">{counters.mpCount}</span>
          <span className="text-[10px] opacity-80">Cartão de Crédito</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchTermChange(e.target.value)}
            placeholder="Buscar por aluno, descrição, nosso número..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-4 text-xs outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase text-slate-400">Status:</span>
          {['TODOS', 'PAGO', 'PENDENTE', 'VENCIDO'].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setSelectedStatus(st)}
              className={`rounded-lg px-2.5 py-1 text-[10px] font-black uppercase transition-colors ${
                selectedStatus === st
                  ? 'bg-slate-800 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {isLoading ? (
          <div className="py-12 text-center text-xs font-semibold text-slate-500">
            Carregando dados de conciliação bancária...
          </div>
        ) : isError ? (
          <div className="rounded-2xl border border-rose-100 bg-rose-50 p-6 text-center text-xs font-semibold text-rose-700">
            Não foi possível recuperar os lançamentos do ambiente bancário ativo.
          </div>
        ) : (
          <table className="w-full overflow-hidden rounded-2xl border border-slate-100 text-left">
            <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-500">
              <tr>
                <th className="p-3.5">Descrição / Título</th>
                <th className="p-3.5">Nosso Número</th>
                <th className="p-3.5">Vencimento</th>
                <th className="p-3.5">Valor Nominal</th>
                <th className="p-3.5">Status Título</th>
                <th className="p-3.5">Canal & Origem da Baixa</th>
                <th className="p-3.5 text-right">Ação Opcional</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-xs font-bold uppercase text-slate-400">
                    Nenhum lançamento encontrado para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const isRefreshing = refreshingIds.includes(row.id);
                  const errorText = formatErrorText(row.gatewayLastError);
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3.5">
                        <p className="font-bold text-slate-800">{row.descricao}</p>
                        {errorText ? (
                          <p className="mt-1 flex items-center gap-1 text-[10px] font-medium text-rose-600">
                            <ShieldAlert size={12} /> {errorText}
                          </p>
                        ) : null}
                      </td>
                      <td className="p-3.5 font-mono text-[11px] font-bold text-slate-600">
                        {row.nossoNumero || '-'}
                      </td>
                      <td className="p-3.5 text-slate-600">
                        {formatConciliacaoDate(row.dataVencimento)}
                      </td>
                      <td className="p-3.5 font-black text-slate-800">
                        {formatConciliacaoCurrency(row.valor)}
                      </td>
                      <td className="p-3.5">
                        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${conciliacaoStatusClass(row.status)}`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="p-3.5">
                        {renderOrigemBadge(row)}
                      </td>
                      <td className="p-3.5 text-right">
                        {row.status === 'PAGO' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-700">
                            <CheckCircle2 size={13} />
                            {row.canalBaixa === 'CAIXA_MANUAL' ? 'Baixa manual registrada' : 'Conciliado'}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onRefresh(row.id)}
                            disabled={isRefreshing || isBatchSyncing}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50 transition-all"
                            title="Verificação individual opcional via API Banese"
                          >
                            <RefreshCw size={11} className={isRefreshing ? 'animate-spin text-blue-600' : ''} />
                            {isRefreshing ? 'Verificando...' : 'Re-verificar'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
};

export default ConciliacaoOrigemBaixaPanel;
