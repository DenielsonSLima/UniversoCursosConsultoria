import React from 'react';
import {
  AlertTriangle,
  Archive,
  Info,
  Layers3,
  PackagePlus,
  ReceiptText,
} from 'lucide-react';
import type { CaixaPatrimonioResumo } from '../caixa.service';
import { formatCaixaCanonicalCurrency } from '../caixa.formatters';

interface CaixaPatrimonioResumoCardProps {
  resumo?: CaixaPatrimonioResumo;
  isLoading: boolean;
  hasError: boolean;
}

const quantityFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 0,
});

const formatQuantity = (value: number) => quantityFormatter.format(value);

export const CaixaPatrimonioResumoCard: React.FC<CaixaPatrimonioResumoCardProps> = ({
  resumo,
  isLoading,
  hasError,
}) => {
  if (isLoading) {
    return (
      <section
        aria-busy="true"
        aria-label="Carregando posição patrimonial"
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="h-5 w-44 animate-pulse rounded bg-slate-100" />
        <div className="mt-2 h-3 w-96 max-w-full animate-pulse rounded bg-slate-100" />
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
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
            <h2 className="text-sm font-bold">Posição patrimonial</h2>
            <p className="mt-1 text-xs leading-5">
              Não foi possível carregar o resumo patrimonial desta competência. Os demais valores do Caixa permanecem disponíveis.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const metrics = [
    {
      label: 'Valor ativo a custo',
      value: formatCaixaCanonicalCurrency(resumo.posicaoFechamento.valorAtivoCusto),
      helper: `${formatQuantity(resumo.posicaoFechamento.registrosAtivos)} registro(s) ativo(s) no fechamento`,
      tone: 'text-blue-900',
      icon: <Archive size={14} className="text-blue-600" />,
    },
    {
      label: 'Unidades ativas',
      value: formatQuantity(resumo.posicaoFechamento.unidadesAtivas),
      helper: 'Quantidade disponível no fechamento da competência',
      tone: 'text-slate-900',
      icon: <Layers3 size={14} className="text-slate-500" />,
    },
    {
      label: 'Aquisições',
      value: formatCaixaCanonicalCurrency(resumo.aquisicoesCompetencia.valorCusto),
      helper: `${formatQuantity(resumo.aquisicoesCompetencia.registros)} registro(s) · ${formatQuantity(resumo.aquisicoesCompetencia.unidades)} unidade(s)`,
      tone: 'text-cyan-800',
      icon: <PackagePlus size={14} className="text-cyan-600" />,
    },
    {
      label: 'Perdas',
      value: formatCaixaCanonicalCurrency(resumo.perdasCompetencia.valorCusto),
      helper: `${formatQuantity(resumo.perdasCompetencia.movimentos)} baixa(s) · ${formatQuantity(resumo.perdasCompetencia.unidades)} unidade(s)`,
      tone: 'text-rose-700',
      icon: <AlertTriangle size={14} className="text-rose-500" />,
    },
  ];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-blue-50 p-2.5 text-blue-700">
            <Archive size={18} aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Posição patrimonial</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Bens e perdas reconhecidos a custo na competência selecionada.
            </p>
          </div>
        </div>

        <div className="flex max-w-2xl items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] leading-4 text-blue-900">
          <Info size={14} className="mt-0.5 shrink-0 text-blue-600" />
          <span>
            Patrimônio não altera o caixa disponível nem o resultado operacional. Pagamentos relacionados permanecem nas despesas e não são duplicados aqui.
          </span>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 divide-x divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100 lg:grid-cols-4 lg:divide-y-0">
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

      {resumo.observacao ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-[11px] leading-4 text-slate-600">
          <ReceiptText size={13} className="mt-0.5 shrink-0 text-slate-400" />
          <span>{resumo.observacao}</span>
        </div>
      ) : null}
    </section>
  );
};
