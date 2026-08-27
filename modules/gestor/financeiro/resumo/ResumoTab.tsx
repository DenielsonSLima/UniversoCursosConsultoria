import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Landmark,
  Loader2,
  RefreshCw,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import type { FinanceiroTabId } from '../../access-control';
import { financeiroQueryKeys } from '../financeiro.queryKeys';
import { useFinanceiroRealtime } from '../hooks/useFinanceiroRealtime';
import BaneseApiHealthCard from './BaneseApiHealthCard';
import { resumoFinanceiroService } from './resumo-financeiro.service';
import {
  formatResumoDate,
  formatResumoRange,
  getResumoOverdueRange,
  getResumoPresetRange,
  getResumoThreeMonthPeriods,
  type ResumoPeriodPreset,
  type ResumoPeriodRange,
  validateResumoCustomRange,
} from './resumo-period';

interface ResumoTabProps {
  poloId?: string | null;
  availableTabs: FinanceiroTabId[];
  onNavigate: (tab: FinanceiroTabId) => void;
}

interface KpiCardProps {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  iconClassName: string;
}

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const formatCurrency = (value: number) => currencyFormatter.format(value);

const SectionError: React.FC<{
  message: string;
  onRetry: () => void;
}> = ({ message, onRetry }) => (
  <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between" role="alert">
    <div className="flex items-start gap-3">
      <AlertTriangle className="mt-0.5 shrink-0" size={18} />
      <div>
        <p className="font-black">Informação indisponível</p>
        <p className="mt-0.5 text-xs font-medium leading-relaxed">{message}</p>
      </div>
    </div>
    <button
      type="button"
      onClick={onRetry}
      className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white px-4 text-xs font-black uppercase tracking-wide transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
    >
      <RefreshCw size={14} /> Tentar novamente
    </button>
  </div>
);

const CardSkeleton = () => (
  <div className="min-h-28 animate-pulse rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
    <div className="h-2.5 w-24 rounded bg-slate-100" />
    <div className="mt-4 h-6 w-32 rounded bg-slate-100" />
    <div className="mt-3 h-2.5 w-20 rounded bg-slate-100" />
  </div>
);

const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  detail,
  icon: Icon,
  iconClassName,
}) => (
  <div className="flex min-h-28 items-start justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
    <div className="min-w-0">
      <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-2 text-lg font-black leading-tight text-[#001a33]">{value}</p>
      <p className="mt-1 text-[10px] font-semibold text-slate-500">{detail}</p>
    </div>
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconClassName}`}>
      <Icon size={19} />
    </span>
  </div>
);

const ResumoTab: React.FC<ResumoTabProps> = ({
  poloId,
  availableTabs,
  onNavigate,
}) => {
  const initial30DaysRange = useMemo(() => getResumoPresetRange('LAST_30_DAYS'), []);
  const [dateRange, setDateRange] = useState<ResumoPeriodRange>(initial30DaysRange);
  useFinanceiroRealtime(poloId);

  const rangeError = validateResumoCustomRange(dateRange);
  const activeRange = rangeError ? initial30DaysRange : dateRange;

  const overdueRange = getResumoOverdueRange();
  const flowPeriods = getResumoThreeMonthPeriods();
  const currentMonthKey = flowPeriods.at(-1)?.start.slice(0, 7) || 'unknown';

  const summaryQuery = useQuery({
    queryKey: financeiroQueryKeys.resumoFinanceiroByPoloPeriod(
      poloId,
      activeRange.start,
      activeRange.end,
    ),
    queryFn: () => resumoFinanceiroService.getValues({
      poloId,
      start: activeRange.start,
      end: activeRange.end,
    }),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const overdueQuery = useQuery({
    queryKey: financeiroQueryKeys.resumoOverdueByPolo(poloId, overdueRange.end),
    queryFn: () => resumoFinanceiroService.getValues({
      poloId,
      start: overdueRange.start,
      end: overdueRange.end,
    }),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const flowQuery = useQuery({
    queryKey: financeiroQueryKeys.resumoFlowByPolo(poloId, currentMonthKey),
    queryFn: () => resumoFinanceiroService.getThreeMonthFlow({
      poloId,
      periods: flowPeriods,
    }),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  });

  const canOpenReceivables = availableTabs.includes('receber');
  const canOpenExpenses = availableTabs.includes('despesas');
  const overdueReceivable = overdueQuery.data?.totalAReceber ?? 0;
  const overduePayable = overdueQuery.data?.totalAPagar ?? 0;
  const noOverdue = overdueQuery.isSuccess
    && overdueReceivable === 0
    && overduePayable === 0;

  const quickActions = [
    { tab: 'receber' as const, label: 'Abrir contas a receber', icon: ArrowDownLeft },
    { tab: 'despesas' as const, label: 'Abrir contas a pagar', icon: ArrowUpRight },
    { tab: 'conciliacao-bancaria' as const, label: 'Abrir conciliação', icon: Landmark },
    { tab: 'transferencias' as const, label: 'Abrir transferências', icon: ArrowRight },
  ].filter((action) => availableTabs.includes(action.tab));

  const receitaOrigemItems = summaryQuery.data?.receitaPorOrigem || [];

  return (
    <div className="space-y-5 animate-fadeIn">
      <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">Visão financeira</span>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-slate-600">
                {poloId && poloId !== 'todos' ? 'Polo selecionado' : 'Visão global'}
              </span>
            </div>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-[#001a33]">Resumo financeiro</h2>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-slate-500">
              De
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange((prev) => ({ ...prev, start: e.target.value }))}
                className="h-10 rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-xs font-bold text-slate-700 outline-none transition-all hover:bg-white focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
              />
            </label>
            <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-slate-500">
              Até
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange((prev) => ({ ...prev, end: e.target.value }))}
                className="h-10 rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-xs font-bold text-slate-700 outline-none transition-all hover:bg-white focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
              />
            </label>
            {summaryQuery.isFetching && !summaryQuery.isLoading ? (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-600"><Loader2 size={14} className="animate-spin" /></span>
            ) : null}
          </div>
        </div>
        {rangeError ? <p className="mt-2 text-xs font-semibold text-rose-600" role="alert">{rangeError}</p> : null}
      </section>

      <section aria-labelledby="resumo-posicao-title">
        <div className="mb-3">
          <h3 id="resumo-posicao-title" className="text-lg font-black tracking-tight text-[#001a33]">Posição financeira do período</h3>
          <p className="text-xs font-medium text-slate-500">Saldo atual e fluxo movimentado no período selecionado.</p>
        </div>
        {summaryQuery.isLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <CardSkeleton key={index} />)}</div>
        ) : summaryQuery.isError ? (
          <SectionError message={(summaryQuery.error as Error)?.message || 'Não foi possível carregar a posição financeira.'} onRetry={() => { void summaryQuery.refetch(); }} />
        ) : summaryQuery.data ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <KpiCard label="Saldo atual" value={formatCurrency(summaryQuery.data.saldoCaixa)} detail="Contas e caixas" icon={WalletCards} iconClassName="bg-blue-50 text-blue-600" />
            <KpiCard label="Recebido no período" value={formatCurrency(summaryQuery.data.totalRecebido)} detail="Pagamento no período" icon={ArrowDownLeft} iconClassName="bg-emerald-50 text-emerald-600" />
            <KpiCard label="Pago no período" value={formatCurrency(summaryQuery.data.totalPago)} detail="Saída paga no período" icon={ArrowUpRight} iconClassName="bg-rose-50 text-rose-600" />
            <KpiCard label="A receber no período" value={formatCurrency(summaryQuery.data.totalAReceber)} detail="Vencimento no período" icon={Clock3} iconClassName="bg-amber-50 text-amber-600" />
            <KpiCard label="A pagar no período" value={formatCurrency(summaryQuery.data.totalAPagar)} detail="Vencimento no período" icon={CalendarDays} iconClassName="bg-indigo-50 text-indigo-600" />
          </div>
        ) : null}
      </section>

      {receitaOrigemItems.length > 0 ? (
        <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm" aria-labelledby="receita-origem-title">
          <div>
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">Composição do faturamento</span>
            <h3 id="receita-origem-title" className="mt-1 text-lg font-black tracking-tight text-[#001a33]">Receita por origem de curso</h3>
            <p className="mt-1 text-xs font-medium text-slate-500">Distribuição dos recebimentos consolidados no período por categoria.</p>
          </div>
          <div className="mt-4 space-y-3">
            {receitaOrigemItems.map((item) => (
              <div key={item.categoria} className="space-y-1">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <span>{item.label}</span>
                  <span className="font-black text-[#001a33]">{formatCurrency(item.valor)} ({item.percentual}%)</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(0, item.percentual))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <section className="rounded-3xl border border-slate-100 bg-slate-50/70 p-5" aria-labelledby="resumo-atencao-title">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-rose-600">Prioridade diária</p>
              <h3 id="resumo-atencao-title" className="mt-1 text-lg font-black tracking-tight text-[#001a33]">Atenção agora</h3>
              <p className="mt-1 text-xs font-medium text-slate-500">Valores ainda em aberto com vencimento até {formatResumoDate(overdueRange.end)}.</p>
            </div>

            <div className="mt-4">
              {overdueQuery.isLoading ? (
                <div className="grid gap-3 sm:grid-cols-2"><CardSkeleton /><CardSkeleton /></div>
              ) : overdueQuery.isError ? (
                <SectionError message={(overdueQuery.error as Error)?.message || 'Não foi possível carregar os valores vencidos.'} onRetry={() => { void overdueQuery.refetch(); }} />
              ) : noOverdue ? (
                <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
                  <CheckCircle2 size={20} className="shrink-0" />
                  <div>
                    <p className="text-sm font-black">Nenhuma pendência vencida até ontem</p>
                    <p className="mt-0.5 text-xs font-medium">Os próximos vencimentos continuam disponíveis nas abas operacionais.</p>
                  </div>
                </div>
              ) : overdueQuery.data ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    {
                      label: 'Em atraso a receber',
                      value: overdueReceivable,
                      detail: 'Recebíveis vencidos acumulados',
                      enabled: canOpenReceivables,
                      action: 'Ver contas a receber',
                      tab: 'receber' as const,
                      tone: 'border-rose-200 bg-rose-50 text-rose-700',
                    },
                    {
                      label: 'Em atraso a pagar',
                      value: overduePayable,
                      detail: 'Despesas vencidas acumuladas',
                      enabled: canOpenExpenses,
                      action: 'Ver contas a pagar',
                      tab: 'despesas' as const,
                      tone: 'border-amber-200 bg-amber-50 text-amber-800',
                    },
                  ].map((item) => (
                    <div key={item.label} className={`rounded-2xl border p-4 ${item.tone}`}>
                      <p className="text-[10px] font-black uppercase tracking-wide opacity-80">{item.label}</p>
                      <p className="mt-2 text-2xl font-black">{formatCurrency(item.value)}</p>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold opacity-80">{item.detail}</p>
                        {item.enabled ? (
                          <button
                            type="button"
                            onClick={() => onNavigate(item.tab)}
                            className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-white/80 px-3 text-[10px] font-black uppercase tracking-wide shadow-sm transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
                          >
                            {item.action} <ArrowRight size={13} />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm" aria-labelledby="resumo-fluxo-title">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Realizado</p>
                <h3 id="resumo-fluxo-title" className="mt-1 text-lg font-black tracking-tight text-[#001a33]">Fluxo dos últimos 3 meses</h3>
                <p className="mt-1 text-xs font-medium text-slate-500">Recebimentos brutos e pagamentos efetivados em cada mês.</p>
              </div>
              {flowQuery.isFetching && !flowQuery.isLoading ? <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600"><Loader2 size={12} className="animate-spin" /> Atualizando</span> : null}
            </div>

            <div className="mt-4">
              {flowQuery.isLoading ? (
                <div className="grid gap-3 sm:grid-cols-3"><CardSkeleton /><CardSkeleton /><CardSkeleton /></div>
              ) : flowQuery.isError ? (
                <SectionError message={(flowQuery.error as Error)?.message || 'Não foi possível carregar o fluxo realizado.'} onRetry={() => { void flowQuery.refetch(); }} />
              ) : flowQuery.data ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  {flowQuery.data.map((month) => (
                    <article key={`${month.ano}-${month.mes}`} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                      <p className="text-xs font-black uppercase tracking-wide text-[#001a33]">{month.mesNome} · {month.ano}</p>
                      <dl className="mt-4 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <dt className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-emerald-700"><ArrowDownLeft size={14} /> Recebido</dt>
                          <dd className="text-sm font-black text-emerald-700">{formatCurrency(month.creditos)}</dd>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <dt className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-rose-700"><ArrowUpRight size={14} /> Pago</dt>
                          <dd className="text-sm font-black text-rose-700">{formatCurrency(month.debitos)}</dd>
                        </div>
                      </dl>
                    </article>
                  ))}
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <div className="space-y-5 lg:col-span-1">
          <BaneseApiHealthCard compact />

          {quickActions.length > 0 ? (
            <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm" aria-labelledby="resumo-atalhos-title">
              <h3 id="resumo-atalhos-title" className="text-sm font-black uppercase tracking-wide text-[#001a33]">Continuar no Financeiro</h3>
              <div className="mt-3 space-y-2">
                {quickActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.tab}
                      type="button"
                      onClick={() => onNavigate(action.tab)}
                      className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-left text-xs font-black text-slate-700 shadow-sm transition-all hover:border-blue-200 hover:text-blue-700 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <span className="flex items-center gap-2"><Icon size={16} className="text-blue-600" /> {action.label}</span>
                      <ArrowRight size={14} className="shrink-0" />
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default ResumoTab;
