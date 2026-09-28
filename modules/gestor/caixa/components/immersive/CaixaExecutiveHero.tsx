import React from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  CircleDollarSign,
  Gauge,
} from 'lucide-react';
import type { CaixaResultStatus } from '../../caixa.types';
import { formatCaixaCurrency } from '../../caixa.formatters';

export interface CaixaExecutiveHeroProps {
  competencia: string;
  escopo: string;
  posicao: number;
  bancarioRegistrado: number;
  caixaLocal: number;
  entradas: number;
  quantidadeRecebimentos: number;
  saidas: number;
  quantidadePagamentos: number;
  tarifasBancariasConfirmadas: number;
  resultado: number;
  resultadoStatus: CaixaResultStatus;
  posicaoLabel?: string;
}

const statusPresentation: Record<CaixaResultStatus, {
  label: string;
  valueClass: string;
  badgeClass: string;
}> = {
  POSITIVO: {
    label: 'Superávit operacional',
    valueClass: 'text-emerald-700',
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  NEGATIVO: {
    label: 'Déficit operacional',
    valueClass: 'text-rose-700',
    badgeClass: 'border-rose-200 bg-rose-50 text-rose-700',
  },
  NEUTRO: {
    label: 'Resultado equilibrado',
    valueClass: 'text-blue-700',
    badgeClass: 'border-blue-200 bg-blue-50 text-blue-700',
  },
};

export const CaixaExecutiveHero = ({
  competencia,
  escopo,
  posicao,
  bancarioRegistrado,
  caixaLocal,
  entradas,
  quantidadeRecebimentos,
  saidas,
  quantidadePagamentos,
  tarifasBancariasConfirmadas,
  resultado,
  resultadoStatus,
  posicaoLabel = 'Posição registrada',
}: CaixaExecutiveHeroProps) => {
  const resultPresentation = statusPresentation[resultadoStatus];

  const metrics = [
    {
      label: 'Entradas confirmadas',
      value: entradas,
      helper: `${quantidadeRecebimentos} receita(s) operacional(is) confirmada(s)`,
      icon: ArrowUpRight,
      iconClass: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    },
    {
      label: 'Saídas confirmadas',
      value: saidas,
      helper: `${quantidadePagamentos} pagamento(s) · Tarifas ${formatCaixaCurrency(tarifasBancariasConfirmadas)}`,
      icon: ArrowDownRight,
      iconClass: 'bg-rose-50 text-rose-700 ring-rose-100',
    },
    {
      label: resultPresentation.label,
      value: resultado,
      helper: 'Entradas operacionais menos saídas operacionais do período',
      icon: Gauge,
      iconClass: resultPresentation.badgeClass,
      valueClass: resultPresentation.valueClass,
    },
  ];

  return (
    <section
      aria-labelledby="caixa-executive-hero-title"
      className="relative isolate overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_28px_80px_-50px_rgba(0,26,51,0.55)]"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_8%_12%,rgba(37,99,235,0.10),transparent_31%),linear-gradient(135deg,#ffffff_0%,#f6f9ff_58%,#eef5ff_100%)]"
      />
      <div aria-hidden="true" className="absolute -right-24 -top-28 -z-10 h-64 w-64 rounded-full border-[42px] border-blue-200/35" />

      <header className="flex flex-col gap-5 border-b border-slate-200/80 px-5 py-6 sm:px-7 lg:flex-row lg:items-end lg:justify-between lg:px-9">
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-blue-700">
              Visão executiva
            </span>
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] ${resultPresentation.badgeClass}`}>
              {resultPresentation.label}
            </span>
          </div>
          <h2 id="caixa-executive-hero-title" className="mt-4 text-2xl font-black tracking-[-0.035em] text-[#001a33] sm:text-3xl">
            Caixa em uma leitura direta.
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
            Posição contábil e movimento operacional apresentados no mesmo recorte, sem misturar compromissos futuros ao realizado.
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:flex sm:flex-wrap sm:items-end sm:justify-end">
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Competência</dt>
            <dd className="mt-1 font-bold text-slate-800">{competencia}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Escopo</dt>
            <dd className="mt-1 max-w-48 truncate font-bold text-slate-800" title={escopo}>{escopo}</dd>
          </div>
        </dl>
      </header>

      <div className="grid lg:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.65fr)]">
        <div className="border-b border-slate-200/80 px-5 py-7 sm:px-7 lg:border-b-0 lg:border-r lg:px-9 lg:py-9">
          <div className="flex items-center gap-2 text-blue-700">
            <CircleDollarSign aria-hidden="true" size={17} />
            <p className="text-[10px] font-extrabold uppercase tracking-[0.17em]">{posicaoLabel}</p>
          </div>
          <p className="mt-4 break-words text-3xl font-black tracking-[-0.045em] text-[#001a33] sm:text-4xl">
            {formatCaixaCurrency(posicao)}
          </p>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            Banco registrado {formatCaixaCurrency(bancarioRegistrado)} · Caixa local {formatCaixaCurrency(caixaLocal)}
          </p>
        </div>

        <dl className="grid gap-px bg-slate-200/80 sm:grid-cols-3">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <div key={metric.label} className="bg-white/90 px-5 py-6 sm:px-6 lg:py-9">
                <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ring-1 ${metric.iconClass}`}>
                  <Icon aria-hidden="true" size={17} />
                </span>
                <dt className="mt-4 text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">
                  {metric.label}
                </dt>
                <dd className={`mt-2 break-words text-xl font-black tracking-[-0.025em] ${metric.valueClass || 'text-[#001a33]'}`}>
                  {formatCaixaCurrency(metric.value)}
                </dd>
                <p className="mt-2 text-[10px] leading-4 text-slate-500">{metric.helper}</p>
              </div>
            );
          })}
        </dl>
      </div>
    </section>
  );
};
