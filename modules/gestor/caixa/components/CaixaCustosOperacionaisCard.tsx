import React from 'react';
import {
  AlertTriangle,
  CircleGauge,
  Layers3,
  ReceiptText,
  WalletMinimal,
} from 'lucide-react';
import type { CaixaCustosOperacionais } from '../caixa.service';
import { formatCaixaCurrency } from '../caixa.formatters';

interface CaixaCustosOperacionaisCardProps {
  resumo?: CaixaCustosOperacionais;
  isLoading: boolean;
  hasError: boolean;
}

/**
 * Painel econômico, deliberadamente separado do Caixa físico. Assim uma
 * baixa centralizada na Matriz não multiplica banco/saldo nos demais polos.
 */
export const CaixaCustosOperacionaisCard: React.FC<CaixaCustosOperacionaisCardProps> = ({
  resumo,
  isLoading,
  hasError,
}) => {
  if (isLoading) {
    return (
      <section aria-busy="true" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="h-5 w-64 animate-pulse rounded bg-slate-100" />
        <div className="mt-2 h-3 w-96 max-w-full animate-pulse rounded bg-slate-100" />
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-20 animate-pulse rounded-xl bg-slate-50" />
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
            <h2 className="text-sm font-bold">Custos por polo</h2>
            <p className="mt-1 text-xs leading-5">
              Não foi possível carregar a distribuição econômica dos custos neste momento.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const itens = [
    {
      label: 'Custo da competência',
      value: resumo.custoCompetencia,
      helper: `${resumo.lancamentosCompetencia} lançamento(s) com vencimento no mês`,
      tone: 'text-slate-900',
      icon: <ReceiptText size={14} className="text-slate-500" />,
    },
    {
      label: 'Custos rateados',
      value: resumo.custoRateadoCompetencia,
      helper: `${resumo.rateiosCompetencia} rateio(s) econômico(s) no período`,
      tone: 'text-indigo-700',
      icon: <Layers3 size={14} className="text-indigo-600" />,
    },
    {
      label: 'Custo em aberto',
      value: resumo.aPagar,
      helper: resumo.rateadoAPagar > 0
        ? `${formatCaixaCurrency(resumo.rateadoAPagar)} distribuído entre polos`
        : 'Nenhum rateio em aberto neste escopo',
      tone: 'text-amber-700',
      icon: <WalletMinimal size={14} className="text-amber-600" />,
    },
    {
      label: 'Custo vencido',
      value: resumo.vencido,
      helper: 'Custo econômico ainda não regularizado',
      tone: 'text-rose-700',
      icon: <AlertTriangle size={14} className="text-rose-600" />,
    },
  ];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900">Custos operacionais por polo</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Competência econômica: custo próprio e rateios recebidos, sem duplicar a baixa bancária.
          </p>
        </div>
        <div className="flex max-w-xl items-start gap-2 rounded-xl border border-indigo-100 bg-indigo-50/70 px-3 py-2 text-[11px] leading-4 text-indigo-900">
          <CircleGauge size={14} className="mt-0.5 shrink-0 text-indigo-600" />
          <span>
            Ponto de equilíbrio real depende da margem das receitas. Este painel mostra a base de custos canônica, sem inventar uma meta.
          </span>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 divide-y divide-slate-100 rounded-xl border border-slate-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
        {itens.map((item) => (
          <div key={item.label} className="p-3.5 first:rounded-t-xl last:rounded-b-xl sm:first:rounded-tl-xl sm:last:rounded-br-xl">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
              {item.icon}
              {item.label}
            </div>
            <p className={`mt-2 text-lg font-extrabold tracking-tight ${item.tone}`}>
              {formatCaixaCurrency(item.value)}
            </p>
            <p className="mt-1 text-[10px] leading-4 text-slate-400">{item.helper}</p>
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
