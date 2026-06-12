
import { CalendarEvent, EventType, DEFAULT_EVENT_TYPES } from './calendario.types';

// Mock Events
let mockEvents: CalendarEvent[] = [
  {
    id: '1',
    title: 'Início das Aulas',
    description: 'Boas vindas aos alunos veteranos e calouros.',
    date: new Date().toISOString().split('T')[0],
    typeId: 'ped'
  },
  {
    id: '2',
    title: 'Reunião de Pais',
    description: 'Apresentação do semestre letivo.',
    date: '2024-03-10',
    typeId: 'inst'
  }
];

// Mock Types (Inicia com os padrões)
let mockTypes: EventType[] = [...DEFAULT_EVENT_TYPES];

export const calendarioService = {
  // --- Eventos ---
  async getEvents() {
    return new Promise<CalendarEvent[]>((resolve) => {
      setTimeout(() => resolve(mockEvents), 300);
    });
  },

  async addEvent(event: Omit<CalendarEvent, 'id'>) {
    return new Promise<CalendarEvent>((resolve) => {
      setTimeout(() => {
        const newEvent = { ...event, id: Math.random().toString(36).substr(2, 9) };
        mockEvents.push(newEvent);
        resolve(newEvent);
      }, 300);
    });
  },

  async deleteEvent(id: string) {
    return new Promise<void>((resolve) => {
        setTimeout(() => {
            mockEvents = mockEvents.filter(e => e.id !== id);
            resolve();
        }, 300);
    });
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
