import React from 'react';
import type { CaixaMonthlyStatement } from '../caixa.service';
import { formatCaixaCurrency } from '../caixa.formatters';

interface CaixaMovimentacaoChartProps {
  serieMensal: CaixaMonthlyStatement['serieMensal'];
}

export const CaixaMovimentacaoChart: React.FC<CaixaMovimentacaoChartProps> = ({ serieMensal }) => {
  const chartMonths = serieMensal.slice(-3);
  const hasChartMovement = chartMonths.some(
    (month) => month.entradas !== 0 || month.saidas !== 0 || month.inadimplencia !== 0 || !month.inadimplenciaCompleto,
  );
  const chartResultPoints = chartMonths
    .map((month, index) => `${((index + 0.5) / chartMonths.length) * 100},${month.resultadoPosicaoPercentual}`)
    .join(' ');
  const delinquencyPoints = chartMonths
    .map((month, index) => `${((index + 0.5) / chartMonths.length) * 100},${month.inadimplenciaPosicaoPercentual}`)
    .join(' ');

  return (
    <div className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900">Movimentação operacional</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Receitas, despesas, resultado e inadimplência dos últimos três meses
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-[10px] font-medium text-slate-500 sm:justify-end">
          <span className="flex items-center gap-1.5">
            <i className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Receitas
          </span>
          <span className="flex items-center gap-1.5">
            <i className="h-2.5 w-2.5 rounded-sm bg-rose-500" /> Despesas
          </span>
          <span className="flex items-center gap-1.5" title="Resultado operacional: receitas menos despesas">
            <i className="w-3 border-t-2 border-blue-500" /> Resultado operacional
          </span>
          <span className="flex items-center gap-1.5" title="Cobranças do mês não recebidas até a data de referência">
            <i className="w-3 border-t-2 border-orange-500" /> Inadimplência
          </span>
        </div>
      </div>

      {hasChartMovement ? (
        <div className="mt-5">
          <div className="relative flex h-44 items-end border-b border-slate-100">
            <svg
              className="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-visible"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <line
                x1="0" y1={chartMonths[0]?.graficoZeroPosicaoPercentual ?? 100}
                x2="100" y2={chartMonths[0]?.graficoZeroPosicaoPercentual ?? 100}
                stroke="#cbd5e1" strokeDasharray="3 4" vectorEffect="non-scaling-stroke"
              />
              <polyline
                points={chartResultPoints}
                fill="none"
                stroke="#3b82f6"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              <polyline
                data-series="inadimplencia"
                points={delinquencyPoints}
                fill="none"
                stroke="#f97316"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            {chartMonths.map((month, index) => (
              <div
                key={month.competencia}
                className="group/month relative flex h-full min-w-0 flex-1 cursor-help items-end justify-center gap-1.5 border-l border-slate-100 px-1.5 outline-none transition-colors first:border-l-0 hover:bg-slate-50/60 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:px-2.5"
                role="img"
                tabIndex={0}
                aria-label={`${month.rotulo}: receitas ${formatCaixaCurrency(month.entradas)}; despesas ${formatCaixaCurrency(month.saidas)}; resultado ${formatCaixaCurrency(month.resultado)}; inadimplência ${formatCaixaCurrency(month.inadimplencia)}${!month.inadimplenciaCompleto ? `, valor parcial: ${month.inadimplenciaQuantidadeEmConferencia} cobrança(s) em conferência não incluída(s)` : ''}`}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute -top-2 z-30 hidden w-48 max-w-[65vw] -translate-y-full rounded-lg bg-slate-900 px-2.5 py-2 text-[10px] font-medium text-white shadow-lg group-hover/month:block group-focus/month:block ${
                    index === 0 ? 'left-0' : index === chartMonths.length - 1 ? 'right-0' : 'left-1/2 -translate-x-1/2'
                  }`}
                >
                  <span className="block font-bold">{month.rotulo}</span>
                  <span className="block">Receitas {formatCaixaCurrency(month.entradas)}</span>
                  <span className="block">Despesas {formatCaixaCurrency(month.saidas)}</span>
                  <span className="block">Resultado operacional {formatCaixaCurrency(month.resultado)}</span>
                  <span className="block text-orange-300">Inadimplência {formatCaixaCurrency(month.inadimplencia)}</span>
                  {!month.inadimplenciaCompleto && (
                    <span className="mt-1 block text-orange-200">
                      Valor parcial: {month.inadimplenciaQuantidadeEmConferencia} cobrança(s) em conferência não incluída(s).
                    </span>
                  )}
                </span>
                <span
                  className={`pointer-events-none absolute left-1/2 z-20 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-sm ${
                    month.resultadoStatus === 'POSITIVO' ? 'bg-emerald-500'
                      : month.resultadoStatus === 'NEGATIVO' ? 'bg-rose-500' : 'bg-blue-500'
                  }`}
                  style={{ top: `${month.resultadoPosicaoPercentual}%` }}
                  aria-hidden="true"
                />
                <span
                  className="pointer-events-none absolute left-1/2 z-20 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-orange-500 shadow-sm"
                  style={{ top: `${month.inadimplenciaPosicaoPercentual}%` }}
                  aria-hidden="true"
                />
                <div
                  className="absolute right-1/2 mr-1 w-3 rounded-t bg-emerald-500 sm:w-5"
                  style={{ height: `${month.entradasEscalaPercentual}%`, bottom: `${100 - month.graficoZeroPosicaoPercentual}%` }}
                  aria-hidden="true"
                />
                <div
                  className="absolute left-1/2 ml-1 w-3 rounded-t bg-rose-500 sm:w-5"
                  style={{ height: `${month.saidasEscalaPercentual}%`, bottom: `${100 - month.graficoZeroPosicaoPercentual}%` }}
                  aria-hidden="true"
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex">
            {chartMonths.map((month) => (
              <p key={month.competencia} className="min-w-0 flex-1 truncate px-1 text-center text-[10px] font-medium text-slate-500">
                {month.rotulo}
              </p>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-5 flex min-h-28 flex-1 items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-400">
          Nenhuma movimentação ou inadimplência confirmada neste período.
        </div>
      )}
    </div>
  );
};
