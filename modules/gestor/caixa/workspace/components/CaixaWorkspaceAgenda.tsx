import React from 'react';
import { CalendarClock, Clock3 } from 'lucide-react';
import {
  formatCaixaCanonicalCurrency,
  formatCaixaDate,
} from '../../caixa.formatters.ts';
import type { CaixaWorkspaceAgendaData } from '../caixa-workspace.types.ts';

const weekdayFormatter = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'short',
  timeZone: 'UTC',
});

const formatWeekday = (date: string) => weekdayFormatter
  .format(new Date(`${date}T12:00:00Z`))
  .replace('.', '');

const quantityLabel = (quantity: number) => (
  `${new Intl.NumberFormat('pt-BR').format(quantity)} ${quantity === 1 ? 'título' : 'títulos'}`
);

interface CaixaWorkspaceAgendaProps {
  agenda: CaixaWorkspaceAgendaData;
}

export const CaixaWorkspaceAgenda = ({ agenda }: CaixaWorkspaceAgendaProps) => (
  <section
    aria-labelledby="caixa-workspace-agenda-title"
    className="border-t border-slate-200/80 bg-white/75 px-4 py-5 sm:px-6 lg:px-8"
  >
    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div>
        <div className="flex items-center gap-2 text-blue-700">
          <CalendarClock aria-hidden="true" size={16} />
          <h3
            id="caixa-workspace-agenda-title"
            className="text-xs font-extrabold uppercase tracking-[0.18em]"
          >
            Agenda financeira
          </h3>
        </div>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Oito posições canônicas, de hoje a D+7, sem projeções criadas na interface.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Hoje</p>
          <p className="mt-0.5 text-sm font-extrabold text-[#001a33]">
            {formatCaixaCanonicalCurrency(agenda.hoje.valor)}
          </p>
          <p className="text-[10px] text-slate-500">{quantityLabel(agenda.hoje.quantidade)}</p>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-blue-700">Amanhã a D+7</p>
          <p className="mt-0.5 text-sm font-extrabold text-[#001a33]">
            {formatCaixaCanonicalCurrency(agenda.proximos_sete_dias.valor)}
          </p>
          <p className="text-[10px] text-blue-700/80">
            {quantityLabel(agenda.proximos_sete_dias.quantidade)}
          </p>
        </div>
      </div>
    </div>

    <ol
      aria-label="Vencimentos de hoje aos próximos sete dias"
      className="mt-4 flex snap-x snap-mandatory gap-2 overflow-x-auto pb-2 sm:grid sm:grid-cols-4 sm:overflow-visible sm:pb-0 xl:grid-cols-8"
    >
      {agenda.dias.map((day, index) => (
        <li
          key={day.data}
          data-agenda-day={day.data}
          className={`min-w-[136px] snap-start rounded-2xl border px-3 py-3 sm:min-w-0 ${
            index === 0
              ? 'border-blue-300 bg-blue-50 shadow-sm'
              : 'border-slate-200 bg-white'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-blue-700">
              {index === 0 ? 'Hoje' : `D+${index}`}
            </span>
            <Clock3 aria-hidden="true" size={12} className="text-slate-400" />
          </div>
          <p className="mt-2 text-xs font-bold capitalize text-slate-600">
            {formatWeekday(day.data)} · <time dateTime={day.data}>{formatCaixaDate(day.data)}</time>
          </p>
          <p className="mt-2 break-words text-sm font-extrabold leading-5 text-[#001a33]">
            {formatCaixaCanonicalCurrency(day.valor)}
          </p>
          <p className="mt-1 text-[10px] text-slate-500">{quantityLabel(day.quantidade)}</p>
        </li>
      ))}
    </ol>
  </section>
);
