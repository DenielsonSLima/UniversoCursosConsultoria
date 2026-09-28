import React from 'react';
import { CircleGauge } from 'lucide-react';
import { formatCaixaCanonicalCurrency } from '../../caixa.formatters.ts';
import type { CaixaImmersiveCompositionItem, CaixaImmersiveCompositionVisual } from './CaixaImmersiveChart.types.ts';
import { getCaixaImmersiveColorByBusinessCode } from './caixa-immersive.palette.ts';

export interface CaixaImmersiveDonutChartProps {
  chartId: string;
  eyebrow?: string;
  title: string;
  description: string;
  accessibleSummary: string;
  composition: CaixaImmersiveCompositionVisual;
  centerLabel: string;
  emptyLabel?: string;
}

const quantityFormatter = new Intl.NumberFormat('pt-BR');
const percentageFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const quantityLabel = (item: CaixaImmersiveCompositionItem) => `${quantityFormatter.format(item.quantidade)} movimentos`;

export const CaixaImmersiveDonutChart = ({
  chartId,
  eyebrow = 'Composição',
  title,
  description,
  accessibleSummary,
  composition,
  centerLabel,
  emptyLabel = 'Nenhuma composição canônica disponível.',
}: CaixaImmersiveDonutChartProps) => (
  <section
    aria-labelledby={`${chartId}-title`}
    aria-describedby={`${chartId}-description ${chartId}-summary`}
    className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_20px_55px_-38px_rgba(0,26,51,0.48)] sm:p-6"
  >
    <header className="flex items-start gap-3">
      <span className="mt-0.5 rounded-2xl border border-blue-100 bg-blue-50 p-2.5 text-blue-700"><CircleGauge aria-hidden="true" size={19} /></span>
      <div>
        <p className="text-[10px] font-extrabold uppercase tracking-[0.19em] text-blue-700">{eyebrow}</p>
        <h2 id={`${chartId}-title`} className="mt-1 text-lg font-black tracking-[-0.025em] text-[#001a33]">{title}</h2>
        <p id={`${chartId}-description`} className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
      </div>
    </header>

    <p id={`${chartId}-summary`} className="sr-only">{accessibleSummary}</p>

    {composition.itens.length > 0 ? (
      <div className="mt-5 grid items-center gap-6 sm:grid-cols-[minmax(180px,0.8fr)_minmax(0,1.2fr)]">
        <div className="mx-auto w-full max-w-[260px]">
          <svg role="img" aria-label={accessibleSummary} viewBox="0 0 100 100" className="h-auto w-full overflow-visible">
            <circle cx="50" cy="50" r="35" pathLength="100" fill="none" stroke="#e8edf3" strokeWidth="12" aria-hidden="true" />
            {composition.itens.map((item) => {
              const color = getCaixaImmersiveColorByBusinessCode(item.codigo);
              const percentageLabel = `${percentageFormatter.format(item.percentual)}%`;
              return (
                <g key={item.codigo} className="group cursor-help outline-none" role="img" tabIndex={0} aria-label={`${item.rotulo}: ${formatCaixaCanonicalCurrency(item.valor)}, ${percentageLabel}, ${quantityLabel(item)}`}>
                  <circle
                    data-donut-segment={item.codigo}
                    cx="50"
                    cy="50"
                    r="35"
                    pathLength="100"
                    fill="none"
                    stroke={color.solid}
                    strokeWidth="12"
                    strokeDasharray={`${item.comprimentoPercentual} ${item.gapPercentual}`}
                    strokeDashoffset={item.offsetPercentual}
                    transform="rotate(-90 50 50)"
                    className="transition-opacity duration-150 group-hover:opacity-75 group-focus:opacity-75 motion-reduce:transition-none"
                  />
                  <g role="tooltip" aria-hidden="true" className="pointer-events-none opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus:opacity-100 motion-reduce:transition-none">
                    <rect x="30" y="36" width="40" height="27" rx="3" fill="#001a33" className="drop-shadow-lg" />
                    <text x="50" y="43" fill="#bfdbfe" fontSize="3" fontWeight="800" textAnchor="middle">{item.rotulo}</text>
                    <text x="50" y="50" fill="#ffffff" fontSize="3.4" fontWeight="800" textAnchor="middle">{formatCaixaCanonicalCurrency(item.valor)}</text>
                    <text x="50" y="56" fill="#ffffff" fontSize="2.8" textAnchor="middle">{percentageLabel}</text>
                    <text x="50" y="61" fill="#cbd5e1" fontSize="2.5" textAnchor="middle">{quantityLabel(item)}</text>
                  </g>
                </g>
              );
            })}
            <g aria-hidden="true">
              <text x="50" y="47" textAnchor="middle" fill="#001a33" fontSize="4" fontWeight="800">{centerLabel}</text>
              <text x="50" y="55" textAnchor="middle" fill="#475569" fontSize="3.4" fontWeight="700">{formatCaixaCanonicalCurrency(composition.total)}</text>
            </g>
          </svg>
        </div>

        <ul aria-label="Detalhamento da composição" className="grid gap-2">
          {composition.itens.map((item) => {
            const color = getCaixaImmersiveColorByBusinessCode(item.codigo);
            return (
              <li key={item.codigo} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
                <span className="flex min-w-0 items-center gap-2.5">
                  <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color.solid }} />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-bold text-slate-700">{item.rotulo}</span>
                    <span className="block text-[10px] text-slate-500">{quantityLabel(item)}</span>
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-xs font-black text-[#001a33]">{formatCaixaCanonicalCurrency(item.valor)}</span>
                  <span className="block text-[10px] font-bold" style={{ color: color.ink }}>{percentageFormatter.format(item.percentual)}%</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    ) : (
      <div role="status" className="mt-5 flex min-h-52 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 text-center text-sm text-slate-500">{emptyLabel}</div>
    )}
  </section>
);
