import { AlertTriangle, ArrowRight, CalendarDays, CreditCard, FileText, RefreshCw } from 'lucide-react';

export type HomeFinanceSummary = {
  nextPayment?: { data_vencimento?: string | null; descricao?: string | null; valor?: number | string | null } | null;
  overdueCount?: number;
  overdueTotal?: number;
  openTotal?: number;
};

export type HomeUpcomingEvent = { id: string; date: string; title: string; subtitle: string; detail: string };

const currency = (value?: number | string | null) => new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL',
}).format(Number(value || 0));

const dateLabel = (value?: string | null) => value?.split('-').reverse().join('/') || 'Sem vencimento';

export const HomeDataNotice = ({ onRetry }: { onRetry: () => void }) => (
  <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-[13px] text-amber-900">
    <AlertTriangle size={18} className="shrink-0" />
    <p className="min-w-0 flex-1">Algumas informações não foram carregadas.</p>
    <button type="button" onClick={onRetry} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 font-medium hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-700">
      <RefreshCw size={15} /> Tentar novamente
    </button>
  </div>
);

export const HomeFinanceAndDocuments = ({ summary, loading, error, onNavigate }: {
  summary?: HomeFinanceSummary;
  loading: boolean;
  error: boolean;
  onNavigate: (module: string) => void;
}) => {
  const overdue = Number(summary?.overdueCount || 0) > 0;
  const status = loading ? 'Consultando sua situação…'
    : error ? 'Não foi possível consultar agora'
      : overdue ? `${summary?.overdueCount} pagamento(s) em atraso`
        : summary?.nextPayment ? 'Próximo pagamento' : 'Nenhuma cobrança em aberto';

  return (
    <div className="space-y-3">
      <section aria-labelledby="aluno-home-finance-title" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <button type="button" onClick={() => onNavigate('financeiro')} className="flex min-h-11 w-full items-center gap-3 p-4 text-left hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${!loading && (error || overdue) ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}><CreditCard size={19} /></span>
          <span className="min-w-0 flex-1">
            <span id="aluno-home-finance-title" className="block text-sm font-semibold text-[#001a33]">Financeiro</span>
            <span className={`mt-0.5 block text-xs ${!loading && (error || overdue) ? 'text-amber-800' : 'text-slate-600'}`} aria-live="polite">{status}</span>
          </span>
          <ArrowRight size={17} className="shrink-0 text-slate-500" />
        </button>
        {!loading && !error && summary ? (
          <div className="space-y-2 border-t border-slate-100 px-4 py-3 text-[13px]">
            {summary.nextPayment ? (
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="text-slate-600">Vencimento em {dateLabel(summary.nextPayment.data_vencimento)}</p>
                <p className="font-semibold text-[#001a33]">{currency(summary.nextPayment.valor)}</p>
              </div>
            ) : null}
            {summary.nextPayment?.descricao ? <p className="break-words text-xs text-slate-600">{summary.nextPayment.descricao}</p> : null}
            <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-600">
              <span>Total em aberto: {currency(summary.openTotal)}</span>
              {overdue ? <span className="text-rose-700">Em atraso: {currency(summary.overdueTotal)}</span> : null}
            </div>
          </div>
        ) : null}
      </section>

      <button type="button" onClick={() => onNavigate('secretaria')} className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-blue-300 hover:bg-blue-50/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><FileText size={19} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[#001a33]">Documentos</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-slate-600">Carteirinha do estudante, declarações e solicitações.</span>
        </span>
        <ArrowRight size={17} className="shrink-0 text-slate-500" />
      </button>
    </div>
  );
};

export const HomeAgenda = ({ events, loading, error, canViewCalendar, onNavigate, limit = 4 }: {
  events: HomeUpcomingEvent[];
  loading: boolean;
  error: boolean;
  canViewCalendar: boolean;
  onNavigate: (module: string) => void;
  limit?: number;
}) => (
  <section aria-labelledby="aluno-home-agenda-title" className="rounded-xl border border-slate-200 bg-white p-4">
    <div className="flex items-center justify-between gap-3">
      <h2 id="aluno-home-agenda-title" className="flex items-center gap-2 text-sm font-semibold text-[#001a33]"><CalendarDays size={17} className="text-slate-500" /> Próximas aulas</h2>
      {canViewCalendar ? <button type="button" onClick={() => onNavigate('calendario')} className="min-h-11 rounded-lg px-2 text-[13px] font-medium text-blue-700 hover:bg-blue-50">Ver agenda</button> : null}
    </div>
    {loading ? <p role="status" className="py-3 text-[13px] text-slate-600">Carregando eventos…</p>
      : error ? <p className="py-3 text-[13px] text-amber-800">Não foi possível consultar sua agenda.</p>
        : events.length ? <div className="mt-2 divide-y divide-slate-100">
          {events.slice(0, limit).map((event) => (
            <article key={event.id} className="flex items-start gap-3 py-3">
              <div className="shrink-0 rounded-lg bg-slate-50 px-2.5 py-2 text-center text-xs font-medium text-slate-700">{event.date.split('-').slice(1).reverse().join('/')}</div>
              <div className="min-w-0">
                <h3 className="break-words text-[13px] font-medium text-[#001a33]">{event.title}</h3>
                <p className="mt-1 break-words text-xs text-slate-600">{event.subtitle}</p>
                {event.detail ? <p className="mt-1 break-words text-xs text-slate-600">{event.detail}</p> : null}
              </div>
            </article>
          ))}
        </div> : <p className="py-3 text-[13px] text-slate-600">Nenhuma aula futura encontrada. As próximas aulas aparecerão aqui quando forem agendadas.</p>}
  </section>
);
