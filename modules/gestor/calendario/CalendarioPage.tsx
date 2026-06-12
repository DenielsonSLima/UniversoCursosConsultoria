
import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { calendarioService } from './calendario.service';
import { CalendarEvent, EventType } from './calendario.types';
import EventModal from './components/EventModal';
import CalendarSidebar from './components/CalendarSidebar';
import TypeManagerModal from './components/TypeManagerModal';

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

const CalendarioPage: React.FC = () => {
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [isTypeManagerOpen, setIsTypeManagerOpen] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const eventsData = await calendarioService.getEvents();
    const typesData = await calendarioService.getEventTypes();
    setEvents(eventsData);
    setEventTypes(typesData);
  };

  // --- Ações de Eventos ---
  const handleAddEvent = async (event: any) => {
    await calendarioService.addEvent(event);
    loadData();
  };

  const handleDeleteEvent = async (id: string) => {
    await calendarioService.deleteEvent(id);
    loadData();
  };

  // --- Ações de Tipos (Legenda) ---
  const handleAddType = async (data: { label: string; color: string }) => {
    await calendarioService.createEventType(data);
    loadData();
  };

  const handleDeleteType = async (id: string) => {
    await calendarioService.deleteEventType(id);
    loadData();
  };

  // --- Navegação ---
  const prevYear = () => setCurrentYear(prev => prev - 1);
  const nextYear = () => setCurrentYear(prev => prev + 1);
  
  // --- Utilitários de Calendário ---
  const getDaysInMonth = (year: number, monthIndex: number) => {
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const firstDayOfWeek = new Date(year, monthIndex, 1).getDay();
    const days = [];
    for (let i = 0; i < firstDayOfWeek; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, monthIndex, i));
    return days;
  };

  const getEventsForDay = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return events.filter(e => e.date === dateStr);
  };

  // Retorna eventos ordenados para o mês específico para a lista inferior
  const getEventsForMonthList = (monthIndex: number) => {
    return events.filter(e => {
        const [y, m] = e.date.split('-');
        return parseInt(y) === currentYear && parseInt(m) === monthIndex + 1;
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  // Pega a cor do tipo pelo ID
  const getTypeColor = (typeId: string) => {
    const type = eventTypes.find(t => t.id === typeId);
    return type ? type.color : '#cbd5e1';
  };

  const handleDayClick = (date: Date) => {
    setSelectedDate(date);
    setIsEventModalOpen(true);
  };

  return (
    <div className="max-w-full mx-auto animate-fadeIn min-h-screen pb-10">
      
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Lado Esquerdo: Grid do Calendário */}
        <div className="lg:col-span-9">
            
            {/* Controles de Navegação */}
            <div className="flex justify-between items-center mb-6 bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
                <button onClick={prevYear} className="p-3 hover:bg-slate-50 rounded-xl text-slate-500 hover:text-[#001a33] transition-colors">
                    <ChevronLeft size={20} />
                </button>
                <h2 className="text-3xl font-black text-[#001a33] tracking-tighter">{currentYear}</h2>
                <button onClick={nextYear} className="p-3 hover:bg-slate-50 rounded-xl text-slate-500 hover:text-[#001a33] transition-colors">
                    <ChevronRight size={20} />
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {MONTHS.map((monthName, monthIndex) => {
                    const days = getDaysInMonth(currentYear, monthIndex);
                    const isCurrentMonth = new Date().getMonth() === monthIndex && new Date().getFullYear() === currentYear;
                    const monthEventsList = getEventsForMonthList(monthIndex);

                    return (
                        <div key={monthName} className={`bg-white rounded-3xl border p-5 transition-all hover:shadow-lg flex flex-col ${isCurrentMonth ? 'border-blue-200 shadow-blue-900/5 ring-1 ring-blue-100' : 'border-slate-100 shadow-sm'}`}>
                            <h3 className={`text-lg font-black mb-4 uppercase tracking-wide text-center ${isCurrentMonth ? 'text-blue-600' : 'text-[#001a33]'}`}>
                                {monthName}
                            </h3>

                            {/* GRID DE DIAS */}
                            <div className="grid grid-cols-7 mb-2">
                                {WEEKDAYS.map((day, i) => (
                                    <div key={i} className="text-center text-[10px] font-bold text-slate-400">
                                        {day}
                                    </div>
                                ))}
                            </div>

                            <div className="grid grid-cols-7 gap-y-2 mb-4">
                                {days.map((date, dayIdx) => {
                                    if (!date) return <div key={`empty-${dayIdx}`} className="h-8"></div>;
                                    
                                    const dayEvents = getEventsForDay(date);
                                    const hasEvents = dayEvents.length > 0;
                                    const isToday = new Date().toDateString() === date.toDateString();

                                    return (
                                        <div 
                                            key={dayIdx} 
                                            onClick={() => handleDayClick(date)}
                                            className="flex flex-col items-center justify-start h-9 cursor-pointer group relative"
                                        >
                                            <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold transition-colors ${
                                                isToday 
                                                ? 'bg-blue-600 text-white' 
                                                : hasEvents 
                                                    ? 'text-[#001a33] font-black' 
                                                    : 'text-slate-500 group-hover:bg-slate-100'
                                            }`}>
                                                {date.getDate()}
                                            </span>
                                            
                                            {/* Dots Indicadores (Visual limpo) */}
                                            <div className="flex gap-0.5 mt-0.5 h-1.5 items-center">
                                                {dayEvents.slice(0, 3).map((ev, i) => (
                                                    <div 
                                                        key={i} 
                                                        className="w-1.5 h-1.5 rounded-full" 
                                                        style={{ backgroundColor: getTypeColor(ev.typeId) }} 
                                                    />
                                                ))}
                                                {dayEvents.length > 3 && (
                                                    <div className="w-1 h-1 rounded-full bg-slate-300" />
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* LISTA DE EVENTOS DO MÊS (Rodapé) */}
                            {monthEventsList.length > 0 && (
                                <div className="mt-auto pt-3 border-t border-slate-50">
                                    <div className="space-y-2">
                                        {monthEventsList.map(event => (
                                            <div key={event.id} className="flex items-center gap-2 text-xs group cursor-default">
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

        {/* Lado Direito: Sidebar com Lista Geral e Ferramentas */}
        <div className="lg:col-span-3">
            <CalendarSidebar 
                types={eventTypes}
                events={events}
                currentYear={currentYear}
                onManageTypes={() => setIsTypeManagerOpen(true)}
            />
        </div>

      </div>

      {/* Modais */}
      {selectedDate && (
        <EventModal 
          isOpen={isEventModalOpen}
          onClose={() => setIsEventModalOpen(false)}
          selectedDate={selectedDate}
          eventsOnDate={getEventsForDay(selectedDate)}
          eventTypes={eventTypes}
          onAddEvent={handleAddEvent}
          onDeleteEvent={handleDeleteEvent}
        />
      )}

      <TypeManagerModal 
        isOpen={isTypeManagerOpen}
        onClose={() => setIsTypeManagerOpen(false)}
        types={eventTypes}
        onAddType={handleAddType}
        onDeleteType={handleDeleteType}
      />

    </div>
  );
};

export default CalendarioPage;
