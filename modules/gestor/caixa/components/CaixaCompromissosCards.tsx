import React from 'react';
import type { CaixaMonthlyStatement } from '../caixa.service';
import { formatCaixaCurrency, formatCaixaDate, formatCaixaPercent } from '../caixa.formatters';

interface CaixaCompromissosCardsProps {
  compromissos: CaixaMonthlyStatement['compromissos'];
}

export const CaixaCompromissosCards: React.FC<CaixaCompromissosCardsProps> = ({ compromissos }) => {
  const monthly = compromissos.inadimplenciaMensal;
  return (
  <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 sm:grid-cols-3 md:grid-cols-5 md:divide-y-0">
      {[
        { label: 'Receitas futuras', value: formatCaixaCurrency(compromissos.aReceber), color: 'text-emerald-700', helper: 'Compromisso em aberto hoje' },
        { label: 'Inadimplência do mês', value: formatCaixaCurrency(compromissos.receberVencido), color: 'text-amber-600', helper: `Não recebido até ${formatCaixaDate(monthly.dataCorte)}` },
        { label: 'Margem de inadimplência do mês', value: formatCaixaPercent(compromissos.margemInadimplencia), color: 'text-amber-600', helper: 'Sobre cobranças com vencimento no mês' },
        { label: 'Obrigações futuras', value: formatCaixaCurrency(compromissos.aPagar), color: 'text-rose-600', helper: 'Compromisso em aberto hoje' },
        { label: 'Obrigações vencidas', value: formatCaixaCurrency(compromissos.pagarVencido), color: 'text-rose-700', helper: 'Valor vencido ainda não liquidado' },
      ].map((item) => (
        <div key={item.label} className="px-4 py-3.5">
          <p className="text-[11px] font-medium text-slate-500">{item.label}</p>
          <p className={`mt-1 text-lg font-bold ${item.color}`}>{item.value}</p>
          <p className="mt-0.5 text-[10px] text-slate-400">{item.helper}</p>
        </div>
      ))}
    </div>
    <div className="border-t border-slate-100 px-4 py-2.5 text-[11px] text-slate-500">
      <p>Base da margem: {formatCaixaCurrency(monthly.baseElegivel)} em cobranças com vencimento no mês.</p>
      {!monthly.completo && (
        <p className="mt-1 font-medium text-amber-700">
          Indicadores incompletos: {monthly.quantidadeEmConferencia} cobrança(s) em conferência não incluída(s).
        </p>
      )}
    </div>
  </section>
  );
};
