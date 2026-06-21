
import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Share2, Download } from 'lucide-react';
import { calendarioService } from './calendario.service';
import { CalendarEvent, EventType } from './calendario.types';
import EventModal from './components/EventModal';
import CalendarSidebar from './components/CalendarSidebar';
import TypeManagerModal from './components/TypeManagerModal';
import { supabase } from '../../../lib/supabase';

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

const CalendarioPage: React.FC = () => {
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  
  // Data lists for filters
  const [teachers, setTeachers] = useState<any[]>([]);
  const [turmas, setTurmas] = useState<any[]>([]);

  // Filter states
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<string>('');
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [selectedTurmaId, setSelectedTurmaId] = useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [isTypeManagerOpen, setIsTypeManagerOpen] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const eventsData = await calendarioService.getEvents();
      const typesData = await calendarioService.getEventTypes();

      // Fetch teachers and turmas lists for filters & modal
      const { data: dbTeachers } = await supabase
        .from('parceiros')
        .select('id, nome')
        .eq('tipo', 'Professor')
        .eq('status', 'ATIVO')
        .order('nome', { ascending: true });

      const { data: dbTurmas } = await supabase
        .from('turmas')
        .select('id, nome, codigo')
        .order('nome', { ascending: true });

      setTeachers(dbTeachers || []);
      setTurmas(dbTurmas || []);

      // 1. Buscar aulas agendadas da tabela aulas_turma
      const { data: dbAulas, error: errorAulas } = await supabase
        .from('aulas_turma')
        .select(`
          id,
          titulo,
          carga_horaria,
          data_aula,
          turma_id,
          disciplina_id,
          turmas ( nome ),
          disciplinas ( nome )
        `)
        .not('data_aula', 'is', null);

      let classEvents: CalendarEvent[] = [];

      if (!errorAulas && dbAulas && dbAulas.length > 0) {
        // 2. Buscar configurações de professor para as turmas e disciplinas
        const { data: dbConfigs } = await supabase
          .from('turmas_disciplinas')
          .select('turma_id, disciplina_id, professor_nome, professor_id');

        // Mapeia (turma_id-disciplina_id) para nome do professor
        const configMap: Record<string, { nome: string; id: string | null }> = {};
        dbConfigs?.forEach(c => {
          configMap[`${c.turma_id}-${c.disciplina_id}`] = {
            nome: c.professor_nome || 'Não atribuído',
            id: c.professor_id || null
          };
        });

        // 3. Mapear aulas para o formato CalendarEvent
        classEvents = dbAulas.map((a: any) => {
          const key = `${a.turma_id}-${a.disciplina_id}`;
          const config = configMap[key] || { nome: 'Não atribuído', id: null };
          const profName = config.nome;
          const profId = config.id;
          const turmaNome = a.turmas?.nome || 'Turma';
          const discNome = a.disciplinas?.nome || 'Disciplina';

          return {
            id: `class-${a.id}`,
            title: `${turmaNome} - ${discNome}`,
            description: `Aula: ${a.titulo} (${a.carga_horaria}H) - Prof. ${profName}`,
            date: a.data_aula, // YYYY-MM-DD
            typeId: 'ped', // Associa à categoria 'Pedagógico'
            professorId: profId,
            turmaId: a.turma_id
          };
        });
      }

      // Combina eventos de calendário normais + aulas operacionais
      setEvents([...eventsData, ...classEvents]);
      setEventTypes(typesData);
    } catch (err) {
      console.error("Erro ao carregar eventos do calendário:", err);
    }
  };

  // Filter events reactively
  const filteredEvents = useMemo(() => {
    return events.filter(e => {
      if (selectedTeacherId && e.professorId !== selectedTeacherId) return false;
      if (selectedTurmaId && e.turmaId !== selectedTurmaId) return false;
      if (selectedCategoryId && e.typeId !== selectedCategoryId) return false;
      return true;
    });
  }, [events, selectedTeacherId, selectedTurmaId, selectedCategoryId]);

  // Export as ICS (iCalendar)
  const exportToICS = () => {
    const icsLines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Universo Cursos//Agenda//PT-BR',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH'
    ];

    filteredEvents.forEach(e => {
      const type = eventTypes.find(t => t.id === e.typeId)?.label || 'Outro';
      const dateRaw = e.date.replace(/-/g, '');
      const uid = `event-${e.id}@universo.com`;
      const desc = e.description || '';

      icsLines.push('BEGIN:VEVENT');
      icsLines.push(`UID:${uid}`);
      icsLines.push(`DTSTAMP:${dateRaw}T000000Z`);
      icsLines.push(`DTSTART;VALUE=DATE:${dateRaw}`);
      icsLines.push(`DTEND;VALUE=DATE:${dateRaw}`);
      icsLines.push(`SUMMARY:${e.title}`);
      icsLines.push(`DESCRIPTION:${desc} [Categoria: ${type}]`);
      icsLines.push('END:VEVENT');
    });

    icsLines.push('END:VCALENDAR');

    const blob = new Blob([icsLines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    link.download = `agenda-${currentYear}.ics`;
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export as CSV
  const exportToCSV = () => {
    const headers = ['Data', 'Evento', 'Categoria', 'Professor', 'Turma', 'Descricao'];
    const rows = filteredEvents.map(e => {
      const type = eventTypes.find(t => t.id === e.typeId)?.label || 'Outro';
      const teacher = teachers.find(t => t.id === e.professorId)?.nome || 'Geral';
      const classObj = turmas.find(t => t.id === e.turmaId)?.nome || 'Geral';
      return [
        e.date,
        e.title,
        type,
        teacher,
        classObj,
        e.description || ''
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(val => `"${val.replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    link.download = `agenda-${currentYear}.csv`;
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
    return filteredEvents.filter(e => e.date === dateStr);
  };

  // Retorna eventos ordenados para o mês específico para a lista inferior
  const getEventsForMonthList = (monthIndex: number) => {
    return filteredEvents.filter(e => {
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

  const isMonthFiltered = selectedMonthIndex !== '';
  const monthsToRender = isMonthFiltered ? [parseInt(selectedMonthIndex, 10)] : Array.from({ length: 12 }, (_, i) => i);

  return (
    <div className="max-w-full mx-auto animate-fadeIn min-h-screen pb-10">
      
      {/* Barra de Filtros e Exportação */}
      <div className="bg-white p-5 rounded-[2.5rem] border border-slate-100 shadow-sm mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        
        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Mês dropdown */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">Foco Mensal</span>
            <select
              className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-500 cursor-pointer min-w-[140px]"
              value={selectedMonthIndex}
              onChange={(e) => setSelectedMonthIndex(e.target.value)}
            >
              <option value="">Todos os meses</option>
              {MONTHS.map((m, idx) => (
                <option key={idx} value={idx}>{m}</option>
              ))}
            </select>
          </div>

          {/* Professor dropdown */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">Professor</span>
            <select
              className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-500 cursor-pointer min-w-[165px] truncate max-w-[200px]"
              value={selectedTeacherId}
              onChange={(e) => setSelectedTeacherId(e.target.value)}
            >
              <option value="">Todos os professores</option>
              {teachers.map(t => (
                <option key={t.id} value={t.id}>{t.nome}</option>
              ))}
            </select>
          </div>

          {/* Turma dropdown */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">Turma</span>
            <select
              className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-500 cursor-pointer min-w-[165px] truncate max-w-[200px]"
              value={selectedTurmaId}
              onChange={(e) => setSelectedTurmaId(e.target.value)}
            >
              <option value="">Todas as turmas</option>
              {turmas.map(t => (
                <option key={t.id} value={t.id}>{t.nome}</option>
              ))}
            </select>
          </div>

          {/* Categoria dropdown */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">Categoria</span>
            <select
              className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-500 cursor-pointer min-w-[140px]"
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
            >
              <option value="">Todas as categorias</option>
              {eventTypes.map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Botões de Exportação */}
        <div className="flex gap-2 w-full md:w-auto self-end md:self-center">
          <button
            onClick={exportToCSV}
            className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-white border border-slate-200 hover:border-emerald-250 hover:text-emerald-600 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-sm"
          >
            <Download size={14} /> Exportar CSV
          </button>
          <button
            onClick={exportToICS}
            className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-lg shadow-blue-500/10"
          >
            <Share2 size={14} /> Exportar ICS
          </button>
        </div>

      </div>

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
 
            <div className={isMonthFiltered ? 'max-w-2xl mx-auto w-full' : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6'}>
                {monthsToRender.map((monthIndex) => {
                    const monthName = MONTHS[monthIndex];
                    const days = getDaysInMonth(currentYear, monthIndex);
                    const isCurrentMonth = new Date().getMonth() === monthIndex && new Date().getFullYear() === currentYear;
                    const monthEventsList = getEventsForMonthList(monthIndex);
                    const cellHeight = isMonthFiltered ? 'h-14 py-1' : 'h-9';
                    const badgeSize = isMonthFiltered ? 'w-8 h-8 text-sm' : 'w-6 h-6 text-xs';

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
                                            className={`flex flex-col items-center justify-start ${cellHeight} cursor-pointer group relative`}
                                        >
                                            <span className={`${badgeSize} flex items-center justify-center rounded-full font-bold transition-colors ${
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
                                <div className="mt-auto pt-3 border-t border-slate-550 border-slate-100">
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
                events={filteredEvents}
                teachers={teachers}
                turmas={turmas}
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
          teachers={teachers}
          turmas={turmas}
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
