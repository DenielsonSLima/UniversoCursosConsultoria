import React from 'react';
import { AlertTriangle, ArrowRight, CalendarClock, Wallet } from 'lucide-react';
import { formatCaixaCanonicalCurrency, formatCaixaDate } from '../caixa.formatters';
import type { CaixaReceivablesPosition } from './caixa-receivables-position.service';

interface Props {
  position?: CaixaReceivablesPosition;
  loading: boolean;
  hasError: boolean;
  onRetry: () => void;
  onReview: () => void;
}
export function CaixaReceivablesPortfolio({ position, loading, hasError, onRetry, onReview }: Props) {
  return <section aria-labelledby="caixa-portfolio-title" className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-blue-100 bg-blue-50/60 p-4 sm:p-5">
      <div className="flex items-start gap-3"><Wallet size={20} className="mt-1 text-blue-700" aria-hidden="true" />
        <div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-600">Além da competência mensal</p>
          <h2 id="caixa-portfolio-title" className="mt-1 text-base font-extrabold text-[#001a33]">Visão geral da carteira</h2>
          <p className="mt-1 text-xs leading-5 text-slate-600">Carteira cadastrada, reexpressa na data de corte, incluindo outros meses. Não compõe o recebido nem o saldo do Caixa.</p>
        </div></div>
      {position ? <span className="rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-bold text-blue-800">Corte {formatCaixaDate(position.dataCorte)}</span> : null}
    </header>
    {hasError ? <div role="alert" className="p-5 text-sm text-amber-950"><p>Carteira geral indisponível. Nenhum valor foi estimado.</p>
      <button type="button" className="mt-3 min-h-11 rounded-xl border border-amber-300 px-4 font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600" onClick={onRetry}>Tentar novamente</button></div>
      : loading || !position ? <p role="status" className="p-6 text-sm text-slate-500">Carregando posição geral da carteira…</p>
        : <>
          <dl className="grid divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {[
              { label: 'Total em aberto confirmado', value: position.portfolio.openConfirmed, help: `${position.portfolio.count} cobrança(s) confirmada(s)`, tone: 'text-blue-800', Icon: Wallet },
              { label: 'Vencido até o corte', value: position.portfolio.overdue, help: 'Obrigações vencidas na posição apurada', tone: 'text-amber-800', Icon: AlertTriangle },
              { label: 'A vencer', value: position.portfolio.toDue, help: 'Vencimentos ainda não vencidos no recorte', tone: 'text-emerald-800', Icon: CalendarClock },
            ].map(({ label, value, help, tone, Icon }) => <div key={label} className="p-4 sm:p-5">
              <dt className="flex items-center gap-2 text-xs font-bold text-slate-600"><Icon size={15} aria-hidden="true" />{label}</dt>
              <dd className={`mt-2 text-2xl font-black ${tone}`}>{formatCaixaCanonicalCurrency(value)}</dd>
              <p className="mt-2 text-[11px] text-slate-500">{help}</p>
            </div>)}
          </dl>
          <p className="px-5 pb-3 text-[10px] leading-4 text-slate-500">Posição baseada no cadastro e nas evidências atuais. Cancelamentos sem data histórica podem limitar a reconstituição.</p>
          {position.portfolio.reviewCount > 0 ? <button type="button" aria-haspopup="dialog" onClick={onReview}
            className="flex min-h-11 w-full items-start justify-between gap-3 border-t border-amber-200 bg-amber-50 px-4 py-4 text-left text-xs leading-5 text-amber-950 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-700 sm:px-5">
            <span><strong className="block">Registros em conferência — carteira</strong>
              Conferência de dados: {position.portfolio.reviewCount} registro(s) local(is) (valor nominal cadastrado {formatCaixaCanonicalCurrency(position.portfolio.reviewNominal)}), não incluídos nos valores confirmados.
              <span className="ml-1 font-extrabold underline underline-offset-2">Ver registros</span>
              <span className="mt-1 block">Estes registros não comprovam cobrança em aberto nem inadimplência. Podem corresponder a divergências de importação, quitações ou cancelamentos ainda não conciliados.</span></span>
            <ArrowRight size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
          </button> : <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">Sem registros locais em conferência neste recorte geral.</p>}
        </>}
  </section>;
}
