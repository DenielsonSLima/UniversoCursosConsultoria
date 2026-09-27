import type React from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ReceiptText,
} from 'lucide-react';
import type { DashboardFinancialRadar as DashboardFinancialRadarData } from '../dashboard-financial.mapper';
import {
  addDays,
  formatDashboardCanonicalCurrency,
  formatShortDate,
} from '../dashboard.presentation';
import { toDateKey } from '../../calendario/calendario.official';

interface DashboardFinancialRadarProps {
  radar?: DashboardFinancialRadarData;
  loading: boolean;
  hasError: boolean;
  onOpenPayables: () => void;
}

const metricCards = (radar: DashboardFinancialRadarData) => [
  {
    label: 'Em atraso',
    amount: radar.emAtraso,
    helper: radar.emAtraso.dataMaisAntiga
      ? `Mais antiga em ${formatShortDate(radar.emAtraso.dataMaisAntiga)}`
      : 'Nenhuma conta vencida em aberto',
    icon: AlertTriangle,
    tone: 'border-rose-100 bg-rose-50/70 text-rose-700',
  },
  {
    label: 'Vencem hoje',
    amount: radar.agendaFinanceira.hoje,
    helper: formatShortDate(radar.agendaFinanceira.hoje.data),
    icon: Clock3,
    tone: 'border-amber-100 bg-amber-50/70 text-amber-700',
  },
  {
    label: 'Próximos 7 dias',
    amount: radar.agendaFinanceira.proximosSeteDias,
    helper: `${formatShortDate(radar.agendaFinanceira.proximosSeteDias.periodoInicio)} a ${formatShortDate(toDateKey(addDays(new Date(`${radar.agendaFinanceira.proximosSeteDias.periodoFimExclusivo}T12:00:00`), -1)))}`,
    icon: CalendarClock,
    tone: 'border-blue-100 bg-blue-50/70 text-blue-700',
  },
];

const DashboardFinancialRadar: React.FC<DashboardFinancialRadarProps> = ({
  radar,
  loading,
  hasError,
  onOpenPayables,
}) => {
  if (loading) {
    return (
      <section aria-busy="true" aria-label="Carregando Radar financeiro" className="rounded-[1.75rem] border border-slate-200/80 bg-white p-6 shadow-sm">
        <div className="h-5 w-44 animate-pulse rounded bg-slate-100" />
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {[1, 2, 3].map(item => <div key={item} className="h-28 animate-pulse rounded-2xl bg-slate-50" />)}
        </div>
      </section>
    );
  }

  if (hasError || !radar) {
    return (
      <section role="alert" className="rounded-[1.75rem] border border-amber-200 bg-amber-50 p-6 text-amber-900">
        <div className="flex items-start gap-3">
          <AlertTriangle size={19} className="mt-0.5 shrink-0 text-amber-600" />
          <div>
            <h2 className="text-sm font-bold">Radar financeiro indisponível</h2>
            <p className="mt-1 text-xs leading-5">O restante da tela inicial continua disponível. Consulte Contas a Pagar para ver os lançamentos.</p>
          </div>
        </div>
      </section>
    );
  }

  const cards = metricCards(radar);
  const hasDailyPayables = radar.agendaFinanceira.dias.some(day => day.quantidade > 0);

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-rose-600">Contas a pagar</p>
          <h2 className="mt-1 text-lg font-bold text-[#001a33]">Radar financeiro</h2>
          <p className="mt-0.5 text-xs font-medium text-slate-500">Posição reexpressa no corte de {formatShortDate(radar.dataCorte)}.</p>
        </div>
        <button type="button" onClick={onOpenPayables} className="flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800">
          Ver contas <ChevronRight size={14} />
        </button>
      </div>

      <div className="p-4 sm:p-6">
        <div className="grid gap-3 md:grid-cols-3">
          {cards.map(({ label, amount, helper, icon: Icon, tone }) => (
            <button key={label} type="button" onClick={onOpenPayables} className={`group rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${tone}`}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-bold uppercase tracking-[0.15em]">{label}</span>
                <Icon size={17} />
              </div>
              <p className="mt-3 text-xl font-bold tracking-tight">{formatDashboardCanonicalCurrency(amount.valor)}</p>
              <p className="mt-1 text-[11px] font-semibold opacity-75">{amount.quantidade} {amount.quantidade === 1 ? 'conta' : 'contas'} · {helper}</p>
            </button>
          ))}
        </div>

        <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Faixa diária</p>
              <p className="mt-0.5 text-sm font-bold text-[#001a33]">Hoje e próximos vencimentos</p>
            </div>
            <ReceiptText size={17} className="text-slate-300" />
          </div>

          {hasDailyPayables ? (
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
              {radar.agendaFinanceira.dias.map((day, index) => (
                <button
                  key={day.data}
                  type="button"
                  onClick={onOpenPayables}
                  className={`min-w-0 rounded-xl border px-3 py-3 text-left transition hover:border-blue-200 hover:bg-white ${
                    index === 0 ? 'border-blue-200 bg-white shadow-sm' : 'border-slate-100 bg-slate-50'
                  }`}
                >
                  <span className="block text-[9px] font-bold uppercase tracking-wide text-slate-400">{index === 0 ? 'Hoje' : formatShortDate(day.data)}</span>
                  <span className="mt-1 block truncate text-xs font-bold text-[#001a33]">{formatDashboardCanonicalCurrency(day.valor)}</span>
                  <span className="mt-0.5 block text-[9px] font-semibold text-slate-500">{day.quantidade} {day.quantidade === 1 ? 'conta' : 'contas'}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-emerald-800">
              <CheckCircle2 size={17} className="shrink-0" />
              <p className="text-xs font-semibold">Nenhuma conta vence entre hoje e os próximos sete dias.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default DashboardFinancialRadar;
