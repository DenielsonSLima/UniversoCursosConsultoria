import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  RefreshCw,
  ReceiptText,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { formatCaixaCanonicalCurrency } from '../caixa.formatters.ts';
import { caixaCompositionObservation } from '../caixa-composicao.presentation.ts';
import type {
  CaixaComposicaoDados,
  CaixaComposicaoMensalPayload,
  CaixaComposicaoSecao,
} from '../caixa-composicao.types.ts';

interface CaixaCompositionCardsProps {
  composicao?: CaixaComposicaoMensalPayload;
  isLoading: boolean;
  hasError: boolean;
  onRetry?: () => void;
}

type CompositionTone = 'receipts' | 'expenses';

interface CardCopy {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  totalLabel: string;
  movementLabel: string;
  tone: CompositionTone;
  icon: LucideIcon;
}

const copies: Record<CompositionTone, CardCopy> = {
  receipts: {
    id: 'caixa-composicao-recebimentos',
    eyebrow: 'Entradas realizadas',
    title: 'Composição dos recebimentos confirmados',
    description: 'O que formou o valor efetivamente recebido na competência.',
    totalLabel: 'Total recebido',
    movementLabel: 'recebimento(s) confirmado(s)',
    tone: 'receipts',
    icon: CircleDollarSign,
  },
  expenses: {
    id: 'caixa-composicao-despesas',
    eyebrow: 'Saídas realizadas',
    title: 'Composição das despesas pagas',
    description: 'O que formou o valor efetivamente pago na competência.',
    totalLabel: 'Total pago',
    movementLabel: 'pagamento(s) confirmado(s)',
    tone: 'expenses',
    icon: ReceiptText,
  },
};

const toneClasses = {
  receipts: {
    card: 'border-emerald-200/80 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.13),transparent_38%),linear-gradient(145deg,#ffffff_0%,#f4fcf8_100%)]',
    icon: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    eyebrow: 'text-emerald-700',
    value: 'text-emerald-800',
    rule: 'bg-emerald-500',
    metric: 'border-emerald-100/80 bg-white/75',
    focus: 'focus-visible:ring-emerald-600',
  },
  expenses: {
    card: 'border-rose-200/80 bg-[radial-gradient(circle_at_top_right,rgba(244,63,94,0.11),transparent_38%),linear-gradient(145deg,#ffffff_0%,#fff7f8_100%)]',
    icon: 'border-rose-200 bg-rose-50 text-rose-700',
    eyebrow: 'text-rose-700',
    value: 'text-rose-700',
    rule: 'bg-rose-500',
    metric: 'border-rose-100/80 bg-white/75',
    focus: 'focus-visible:ring-rose-600',
  },
} as const;

const quantityFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

const formatQuantity = (value: number) => quantityFormatter.format(value);

const formatProvenMoney = (value: string | null) => (
  value === null ? null : formatCaixaCanonicalCurrency(value)
);

const compositionMetrics = (dados: CaixaComposicaoDados) => [
  { label: 'Base', value: dados.base },
  { label: 'Juros', value: dados.juros },
  { label: 'Multa', value: dados.multa },
  { label: 'Acréscimo', value: dados.acrescimo },
  { label: 'Desconto', value: dados.desconto },
  { label: 'Diferença a conferir', value: dados.diferenca_a_conferir },
] as const;

const CompositionMetrics = ({
  dados,
  tone,
  partial,
  className,
}: {
  dados: CaixaComposicaoDados;
  tone: CompositionTone;
  partial: boolean;
  className: string;
}) => (
  <dl className={className}>
    {compositionMetrics(dados).map((metric) => {
      const formattedValue = formatProvenMoney(metric.value);
      const subtotal = partial && !['Base', 'Diferença a conferir'].includes(metric.label)
        && formattedValue !== null;
      return (
        <div
          key={metric.label}
          className={`min-w-0 rounded-xl border px-3 py-3 ${toneClasses[tone].metric}`}
        >
          <dt className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-slate-500">
            {metric.label}
            {subtotal ? <span className="mt-0.5 block normal-case tracking-normal">Subtotal identificado</span> : null}
          </dt>
          <dd
            className={`mt-1.5 break-words text-sm font-black tracking-tight ${
              formattedValue === null ? 'text-slate-400' : 'text-slate-800'
            }`}
            title={formattedValue ?? 'Valor não comprovado'}
          >
            {formattedValue ?? (
              <span aria-label={`${metric.label}: valor não comprovado`} title="Valor não comprovado">
                —
              </span>
            )}
          </dd>
        </div>
      );
    })}
  </dl>
);

const CompositionStatus = ({ section }: { section: CaixaComposicaoSecao }) => {
  if (!section.disponivel) {
    return (
      <span className="inline-flex min-h-7 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.09em] text-slate-500">
        <AlertTriangle aria-hidden="true" size={12} /> Indisponível
      </span>
    );
  }
  if (!section.completo) {
    return (
      <span className="inline-flex min-h-7 items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.09em] text-amber-800">
        <AlertTriangle aria-hidden="true" size={12} /> Leitura parcial
      </span>
    );
  }
  return (
    <span className="inline-flex min-h-7 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.09em] text-emerald-800">
      <CheckCircle2 aria-hidden="true" size={12} /> Composição comprovada
    </span>
  );
};

const CompositionCard = ({
  section,
  copy,
}: {
  section: CaixaComposicaoSecao;
  copy: CardCopy;
}) => {
  const classes = toneClasses[copy.tone];
  const Icon = copy.icon;

  return (
    <section
      aria-labelledby={`${copy.id}-title`}
      className={`relative isolate overflow-hidden rounded-[24px] border p-4 shadow-[0_18px_45px_-34px_rgba(0,26,51,0.45)] sm:p-5 ${classes.card}`}
    >
      <div aria-hidden="true" className={`absolute inset-x-0 top-0 h-1 ${classes.rule}`} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl border shadow-sm ${classes.icon}`}>
            <Icon aria-hidden="true" size={19} />
          </span>
          <div className="min-w-0">
            <p className={`text-[10px] font-extrabold uppercase tracking-[0.17em] ${classes.eyebrow}`}>
              {copy.eyebrow}
            </p>
            <h2 id={`${copy.id}-title`} className="mt-1 text-base font-black leading-tight tracking-[-0.02em] text-[#001a33]">
              {copy.title}
            </h2>
          </div>
        </div>
        <div className="hidden shrink-0 sm:block">
          <CompositionStatus section={section} />
        </div>
      </div>

      <p className="relative mt-3 max-w-xl text-xs leading-5 text-slate-600">
        {copy.description}
      </p>
      <div className="relative mt-3 sm:hidden">
        <CompositionStatus section={section} />
      </div>

      {!section.disponivel ? (
        <div className="relative mt-5 rounded-2xl border border-dashed border-slate-300 bg-white/70 p-4">
          <p className="text-2xl font-black tracking-[-0.04em] text-slate-300">—</p>
          <p className="mt-2 text-sm font-bold text-slate-700">Fonte temporariamente indisponível</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{section.observacao}</p>
        </div>
      ) : (
        <>
          <div className="relative mt-5 flex flex-col gap-2 border-b border-slate-200/80 pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.13em] text-slate-500">
                {copy.totalLabel}
              </p>
              <p className={`mt-1 break-words text-3xl font-black leading-none tracking-[-0.045em] ${classes.value}`}>
                {formatCaixaCanonicalCurrency(section.dados.total)}
              </p>
            </div>
            <p className="text-xs font-semibold text-slate-600">
              <strong className="text-slate-900">{formatQuantity(section.dados.quantidade)}</strong>{' '}
              {copy.movementLabel}
            </p>
          </div>

          <CompositionMetrics
            dados={section.dados}
            tone={copy.tone}
            partial={!section.completo}
            className="relative mt-4 hidden grid-cols-3 gap-2 sm:grid"
          />

          <details className="group relative mt-4 sm:hidden">
            <summary
              tabIndex={0}
              className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-xs font-extrabold text-slate-700 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 motion-reduce:transition-none [&::-webkit-details-marker]:hidden ${classes.focus}`}
            >
              <span>Ver componentes disponíveis</span>
              <ChevronDown
                aria-hidden="true"
                size={16}
                className="shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
              />
            </summary>
            <CompositionMetrics
              dados={section.dados}
              tone={copy.tone}
              partial={!section.completo}
              className="mt-2 grid grid-cols-2 gap-2"
            />
          </details>

          {!section.completo ? (
            <div role="status" className="relative mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/90 p-3 text-xs leading-5 text-amber-950">
              <AlertTriangle aria-hidden="true" size={15} className="mt-0.5 shrink-0 text-amber-600" />
              <p>
                {section.dados.quantidade_com_diferenca === undefined
                  || section.dados.quantidade_sem_detalhamento === undefined ? (
                    <strong>{formatQuantity(section.dados.quantidade_a_conferir)} movimento(s) a conferir. </strong>
                  ) : (
                    <>
                      {section.dados.quantidade_com_diferenca > 0 && (
                        <strong>{formatQuantity(section.dados.quantidade_com_diferenca)} movimento(s) com valor ou diferença a conferir. </strong>
                      )}
                      {section.dados.quantidade_sem_detalhamento > 0 && (
                        <span>{formatQuantity(section.dados.quantidade_sem_detalhamento)} {copy.tone === 'receipts' ? 'recebimento(s)' : 'pagamento(s)'} sem detalhamento da origem, sem diferença de valor. </span>
                      )}
                    </>
                  )}
                {caixaCompositionObservation(section.observacao)}
              </p>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
};

const LoadingCard = ({ tone }: { tone: CompositionTone }) => (
  <section
    aria-busy="true"
    aria-label={tone === 'receipts'
      ? 'Carregando composição dos recebimentos'
      : 'Carregando composição das despesas'}
    className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
  >
    <div className="flex items-center gap-3">
      <div className="h-11 w-11 animate-pulse rounded-2xl bg-slate-100 motion-reduce:animate-none" />
      <div className="flex-1">
        <div className="h-2.5 w-28 animate-pulse rounded bg-slate-100 motion-reduce:animate-none" />
        <div className="mt-2 h-4 w-64 max-w-full animate-pulse rounded bg-slate-100 motion-reduce:animate-none" />
      </div>
    </div>
    <div className="mt-6 h-8 w-40 animate-pulse rounded bg-slate-100 motion-reduce:animate-none" />
    <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="h-16 animate-pulse rounded-xl bg-slate-50 motion-reduce:animate-none" />
      ))}
    </div>
  </section>
);

export const CaixaCompositionCards: React.FC<CaixaCompositionCardsProps> = ({
  composicao,
  isLoading,
  hasError,
  onRetry,
}) => {
  if (isLoading) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <LoadingCard tone="receipts" />
        <LoadingCard tone="expenses" />
      </div>
    );
  }

  if (hasError || !composicao) {
    return (
      <section role="alert" className="rounded-[24px] border border-amber-200 bg-amber-50 p-5 text-amber-950 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-amber-200 bg-white text-amber-700">
              <AlertTriangle aria-hidden="true" size={19} />
            </span>
            <div>
              <h2 className="text-sm font-black">Composição dos movimentos indisponível</h2>
              <p className="mt-1 text-xs leading-5 text-amber-800">
                Não foi possível carregar a abertura de recebimentos e despesas. Os demais indicadores do Caixa permanecem disponíveis.
              </p>
            </div>
          </div>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white px-4 py-2 text-xs font-extrabold uppercase tracking-[0.1em] text-amber-900 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 motion-reduce:transition-none"
            >
              <RefreshCw aria-hidden="true" size={15} /> Tentar novamente
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <CompositionCard section={composicao.recebimentos} copy={copies.receipts} />
      <CompositionCard section={composicao.despesas} copy={copies.expenses} />
    </div>
  );
};
