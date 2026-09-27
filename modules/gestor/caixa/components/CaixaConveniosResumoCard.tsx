import React from 'react';
import { Building2, CircleDollarSign, ReceiptText, WalletCards } from 'lucide-react';
import type { CaixaConveniosResumo } from '../caixa-convenios.service';
import { formatCaixaCurrency } from '../caixa.formatters';

interface Props {
  resumo?: CaixaConveniosResumo;
  isLoading: boolean;
  hasError: boolean;
}

export const CaixaConveniosResumoCard: React.FC<Props> = ({
  resumo,
  isLoading,
  hasError,
}) => {
  if (isLoading) {
    return (
      <section aria-busy="true" aria-label="Carregando convênios" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="h-5 w-44 animate-pulse rounded bg-slate-100" />
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-20 animate-pulse rounded-xl bg-slate-50" />)}
        </div>
      </section>
    );
  }

  if (hasError || !resumo) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
        <div className="flex items-start gap-3">
          <ReceiptText size={18} className="mt-0.5 shrink-0 text-amber-600" />
          <div>
            <h2 className="text-sm font-bold">Recursos de convênios</h2>
            <p className="mt-1 text-xs leading-5">Não foi possível carregar a posição analítica dos convênios agora.</p>
          </div>
        </div>
      </section>
    );
  }

  const metrics = [
    ['Saldo inicial', resumo.saldoInicial, 'Carregado de competências finalizadas', 'text-slate-900'],
    ['Créditos recebidos', resumo.creditosRecebidos, 'Entradas vinculadas nesta competência', 'text-emerald-700'],
    ['Despesas pagas', resumo.despesasPagas, 'Saídas já efetivadas', 'text-rose-700'],
    ['Comprometido em aberto', resumo.comprometidoAberto, 'Despesas vinculadas ainda pendentes', 'text-amber-700'],
  ] as const;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Building2 size={17} className="text-violet-600" />
            <h2 className="text-base font-bold text-slate-900">Recursos de convênios</h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {resumo.quantidadeConvenios} convênio(s) na competência, sem duplicar entradas ou saídas do Caixa.
          </p>
          <p className="mt-1 text-[10px] leading-4 text-slate-400">
            A competência do convênio fecha manualmente; uma baixa posterior aparece no Caixa do mês em que foi paga.
          </p>
        </div>
        <div className="grid min-w-[280px] grid-cols-2 gap-2 rounded-xl border border-violet-100 bg-violet-50/70 p-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-600">Disponível</p>
            <p className="mt-1 text-lg font-extrabold text-violet-950">{formatCaixaCurrency(resumo.saldoDisponivel)}</p>
          </div>
          <div className="border-l border-violet-200 pl-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-600">Projetado</p>
            <p className="mt-1 text-lg font-extrabold text-violet-950">{formatCaixaCurrency(resumo.saldoProjetado)}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 divide-y divide-slate-100 rounded-xl border border-slate-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
        {metrics.map(([label, value, helper, tone], index) => (
          <div key={label} className="p-3.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
              {index === 0 ? <WalletCards size={14} /> : <CircleDollarSign size={14} />}
              {label}
            </div>
            <p className={`mt-2 text-lg font-extrabold tracking-tight ${tone}`}>{formatCaixaCurrency(value)}</p>
            <p className="mt-1 text-[10px] leading-4 text-slate-400">{helper}</p>
          </div>
        ))}
      </div>
    </section>
  );
};
