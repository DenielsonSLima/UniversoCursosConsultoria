import React from 'react';
import { WalletCards } from 'lucide-react';
import { formatCaixaCanonicalCurrency } from '../../caixa.formatters.ts';
import type { CaixaImmersiveBalanceItem, CaixaImmersiveBalanceVisual } from './CaixaImmersiveChart.types.ts';
import { getCaixaImmersiveColorByBusinessCode } from './caixa-immersive.palette.ts';

export interface CaixaImmersiveBalanceDistributionProps {
  distributionId: string;
  eyebrow?: string;
  title: string;
  description: string;
  accessibleSummary: string;
  totalLabel: string;
  distribution: CaixaImmersiveBalanceVisual;
  emptyLabel?: string;
}

const percentageFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const accountLabel = (item: CaixaImmersiveBalanceItem) => item.banco || item.titular || 'Conta sem identificação';
const accountDetail = (item: CaixaImmersiveBalanceItem) => item.conta || item.titular || item.natureza || 'Sem detalhe adicional';

export const CaixaImmersiveBalanceDistribution = ({
  distributionId,
  eyebrow = 'Distribuição de saldo',
  title,
  description,
  accessibleSummary,
  totalLabel,
  distribution,
  emptyLabel = 'Nenhuma distribuição canônica disponível.',
}: CaixaImmersiveBalanceDistributionProps) => (
  <section
    aria-labelledby={`${distributionId}-title`}
    aria-describedby={`${distributionId}-description ${distributionId}-summary`}
    className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_20px_55px_-38px_rgba(0,26,51,0.48)] sm:p-6"
  >
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <header className="flex items-start gap-3">
        <span className="mt-0.5 rounded-2xl border border-blue-100 bg-blue-50 p-2.5 text-blue-700"><WalletCards aria-hidden="true" size={19} /></span>
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.19em] text-blue-700">{eyebrow}</p>
          <h2 id={`${distributionId}-title`} className="mt-1 text-lg font-black tracking-[-0.025em] text-[#001a33]">{title}</h2>
          <p id={`${distributionId}-description`} className="mt-1 max-w-xl text-xs leading-5 text-slate-500">{description}</p>
        </div>
      </header>
      <dl className="shrink-0 rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3 sm:text-right">
        <dt className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-blue-700">{totalLabel}</dt>
        <dd className="mt-1 text-lg font-black tracking-[-0.025em] text-[#001a33]">{formatCaixaCanonicalCurrency(distribution.totalPositivo)}</dd>
      </dl>
    </div>

    <p id={`${distributionId}-summary`} className="sr-only">{accessibleSummary}</p>

    {distribution.itens.length > 0 ? (
      <div className="mt-6">
        <div aria-hidden="true" className="relative h-4 w-full overflow-hidden rounded-full bg-slate-100 ring-1 ring-inset ring-slate-200">
          {distribution.itens.map((item) => (
            <span
              key={item.id}
              data-balance-segment={item.id}
              className="absolute inset-y-0 transition-opacity duration-150 hover:opacity-80 motion-reduce:transition-none"
              style={{
                left: `${item.inicioPercentual}%`,
                width: `${item.comprimentoPercentual}%`,
                backgroundColor: getCaixaImmersiveColorByBusinessCode(item.natureza).solid,
              }}
            />
          ))}
        </div>

        <ul aria-label="Detalhamento da distribuição" className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {distribution.itens.map((item) => {
            const color = getCaixaImmersiveColorByBusinessCode(item.natureza);
            const formattedValue = formatCaixaCanonicalCurrency(item.valor);
            const percentageLabel = `${percentageFormatter.format(item.percentual)}%`;
            return (
              <li
                key={item.id}
                className="group relative rounded-2xl border border-slate-200 bg-white p-3 outline-none transition-colors hover:border-blue-200 hover:bg-blue-50/30 focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 motion-reduce:transition-none"
                role="img"
                tabIndex={0}
                aria-label={`${accountLabel(item)}: ${formattedValue}, ${percentageLabel}, ${accountDetail(item)}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <span aria-hidden="true" className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color.solid }} />
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-bold text-slate-700">{accountLabel(item)}</span>
                      <span className="block truncate text-[10px] text-slate-500">{accountDetail(item)}</span>
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold" style={{ backgroundColor: color.soft, color: color.ink }}>{percentageLabel}</span>
                </div>
                <p className="mt-2 text-base font-black tracking-[-0.02em] text-[#001a33]">{formattedValue}</p>
                <div role="tooltip" aria-hidden="true" className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-max max-w-[min(250px,80vw)] -translate-x-1/2 rounded-xl bg-[#001a33] px-3 py-2 text-center text-[10px] font-bold text-white shadow-xl group-hover:block group-focus:block">
                  {accountLabel(item)} · {formattedValue} · {percentageLabel}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    ) : (
      <div role="status" className="mt-5 flex min-h-32 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 text-center text-sm text-slate-500">{emptyLabel}</div>
    )}
  </section>
);
