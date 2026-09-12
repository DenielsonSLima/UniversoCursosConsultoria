import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { ReceivablesSummary } from '../../../financeiro.types';
import { formatCurrency } from './modalidade-receber.utils';
import { getReceivablesScopeTotal, type ReceivablesScope } from './receivables-period';

export interface ReceivablesSummaryState {
  data?: ReceivablesSummary;
  loading: boolean;
  error: boolean;
}

interface Props {
  summary: ReceivablesSummaryState;
  upcoming: ReceivablesSummaryState;
  scope: ReceivablesScope;
  disabled: boolean;
  onScopeChange: (scope: ReceivablesScope) => void;
}

const cards = [
  { scope: 'received' as const, label: 'Recebido no período', detail: 'Pela data do pagamento', tone: 'text-emerald-700', selected: 'border-emerald-600 bg-emerald-50' },
  { scope: 'upcoming' as const, label: 'A vencer', detail: 'Em aberto, vence hoje ou depois', tone: 'text-amber-700', selected: 'border-amber-500 bg-amber-50' },
  { scope: 'overdue' as const, label: 'Em atraso', detail: 'Parcelas vencidas no período', tone: 'text-rose-600', selected: 'border-rose-500 bg-rose-50' },
];

export function ReceivablesSummaryCards({ summary, upcoming, scope, disabled, onScopeChange }: Props) {
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-3">
        {cards.map((card) => {
          const state = card.scope === 'upcoming' ? upcoming : summary;
          const total = state.data ? getReceivablesScopeTotal(card.scope, state.data) : null;
          return (
            <button
              key={card.scope}
              type="button"
              aria-pressed={scope === card.scope}
              disabled={disabled || state.loading || state.error || !total}
              onClick={() => onScopeChange(card.scope)}
              className={`rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-default ${scope === card.scope ? card.selected : 'border-slate-200 bg-white hover:bg-slate-50'}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">{card.label}</span>
                <ArrowUpRight size={14} className={card.tone} aria-hidden="true" />
              </span>
              <span className={`mt-1 block text-lg font-black ${card.tone}`}>
                {disabled ? '—' : state.error ? 'Indisponível' : state.loading || !total ? 'Carregando…' : formatCurrency(total.value)}
              </span>
              <span className="block text-[11px] font-medium text-slate-500">
                {!disabled && !state.loading && !state.error && total ? `${total.count} cobrança(s) · ` : ''}{card.detail}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-500">
        Valores conforme aluno e turma. Recebidos considera a data do pagamento, como no Caixa. As demais situações consideram o vencimento. Clique para filtrar a lista.
      </p>
    </div>
  );
}

export function ReceivablesResultTotal({ scope, state }: { scope: ReceivablesScope; state: ReceivablesSummaryState }) {
  const total = state.data ? getReceivablesScopeTotal(scope, state.data) : null;
  return (
    <p role="status" className="text-xs font-semibold text-slate-600">
      {state.error ? 'Total indisponível. Tente atualizar a consulta.' : state.loading || !total ? 'Atualizando total…' : (
        <>{total.count} cobrança(s) no filtro · <strong className="text-[#001a33]">{formatCurrency(total.value)}</strong>
          {scope === 'all' ? ' de valor nominal, incluindo canceladas' : scope === 'received' ? ' recebido' : scope === 'canceled' ? ' cancelado' : ' em aberto'}
        </>
      )}
    </p>
  );
}
