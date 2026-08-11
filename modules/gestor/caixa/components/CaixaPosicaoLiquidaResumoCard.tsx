import React from 'react';
import {
  AlertTriangle,
  Archive,
  Info,
  Landmark,
  ReceiptText,
  Scale,
} from 'lucide-react';
import type { CaixaPosicaoLiquidaResumo } from '../caixa.service';
import { formatCaixaCanonicalCurrency } from '../caixa.formatters';

interface CaixaPosicaoLiquidaResumoCardProps {
  resumo?: CaixaPosicaoLiquidaResumo;
  isLoading: boolean;
  hasError: boolean;
}

/**
 * Mostra exclusivamente os valores da RPC composta. O cliente não subtrai
 * patrimônio e dívida, preservando o fechamento e os centavos do backend.
 */
export const CaixaPosicaoLiquidaResumoCard: React.FC<CaixaPosicaoLiquidaResumoCardProps> = ({
  resumo,
  isLoading,
  hasError,
}) => {
  if (isLoading) {
    return (
      <section
        aria-busy="true"
        aria-label="Carregando posição patrimonial líquida"
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="h-5 w-56 animate-pulse rounded bg-slate-100" />
        <div className="mt-2 h-3 w-[30rem] max-w-full animate-pulse rounded bg-slate-100" />
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-xl bg-slate-50" />
          ))}
        </div>
      </section>
    );
  }

  if (hasError || !resumo) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
          <div>
            <h2 className="text-sm font-bold">Posição patrimonial líquida</h2>
            <p className="mt-1 text-xs leading-5">
              Não foi possível combinar patrimônio e empréstimos a pagar neste escopo. Os demais valores do Caixa permanecem disponíveis.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const isNegative = resumo.valorLiquido.startsWith('-');
  const metrics = [
    {
      label: 'Patrimônio a custo',
      value: formatCaixaCanonicalCurrency(resumo.valorPatrimonialCusto),
      helper: 'Bens ativos no fechamento da competência',
      tone: 'text-blue-900',
      icon: <Archive size={14} className="text-blue-600" />,
    },
    {
      label: 'Empréstimos a pagar',
      value: formatCaixaCanonicalCurrency(resumo.saldoEmprestimosAPagar),
      helper: 'Parcelas ainda devidas, incluindo encargos',
      tone: 'text-rose-700',
      icon: <Landmark size={14} className="text-rose-600" />,
    },
    {
      label: 'Valor líquido',
      value: formatCaixaCanonicalCurrency(resumo.valorLiquido),
      helper: 'Patrimônio a custo menos empréstimos a pagar',
      tone: isNegative ? 'text-rose-700' : 'text-emerald-700',
      icon: <Scale size={14} className={isNegative ? 'text-rose-600' : 'text-emerald-600'} />,
    },
  ];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-blue-50 p-2.5 text-blue-700">
            <Scale size={18} aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Posição patrimonial líquida</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Patrimônio a custo menos empréstimos ainda a pagar no fechamento.
            </p>
          </div>
        </div>

        <div className="flex max-w-2xl items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] leading-4 text-blue-900">
          <Info size={14} className="mt-0.5 shrink-0 text-blue-600" />
          <span>
            Indicador patrimonial complementar: não altera caixa disponível nem resultado operacional.
          </span>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {metrics.map((metric) => (
          <div key={metric.label} className="min-w-0 p-3.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
              {metric.icon}
              <span>{metric.label}</span>
            </div>
            <p className={`mt-2 truncate text-lg font-extrabold tracking-tight ${metric.tone}`} title={metric.value}>
              {metric.value}
            </p>
            <p className="mt-1 text-[10px] leading-4 text-slate-400">{metric.helper}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-[11px] leading-4 text-slate-600">
        <ReceiptText size={13} className="mt-0.5 shrink-0 text-slate-400" />
        <span>{resumo.observacao}</span>
      </div>
    </section>
  );
};
