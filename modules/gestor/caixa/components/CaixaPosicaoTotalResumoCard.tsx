import React from 'react';
import {
  AlertTriangle,
  Archive,
  CalendarDays,
  CircleDollarSign,
  Info,
  Landmark,
  Scale,
} from 'lucide-react';
import type { CaixaPosicaoTotalResumo } from '../caixa.service';
import {
  formatCaixaCanonicalCurrency,
  formatCaixaDate,
} from '../caixa.formatters';

interface CaixaPosicaoTotalResumoCardProps {
  resumo?: CaixaPosicaoTotalResumo;
  isLoading: boolean;
  hasError: boolean;
}

const unavailableCopy = (resumo?: CaixaPosicaoTotalResumo) => {
  if (resumo?.disponivel === false && resumo.motivo === 'HISTORICO_INSUFICIENTE') {
    return 'O histórico disponível não permite apurar o caixa neste fechamento. Nenhum valor foi estimado.';
  }
  if (resumo?.disponivel === false && resumo.motivo === 'ACESSO_RESTRITO') {
    return 'Este perfil precisa dos escopos de Caixa, patrimônio e financeiro para apurar a posição total.';
  }
  return 'Não foi possível apurar a posição total agora. Os demais valores do Caixa permanecem disponíveis.';
};

/**
 * O card é somente uma apresentação da RPC composta. Não soma nem subtrai
 * valores no navegador, inclusive quando o total ultrapassa o limite seguro
 * de Number do JavaScript.
 */
export const CaixaPosicaoTotalResumoCard: React.FC<CaixaPosicaoTotalResumoCardProps> = ({
  resumo,
  isLoading,
  hasError,
}) => {
  if (isLoading) {
    return (
      <section
        aria-busy="true"
        aria-label="Carregando posição total registrada"
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="h-5 w-56 animate-pulse rounded bg-slate-100" />
        <div className="mt-2 h-3 w-[34rem] max-w-full animate-pulse rounded bg-slate-100" />
        <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-[1.15fr_repeat(3,1fr)]">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-xl bg-slate-50" />
          ))}
        </div>
      </section>
    );
  }

  if (hasError || !resumo || !resumo.disponivel) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
          <div>
            <h2 className="text-sm font-bold">Posição total registrada</h2>
            <p className="mt-1 text-xs leading-5">{unavailableCopy(resumo)}</p>
            {resumo?.disponivel === false && (
              <p className="mt-1.5 text-[11px] font-semibold text-amber-800">
                Corte solicitado: {formatCaixaDate(resumo.dataCorte)}.
              </p>
            )}
          </div>
        </div>
      </section>
    );
  }

  const { dados } = resumo;
  const totalIsNegative = dados.valorTotalLiquido.startsWith('-');
  const metrics = [
    {
      label: 'Caixa registrado',
      value: formatCaixaCanonicalCurrency(dados.saldoCaixaRegistrado),
      helper: 'Saldo contábil no corte',
      icon: <CircleDollarSign size={14} className="text-blue-600" />,
      tone: 'text-blue-950',
    },
    {
      label: 'Patrimônio a custo',
      value: formatCaixaCanonicalCurrency(dados.valorPatrimonialCusto),
      helper: 'Bens ativos no fechamento',
      icon: <Archive size={14} className="text-cyan-600" />,
      tone: 'text-cyan-800',
    },
    {
      label: 'Empréstimos a pagar',
      value: formatCaixaCanonicalCurrency(dados.saldoEmprestimosAPagar),
      helper: 'Parcelas devidas, com encargos',
      icon: <Landmark size={14} className="text-rose-600" />,
      tone: 'text-rose-700',
    },
  ];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="rounded-xl bg-blue-50 p-2.5 text-blue-600">
            <Scale size={18} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[#001a33]">Posição total registrada</h2>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              Caixa no corte + patrimônio a custo − empréstimos a pagar.
            </p>
          </div>
        </div>

        <div className="inline-flex w-fit items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600">
          <CalendarDays size={14} className="shrink-0 text-blue-600" />
          Corte: {formatCaixaDate(resumo.dataCorte)}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[1.25fr_repeat(3,minmax(0,1fr))]">
        <div className="min-w-0 rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-slate-50 px-4 py-3.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
            <Scale size={14} className={totalIsNegative ? 'text-rose-600' : 'text-emerald-600'} />
            Posição total
          </div>
          <p className={`mt-1.5 truncate text-2xl font-extrabold tracking-tight ${
            totalIsNegative ? 'text-rose-700' : 'text-emerald-700'
          }`} title={formatCaixaCanonicalCurrency(dados.valorTotalLiquido)}>
            {formatCaixaCanonicalCurrency(dados.valorTotalLiquido)}
          </p>
          <p className="mt-1 text-[10px] leading-4 text-slate-500">
            Recursos e bens registrados, menos empréstimos pendentes.
          </p>
        </div>

        {metrics.map((metric) => (
          <div key={metric.label} className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
              {metric.icon}
              <span>{metric.label}</span>
            </div>
            <p className={`mt-1.5 truncate text-lg font-extrabold tracking-tight ${metric.tone}`} title={metric.value}>
              {metric.value}
            </p>
            <p className="mt-1 text-[10px] leading-4 text-slate-400">{metric.helper}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 flex min-w-0 items-center gap-2 text-[11px] leading-4 text-slate-500" title={dados.observacao}>
        <Info size={13} className="shrink-0 text-blue-600" />
        <span className="truncate">{dados.observacao}</span>
      </div>
    </section>
  );
};
