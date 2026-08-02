import type { CalendarEvent } from '../../gestor/calendario/calendario.types';

export const isCalendarEventVisibleToStudent = (
  event: CalendarEvent,
  turmaIds: ReadonlySet<string>,
) => {
  if (event.id.startsWith('official-')) return true;
  if (event.visibility === 'GENERAL') return true;
  return Boolean(event.turmaId && turmaIds.has(event.turmaId));
};

export const filterStudentCalendarEvents = (
  events: CalendarEvent[],
  selectedTurmaId: string,
  selectedCategoryId: string,
) => events.filter((event) => {
  if (selectedCategoryId && event.typeId !== selectedCategoryId) return false;
  if (!selectedTurmaId) return true;

  // Datas oficiais e comunicados gerais pertencem a todos, mesmo com uma turma selecionada.
  if (event.id.startsWith('official-') || event.visibility === 'GENERAL') return true;
  return event.turmaId === selectedTurmaId;
});

