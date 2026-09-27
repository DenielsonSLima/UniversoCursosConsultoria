import React from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ReceiptText,
} from 'lucide-react';
import type { CaixaContasPagarResumo } from '../caixa.types';
import {
  formatCaixaCanonicalCurrency,
  formatCaixaDate,
} from '../caixa.formatters';

interface CaixaContasPagarResumoCardProps {
  resumo?: CaixaContasPagarResumo;
  isLoading: boolean;
  hasError: boolean;
}

const formatQuantity = (value: number) => new Intl.NumberFormat('pt-BR').format(value);

export const CaixaContasPagarResumoCard: React.FC<CaixaContasPagarResumoCardProps> = ({
  resumo,
  isLoading,
  hasError,
}) => {
  if (isLoading) {
    return (
      <section
        aria-busy="true"
        aria-label="Carregando resumo de contas a pagar"
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="h-5 w-40 animate-pulse rounded bg-slate-100" />
        <div className="mt-2 h-3 w-80 max-w-full animate-pulse rounded bg-slate-100" />
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-xl bg-slate-50" />
          ))}
        </div>
      </section>
    );
  }

  if (hasError || !resumo) {
    return (
      <section role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
          <div>
            <h2 className="text-sm font-bold">Contas a pagar</h2>
            <p className="mt-1 text-xs leading-5">
              Não foi possível carregar os compromissos desta competência. Os valores realizados do Caixa permanecem disponíveis.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const metrics = [
    {
      label: 'Contas da competência',
      value: resumo.contasCompetencia.valor,
      quantity: resumo.contasCompetencia.quantidade,
      quantityLabel: 'conta(s)',
      helper: 'Com vencimento na competência selecionada',
      tone: 'text-slate-900',
      icon: <ReceiptText size={14} className="text-slate-500" />,
      detail: (
        <span className="text-amber-700">
          A vencer: {formatCaixaCanonicalCurrency(resumo.aVencerCompetencia.valor)} ·{' '}
          {formatQuantity(resumo.aVencerCompetencia.quantidade)} conta(s)
        </span>
      ),
    },
    {
      label: 'Pagamentos na competência',
      value: resumo.pagasCompetencia.valor,
      quantity: resumo.pagasCompetencia.quantidade,
      quantityLabel: 'título(s) integralmente quitado(s)',
      helper: 'O valor inclui pagamentos efetivos, inclusive parciais',
      tone: 'text-emerald-700',
      icon: <CheckCircle2 size={14} className="text-emerald-600" />,
    },
    {
      label: 'Em atraso no corte',
      value: resumo.emAtraso.valor,
      quantity: resumo.emAtraso.quantidade,
      quantityLabel: 'conta(s)',
      helper: resumo.emAtraso.dataMaisAntiga
        ? `Mais antiga em ${formatCaixaDate(resumo.emAtraso.dataMaisAntiga)}`
        : 'Nenhuma data vencida no corte',
      tone: resumo.emAtraso.valor === '0' || resumo.emAtraso.valor === '0.00'
        ? 'text-slate-900'
        : 'text-rose-700',
      icon: <AlertTriangle size={14} className="text-rose-600" />,
    },
  ];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900">Contas a pagar</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Compromissos da competência separados do Caixa efetivamente realizado.
          </p>
        </div>
        <span className="flex w-fit items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-500">
          <CalendarClock size={12} /> Corte em {formatCaixaDate(resumo.dataCorte)}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {metrics.map((metric) => (
          <div key={metric.label} className="min-w-0 p-3.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
              {metric.icon}
              <span>{metric.label}</span>
            </div>
            <p className={`mt-2 truncate text-lg font-extrabold tracking-tight ${metric.tone}`} title={metric.value}>
              {formatCaixaCanonicalCurrency(metric.value)}
            </p>
            <p className="mt-1 text-[10px] leading-4 text-slate-400">
              {formatQuantity(metric.quantity)} {metric.quantityLabel} · {metric.helper}
            </p>
            {metric.detail ? <p className="mt-1 text-[10px] leading-4">{metric.detail}</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
};
