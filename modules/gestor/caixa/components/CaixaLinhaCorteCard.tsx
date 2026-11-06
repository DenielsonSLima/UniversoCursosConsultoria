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

const statusConfig = {
  LUCRO: {
    label: 'Ponto de equilíbrio superado',
    detail: 'Operação no lucro',
    icon: CheckCircle2,
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    gauge: '#34d399',
  },
  COBRINDO_FIXAS: {
    label: 'Custos fixos cobertos',
    detail: 'Buscando equilíbrio total',
    icon: Activity,
    badge: 'border-amber-200 bg-amber-50 text-amber-800',
    gauge: '#fbbf24',
  },
  ABAIXO_DA_LINHA: {
    label: 'Abaixo da linha de corte',
    detail: 'Ação necessária',
    icon: AlertCircle,
    badge: 'border-rose-200 bg-rose-50 text-rose-800',
    gauge: '#fb7185',
  },
  SEM_MOVIMENTO: {
    label: 'Sem movimentação confirmada',
    detail: 'Aguardando dados realizados',
    icon: HelpCircle,
    badge: 'border-slate-200 bg-slate-100 text-slate-600',
    gauge: '#94a3b8',
  },
} as const;

export const CaixaLinhaCorteCard: React.FC<CaixaLinhaCorteCardProps> = ({ resumo, isLoading, hasError }) => {
  if (isLoading) {
    return (
      <section aria-busy="true" aria-label="Carregando linha de corte" className="caixa-line-cut-overview overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="bg-slate-50 p-4"><div className="h-6 w-64 animate-pulse rounded bg-slate-200 motion-reduce:animate-none" /><div className="mt-3 h-3 w-96 max-w-full animate-pulse rounded bg-slate-200 motion-reduce:animate-none" /></div>
        <div className="grid gap-3 p-6 md:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <div key={index} className="h-40 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none" />)}</div>
      </section>
    );
  }

  if (hasError || !resumo) {
    return (
      <section role="status" className="caixa-line-cut-overview rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
        <div className="flex items-start gap-3">
          <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
          <div><h3 className="text-sm font-medium">Linha de Corte do Mês (Ponto de Equilíbrio)</h3><p className="mt-1 text-xs leading-5">Não foi possível consolidar a linha de corte e os indicadores de cobertura operacional neste momento.</p></div>
        </div>
      </section>
    );
  }

  const { receitas, inadimplencia, despesas, cobertura, historico } = resumo;
  const status = statusConfig[cobertura.statusOperacional];
  const StatusIcon = status.icon;
  const coverageVisual = Math.min(100, Math.max(0, cobertura.percentualRealizado));
  const projectedVisual = Math.min(100, Math.max(0, cobertura.percentualProjetado));
  const fixedVisual = Math.min(100, Math.max(0, despesas.percentualFixas));
  const variableVisual = Math.min(100, Math.max(0, despesas.percentualVariaveisRateios));

  return (
    <section aria-labelledby="caixa-line-cut-title" className="caixa-line-cut-overview overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="caixa-line-cut-heading border-b border-slate-200 bg-slate-50/60 px-4 py-4 text-[#122b42] sm:px-5">
        <div className="relative flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-medium tracking-wide text-blue-600">Cockpit de equilíbrio</p>
              {inadimplencia.toleranciaInadimplencia > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-medium text-blue-700">
                  <ShieldCheck size={11} aria-hidden="true" /> Tolerância à inadimplência: {inadimplencia.toleranciaInadimplencia}%
                </span>
              ) : null}
            </div>
            <h3 id="caixa-line-cut-title" className="mt-2 text-[17px] font-medium tracking-tight">Quanto falta para a operação se sustentar</h3>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">Receita realizada, estrutura de custos, margem e risco de carteira na mesma leitura.</p>
          </div>
          <div className={`inline-flex w-fit items-center gap-2 rounded-xl border px-3 py-2 ${status.badge}`}>
            <StatusIcon size={15} aria-hidden="true" />
            <span><strong className="block text-[11px]">{status.label}</strong><span className="block text-[10px] opacity-70">{status.detail}</span></span>
          </div>
        </div>

        <div className="relative mt-6 grid gap-5 lg:grid-cols-[136px_minmax(0,1fr)_minmax(220px,0.8fr)] lg:items-center">
          <div className="relative mx-auto h-32 w-32">
            <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" role="img" aria-label={`Cobertura realizada ${cobertura.percentualRealizado}%; cobertura projetada ${cobertura.percentualProjetado}%`}>
              <circle cx="60" cy="60" r="47" pathLength="100" fill="none" stroke="rgba(100,116,139,.12)" strokeWidth="10" />
              <circle cx="60" cy="60" r="47" pathLength="100" fill="none" stroke="rgba(96,165,250,.32)" strokeWidth="10" strokeDasharray={`${projectedVisual} 100`} strokeLinecap="round" />
              <circle cx="60" cy="60" r="47" pathLength="100" fill="none" stroke={status.gauge} strokeWidth="10" strokeDasharray={`${coverageVisual} 100`} strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <Target size={18} className="text-blue-600" aria-hidden="true" />
              <strong className="mt-1 text-[22px] font-medium">{cobertura.percentualRealizado}%</strong>
              <span className="text-[10px] tracking-wider text-slate-500">Cobertura atual</span>
            </div>
          </div>

          <div>
            <div
              className="rounded-xl border border-slate-200 bg-white p-4"
              role="progressbar"
              aria-label="Cobertura da linha de corte"
              aria-valuenow={cobertura.percentualRealizado}
              aria-valuemin={0}
              aria-valuemax={Math.max(100, cobertura.percentualRealizado)}
              aria-valuetext={`${cobertura.percentualRealizado}% da linha de corte; projeção ${cobertura.percentualProjetado}%`}
            >
              <div className="flex items-center justify-between gap-3 text-[11px] font-semibold">
                <span className="text-slate-600">Realizado <strong className="ml-1 text-[#122b42]">{cobertura.percentualRealizado}%</strong></span>
                <span className="text-blue-600">Projetado <strong className="ml-1 text-[#122b42]">{cobertura.percentualProjetado}%</strong></span>
              </div>
              <div className="relative mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
                <div className="absolute inset-y-0 left-0 rounded-full bg-blue-400/35" style={{ width: `${projectedVisual}%` }} />
                <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${coverageVisual}%`, backgroundColor: status.gauge }} />
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-slate-500"><span>0%</span><span>Custos fixos · {despesas.percentualFixas}%</span><span>100%</span></div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <DarkMetric label="Receita realizada" value={formatCaixaCurrency(receitas.realizadas)} tone="green" />
              <DarkMetric label="Linha de corte" value={formatCaixaCurrency(despesas.linhaCorteTotal)} tone="rose" />
            </div>
          </div>

          <div className={`rounded-xl border p-5 ${cobertura.pontoEquilibrioAtingido ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
            <p className="flex items-center gap-2 text-[11px] font-medium tracking-normal text-slate-600">
              {cobertura.pontoEquilibrioAtingido ? <Sparkles size={14} className="text-emerald-700" /> : <Target size={14} className="text-rose-700" />}
              {cobertura.pontoEquilibrioAtingido ? 'Acima da meta' : 'Distância da meta'}
            </p>
            <p className={`mt-2 text-[22px] font-medium ${cobertura.pontoEquilibrioAtingido ? 'text-emerald-700' : 'text-rose-700'}`}>
              {cobertura.pontoEquilibrioAtingido ? formatCaixaCurrency(cobertura.margemAtual) : formatCaixaCurrency(cobertura.valorFaltante)}
            </p>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">
              {cobertura.pontoEquilibrioAtingido ? 'Superávit sobre os custos do mês' : 'Valor que falta para zerar os custos do mês'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-0 xl:grid-cols-[1fr_1.05fr_0.85fr]">
        <article className="border-b border-slate-200 p-4 sm:p-5 xl:border-b-0 xl:border-r">
          <div className="flex items-center gap-2"><ArrowUpRight size={16} className="text-emerald-600" /><h4 className="text-sm font-medium text-slate-900">Receita e carteira</h4></div>
          <p className="mt-3 text-[22px] font-medium text-emerald-700">{formatCaixaCurrency(receitas.realizadas)}</p>
          <div className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-[11px]">
            <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Previstas a vencer:</span><strong className="text-slate-800">{receitas.previstasAVencer === null ? 'Indisponível' : formatCaixaCurrency(receitas.previstasAVencer)}</strong></div>
            <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Receita total gerada</span><strong className="text-slate-800">{formatCaixaCurrency(receitas.totais)}</strong></div>
            <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Vencido / em atraso</span><strong className="text-amber-700">{formatCaixaCurrency(inadimplencia.valorVencido)}</strong></div>
            <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Títulos em atraso</span><strong className="text-slate-800">{inadimplencia.quantidadeTitulos}</strong></div>
          </div>
        </article>

        <article className="border-b border-slate-200 p-4 sm:p-5 xl:border-b-0 xl:border-r">
          <div className="flex items-center gap-2"><Layers3 size={16} className="text-violet-600" /><h4 className="text-sm font-medium text-slate-900">Estrutura dos gastos</h4></div>
          <div className="mt-4 space-y-4">
            <CostBar label="Custos fixos" value={formatCaixaCurrency(despesas.fixas)} percent={despesas.percentualFixas} visualPercent={fixedVisual} color="bg-violet-500" />
            <CostBar label="Variáveis e rateios" value={formatCaixaCurrency(despesas.variaveisERateios)} percent={despesas.percentualVariaveisRateios} visualPercent={variableVisual} color="bg-blue-500" />
          </div>
          <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5 text-[11px]"><span className="text-slate-500">Rateios recebidos</span><strong className="text-slate-800">{formatCaixaCurrency(despesas.rateadas)}</strong></div>
        </article>

        <article className="p-4 sm:p-5">
          <div className="flex items-center gap-2"><Scale size={16} className="text-blue-600" /><h4 className="text-sm font-medium text-slate-900">Margens do período</h4></div>
          <MarginMetric label="Margem atual" value={cobertura.margemAtual} />
          <MarginMetric label="Margem projetada" value={cobertura.margemProjetada} projected />
          <p className="mt-3 text-[11px] leading-4 text-slate-500">A projeção considera os boletos a receber retornados pelo servidor.</p>
        </article>
      </div>

      <div className="border-t border-slate-200 bg-slate-50/70 p-4 sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
          <div className={`rounded-xl border p-4 ${inadimplencia.impacto === 'CRITICO' ? 'border-rose-200 bg-rose-50' : inadimplencia.impacto === 'RECUPERAVEL' ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
            <div className="flex items-start gap-3">
              <ShieldAlert size={17} className="mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
              <div><p className="text-xs font-medium text-slate-900">Risco de inadimplência · {inadimplencia.impacto.toLowerCase()}</p><p className="mt-1 text-[11px] leading-4 text-slate-600">{formatCaixaPercent(inadimplencia.taxaInadimplenciaMes)} da carteira no mês · tolerância {formatCaixaPercent(inadimplencia.toleranciaInadimplencia)}</p></div>
            </div>
            {inadimplencia.diagnostico ? <p className="mt-3 border-t border-black/5 pt-3 text-[11px] leading-4 text-slate-600"><strong>Diagnóstico:</strong> {inadimplencia.diagnostico}</p> : null}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-800"><History size={15} className="text-slate-500" /> Referência histórica de gastos</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <HistoryMetric label={historico.mesAnterior.rotulo ? `Mês anterior (${historico.mesAnterior.rotulo})` : 'Mês anterior'} value={historico.mesAnterior.linhaCorte} variation={historico.mesAnterior.variacaoPercentual} />
              <HistoryMetric label="Média histórica" value={historico.mediaTrimestral.linhaCorte} variation={historico.mediaTrimestral.variacaoPercentual} />
            </div>
            <p className="mt-2 text-right text-[10px] font-medium text-slate-500">{historico.rotuloAmostra}</p>
          </div>
        </div>
      </div>
    </section>
  );
};

const DarkMetric: React.FC<{ label: string; value: string; tone: 'green' | 'rose' }> = ({ label, value, tone }) => (
  <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5"><p className="text-[10px] text-slate-500">{label}</p><p className={`mt-1 break-words text-sm font-medium ${tone === 'green' ? 'text-emerald-700' : 'text-rose-700'}`} title={value}>{value}</p></div>
);

const CostBar: React.FC<{ label: string; value: string; percent: number; visualPercent: number; color: string }> = ({ label, value, percent, visualPercent, color }) => (
  <div><div className="flex items-center justify-between gap-3 text-[11px]"><span className="font-semibold text-slate-600">{label} · {formatCaixaPercent(percent)}</span><strong className="text-slate-900">{value}</strong></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${color}`} style={{ width: `${visualPercent}%` }} /></div></div>
);

const MarginMetric: React.FC<{ label: string; value: number; projected?: boolean }> = ({ label, value, projected = false }) => (
  <div className={`mt-3 rounded-xl p-3 ${projected ? 'bg-blue-50' : 'bg-slate-50'}`}><p className="text-[11px] font-semibold text-slate-500">{label}</p><p className={`mt-1 text-lg font-medium ${value >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{value >= 0 ? '+' : ''}{formatCaixaCurrency(value)}</p></div>
);

const HistoryMetric: React.FC<{ label: string; value: number; variation: number | null }> = ({ label, value, variation }) => (
  <div className="rounded-xl bg-slate-50 px-3 py-2.5"><p className="text-[10px] text-slate-500">{label}</p><div className="mt-1 flex items-center justify-between gap-2"><strong className="text-xs text-slate-900">{formatCaixaCurrency(value)}</strong>{variation !== null ? <span className={`inline-flex items-center text-[10px] font-medium ${variation > 0 ? 'text-rose-600' : variation < 0 ? 'text-emerald-600' : 'text-slate-500'}`}>{variation > 0 ? <TrendingUp size={10} /> : variation < 0 ? <TrendingDown size={10} /> : null}{variation > 0 ? '+' : ''}{formatCaixaPercent(variation)}</span> : null}</div></div>
);
