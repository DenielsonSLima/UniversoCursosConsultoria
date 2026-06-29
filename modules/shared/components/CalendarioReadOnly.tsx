import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, X, CalendarDays, Tag, Info, Clock } from 'lucide-react';
import { CalendarEvent, EventType } from '../../gestor/calendario/calendario.types';

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

interface CalendarioReadOnlyProps {
  events: CalendarEvent[];
  eventTypes: EventType[];
  isLoading?: boolean;
}

const CalendarioReadOnly: React.FC<CalendarioReadOnlyProps> = ({ events, eventTypes, isLoading = false }) => {
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const filteredEvents = useMemo(() => {
    return events.filter(e => {
      if (selectedCategoryId && e.typeId !== selectedCategoryId) return false;
      return true;
    });
  }, [events, selectedCategoryId]);

  const getDaysInMonth = (year: number, monthIndex: number) => {
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const firstDayOfWeek = new Date(year, monthIndex, 1).getDay();
    const days: (Date | null)[] = [];
    for (let i = 0; i < firstDayOfWeek; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, monthIndex, i));
    return days;
  };

  const getEventsForDay = (date: Date) => {
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return filteredEvents.filter(e => e.date === dateStr);
  };

  const getEventsForMonthList = (monthIndex: number) => {
    return filteredEvents
      .filter(e => {
        const [y, m] = e.date.split('-');
        return parseInt(y) === currentYear && parseInt(m) === monthIndex + 1;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  const getTypeColor = (typeId: string) => {
    const type = eventTypes.find(t => t.id === typeId);
    return type ? type.color : '#cbd5e1';
  };

  const getTypeName = (typeId: string) => {
    const type = eventTypes.find(t => t.id === typeId);
    return type ? type.label : 'Geral';
  };

  const handleDayClick = (date: Date) => {
    const dayEvents = getEventsForDay(date);
    if (dayEvents.length === 0) return;
    setSelectedDate(date);
    setIsModalOpen(true);
  };

  const isMonthFiltered = selectedMonthIndex !== '';
  const monthsToRender = isMonthFiltered
    ? [parseInt(selectedMonthIndex, 10)]
    : Array.from({ length: 12 }, (_, i) => i);

  // Sidebar: eventos do ano corrente ordenados cronologicamente
  const sidebarEvents = useMemo(() => {
    return [...filteredEvents]
      .filter(e => e.date.startsWith(currentYear.toString()))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [filteredEvents, currentYear]);

  const formatDateShort = (dateStr: string) => {
    const [, month, day] = dateStr.split('-');
    return `${day}/${month}`;
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      {/* Barra de Filtros */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm mb-6 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">Foco Mensal</span>
          <select
            className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-purple-500 cursor-pointer min-w-[140px]"
            value={selectedMonthIndex}
            onChange={e => setSelectedMonthIndex(e.target.value)}
          >
            <option value="">Todos os meses</option>
            {MONTHS.map((m, idx) => (
              <option key={idx} value={idx}>{m}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">Categoria</span>
          <select
            className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-purple-500 cursor-pointer min-w-[140px]"
            value={selectedCategoryId}
            onChange={e => setSelectedCategoryId(e.target.value)}
          >
            <option value="">Todas as categorias</option>
            {eventTypes.map(c => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Layout 2 colunas: Calendário + Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* Coluna Esquerda: Calendário (9 cols) */}
        <div className="lg:col-span-9">
          {/* Navegação de Ano */}
          <div className="flex justify-between items-center mb-6 bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
            <button
              onClick={() => setCurrentYear(prev => prev - 1)}
              className="p-3 hover:bg-slate-50 rounded-xl text-slate-500 hover:text-[#001a33] transition-colors"
            >
              <ChevronLeft size={20} />
            </button>
            <h2 className="text-3xl font-black text-[#001a33] tracking-tighter">{currentYear}</h2>
            <button
              onClick={() => setCurrentYear(prev => prev + 1)}
              className="p-3 hover:bg-slate-50 rounded-xl text-slate-500 hover:text-[#001a33] transition-colors"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          {/* Grade de Meses */}
          <div className={isMonthFiltered ? 'max-w-2xl mx-auto w-full' : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6'}>
            {monthsToRender.map(monthIndex => {
              const monthName = MONTHS[monthIndex];
              const days = getDaysInMonth(currentYear, monthIndex);
              const isCurrentMonth = new Date().getMonth() === monthIndex && new Date().getFullYear() === currentYear;
              const monthEventsList = getEventsForMonthList(monthIndex);
              const cellHeight = isMonthFiltered ? 'h-14 py-1' : 'h-9';
              const badgeSize = isMonthFiltered ? 'w-8 h-8 text-sm' : 'w-6 h-6 text-xs';

              return (
                <div
                  key={monthName}
                  className={`bg-white rounded-3xl border p-5 transition-all hover:shadow-lg flex flex-col ${
                    isCurrentMonth
                      ? 'border-purple-200 shadow-purple-900/5 ring-1 ring-purple-100'
                      : 'border-slate-100 shadow-sm'
                  }`}
                >
                  <h3 className={`text-lg font-black mb-4 uppercase tracking-wide text-center ${isCurrentMonth ? 'text-purple-600' : 'text-[#001a33]'}`}>
                    {monthName}
                  </h3>

                  <div className="grid grid-cols-7 mb-2">
                    {WEEKDAYS.map((day, i) => (
                      <div key={i} className="text-center text-[10px] font-bold text-slate-400">{day}</div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-y-2 mb-4">
                    {days.map((date, dayIdx) => {
                      if (!date) return <div key={`empty-${dayIdx}`} className="h-8" />;
                      const dayEvents = getEventsForDay(date);
                      const hasEvents = dayEvents.length > 0;
                      const isToday = new Date().toDateString() === date.toDateString();

                      return (
                        <div
                          key={dayIdx}
                          onClick={() => handleDayClick(date)}
                          className={`flex flex-col items-center justify-start ${cellHeight} ${hasEvents ? 'cursor-pointer' : 'cursor-default'} group relative`}
                        >
                          <span className={`${badgeSize} flex items-center justify-center rounded-full font-bold transition-colors ${
                            isToday
                              ? 'bg-purple-600 text-white'
                              : hasEvents
                                ? 'text-[#001a33] font-black group-hover:bg-purple-50'
                                : 'text-slate-400'
                          }`}>
                            {date.getDate()}
                          </span>
                          <div className="flex gap-0.5 mt-0.5 h-1.5 items-center">
                            {dayEvents.slice(0, 3).map((ev, i) => (
                              <div
                                key={i}
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: getTypeColor(ev.typeId) }}
                              />
                            ))}
                            {dayEvents.length > 3 && <div className="w-1 h-1 rounded-full bg-slate-300" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {monthEventsList.length > 0 && (
                    <div className="mt-auto pt-3 border-t border-slate-100">
                      <div className="space-y-2">
                        {monthEventsList.map(event => (
                          <div key={event.id} className="flex items-center gap-2 text-xs">
                            <div
                              className="w-5 h-5 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                              style={{ backgroundColor: getTypeColor(event.typeId) }}
                            >
                              {event.date.split('-')[2]}
                            </div>
                            <span className="text-slate-600 font-medium truncate w-full" title={event.title}>
                              {event.title}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Coluna Direita: Sidebar (3 cols) */}
        <div className="lg:col-span-3">
          <div
            className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm p-6 flex flex-col sticky top-4"
            style={{ maxHeight: 'calc(100vh - 200px)', overflow: 'hidden' }}
          >
            {/* Header da Sidebar */}
            <div className="mb-5 shrink-0">
              <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center mb-3">
                <CalendarDays size={20} />
              </div>
              <h3 className="text-base font-black text-[#001a33] uppercase tracking-tight leading-none">
                Agenda {currentYear}
              </h3>
              <p className="text-[10px] text-slate-400 font-medium mt-1">
                Seus eventos e compromissos
              </p>
            </div>

            {/* Lista de Eventos (scrollável) */}
            <div className="flex-1 overflow-y-auto custom-scrollbar mb-5 pr-1 min-h-0">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 sticky top-0 bg-white py-1 z-10">
                Todos os Eventos
              </h4>

              {sidebarEvents.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <Clock size={22} className="mx-auto text-slate-300 mb-2" />
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Nenhum evento este ano</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {sidebarEvents.map(event => {
                    const typeColor = getTypeColor(event.typeId);
                    const typeName = getTypeName(event.typeId);
                    return (
                      <div
                        key={event.id}
                        className="flex gap-3 items-start p-3 rounded-xl bg-slate-50 hover:bg-purple-50 transition-colors border border-transparent hover:border-purple-100 group cursor-default"
                      >
                        <div className="flex flex-col items-center min-w-[36px]">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider group-hover:text-purple-500">
                            {formatDateShort(event.date)}
                          </span>
                          <div className="w-1.5 h-1.5 rounded-full mt-1" style={{ backgroundColor: typeColor }} />
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <p className="text-xs font-bold text-[#001a33] truncate" title={event.title}>
                            {event.title}
                          </p>
                          {event.description && (
                            <p className="text-[9px] text-slate-400 mt-0.5 truncate font-medium" title={event.description}>
                              {event.description}
                            </p>
                          )}
                          <span
                            className="inline-block text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded mt-1"
                            style={{ backgroundColor: `${typeColor}20`, color: typeColor }}
                          >
                            {typeName}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Legenda — fixada no rodapé */}
            <div className="shrink-0 pt-4 border-t border-slate-100">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Legenda</h4>
              <div className="flex flex-wrap gap-2">
                {eventTypes.map(type => (
                  <div key={type.id} className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: type.color }} />
                    <span className="text-[10px] font-bold text-slate-600 truncate max-w-[80px]">{type.label}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-1.5 bg-slate-50 rounded-xl px-3 py-2">
                <Info size={10} className="shrink-0 text-slate-400" />
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                  Somente leitura
                </p>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Modal de Detalhe do Dia */}
      {isModalOpen && selectedDate && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="bg-white rounded-[2.5rem] p-8 max-w-md w-full border border-slate-100 shadow-2xl relative animate-fadeIn"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-full transition-colors"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center">
                <CalendarDays size={20} />
              </div>
              <div>
                <h4 className="text-base font-black text-[#001a33]">
                  {selectedDate.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                </h4>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Eventos do dia</p>
              </div>
            </div>

            <div className="space-y-3">
              {getEventsForDay(selectedDate).map(event => (
                <div key={event.id} className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50">
                  <div className="flex items-start gap-3">
                    <div
                      className="w-3 h-3 rounded-full shrink-0 mt-1"
                      style={{ backgroundColor: getTypeColor(event.typeId) }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-[#001a33]">{event.title}</p>
                      {event.description && (
                        <p className="text-[10px] text-slate-500 mt-1 font-medium leading-relaxed">{event.description}</p>
                      )}
                      <div className="flex items-center gap-1 mt-2">
                        <Tag size={9} className="text-slate-400" />
                        <span
                          className="text-[9px] font-black uppercase tracking-widest"
                          style={{ color: getTypeColor(event.typeId) }}
                        >
                          {getTypeName(event.typeId)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex items-center gap-1.5 bg-slate-50 rounded-xl px-3 py-2">
              <Info size={11} className="shrink-0 text-slate-400" />
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                Agenda somente leitura — eventos gerenciados pela coordenação
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarioReadOnly;
