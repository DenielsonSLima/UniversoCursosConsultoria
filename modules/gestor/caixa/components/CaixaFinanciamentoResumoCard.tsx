import React from 'react';
import {
  ArrowDownRight,
  CircleDollarSign,
  Landmark,
  ReceiptText,
} from 'lucide-react';
import type { CaixaFinanciamentoResumo } from '../caixa.service';
import { formatCaixaCurrency } from '../caixa.formatters';

interface CaixaFinanciamentoResumoCardProps {
  resumo?: CaixaFinanciamentoResumo;
  isLoading: boolean;
  hasError: boolean;
}

/**
 * Exibe exclusivamente valores canônicos devolvidos pela RPC financeira.
 * Não há composição, saldo ou rateio calculado no cliente.
 */
export const CaixaFinanciamentoResumoCard: React.FC<CaixaFinanciamentoResumoCardProps> = ({
  resumo,
  isLoading,
  hasError,
}) => {
  if (isLoading) {
    return (
      <section
        aria-busy="true"
        aria-label="Carregando financiamento e rateios"
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="h-5 w-52 animate-pulse rounded bg-slate-100" />
        <div className="mt-2 h-3 w-80 max-w-full animate-pulse rounded bg-slate-100" />
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => (
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
          <ReceiptText size={18} className="mt-0.5 shrink-0 text-amber-600" />
          <div>
            <h2 className="text-sm font-bold">Financiamento e rateios</h2>
            <p className="mt-1 text-xs leading-5">
              Não foi possível carregar o resumo canônico de crédito e obrigações agora.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const itens = [
    {
      label: 'Obrigações rateadas',
      value: resumo.obrigacaoRateada,
      helper: 'Compromissos previstos neste escopo',
      tone: 'text-rose-700',
      icon: <ArrowDownRight size={14} className="text-rose-500" />,
    },
    {
      label: 'Principal rateado',
      value: resumo.principalRateado,
      helper: 'Componente de capital da obrigação',
      tone: 'text-slate-800',
      icon: <CircleDollarSign size={14} className="text-slate-500" />,
    },
    {
      label: 'Encargos rateados',
      value: resumo.encargosRateados,
      helper: 'Juros e demais encargos do contrato',
      tone: 'text-amber-700',
      icon: <ReceiptText size={14} className="text-amber-600" />,
    },
    {
      label: 'Baixado no polo responsável',
      value: resumo.pagoRateado,
      helper: 'Pagamento confirmado no escopo financeiro',
      tone: 'text-emerald-700',
      icon: <Landmark size={14} className="text-emerald-600" />,
    },
  ];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900">Financiamento e rateios</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Crédito e obrigações distribuídos canonicamente para esta competência.
          </p>
        </div>
        <div className="flex max-w-xl items-start gap-2 rounded-xl bg-blue-50 px-3 py-2 text-[11px] leading-4 text-blue-800">
          <Landmark size={14} className="mt-0.5 shrink-0 text-blue-600" />
          <span>
            Crédito de empréstimo não é receita operacional e não compõe o resultado mensal.
          </span>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-white p-2 text-blue-600 shadow-sm">
              <Landmark size={16} />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-blue-800">Crédito liberado neste escopo</p>
              <p className="mt-0.5 text-[10px] text-blue-700">Liberação financeira, fora da receita operacional</p>
            </div>
          </div>
          <p className="text-xl font-extrabold tracking-tight text-blue-900">
            {formatCaixaCurrency(resumo.creditoLiberadoMatriz)}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 divide-y divide-slate-100 rounded-xl border border-slate-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
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

      {resumo.observacao && (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-[11px] leading-4 text-slate-600">
          <ReceiptText size={13} className="mt-0.5 shrink-0 text-slate-400" />
          <span>{resumo.observacao}</span>
        </div>
      )}
    </section>
  );
};
