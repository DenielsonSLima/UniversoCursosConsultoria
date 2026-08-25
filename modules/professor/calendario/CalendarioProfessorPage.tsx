import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getBrazilianOfficialEvents,
  OFFICIAL_EVENT_TYPES,
  toDateKey,
} from '../../gestor/calendario/calendario.official';
import { createAnnualCalendarPdf } from '../../gestor/calendario/calendario.pdf';
import { calendarioService } from '../../gestor/calendario/calendario.service';
import type { CalendarEvent, EventType } from '../../gestor/calendario/calendario.types';
import AgendaWorkspace from '../../gestor/calendario/components/AgendaWorkspace';
import CalendarPdfPreviewModal from '../../gestor/calendario/components/CalendarPdfPreviewModal';
import EventModal from '../../gestor/calendario/components/EventModal';
import {
  professorCalendarQueryKey,
  professorCalendarQueryOptions,
} from './calendario-professor.queries';
import { useProfessorCalendarRealtime } from './useProfessorCalendarRealtime';

interface CalendarioProfessorPageProps {
  professorId: string;
  poloId: string;
}

const escapeICS = (value: string) => value
  .replace(/\\/g, '\\\\')
  .replace(/\n/g, '\\n')
  .replace(/,/g, '\\,')
  .replace(/;/g, '\\;');

const CalendarioProfessorPage: React.FC<CalendarioProfessorPageProps> = ({
  professorId,
  poloId,
}) => {
  const today = useMemo(() => new Date(), []);
  const queryClient = useQueryClient();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonthIndex, setCurrentMonthIndex] = useState(today.getMonth());
  const [focusedDate, setFocusedDate] = useState(today);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTurmaId, setSelectedTurmaId] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [pdfPreview, setPdfPreview] = useState<{ url: string; fileName: string } | null>(null);

  const { data, isLoading } = useQuery(professorCalendarQueryOptions(professorId, poloId));
  const persistedAndClassEvents = data?.events || [];
  const eventTypes = data?.eventTypes || [];
  const turmas = data?.turmas || [];
  useProfessorCalendarRealtime(professorId, poloId);

  useEffect(() => {
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

  const personalEventTypeOptions = useMemo(
    () => allEventTypes.filter(type => ['pes', 'evt', 'ped', 'inst'].includes(type.id)),
    [allEventTypes],
  );

  const officialEvents = useMemo(
    () => getBrazilianOfficialEvents(currentYear),
    [currentYear],
  );

  const visibleEvents = useMemo(
    () => [
      ...persistedAndClassEvents.filter(event => (
        !selectedTurmaId || event.turmaId === selectedTurmaId
      )),
      ...officialEvents,
    ]
      .filter(event => !selectedCategoryId || event.typeId === selectedCategoryId)
      .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'pt-BR')),
    [officialEvents, persistedAndClassEvents, selectedCategoryId, selectedTurmaId],
  );

  const visibleYearEvents = useMemo(
    () => visibleEvents.filter(event => event.date.startsWith(`${currentYear}-`)),
    [currentYear, visibleEvents],
  );

  const monthEvents = useMemo(
    () => visibleYearEvents.filter(event => Number(event.date.slice(5, 7)) === currentMonthIndex + 1),
    [currentMonthIndex, visibleYearEvents],
  );

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    visibleEvents.forEach(event => {
      const current = map.get(event.date) || [];
      current.push(event);
      map.set(event.date, current);
    });
    return map;
  }, [visibleEvents]);

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
    await calendarioService.addEvent({
      ...event,
      poloId,
      professorId,
      turmaId: null,
      visibility: 'PERSONAL',
    }, poloId);
    await queryClient.invalidateQueries({
      queryKey: professorCalendarQueryKey(professorId, poloId),
    });
  };

  const handleDeleteEvent = async (id: string) => {
    const event = persistedAndClassEvents.find(item => item.id === id);
    if (!event || event.visibility !== 'PERSONAL' || event.professorId !== professorId) return;

    await calendarioService.deleteEvent(id);
    await queryClient.invalidateQueries({
      queryKey: professorCalendarQueryKey(professorId, poloId),
    });
  };

  const exportToICS = () => {
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Universo Cursos//Agenda do Professor//PT-BR',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
    ];

    visibleYearEvents.forEach(event => {
      const nextDate = new Date(`${event.date}T12:00:00`);
      nextDate.setDate(nextDate.getDate() + 1);
      lines.push(
        'BEGIN:VEVENT',
        `UID:${escapeICS(event.id)}-${currentYear}@universocursos.com.br`,
        `DTSTART;VALUE=DATE:${event.date.replace(/-/g, '')}`,
        `DTEND;VALUE=DATE:${toDateKey(nextDate).replace(/-/g, '')}`,
        `SUMMARY:${escapeICS(event.title)}`,
        `DESCRIPTION:${escapeICS(event.description || '')}`,
        'END:VEVENT',
      );
    });
    lines.push('END:VCALENDAR');

    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `minha-agenda-${currentYear}.ics`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportToCSV = () => {
    const headers = ['Data', 'Evento', 'Categoria', 'Turma', 'Descrição'];
    const rows = visibleYearEvents.map(event => [
      event.date,
      event.title,
      getTypeInfo(event.typeId).label,
      event.turmaName || 'Geral/pessoal',
      event.description || '',
    ]);
    const content = [headers, ...rows]
      .map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([`\ufeff${content}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `minha-agenda-${currentYear}.csv`;
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
      setPdfPreview({ url, fileName: `minha-agenda-${currentYear}.pdf` });
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <>
      <AgendaWorkspace
        variant="professor"
        currentYear={currentYear}
        currentMonthIndex={currentMonthIndex}
        today={today}
        focusedDate={focusedDate}
        events={visibleEvents}
        monthEvents={monthEvents}
        eventsByDate={eventsByDate}
        eventTypes={allEventTypes}
        teachers={[]}
        turmas={turmas}
        selectedTeacherId=""
        selectedTurmaId={selectedTurmaId}
        selectedCategoryId={selectedCategoryId}
        isLoading={isLoading}
        isExportingPdf={isExportingPdf}
        getTypeInfo={getTypeInfo}
        onTeacherChange={() => undefined}
        onTurmaChange={setSelectedTurmaId}
        onCategoryChange={setSelectedCategoryId}
        onClearFilters={() => {
          setSelectedTurmaId('');
          setSelectedCategoryId('');
        }}
        onMonthChange={monthIndex => focusMonth(currentYear, monthIndex)}
        onChangeMonth={changeMonth}
        onFocusDate={setFocusedDate}
        onOpenDate={openDay}
        onExportCsv={exportToCSV}
        onExportIcs={exportToICS}
        onExportPdf={exportToPDF}
      />

      {selectedDate ? (
        <EventModal
          variant="professor"
          professorId={professorId}
          isOpen={isEventModalOpen}
          onClose={() => setIsEventModalOpen(false)}
          selectedDate={selectedDate}
          eventsOnDate={eventsByDate.get(toDateKey(selectedDate)) || []}
          eventTypes={allEventTypes}
          eventTypeOptions={personalEventTypeOptions}
          teachers={[]}
          turmas={turmas}
          canDeleteEvent={event => (
            event.visibility === 'PERSONAL'
            && event.professorId === professorId
          )}
          onAddEvent={handleAddEvent}
          onDeleteEvent={handleDeleteEvent}
        />
      ) : null}

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

export default CalendarioProfessorPage;
