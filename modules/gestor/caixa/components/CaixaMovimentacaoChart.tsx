import React from 'react';
import { ArrowDownRight, ArrowUpRight, CircleDollarSign, ShieldAlert } from 'lucide-react';
import type { CaixaMonthlyStatement } from '../caixa.service';
import { formatCaixaCurrency } from '../caixa.formatters';

interface CaixaMovimentacaoChartProps {
  serieMensal: CaixaMonthlyStatement['serieMensal'];
}

export const CaixaMovimentacaoChart: React.FC<CaixaMovimentacaoChartProps> = ({ serieMensal }) => {
  const chartMonths = serieMensal.slice(-3);
  const latest = chartMonths.at(-1);
  const hasChartMovement = chartMonths.some(
    (month) => month.entradas !== 0 || month.saidas !== 0 || month.inadimplencia !== 0 || !month.inadimplenciaCompleto,
  );
  const chartResultPoints = chartMonths
    .map((month, index) => `${((index + 0.5) / chartMonths.length) * 100},${month.resultadoPosicaoPercentual}`)
    .join(' ');
  const delinquencyPoints = chartMonths
    .map((month, index) => `${((index + 0.5) / chartMonths.length) * 100},${month.inadimplenciaPosicaoPercentual}`)
    .join(' ');

  return (
    <article className="relative flex min-h-0 flex-col overflow-hidden rounded-[26px] bg-[#071b31] p-5 text-white shadow-xl shadow-slate-900/10 lg:col-span-3 sm:p-6">
      <div className="pointer-events-none absolute -right-20 -top-24 h-60 w-60 rounded-full border-[38px] border-blue-400/10" />
      <header className="relative flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-cyan-300">Pulso de 90 dias</p>
          <h2 className="mt-1 text-lg font-extrabold">Movimentação operacional</h2>
          <p className="mt-0.5 text-xs text-slate-400">Receitas, despesas, resultado e inadimplência dos últimos três meses</p>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-[9px] font-semibold text-slate-400 xl:max-w-[270px] xl:justify-end">
          <Legend color="bg-emerald-400" label="Receitas" />
          <Legend color="bg-rose-400" label="Despesas" />
          <Legend color="border-blue-400" label="Resultado operacional" line />
          <Legend color="border-orange-400" label="Inadimplência" line />
        </div>
      </header>

      {latest ? (
        <div className="relative mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Snapshot icon={<ArrowUpRight size={13} />} label="Receitas" value={latest.entradas} tone="green" />
          <Snapshot icon={<ArrowDownRight size={13} />} label="Despesas" value={latest.saidas} tone="rose" />
          <Snapshot icon={<CircleDollarSign size={13} />} label="Resultado" value={latest.resultado} tone={latest.resultadoStatus === 'NEGATIVO' ? 'rose' : 'blue'} />
          <Snapshot icon={<ShieldAlert size={13} />} label="Inadimplência" value={latest.inadimplencia} tone="orange" partial={!latest.inadimplenciaCompleto} />
        </div>
      ) : null}

      {hasChartMovement ? (
        <div className="relative mt-5 rounded-2xl border border-white/10 bg-white/[0.04] px-3 pb-3 pt-5">
          <div className="relative flex h-48 items-end border-b border-white/10">
            <svg className="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <line x1="0" y1={chartMonths[0]?.graficoZeroPosicaoPercentual ?? 100} x2="100" y2={chartMonths[0]?.graficoZeroPosicaoPercentual ?? 100} stroke="#64748b" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
              <polyline points={chartResultPoints} fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              <polyline data-series="inadimplencia" points={delinquencyPoints} fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </svg>
            {chartMonths.map((month, index) => (
              <div
                key={month.competencia}
                className="group/month relative flex h-full min-w-0 flex-1 cursor-help items-end justify-center gap-1.5 border-l border-white/[0.06] px-1.5 outline-none transition-colors first:border-l-0 hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-cyan-300 motion-reduce:transition-none sm:px-2.5"
                role="img"
                tabIndex={0}
                aria-label={`${month.rotulo}: receitas ${formatCaixaCurrency(month.entradas)}; despesas ${formatCaixaCurrency(month.saidas)}; resultado ${formatCaixaCurrency(month.resultado)}; inadimplência ${formatCaixaCurrency(month.inadimplencia)}${!month.inadimplenciaCompleto ? `, valor parcial: ${month.inadimplenciaQuantidadeEmConferencia} cobrança(s) em conferência não incluída(s)` : ''}`}
              >
                <span aria-hidden="true" className={`pointer-events-none absolute -top-2 z-30 hidden w-48 max-w-[65vw] -translate-y-full rounded-lg bg-white px-2.5 py-2 text-[10px] font-medium text-slate-900 shadow-xl group-hover/month:block group-focus/month:block ${index === 0 ? 'left-0' : index === chartMonths.length - 1 ? 'right-0' : 'left-1/2 -translate-x-1/2'}`}>
                  <span className="block font-bold">{month.rotulo}</span>
                  <span className="block">Receitas {formatCaixaCurrency(month.entradas)}</span>
                  <span className="block">Despesas {formatCaixaCurrency(month.saidas)}</span>
                  <span className="block">Resultado operacional {formatCaixaCurrency(month.resultado)}</span>
                  <span className="block text-orange-600">Inadimplência {formatCaixaCurrency(month.inadimplencia)}</span>
                  {!month.inadimplenciaCompleto ? <span className="mt-1 block text-orange-700">Valor parcial: {month.inadimplenciaQuantidadeEmConferencia} cobrança(s) em conferência não incluída(s).</span> : null}
                </span>
                <span className={`pointer-events-none absolute left-1/2 z-20 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#071b31] shadow-sm ${month.resultadoStatus === 'POSITIVO' ? 'bg-emerald-400' : month.resultadoStatus === 'NEGATIVO' ? 'bg-rose-400' : 'bg-blue-400'}`} style={{ top: `${month.resultadoPosicaoPercentual}%` }} aria-hidden="true" />
                <span className="pointer-events-none absolute left-1/2 z-20 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#071b31] bg-orange-500 shadow-sm" style={{ top: `${month.inadimplenciaPosicaoPercentual}%` }} aria-hidden="true" />
                <div className="absolute right-1/2 mr-1 w-3 rounded-t bg-emerald-400 sm:w-5" style={{ height: `${month.entradasEscalaPercentual}%`, bottom: `${100 - month.graficoZeroPosicaoPercentual}%` }} aria-hidden="true" />
                <div className="absolute left-1/2 ml-1 w-3 rounded-t bg-rose-400 sm:w-5" style={{ height: `${month.saidasEscalaPercentual}%`, bottom: `${100 - month.graficoZeroPosicaoPercentual}%` }} aria-hidden="true" />
              </div>
            ))}
          </div>
          <div className="mt-2 flex">{chartMonths.map((month) => <p key={month.competencia} className="min-w-0 flex-1 truncate px-1 text-center text-[10px] font-semibold text-slate-400">{month.rotulo}</p>)}</div>
        </div>
      ) : (
        <div className="relative mt-5 flex min-h-32 flex-1 flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-5 text-center">
          <ActivityDot />
          <p className="mt-3 text-sm font-semibold text-slate-200">Nenhuma movimentação ou inadimplência confirmada neste período.</p>
          <p className="mt-1 text-[10px] text-slate-500">O histórico aparecerá aqui quando o servidor confirmar os movimentos.</p>
        </div>
      )}
    </article>
  );
};

const Legend: React.FC<{ color: string; label: string; line?: boolean }> = ({ color, label, line = false }) => <span className="flex items-center gap-1.5"><i className={line ? `w-3 border-t-2 ${color}` : `h-2 w-2 rounded-sm ${color}`} />{label}</span>;

const Snapshot: React.FC<{ icon: React.ReactNode; label: string; value: number; tone: 'green' | 'rose' | 'blue' | 'orange'; partial?: boolean }> = ({ icon, label, value, tone, partial = false }) => {
  const toneClass = tone === 'green' ? 'text-emerald-300' : tone === 'rose' ? 'text-rose-300' : tone === 'orange' ? 'text-orange-300' : 'text-blue-300';
  return <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5"><p className={`flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wide ${toneClass}`}>{icon}{label}{partial ? <span className="rounded bg-orange-300/10 px-1 text-[8px]">parcial</span> : null}</p><p className="mt-1 truncate text-sm font-extrabold text-white" title={formatCaixaCurrency(value)}>{formatCaixaCurrency(value)}</p></div>;
};

const ActivityDot = () => <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-blue-400/10"><span className="h-2 w-2 rounded-full bg-blue-300" /><span className="absolute inset-0 animate-ping rounded-full border border-blue-300/30 motion-reduce:animate-none" /></span>;
