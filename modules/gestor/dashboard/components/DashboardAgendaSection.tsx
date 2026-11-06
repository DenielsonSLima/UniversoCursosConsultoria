import type React from 'react';
import { ArrowUpRight, CalendarDays, CheckCircle2, Landmark, Plus } from 'lucide-react';
import type { CalendarEvent, EventType } from '../../calendario/calendario.types';
import { addDays, formatShortDate, getEventTone, getEventType, type DashboardDaySummary } from '../dashboard.presentation';
import { toDateKey } from '../../calendario/calendario.official';

interface DashboardAgendaSectionProps {
  weekStart: Date;
  weekEnd: Date;
  weekDays: DashboardDaySummary[];
  weekEvents: CalendarEvent[];
  upcomingEvents: CalendarEvent[];
  nextImportantDate?: CalendarEvent;
  eventTypes: EventType[];
  loading: boolean;
  canUseCalendar: boolean;
  onOpenCalendar: () => void;
  children?: React.ReactNode;
}

const DashboardAgendaSection: React.FC<DashboardAgendaSectionProps> = ({
  weekStart, weekEnd, weekDays, weekEvents, upcomingEvents, nextImportantDate,
  eventTypes, loading, canUseCalendar, onOpenCalendar, children,
}) => (
  <section className="home-agenda-layout" aria-label="Planejamento">
    <div className="home-primary-column">
    <div className="home-panel home-week">
      <div className="home-panel-heading">
        <div><p className="home-eyebrow">Planejamento</p><h2>Agenda da semana</h2></div>
        {canUseCalendar && (
          <button type="button" onClick={onOpenCalendar} className="home-text-link">
            <span>Ver calendário completo</span><ArrowUpRight size={17} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="home-week-period">
        <CalendarDays size={15} strokeWidth={1.7} aria-hidden="true" />
        {formatShortDate(toDateKey(weekStart))} — {formatShortDate(toDateKey(addDays(weekEnd, -1)))}
      </div>
      <div className="home-week-days">
        {weekDays.map((day) => (
          <button
            key={day.dateKey} type="button" onClick={onOpenCalendar} disabled={!canUseCalendar}
            aria-current={day.isToday ? 'date' : undefined}
            className={`home-day ${day.isToday ? 'is-today' : ''} ${day.events.length ? 'has-events' : ''}`}
          >
            <span className="home-day-label">{day.label}</span>
            <span className="home-day-number">{day.dayNumber}</span>
            <span className="home-day-dots">
              {day.events.slice(0, 3).map((event) => <span key={event.id} className={day.isToday ? 'bg-white' : getEventTone(event.typeId)} />)}
            </span>
          </button>
        ))}
      </div>
      <div className="home-week-events">
        {loading ? (
          <div className="space-y-3" aria-label="Carregando agenda" role="status">
            {[1, 2, 3].map((item) => <div key={item} className="home-skeleton h-14 w-full" />)}
          </div>
        ) : weekEvents.length > 0 ? (
          weekEvents.slice(0, 5).map((event) => (
            <button key={event.id} type="button" onClick={onOpenCalendar} className="home-event-row">
              <span className="home-event-date">
                <span>{new Date(`${event.date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</span>
                <strong>{event.date.slice(-2)}</strong>
              </span>
              <span className={`home-event-line ${getEventTone(event.typeId)}`} />
              <span className="home-event-copy">
                <strong>{event.title}</strong>
                <span>{getEventType(eventTypes, event.typeId)}{event.turmaName ? ` • ${event.turmaName}` : ''}</span>
              </span>
              <ArrowUpRight size={17} aria-hidden="true" />
            </button>
          ))
        ) : (
          <div className="home-agenda-empty">
            <CheckCircle2 size={23} strokeWidth={1.5} aria-hidden="true" />
            <h3>Semana sem compromissos registrados</h3>
            <p>A agenda está livre. Você pode adicionar aulas, reuniões ou eventos no calendário.</p>
            {canUseCalendar && <button type="button" onClick={onOpenCalendar} className="home-text-link"><Plus size={15} /> Adicionar evento</button>}
          </div>
        )}
      </div>
    </div>
    {children}
    </div>
    <aside className="home-agenda-aside">
      <div className={`home-important ${nextImportantDate ? 'has-date' : ''}`}>
        <div className="home-important-top"><p className="home-eyebrow">Próxima data importante</p><Landmark size={19} strokeWidth={1.5} aria-hidden="true" /></div>
        <h2>{nextImportantDate?.title || 'Nenhuma data próxima'}</h2>
        {nextImportantDate ? (
          <><p className="home-important-date">{formatShortDate(nextImportantDate.date)}</p><p className="home-important-description">{nextImportantDate.description || getEventType(eventTypes, nextImportantDate.typeId)}</p></>
        ) : <p className="home-important-description">Nenhuma data importante foi retornada pela agenda.</p>}
      </div>
      <div className="home-panel home-upcoming">
        <div className="home-panel-heading"><div><p className="home-eyebrow">Próximos dias</p><h2>Próximos compromissos</h2></div></div>
        {upcomingEvents.length > 0 ? (
          <ol className="home-upcoming-list">
            {upcomingEvents.map((event) => (
              <li key={event.id}>
                <button type="button" onClick={onOpenCalendar} className="home-upcoming-event">
                  <span className={`home-upcoming-dot ${getEventTone(event.typeId)}`} />
                  <span><span className="home-upcoming-date">{formatShortDate(event.date)} • {getEventType(eventTypes, event.typeId)}</span><strong>{event.title}</strong></span>
                </button>
              </li>
            ))}
          </ol>
        ) : <p className="home-empty">Nenhum compromisso futuro cadastrado.</p>}
      </div>
    </aside>
  </section>
);

export default DashboardAgendaSection;
