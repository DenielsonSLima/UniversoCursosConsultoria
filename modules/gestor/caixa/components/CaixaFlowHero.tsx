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
      className="overflow-hidden rounded-xl border border-[#18364d] bg-[#0c2942] text-white"
    >
      <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium tracking-[0.08em] text-blue-300">
                Fluxo realizado
              </p>
              <h2 id="caixa-flow-hero-title" className="mt-1 text-[15px] font-medium tracking-tight">
                Do dinheiro que entrou ao resultado do mês
              </h2>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-300">
                Entradas e saídas operacionais confirmadas, sem misturar compromissos ainda em aberto.
              </p>
            </div>
            <span className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${result.badgeClass}`}>
              {result.label}
            </span>
          </div>

          <div
            className="mt-4 grid items-stretch gap-2 sm:grid-cols-[minmax(0,1fr)_20px_minmax(0,1fr)_20px_minmax(0,1.1fr)]"
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
            <div className="min-w-0 rounded-lg border border-white/15 bg-white/[0.08] p-3">
              <div className="flex items-center gap-2 text-[11px] font-medium text-slate-300">
                <CircleDollarSign size={15} aria-hidden="true" />
                {result.label}
              </div>
              <p className={`mt-2 break-words text-[24px] font-medium leading-tight tracking-tight tabular-nums ${result.valueClass}`}>
                {formatCaixaCurrency(summary.resultado)}
              </p>
              <p className="mt-1 text-[11px] leading-4 text-slate-300/80">
                Resultado canônico informado para a competência
              </p>
            </div>
          </div>
        </div>

        <aside className="flex min-w-0 flex-col justify-between rounded-lg border border-white/10 bg-white/[0.04] p-3">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-medium text-blue-200">
              <Scale size={15} aria-hidden="true" />
              {positionLabel}
            </div>
            <p className="mt-3 break-words text-[25px] font-medium leading-tight tracking-tight tabular-nums text-white" title={formatCaixaCurrency(statement.saldosHoje.registradoTotal)}>
              {formatCaixaCurrency(statement.saldosHoje.registradoTotal)}
            </p>
            <p className="mt-1 text-[11px] leading-4 text-slate-300">
              Saldo contábil atual. Não compõe a equação do resultado mensal.
            </p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/10 pt-3 text-[11px]">
            <div>
              <p className="text-slate-300/80">Contas</p>
              <p className="mt-1 break-words font-medium tabular-nums text-blue-100">
                {formatCaixaCurrency(statement.saldosHoje.bancarioRegistrado)}
              </p>
            </div>
            <div>
              <p className="text-slate-300/80">Caixa local</p>
              <p className="mt-1 break-words font-medium tabular-nums text-blue-100">
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
  <div className="min-w-0 rounded-lg border border-white/10 bg-white/[0.04] p-3">
    <div className={`flex items-center gap-2 text-[11px] font-medium ${
      tone === 'emerald' ? 'text-emerald-200' : 'text-rose-200'
    }`}>
      {icon}
      {label}
    </div>
    <p className="mt-2 break-words text-[22px] font-medium leading-tight tracking-tight tabular-nums text-white">
      {formatCaixaCurrency(value)}
    </p>
    <p className="mt-1 text-[11px] leading-4 text-slate-300/80">{helper}</p>
  </div>
);

const Operator: React.FC<{ symbol: '−' | '='; label: string }> = ({ symbol, label }) => (
  <div className="flex min-h-8 items-center justify-center text-slate-300/80" aria-label={label}>
    {symbol === '=' ? <Equal size={18} aria-hidden="true" /> : <Minus size={18} aria-hidden="true" />}
    <span className="sr-only">{symbol}</span>
  </div>
);
