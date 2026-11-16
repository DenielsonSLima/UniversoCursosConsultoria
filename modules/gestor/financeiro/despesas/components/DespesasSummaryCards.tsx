import React from 'react';
import type { DespesasSummary } from '../despesas.types';
import { formatDespesaCurrency } from './despesaPresentation';

interface Props {
  summary?: DespesasSummary;
  poloId: string;
  pending: boolean;
  failed: boolean;
}

export default function DespesasSummaryCards({ summary, poloId, pending, failed }: Props) {
  const unavailable = !poloId ? 'Selecione um polo' : pending ? 'Carregando…' : failed ? 'Indisponível' : null;
  const cards = [
    { label: 'Total previsto', value: formatDespesaCurrency(summary?.totalValue), color: 'text-[#001a33]',
      detail: summary?.estimatedCount ? `Inclui ${formatDespesaCurrency(summary.estimatedValue)} estimados` : undefined },
    { label: 'Pago', value: formatDespesaCurrency(summary?.paidValue), color: 'text-emerald-600' },
    { label: summary?.estimatedCount ? 'A pagar confirmado' : 'A pagar', value: formatDespesaCurrency(summary?.confirmedPendingValue ?? summary?.pendingValue), color: 'text-amber-600',
      detail: summary?.estimatedCount ? `${summary.estimatedCount} fatura(s) a confirmar` : undefined },
    { label: summary?.estimatedCount ? 'Vencidos confirmados' : 'Vencidos', value: String(summary?.vencidosCount ?? 0), color: 'text-rose-600' },
  ];
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
    {cards.map(card => <div key={card.label} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <p className="mb-1 text-xs font-medium text-slate-500">{card.label}</p>
      <p className={`text-lg font-semibold ${card.color}`}>{unavailable || card.value}</p>
      {!unavailable && card.detail && <p className="mt-1 text-xs text-slate-600">{card.detail}</p>}
    </div>)}
  </div>;
}
