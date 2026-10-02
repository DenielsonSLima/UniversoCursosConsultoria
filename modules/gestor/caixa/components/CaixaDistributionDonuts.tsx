import React from 'react';
import { ArrowDownRight, ArrowUpRight, CircleSlash2 } from 'lucide-react';
import type { CaixaMonthlyStatement } from '../caixa.types';
import { formatCaixaCurrency, formatCaixaPercent } from '../caixa.formatters';

type DistributionItem = CaixaMonthlyStatement['receitasPorModalidade'][number];
type DistributionTone = 'green' | 'rose';

interface CaixaDistributionDonutProps {
  title: string;
  subtitle: string;
  totalLabel: string;
  totalValue: number;
  items: DistributionItem[];
  emptyLabel: string;
  tone: DistributionTone;
}

interface DonutSegment extends DistributionItem {
  offset: number;
  color: string;
}

const COLOR_RAMPS: Record<DistributionTone, string[]> = {
  green: ['#059669', '#10b981', '#34d399', '#0d9488', '#14b8a6', '#6ee7b7'],
  rose: ['#e11d48', '#f43f5e', '#fb7185', '#be123c', '#f97316', '#fda4af'],
};

const getSegments = (items: DistributionItem[], tone: DistributionTone): DonutSegment[] => {
  let visualOffset = 0;
  return items
    .filter((item) => item.valor !== 0 || item.quantidade !== 0)
    .map((item, index) => {
      const segment = {
        ...item,
        offset: visualOffset,
        color: COLOR_RAMPS[tone][index % COLOR_RAMPS[tone].length],
      };
      // Soma apenas o deslocamento visual. O percentual financeiro é o valor
      // canônico recebido e nunca é refeito a partir dos valores monetários.
      if (item.percentual > 0) visualOffset += item.percentual;
      return segment;
    });
};

export const CaixaDistributionDonut: React.FC<CaixaDistributionDonutProps> = ({
  title,
  subtitle,
  totalLabel,
  totalValue,
  items,
  emptyLabel,
  tone,
}) => {
  const segments = getSegments(items, tone);
  const titleColor = tone === 'green' ? 'text-emerald-950' : 'text-rose-950';
  const valueColor = tone === 'green' ? 'text-emerald-700' : 'text-rose-700';
  const iconClass = tone === 'green'
    ? 'bg-emerald-50 text-emerald-700'
    : 'bg-rose-50 text-rose-700';
  const accessibleBreakdown = segments.length > 0
    ? segments.map((segment) => `${segment.rotulo}: ${formatCaixaPercent(segment.percentual)}`).join('; ')
    : emptyLabel;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="flex items-start gap-3">
        <span className={`rounded-xl p-2 ${iconClass}`}>
          {tone === 'green'
            ? <ArrowUpRight size={17} aria-hidden="true" />
            : <ArrowDownRight size={17} aria-hidden="true" />}
        </span>
        <div>
          <h3 className={`text-base font-extrabold ${titleColor}`}>{title}</h3>
          <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
        </div>
      </header>

      {segments.length > 0 ? (
        <div className="mt-5 grid items-center gap-5 sm:grid-cols-[180px_minmax(0,1fr)]">
          <div className="relative mx-auto h-44 w-44">
            <svg
              viewBox="0 0 120 120"
              className="h-full w-full -rotate-90"
              role="img"
              aria-label={`${title}. ${accessibleBreakdown}`}
            >
              <circle
                cx="60"
                cy="60"
                r="46"
                pathLength="100"
                fill="none"
                stroke="#f1f5f9"
                strokeWidth="13"
              />
              {segments.filter((segment) => segment.percentual > 0).map((segment) => (
                <circle
                  key={segment.codigo}
                  data-segment={segment.codigo}
                  data-percentual={segment.percentual}
                  cx="60"
                  cy="60"
                  r="46"
                  pathLength="100"
                  fill="none"
                  stroke={segment.color}
                  strokeWidth="13"
                  strokeLinecap="butt"
                  strokeDasharray={`${segment.percentual} 100`}
                  strokeDashoffset={-segment.offset}
                />
              ))}
            </svg>
            <div className="pointer-events-none absolute inset-6 flex flex-col items-center justify-center rounded-full bg-white text-center shadow-inner">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{totalLabel}</span>
              <strong className={`mt-1 max-w-[110px] truncate text-base font-extrabold ${valueColor}`} title={formatCaixaCurrency(totalValue)}>
                {formatCaixaCurrency(totalValue)}
              </strong>
            </div>
          </div>

          <ul className="grid min-w-0 gap-2" aria-label={`Detalhamento de ${title.toLowerCase()}`}>
            {segments.map((segment) => (
              <li key={segment.codigo} className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2">
                    <span
                      className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: segment.color }}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-800">{segment.rotulo}</p>
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        {segment.quantidade} {segment.quantidade === 1 ? 'movimento' : 'movimentos'}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-extrabold text-slate-800">{formatCaixaPercent(segment.percentual)}</p>
                    <p className="mt-0.5 text-[10px] text-slate-500">{formatCaixaCurrency(segment.valor)}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="mt-4 flex min-h-28 items-center gap-4 rounded-2xl bg-slate-50 px-4 py-4 text-left">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-slate-300 shadow-sm">
            <CircleSlash2 size={22} aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-600">{emptyLabel}</p>
            <p className="mt-1 text-[10px] leading-4 text-slate-400">
            O gráfico será exibido quando houver percentuais canônicos confirmados.
            </p>
          </div>
        </div>
      )}
    </article>
  );
};

export const CaixaDistributionDonuts: React.FC<{ statement: CaixaMonthlyStatement }> = ({ statement }) => (
  <section aria-labelledby="caixa-distribution-title">
    <div className="mb-4 px-1">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-600">Composição operacional</p>
      <h2 id="caixa-distribution-title" className="mt-1 text-lg font-extrabold text-[#001a33]">
        De onde vieram as entradas e para onde foram as saídas
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        Participações enviadas pelo backend para a competência selecionada.
      </p>
    </div>
    <div className="grid gap-4 xl:grid-cols-2">
      <CaixaDistributionDonut
        title="Receitas por modalidade"
        subtitle="Participação das entradas operacionais confirmadas"
        totalLabel="Recebido"
        totalValue={statement.resumoCompetencia.entradasRecebidasBrutas}
        items={statement.receitasPorModalidade}
        emptyLabel="Nenhuma receita recebida no período."
        tone="green"
      />
      <CaixaDistributionDonut
        title="Despesas por categoria"
        subtitle="Tarifas aparecem somente quando confirmadas"
        totalLabel="Pago"
        totalValue={statement.resumoCompetencia.saidasPagas}
        items={statement.despesasPorCategoria}
        emptyLabel="Nenhuma despesa paga no período."
        tone="rose"
      />
    </div>
  </section>
);
