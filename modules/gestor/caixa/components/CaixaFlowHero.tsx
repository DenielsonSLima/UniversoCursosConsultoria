import React from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  CircleDollarSign,
  Equal,
  Minus,
  Scale,
} from 'lucide-react';
import type { CaixaMonthlyStatement } from '../caixa.types';
import { formatCaixaCurrency } from '../caixa.formatters';

interface CaixaFlowHeroProps {
  statement: CaixaMonthlyStatement;
  isConsolidated: boolean;
}

const resultPresentation = (status: CaixaMonthlyStatement['resumoCompetencia']['resultadoStatus']) => {
  if (status === 'NEGATIVO') {
    return {
      label: 'Déficit operacional',
      valueClass: 'text-rose-200',
      badgeClass: 'border-rose-400/30 bg-rose-400/10 text-rose-100',
    };
  }
  if (status === 'POSITIVO') {
    return {
      label: 'Superávit operacional',
      valueClass: 'text-emerald-200',
      badgeClass: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100',
    };
  }
  return {
    label: 'Resultado operacional',
    valueClass: 'text-blue-100',
    badgeClass: 'border-blue-300/30 bg-blue-300/10 text-blue-100',
  };
};

/**
 * Apresenta a equação financeira já calculada pelo backend. Os operandos e o
 * resultado nunca são recompostos no navegador; até valores aparentemente
 * divergentes permanecem exatamente como vieram do contrato mensal.
 */
export const CaixaFlowHero: React.FC<CaixaFlowHeroProps> = ({
  statement,
  isConsolidated,
}) => {
  const summary = statement.resumoCompetencia;
  const result = resultPresentation(summary.resultadoStatus);
  const positionLabel = isConsolidated
    ? 'Saldo contábil consolidado'
    : 'Posição atribuída ao polo';
  const paymentsHelper = `${summary.quantidadePagamentos} pagamento(s) confirmado(s)${
    summary.tarifasBancariasConfirmadas > 0
      ? ` · Tarifas ${formatCaixaCurrency(summary.tarifasBancariasConfirmadas)}`
      : ''
  }`;

  return (
    <section
      aria-labelledby="caixa-flow-hero-title"
      className="relative overflow-hidden rounded-3xl border border-slate-800 bg-[#061a2f] text-white shadow-lg shadow-slate-900/10"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_15%_20%,rgba(37,99,235,0.35),transparent_32%),radial-gradient(circle_at_85%_80%,rgba(16,185,129,0.18),transparent_30%)]"
      />
      <div className="relative grid gap-5 p-5 sm:p-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-300">
                Fluxo realizado
              </p>
              <h2 id="caixa-flow-hero-title" className="mt-1 text-xl font-extrabold tracking-tight">
                Do dinheiro que entrou ao resultado do mês
              </h2>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-300">
                Entradas e saídas operacionais confirmadas, sem misturar compromissos ainda em aberto.
              </p>
            </div>
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${result.badgeClass}`}>
              {result.label}
            </span>
          </div>

          <div
            className="mt-5 grid items-stretch gap-2 sm:grid-cols-[minmax(0,1fr)_32px_minmax(0,1fr)_32px_minmax(0,1.1fr)]"
            role="group"
            aria-label={`Entradas ${formatCaixaCurrency(summary.entradasRecebidasBrutas)}, menos saídas ${formatCaixaCurrency(summary.saidasPagas)}, resultado informado ${formatCaixaCurrency(summary.resultado)}`}
          >
            <FlowValue
              icon={<ArrowUpRight size={15} aria-hidden="true" />}
              label="Entradas recebidas"
              value={summary.entradasRecebidasBrutas}
              helper={`${summary.quantidadeRecebimentos} recebimento(s) confirmado(s)`}
              tone="emerald"
            />
            <Operator symbol="−" label="menos" />
            <FlowValue
              icon={<ArrowDownRight size={15} aria-hidden="true" />}
              label="Saídas pagas"
              value={summary.saidasPagas}
              helper={paymentsHelper}
              tone="rose"
            />
            <Operator symbol="=" label="igual a" />
            <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-300">
                <CircleDollarSign size={15} aria-hidden="true" />
                {result.label}
              </div>
              <p className={`mt-2 text-2xl font-black tracking-tight ${result.valueClass}`}>
                {formatCaixaCurrency(summary.resultado)}
              </p>
              <p className="mt-1 text-[10px] leading-4 text-slate-400">
                Resultado canônico informado para a competência
              </p>
            </div>
          </div>
        </div>

        <aside className="flex min-w-0 flex-col justify-between rounded-2xl border border-blue-300/20 bg-blue-950/40 p-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-semibold text-blue-200">
              <Scale size={15} aria-hidden="true" />
              {positionLabel}
            </div>
            <p className="mt-3 truncate text-2xl font-black tracking-tight text-white" title={formatCaixaCurrency(statement.saldosHoje.registradoTotal)}>
              {formatCaixaCurrency(statement.saldosHoje.registradoTotal)}
            </p>
            <p className="mt-1 text-[10px] leading-4 text-slate-300">
              Posição contábil no corte. Não compõe a equação do resultado mensal.
            </p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/10 pt-3 text-[10px]">
            <div>
              <p className="text-slate-400">Contas</p>
              <p className="mt-1 truncate font-bold text-blue-100">
                {formatCaixaCurrency(statement.saldosHoje.bancarioRegistrado)}
              </p>
            </div>
            <div>
              <p className="text-slate-400">Caixa local</p>
              <p className="mt-1 truncate font-bold text-blue-100">
                {formatCaixaCurrency(statement.saldosHoje.caixaLocal)}
              </p>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
};

const FlowValue: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: number;
  helper: string;
  tone: 'emerald' | 'rose';
}> = ({ icon, label, value, helper, tone }) => (
  <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
    <div className={`flex items-center gap-2 text-[11px] font-semibold ${
      tone === 'emerald' ? 'text-emerald-200' : 'text-rose-200'
    }`}>
      {icon}
      {label}
    </div>
    <p className="mt-2 text-xl font-extrabold tracking-tight text-white">
      {formatCaixaCurrency(value)}
    </p>
    <p className="mt-1 text-[10px] leading-4 text-slate-400">{helper}</p>
  </div>
);

const Operator: React.FC<{ symbol: '−' | '='; label: string }> = ({ symbol, label }) => (
  <div className="flex min-h-8 items-center justify-center text-slate-400" aria-label={label}>
    {symbol === '=' ? <Equal size={18} aria-hidden="true" /> : <Minus size={18} aria-hidden="true" />}
    <span className="sr-only">{symbol}</span>
  </div>
);
