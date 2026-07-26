import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { getBrazilianOfficialEvents, OFFICIAL_EVENT_TYPES, toDateKey } from './calendario.official';
import { createAnnualCalendarPdf } from './calendario.pdf';
import { gestorCalendarQueryOptions } from './calendario.queries';
import { calendarioService } from './calendario.service';
import type { CalendarEvent, EventType } from './calendario.types';
import AgendaWorkspace from './components/AgendaWorkspace';
import CalendarPdfPreviewModal from './components/CalendarPdfPreviewModal';
import EventModal from './components/EventModal';
import TypeManagerModal from './components/TypeManagerModal';

const escapeICS = (value: string) => value
  .replace(/\\/g, '\\\\')
  .replace(/\n/g, '\\n')
  .replace(/,/g, '\\,')
  .replace(/;/g, '\\;');

interface CalendarioPageProps {
  poloId?: string | null;
}

const CalendarioPage: React.FC<CalendarioPageProps> = ({ poloId }) => {
  const today = useMemo(() => new Date(), []);
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonthIndex, setCurrentMonthIndex] = useState(today.getMonth());
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [pdfPreview, setPdfPreview] = useState<{ url: string; fileName: string } | null>(null);

  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [selectedTurmaId, setSelectedTurmaId] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');

  const [focusedDate, setFocusedDate] = useState(today);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [isTypeManagerOpen, setIsTypeManagerOpen] = useState(false);

  const {
    data: calendarData,
    isLoading,
    refetch: refetchCalendar,
  } = useQuery(gestorCalendarQueryOptions(poloId));
  const events = calendarData?.events || [];
  const eventTypes = calendarData?.eventTypes || [];
  const teachers = calendarData?.teachers || [];
  const turmas = calendarData?.turmas || [];

  useEffect(() => {
    setSelectedTeacherId('');
    setSelectedTurmaId('');
    setSelectedCategoryId('');
  }, [poloId]);

  useEffect(() => () => {
    if (pdfPreview?.url) URL.revokeObjectURL(pdfPreview.url);
  }, [pdfPreview]);

  const allEventTypes = useMemo(() => {
    const typeMap = new Map<string, EventType>();
    OFFICIAL_EVENT_TYPES.forEach(type => typeMap.set(type.id, type));
    eventTypes.forEach(type => typeMap.set(type.id, type));
    return Array.from(typeMap.values());
  }, [eventTypes]);

  const officialEvents = useMemo(
    () => getBrazilianOfficialEvents(currentYear),
    [currentYear],
  );

  const filteredAcademicEvents = useMemo(() => events.filter(event => {
    if (selectedTeacherId && event.professorId !== selectedTeacherId) return false;
    if (selectedTurmaId && event.turmaId !== selectedTurmaId) return false;
    if (selectedCategoryId && event.typeId !== selectedCategoryId) return false;
    return true;
  }), [events, selectedTeacherId, selectedTurmaId, selectedCategoryId]);

  const filteredOfficialEvents = useMemo(
    () => officialEvents.filter(event => !selectedCategoryId || event.typeId === selectedCategoryId),
    [officialEvents, selectedCategoryId],
  );

  const visibleYearEvents = useMemo(
    () => [...filteredAcademicEvents, ...filteredOfficialEvents]
      .filter(event => event.date.startsWith(`${currentYear}-`))
      .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'pt-BR')),
    [currentYear, filteredAcademicEvents, filteredOfficialEvents],
  );

  const visibleFilteredEvents = useMemo(
    () => [...filteredAcademicEvents, ...filteredOfficialEvents]
      .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'pt-BR')),
    [filteredAcademicEvents, filteredOfficialEvents],
  );

  const monthEvents = useMemo(
    () => visibleYearEvents.filter(event => Number(event.date.slice(5, 7)) === currentMonthIndex + 1),
    [currentMonthIndex, visibleYearEvents],
  );

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    visibleFilteredEvents.forEach(event => {
      const dateEvents = map.get(event.date) || [];
      dateEvents.push(event);
      map.set(event.date, dateEvents);
    });
    return map;
  }, [visibleFilteredEvents]);

  const getTypeInfo = useCallback((typeId: string): EventType => (
    allEventTypes.find(type => type.id === typeId)
    || { id: 'other', label: 'Outro', color: '#94a3b8' }
  ), [allEventTypes]);

  const focusMonth = (year: number, monthIndex: number) => {
    setCurrentYear(year);
    setCurrentMonthIndex(monthIndex);
    setFocusedDate(new Date(year, monthIndex, 1));
  };

  const changeMonth = (direction: -1 | 1) => {
    const nextMonth = new Date(currentYear, currentMonthIndex + direction, 1);
    focusMonth(nextMonth.getFullYear(), nextMonth.getMonth());
  };

  const openDay = (date: Date) => {
    setFocusedDate(date);
    setSelectedDate(date);
    setIsEventModalOpen(true);
  };

  const handleAddEvent = async (event: Omit<CalendarEvent, 'id'>) => {
    await calendarioService.addEvent(event);
    await refetchCalendar();
  };

  const handleDeleteEvent = async (id: string) => {
    if (id.startsWith('official-') || id.startsWith('class-')) return;
    await calendarioService.deleteEvent(id);
    await refetchCalendar();
  };

  const handleAddType = async (data: { label: string; color: string }) => {
    await calendarioService.createEventType(data);
    await refetchCalendar();
  };

  const handleDeleteType = async (id: string) => {
    await calendarioService.deleteEventType(id);
    await refetchCalendar();
  };

  const handleUpdateTypeColor = async (id: string, color: string) => {
    await calendarioService.updateEventType(id, { color });
    await refetchCalendar();
  };

  const exportToICS = () => {
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Universo Cursos//Calendario//PT-BR',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
    ];

    visibleYearEvents.forEach(event => {
      const dateRaw = event.date.replace(/-/g, '');
      const nextDate = new Date(`${event.date}T12:00:00`);
      nextDate.setDate(nextDate.getDate() + 1);
      const type = getTypeInfo(event.typeId);
      lines.push(
        'BEGIN:VEVENT',
        `UID:${escapeICS(event.id)}-${currentYear}@universocursos.com.br`,
        `DTSTART;VALUE=DATE:${dateRaw}`,
        `DTEND;VALUE=DATE:${toDateKey(nextDate).replace(/-/g, '')}`,
        `SUMMARY:${escapeICS(event.title)}`,
        `DESCRIPTION:${escapeICS(`${event.description || ''} Categoria: ${type.label}`.trim())}`,
        'END:VEVENT',
      );
    });
    lines.push('END:VCALENDAR');

    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `calendario-universo-${currentYear}.ics`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportToCSV = () => {
    const headers = ['Data', 'Evento', 'Categoria', 'Professor', 'Turma', 'Descrição'];
    const rows = visibleYearEvents.map(event => {
      const teacher = event.professorName || teachers.find(item => item.id === event.professorId)?.nome || 'Geral';
      const turma = event.turmaName || turmas.find(item => item.id === event.turmaId)?.nome || 'Geral';
      return [event.date, event.title, getTypeInfo(event.typeId).label, teacher, turma, event.description || ''];
    });
    const content = [headers, ...rows]
      .map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([`\ufeff${content}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `agenda-universo-${currentYear}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportToPDF = () => {
    setIsExportingPdf(true);
    try {
      const document = createAnnualCalendarPdf({
        year: currentYear,
        events: visibleYearEvents,
        eventTypes: allEventTypes,
      });
      const url = URL.createObjectURL(document.blob);
      setPdfPreview({ url, fileName: document.fileName });
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <>
      <AgendaWorkspace
        currentYear={currentYear}
        currentMonthIndex={currentMonthIndex}
        today={today}
        focusedDate={focusedDate}
        events={visibleFilteredEvents}
        monthEvents={monthEvents}
        eventsByDate={eventsByDate}
        eventTypes={allEventTypes}
        teachers={teachers}
        turmas={turmas}
        selectedTeacherId={selectedTeacherId}
        selectedTurmaId={selectedTurmaId}
        selectedCategoryId={selectedCategoryId}
        isLoading={isLoading}
        isExportingPdf={isExportingPdf}
        getTypeInfo={getTypeInfo}
        onTeacherChange={setSelectedTeacherId}
        onTurmaChange={setSelectedTurmaId}
        onCategoryChange={setSelectedCategoryId}
        onClearFilters={() => {
          setSelectedTeacherId('');
          setSelectedTurmaId('');
          setSelectedCategoryId('');
        }}
        onMonthChange={monthIndex => focusMonth(currentYear, monthIndex)}
        onChangeMonth={changeMonth}
        onFocusDate={setFocusedDate}
        onOpenDate={openDay}
        onManageTypes={() => setIsTypeManagerOpen(true)}
        onExportCsv={exportToCSV}
        onExportIcs={exportToICS}
        onExportPdf={exportToPDF}
      />

      {selectedDate ? (
        <EventModal
          isOpen={isEventModalOpen}
          onClose={() => setIsEventModalOpen(false)}
          selectedDate={selectedDate}
          eventsOnDate={eventsByDate.get(toDateKey(selectedDate)) || []}
          eventTypes={allEventTypes}
          teachers={teachers}
          turmas={turmas}
          onAddEvent={handleAddEvent}
          onDeleteEvent={handleDeleteEvent}
        />
      ) : null}

      <TypeManagerModal
        isOpen={isTypeManagerOpen}
        onClose={() => setIsTypeManagerOpen(false)}
        types={eventTypes}
        onAddType={handleAddType}
        onUpdateTypeColor={handleUpdateTypeColor}
        onDeleteType={handleDeleteType}
      />

      {pdfPreview ? (
        <CalendarPdfPreviewModal
          url={pdfPreview.url}
          fileName={pdfPreview.fileName}
          year={currentYear}
          onClose={() => setPdfPreview(null)}
        />
      ) : null}
    </>
  );
};

export default CalendarioPage;
