import React from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  HelpCircle,
  History,
  Layers3,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type { CaixaLinhaCorteResumo } from '../caixa-linha-corte.service';
import { formatCaixaCurrency, formatCaixaPercent } from '../caixa.formatters';

interface CaixaLinhaCorteCardProps {
  resumo?: CaixaLinhaCorteResumo;
  isLoading: boolean;
  hasError: boolean;
}

export const CaixaLinhaCorteCard: React.FC<CaixaLinhaCorteCardProps> = ({
  resumo,
  isLoading,
  hasError,
}) => {
  if (isLoading) {
    return (
      <section aria-busy="true" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-6 w-64 animate-pulse rounded-lg bg-slate-100" />
            <div className="h-3 w-80 max-w-full animate-pulse rounded bg-slate-100" />
          </div>
          <div className="h-8 w-36 animate-pulse rounded-full bg-slate-100" />
        </div>
        <div className="mt-6 h-4 w-full animate-pulse rounded-full bg-slate-100" />
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-xl bg-slate-50" />
          ))}
        </div>
      </section>
    );
  }

  if (hasError || !resumo) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900 shadow-sm">
        <div className="flex items-start gap-3">
          <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-600" />
          <div>
            <h3 className="text-sm font-bold">Linha de Corte do Mês (Ponto de Equilíbrio)</h3>
            <p className="mt-1 text-xs leading-5">
              Não foi possível consolidar a linha de corte e os indicadores de cobertura operacional neste momento.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const { receitas, inadimplencia, despesas, cobertura, historico } = resumo;

  // Status visual canônico
  const statusConfig = {
    LUCRO: {
      badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      badgeIcon: <CheckCircle2 size={14} className="text-emerald-600" />,
      badgeLabel: 'Ponto de equilíbrio superado (Operação no Lucro)',
      barColor: 'bg-emerald-500',
      progressTone: 'text-emerald-700',
    },
    COBRINDO_FIXAS: {
      badgeBg: 'bg-amber-50 text-amber-800 border-amber-200',
      badgeIcon: <Activity size={14} className="text-amber-600" />,
      badgeLabel: 'Custos fixos cobertos — buscando equilíbrio total',
      barColor: 'bg-amber-500',
      progressTone: 'text-amber-700',
    },
    ABAIXO_DA_LINHA: {
      badgeBg: 'bg-rose-50 text-rose-700 border-rose-200',
      badgeIcon: <AlertCircle size={14} className="text-rose-600" />,
      badgeLabel: 'Abaixo da linha de corte (Atenção)',
      barColor: 'bg-rose-500',
      progressTone: 'text-rose-700',
    },
    SEM_MOVIMENTO: {
      badgeBg: 'bg-slate-100 text-slate-700 border-slate-200',
      badgeIcon: <HelpCircle size={14} className="text-slate-500" />,
      badgeLabel: 'Sem movimentação confirmada',
      barColor: 'bg-slate-400',
      progressTone: 'text-slate-700',
    },
  }[cobertura.statusOperacional];

  const progressPercentVisual = Math.min(100, Math.max(0, cobertura.percentualRealizado));

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">
              Linha de corte & Ponto de equilíbrio
            </h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600">
              Gestão de cobertura
            </span>
            {inadimplencia.toleranciaInadimplencia > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-0.5 text-[10px] font-semibold text-blue-700"
                title="Percentual máximo de perda na carteira antes da operação entrar em prejuízo"
              >
                <ShieldCheck size={12} className="text-blue-600" />
                Tolerância a inadimplência: {inadimplencia.toleranciaInadimplencia}%
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Comparativo canônico entre faturamento do polo, despesas operacionais e impacto da inadimplência.
          </p>
        </div>

        <div className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold ${statusConfig.badgeBg}`}>
          {statusConfig.badgeIcon}
          <span>{statusConfig.badgeLabel}</span>
        </div>
      </div>

      {/* Termômetro de Cobertura */}
      <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50/70 p-4">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
            <Target size={15} className="text-blue-600" />
            <span>Cobertura da linha de corte:</span>
            <span className={`text-sm font-extrabold ${statusConfig.progressTone}`}>
              {cobertura.percentualRealizado}%
            </span>
            {cobertura.pontoEquilibrioAtingido && (
              <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                <Sparkles size={11} />
                Meta batida
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-500">
            {cobertura.pontoEquilibrioAtingido ? (
              <span className="font-semibold text-emerald-700">
                Superávit de {formatCaixaCurrency(cobertura.margemAtual)} acima do ponto de equilíbrio
              </span>
            ) : (
              <span>
                Faltam <strong className="text-rose-600">{formatCaixaCurrency(cobertura.valorFaltante)}</strong> para zerar os custos do mês
              </span>
            )}
          </div>
        </div>

        {/* Barra de Progresso com Marcos */}
        <div className="relative mt-3">
          <div className="h-3.5 w-full overflow-hidden rounded-full bg-slate-200/80 p-0.5">
            <div
              className={`h-full rounded-full transition-all duration-500 ${statusConfig.barColor}`}
              style={{ width: `${progressPercentVisual}%` }}
              role="progressbar"
              aria-valuenow={cobertura.percentualRealizado}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>

          <div className="mt-2 flex items-center justify-between text-[10px] font-medium text-slate-400">
            <span>0%</span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
              Custos Fixos ({despesas.percentualFixas}%)
            </span>
            <span className="flex items-center gap-1 font-bold text-slate-700">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
              Linha de Corte (100%)
            </span>
          </div>
        </div>
      </div>

      {/* Grid de 4 Métricas Principais */}
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Bloco 1: Receitas do Mês & Inadimplência */}
        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm transition hover:border-slate-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
              <ArrowUpRight size={15} className="text-emerald-600" />
              <span>Receitas do mês</span>
            </div>
            {inadimplencia.valorVencido > 0 && (
              <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
                <ShieldAlert size={10} />
                {inadimplencia.taxaInadimplenciaMes}% atraso
              </span>
            )}
          </div>
          <p className="mt-2 text-xl font-extrabold tracking-tight text-emerald-700">
            {formatCaixaCurrency(receitas.realizadas)}
          </p>
          <div className="mt-2 border-t border-slate-50 pt-2 text-[11px] text-slate-500 space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span>Previstas a vencer:</span>
              <strong className="text-slate-700">{formatCaixaCurrency(receitas.previstas - inadimplencia.valorVencido > 0 ? receitas.previstas - inadimplencia.valorVencido : 0)}</strong>
            </div>
            {inadimplencia.valorVencido > 0 && (
              <div className="flex items-center justify-between text-[10px] text-amber-700 font-semibold">
                <span>Vencido / Em atraso:</span>
                <span>{formatCaixaCurrency(inadimplencia.valorVencido)} ({inadimplencia.quantidadeTitulos} carnês)</span>
              </div>
            )}
            <p className="text-[10px] text-slate-400">Total gerado: {formatCaixaCurrency(receitas.totais)}</p>
          </div>
        </div>

        {/* Bloco 2: Linha de Corte (Despesas Totais) */}
        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm transition hover:border-slate-200">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <Target size={15} className="text-rose-600" />
            <span>Linha de corte total</span>
          </div>
          <p className="mt-2 text-xl font-extrabold tracking-tight text-slate-900">
            {formatCaixaCurrency(despesas.linhaCorteTotal)}
          </p>
          <div className="mt-2 border-t border-slate-50 pt-2 text-[11px] text-slate-500">
            <span>Fixas + Variáveis + Rateios</span>
            <p className="text-[10px] text-slate-400">Meta necessária para o zero a zero</p>
          </div>
        </div>

        {/* Bloco 3: Estrutura dos Gastos */}
        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm transition hover:border-slate-200">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <Layers3 size={15} className="text-indigo-600" />
            <span>Estrutura dos gastos</span>
          </div>
          <div className="mt-2 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600">Fixas ({despesas.percentualFixas}%):</span>
              <strong className="text-slate-900">{formatCaixaCurrency(despesas.fixas)}</strong>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600">Variáveis/Rateio:</span>
              <strong className="text-slate-900">{formatCaixaCurrency(despesas.variaveisERateios)}</strong>
            </div>
          </div>
          <div className="mt-2 border-t border-slate-50 pt-1 text-[10px] text-slate-400">
            Rateios recebidos: {formatCaixaCurrency(despesas.rateadas)}
          </div>
        </div>

        {/* Bloco 4: Margem Operacional */}
        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm transition hover:border-slate-200">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <Scale size={15} className="text-blue-600" />
            <span>Margem do período</span>
          </div>
          <p className={`mt-2 text-xl font-extrabold tracking-tight ${
            cobertura.margemAtual >= 0 ? 'text-emerald-600' : 'text-rose-600'
          }`}>
            {cobertura.margemAtual >= 0 ? '+' : ''}
            {formatCaixaCurrency(cobertura.margemAtual)}
          </p>
          <div className="mt-2 border-t border-slate-50 pt-2 text-[11px] text-slate-500">
            <span>Projetada: <strong>{cobertura.margemProjetada >= 0 ? '+' : ''}{formatCaixaCurrency(cobertura.margemProjetada)}</strong></span>
            <p className="text-[10px] text-slate-400">Considerando boletos a receber</p>
          </div>
        </div>
      </div>

      {/* Régua de Benchmark Histórico & Diagnóstico */}
      <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/50 p-3.5 space-y-2">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <History size={15} className="text-slate-500" />
            <span>Referência histórica de gastos:</span>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            {/* Mês Anterior */}
            <div className="flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white px-2.5 py-1 text-slate-700 shadow-2xs">
              <span className="text-[11px] text-slate-500">
                {historico.mesAnterior.rotulo ? `Mês anterior (${historico.mesAnterior.rotulo}):` : 'Mês anterior:'}
              </span>
              <strong className="text-slate-900 font-bold">
                {formatCaixaCurrency(historico.mesAnterior.linhaCorte)}
              </strong>
              {historico.mesAnterior.variacaoPercentual !== null && (
                <span className={`inline-flex items-center text-[10px] font-bold ${
                  historico.mesAnterior.variacaoPercentual > 0
                    ? 'text-rose-600'
                    : historico.mesAnterior.variacaoPercentual < 0
                      ? 'text-emerald-600'
                      : 'text-slate-500'
                }`}>
                  {historico.mesAnterior.variacaoPercentual > 0 ? (
                    <TrendingUp size={11} className="mr-0.5" />
                  ) : historico.mesAnterior.variacaoPercentual < 0 ? (
                    <TrendingDown size={11} className="mr-0.5" />
                  ) : null}
                  {historico.mesAnterior.variacaoPercentual > 0 ? '+' : ''}
                  {formatCaixaPercent(historico.mesAnterior.variacaoPercentual)}
                </span>
              )}
            </div>

            {/* Média dos 3 Meses */}
            <div className="flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white px-2.5 py-1 text-slate-700 shadow-2xs">
              <span className="text-[11px] text-slate-500">Média histórica:</span>
              <strong className="text-slate-900 font-bold">
                {formatCaixaCurrency(historico.mediaTrimestral.linhaCorte)}
              </strong>
              {historico.mediaTrimestral.variacaoPercentual !== null && (
                <span className={`inline-flex items-center text-[10px] font-bold ${
                  historico.mediaTrimestral.variacaoPercentual > 0
                    ? 'text-rose-600'
                    : historico.mediaTrimestral.variacaoPercentual < 0
                      ? 'text-emerald-600'
                      : 'text-slate-500'
                }`}>
                  {historico.mediaTrimestral.variacaoPercentual > 0 ? (
                    <TrendingUp size={11} className="mr-0.5" />
                  ) : historico.mediaTrimestral.variacaoPercentual < 0 ? (
                    <TrendingDown size={11} className="mr-0.5" />
                  ) : null}
                  {historico.mediaTrimestral.variacaoPercentual > 0 ? '+' : ''}
                  {formatCaixaPercent(historico.mediaTrimestral.variacaoPercentual)}
                </span>
              )}
            </div>

            <span className="text-[10px] font-medium text-slate-400">
              • {historico.rotuloAmostra}
            </span>
          </div>
        </div>

        {inadimplencia.diagnostico && (
          <div className="border-t border-slate-100 pt-2 flex items-center gap-2 text-[11px] text-slate-600">
            <span className="font-semibold text-slate-700">Diagnóstico de carteira:</span>
            <span>{inadimplencia.diagnostico}</span>
          </div>
        )}
      </div>
    </section>
  );
};
