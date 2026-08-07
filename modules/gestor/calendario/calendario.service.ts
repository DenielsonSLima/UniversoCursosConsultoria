
import { supabase } from '../../../lib/supabase';
import {
  CalendarEvent,
  CalendarEventVisibility,
  EventType,
  DEFAULT_EVENT_TYPES,
} from './calendario.types';

// Mock Types (Inicia com os padrões)
let mockTypes: EventType[] = [...DEFAULT_EVENT_TYPES];

interface CalendarEventRow {
  id: string;
  polo_id: string;
  title: string;
  description: string | null;
  event_date: string;
  type_id: string;
  visibility: CalendarEventVisibility;
  professor_id: string | null;
  turma_id: string | null;
}

const mapEventRow = (row: CalendarEventRow): CalendarEvent => ({
  id: row.id,
  title: row.title,
  description: row.description || undefined,
  date: row.event_date,
  typeId: row.type_id,
  professorId: row.professor_id,
  turmaId: row.turma_id,
  poloId: row.polo_id,
  visibility: row.visibility,
});

const resolveVisibility = (event: Omit<CalendarEvent, 'id'>): CalendarEventVisibility => {
  if (event.visibility) return event.visibility;
  if (event.turmaId) return 'TURMA';
  if (event.professorId) return 'PROFESSOR';
  return 'GENERAL';
};

export const calendarioService = {
  // --- Eventos ---
  async getEvents(poloId?: string | null, signal?: AbortSignal) {
    let query = supabase
      .from('calendar_events')
      .select('id, polo_id, title, description, event_date, type_id, visibility, professor_id, turma_id')
      .order('event_date', { ascending: true })
      .order('title', { ascending: true });

    if (poloId) query = query.eq('polo_id', poloId);
    if (signal) query = query.abortSignal(signal);

    const { data, error } = await query;
    if (error) throw error;

    return ((data || []) as CalendarEventRow[]).map(mapEventRow);
  },

  async addEvent(event: Omit<CalendarEvent, 'id'>, poloId?: string | null) {
    const eventPoloId = poloId || event.poloId;
    if (!eventPoloId) throw new Error('Selecione um polo antes de criar o evento.');

    const visibility = resolveVisibility(event);
    const { data, error } = await supabase
      .from('calendar_events')
      .insert({
        polo_id: eventPoloId,
        title: event.title.trim(),
        description: event.description?.trim() || null,
        event_date: event.date,
        type_id: event.typeId,
        visibility,
        professor_id: event.professorId || null,
        turma_id: event.turmaId || null,
      })
      .select('id, polo_id, title, description, event_date, type_id, visibility, professor_id, turma_id')
      .single();

    if (error) throw error;
    return mapEventRow(data as CalendarEventRow);
  },

  async deleteEvent(id: string) {
    const { error } = await supabase
      .from('calendar_events')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  // --- Tipos de Eventos (Categorias) ---
  async getEventTypes() {
    return new Promise<EventType[]>((resolve) => {
        setTimeout(() => resolve(mockTypes), 300);
    });
  },

  async createEventType(type: Omit<EventType, 'id' | 'isSystem'>) {
    return new Promise<EventType>((resolve) => {
        setTimeout(() => {
            const newType = { ...type, id: Math.random().toString(36).substr(2, 9), isSystem: false };
            mockTypes.push(newType);
            resolve(newType);
        }, 300);
    });
  },

  async updateEventType(id: string, updates: Pick<EventType, 'color'>) {
    return new Promise<EventType>((resolve, reject) => {
        setTimeout(() => {
            const typeIndex = mockTypes.findIndex(type => type.id === id);
            if (typeIndex < 0) {
              reject(new Error('Categoria não encontrada.'));
              return;
            }

            mockTypes[typeIndex] = { ...mockTypes[typeIndex], ...updates };
            resolve(mockTypes[typeIndex]);
        }, 300);
    });
  },

  async deleteEventType(id: string) {
    return new Promise<void>((resolve) => {
        setTimeout(() => {
            mockTypes = mockTypes.filter(t => t.id !== id);
            // Opcional: Remover eventos desse tipo ou migrar para 'Outros'
            resolve();
        }, 300);
    });
  }
};
