
export interface EventType {
  id: string;
  label: string;
  color: string; // Hex code
  isSystem?: boolean; // Se true, não pode ser deletado (ex: Feriado)
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  date: string; // YYYY-MM-DD
  typeId: string; // Referência ao EventType
}

// Dados iniciais padrão (Seed)
export const DEFAULT_EVENT_TYPES: EventType[] = [
  { id: 'inst', label: 'Institucional', color: '#001a33', isSystem: true },
  { id: 'ped', label: 'Pedagógico', color: '#059669', isSystem: true },
  { id: 'fer', label: 'Feriado', color: '#dc2626', isSystem: true },
  { id: 'fin', label: 'Financeiro', color: '#7c3aed', isSystem: false },
  { id: 'evt', label: 'Eventos', color: '#d97706', isSystem: false },
];
