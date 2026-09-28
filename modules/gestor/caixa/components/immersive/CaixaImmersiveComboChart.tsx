import React from 'react';
import { ChartNoAxesCombined } from 'lucide-react';
import { formatCaixaCanonicalCurrency } from '../../caixa.formatters.ts';
import type { CaixaImmersiveMonthlyPoint, CaixaImmersiveMonthlyVisual } from './CaixaImmersiveChart.types.ts';
import { getCaixaImmersiveColorByBusinessCode } from './caixa-immersive.palette.ts';

export interface CaixaImmersiveComboChartProps {
  chartId: string;
  eyebrow?: string;
  title: string;
  description: string;
  accessibleSummary: string;
  movimentacao: CaixaImmersiveMonthlyVisual;
  emptyLabel?: string;
}

const formatMonthLabel = (month: CaixaImmersiveMonthlyPoint) => (
  `${month.rotulo}: entradas ${formatCaixaCanonicalCurrency(month.entradasValor)}; `
  + `saídas ${formatCaixaCanonicalCurrency(month.saidasValor)}; `
  + `resultado ${formatCaixaCanonicalCurrency(month.resultadoValor)}; `
  + `inadimplência ${formatCaixaCanonicalCurrency(month.inadimplenciaValor)}`
);

const MonthTooltip = ({ month }: { month: CaixaImmersiveMonthlyPoint }) => (
  <g
    role="tooltip"
    aria-hidden="true"
    transform={`translate(${month.x} 3)`}
    className="pointer-events-none opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus:opacity-100 motion-reduce:transition-none"
  >
    <rect x="-15" y="0" width="30" height="25" rx="2.5" fill="#001a33" className="drop-shadow-lg" />
    <text x="-12.5" y="5" fill="#bfdbfe" fontSize="2.5" fontWeight="800">{month.rotulo}</text>
    <text x="-12.5" y="10" fill="#ffffff" fontSize="2.15">Entradas {formatCaixaCanonicalCurrency(month.entradasValor)}</text>
    <text x="-12.5" y="14.5" fill="#ffffff" fontSize="2.15">Saídas {formatCaixaCanonicalCurrency(month.saidasValor)}</text>
    <text x="-12.5" y="19" fill="#ffffff" fontSize="2.15">Resultado {formatCaixaCanonicalCurrency(month.resultadoValor)}</text>
    <text x="-12.5" y="23" fill="#fde68a" fontSize="2.15">Inadimplência {formatCaixaCanonicalCurrency(month.inadimplenciaValor)}</text>
  </g>
);

const LEGEND = [
  { code: 'ENTRADAS', label: 'Entradas', kind: 'BAR' },
  { code: 'SAIDAS', label: 'Saídas', kind: 'BAR' },
  { code: 'RESULTADO', label: 'Resultado', kind: 'LINE' },
  { code: 'INADIMPLENCIA', label: 'Inadimplência', kind: 'LINE' },
] as const;

export const CaixaImmersiveComboChart = ({
  chartId,
  eyebrow = 'Leitura temporal',
  title,
  description,
  accessibleSummary,
  movimentacao,
  emptyLabel = 'Nenhuma série canônica disponível para este período.',
}: CaixaImmersiveComboChartProps) => {
  const entradaColor = getCaixaImmersiveColorByBusinessCode('ENTRADAS');
  const saidaColor = getCaixaImmersiveColorByBusinessCode('SAIDAS');
  const resultadoColor = getCaixaImmersiveColorByBusinessCode('RESULTADO');
  const inadimplenciaColor = getCaixaImmersiveColorByBusinessCode('INADIMPLENCIA');

  return (
    <section
      aria-labelledby={`${chartId}-title`}
      aria-describedby={`${chartId}-description ${chartId}-summary`}
      className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_20px_55px_-38px_rgba(0,26,51,0.48)]"
    >
      <header className="flex flex-col gap-4 border-b border-slate-200 bg-gradient-to-r from-white via-white to-blue-50/70 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 rounded-2xl border border-blue-100 bg-blue-50 p-2.5 text-blue-700">
            <ChartNoAxesCombined aria-hidden="true" size={19} />
          </span>
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.19em] text-blue-700">{eyebrow}</p>
            <h2 id={`${chartId}-title`} className="mt-1 text-lg font-black tracking-[-0.025em] text-[#001a33] sm:text-xl">{title}</h2>
            <p id={`${chartId}-description`} className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">{description}</p>
          </div>
        </div>
        <ul aria-label="Legenda do gráfico" className="flex flex-wrap gap-x-4 gap-y-2 text-[10px] font-bold text-slate-600">
          {LEGEND.map((item) => {
            const color = getCaixaImmersiveColorByBusinessCode(item.code);
            return (
              <li key={item.code} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className={item.kind === 'LINE' ? 'h-0 w-4 border-t-2' : 'h-2.5 w-2.5 rounded-[3px]'}
                  style={item.kind === 'LINE' ? { borderColor: color.solid } : { backgroundColor: color.solid }}
                />
                {item.label}
              </li>
            );
          })}
        </ul>
      </header>

      <p id={`${chartId}-summary`} className="sr-only">{accessibleSummary}</p>

      {movimentacao.meses.length > 0 ? (
        <div className="relative overflow-x-auto px-3 pb-3 pt-4 sm:px-5 sm:pb-5" tabIndex={0} aria-label="Área rolável do gráfico">
          <svg
            role="img"
            aria-label={accessibleSummary}
            viewBox={movimentacao.viewBox}
            className="h-auto min-w-[640px] w-full overflow-visible"
            preserveAspectRatio="xMidYMid meet"
          >
            <g aria-hidden="true" stroke="#dbe3ec" strokeWidth="0.35" strokeDasharray="1 2">
              <line x1="0" x2="100" y1="20" y2="20" />
              <line x1="0" x2="100" y1="40" y2="40" />
              <line x1="0" x2="100" y1="60" y2="60" />
              <line x1="0" x2="100" y1="80" y2="80" />
            </g>

            {movimentacao.meses.map((month) => (
              <g key={month.competencia} className="group cursor-help outline-none" role="img" tabIndex={0} aria-label={formatMonthLabel(month)}>
                <rect
                  data-chart-bar={`${month.competencia}-entradas`}
                  x={month.entradaX}
                  y={month.entradaY}
                  width={month.largura}
                  height={month.entradasAltura}
                  rx="0.8"
                  fill={entradaColor.solid}
                  className="transition-opacity duration-150 group-hover:opacity-80 group-focus:opacity-80 motion-reduce:transition-none"
                />
                <rect
                  data-chart-bar={`${month.competencia}-saidas`}
                  x={month.saidaX}
                  y={month.saidaY}
                  width={month.largura}
                  height={month.saidasAltura}
                  rx="0.8"
                  fill={saidaColor.solid}
                  className="transition-opacity duration-150 group-hover:opacity-80 group-focus:opacity-80 motion-reduce:transition-none"
                />
                <circle cx={month.x} cy={month.resultadoY} r="1.15" fill="#ffffff" stroke={resultadoColor.solid} strokeWidth="0.7" />
                <circle cx={month.x} cy={month.inadimplenciaY} r="1.15" fill="#ffffff" stroke={inadimplenciaColor.solid} strokeWidth="0.7" />
                <text x={month.x} y="97" fill="#64748b" fontSize="2.5" fontWeight="700" textAnchor="middle" aria-hidden="true">{month.rotulo}</text>
                <MonthTooltip month={month} />
              </g>
            ))}

            <polyline data-chart-line="resultado" points={movimentacao.resultadoPontos} fill="none" stroke={resultadoColor.solid} strokeWidth="0.7" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" aria-hidden="true" />
            <polyline data-chart-line="inadimplencia" points={movimentacao.inadimplenciaPontos} fill="none" stroke={inadimplenciaColor.solid} strokeWidth="0.7" strokeDasharray="2 1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" aria-hidden="true" />
          </svg>
          <p className="mt-2 text-center text-[10px] font-semibold text-slate-400 sm:hidden">Deslize horizontalmente para percorrer todo o período.</p>
        </div>
      ) : (
        <div role="status" className="m-5 flex min-h-48 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 text-center text-sm text-slate-500">{emptyLabel}</div>
      )}
    </section>
  );
};
