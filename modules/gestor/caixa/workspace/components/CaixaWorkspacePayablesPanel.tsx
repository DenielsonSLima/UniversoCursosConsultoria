import React from 'react';
import {
  AlertTriangle,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Inbox,
  RefreshCw,
} from 'lucide-react';
import {
  formatCaixaCanonicalCurrency,
  formatCaixaDate,
} from '../../caixa.formatters.ts';
import type {
  CaixaWorkspacePayablesItem,
  CaixaWorkspacePayablesPayload,
} from '../caixa-workspace-payables.types.ts';

const sourceLabels: Record<CaixaWorkspacePayablesItem['fonte'], string> = {
  CONTA_PAGAR_LEGADA: 'Conta a pagar',
  DESPESA: 'Despesa',
  RATEIO_ECONOMICO: 'Rateio econômico',
};

const statusTone = (status: string) => {
  if (status === 'PAGO') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'VENCIDO') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (status === 'PENDENTE') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
};

const formatCount = (value: number) => new Intl.NumberFormat('pt-BR').format(value);

const PayableItem = ({
  item,
  itemKey,
}: {
  item: CaixaWorkspacePayablesItem;
  itemKey: string;
}) => (
  <li key={itemKey} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(220px,1.4fr)_minmax(150px,0.7fr)_minmax(310px,1fr)] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.12em] ${statusTone(item.status)}`}>
            {item.status}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
            {sourceLabels[item.fonte]}
          </span>
        </div>
        <h3 className="mt-2 break-words text-sm font-extrabold leading-5 text-slate-900">
          {item.descricao}
        </h3>
        <p className="mt-1 text-xs text-slate-500">{item.polo.nome}</p>
      </div>

      <dl className="grid grid-cols-3 gap-2 text-xs lg:grid-cols-1 lg:gap-1.5">
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">Vencimento</dt>
          <dd className="mt-0.5 font-semibold text-slate-700">
            <time dateTime={item.datas.vencimento}>{formatCaixaDate(item.datas.vencimento)}</time>
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">Pagamento</dt>
          <dd className="mt-0.5 font-semibold text-slate-700">
            {item.datas.pagamento
              ? <time dateTime={item.datas.pagamento}>{formatCaixaDate(item.datas.pagamento)}</time>
              : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">Registro</dt>
          <dd className="mt-0.5 font-semibold text-slate-700">
            <time dateTime={item.datas.registro}>{formatCaixaDate(item.datas.registro)}</time>
          </dd>
        </div>
      </dl>

      <dl className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-right">
        <div className="min-w-0">
          <dt className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">Programado</dt>
          <dd className="mt-1 break-words text-xs font-extrabold text-slate-700">
            {formatCaixaCanonicalCurrency(item.valor_programado)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">Pago</dt>
          <dd className="mt-1 break-words text-xs font-extrabold text-emerald-700">
            {formatCaixaCanonicalCurrency(item.valor_pago)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">Saldo aberto</dt>
          <dd className="mt-1 break-words text-xs font-extrabold text-rose-700">
            {formatCaixaCanonicalCurrency(item.saldo_aberto)}
          </dd>
        </div>
      </dl>
    </div>
  </li>
);

interface CaixaWorkspacePayablesPanelProps {
  payload?: CaixaWorkspacePayablesPayload;
  isLoading: boolean;
  isError: boolean;
  isSnapshotConflict?: boolean;
  isFetching: boolean;
  onRetry: () => void;
  onPrevious: () => void;
  onNext: () => void;
}

export const CaixaWorkspacePayablesPanel = ({
  payload,
  isLoading,
  isError,
  isSnapshotConflict = false,
  isFetching,
  onRetry,
  onPrevious,
  onNext,
}: CaixaWorkspacePayablesPanelProps) => {
  if (isLoading) {
    return (
      <div role="status" aria-busy="true" className="space-y-3 p-4 sm:p-6">
        <span className="sr-only">Carregando contas a pagar.</span>
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="h-32 rounded-2xl border border-slate-200 bg-slate-100 motion-safe:animate-pulse" />
        ))}
      </div>
    );
  }

  if (isError || !payload) {
    return (
      <div role="alert" className="px-5 py-12 text-center text-rose-900">
        <AlertTriangle aria-hidden="true" className="mx-auto text-rose-500" size={28} />
        <h3 className="mt-3 text-sm font-extrabold">
          {isSnapshotConflict
            ? 'A lista mudou durante a navegação'
            : 'Não foi possível carregar as obrigações'}
        </h3>
        <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-rose-700">
          {isSnapshotConflict
            ? 'Recomece pela primeira página para receber um snapshot consistente.'
            : 'O restante da mesa de tesouraria permanece disponível.'}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600"
        >
          <RefreshCw aria-hidden="true" size={15} />
          {isSnapshotConflict ? 'Recomeçar lista' : 'Tentar novamente'}
        </button>
      </div>
    );
  }

  return (
    <div aria-busy={isFetching || undefined}>
      <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <span className="inline-flex items-center gap-1.5">
          <CalendarClock aria-hidden="true" size={14} className="text-blue-700" />
          Corte em {formatCaixaDate(payload.meta.data_corte)}
        </span>
        <span>{formatCount(payload.paginacao.total_itens)} obrigações econômicas</span>
      </div>

      {payload.itens.length === 0 ? (
        <div className="px-5 py-14 text-center text-slate-600">
          <Inbox aria-hidden="true" className="mx-auto text-slate-300" size={32} />
          <h3 className="mt-3 text-sm font-extrabold text-slate-800">Nenhum título neste filtro</h3>
          <p className="mt-1 text-xs">O retorno canônico não possui itens para esta página.</p>
        </div>
      ) : (
        <ul className="space-y-3 p-4 sm:p-6" aria-label="Obrigações econômicas de contas a pagar">
          {payload.itens.map((item) => PayableItem({ item, itemKey: item.chave }))}
        </ul>
      )}

      <nav aria-label="Paginação das obrigações" className="flex flex-col gap-3 border-t border-slate-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-center text-xs font-semibold text-slate-500 sm:text-left">
          Página {payload.paginacao.pagina} de {payload.paginacao.total_paginas}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            data-pagination-previous
            onClick={onPrevious}
            disabled={!payload.paginacao.tem_anterior}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft aria-hidden="true" size={16} /> Anterior
          </button>
          <button
            type="button"
            data-pagination-next
            onClick={onNext}
            disabled={!payload.paginacao.tem_proxima}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#001a33] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#082a4b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Próxima <ChevronRight aria-hidden="true" size={16} />
          </button>
        </div>
      </nav>
    </div>
  );
};
