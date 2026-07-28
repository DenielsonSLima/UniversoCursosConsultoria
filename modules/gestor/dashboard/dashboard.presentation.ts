import type { CalendarEvent, EventType } from '../calendario/calendario.types';

export interface DashboardDaySummary {
  dateKey: string;
  label: string;
  dayNumber: string;
  events: CalendarEvent[];
  isToday: boolean;
}

export type DashboardQuickActionMode = 'partner' | 'student-finance';
export type DashboardPartnerForm = 'aluno' | 'professor' | 'pf' | 'pj';

export const DAY_IN_MS = 24 * 60 * 60 * 1000;

export const startOfDay = (date: Date) => {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
};

export const startOfWeek = (date: Date) => {
  const result = startOfDay(date);
  const mondayOffset = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - mondayOffset);
  return result;
};

export const addDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

export const formatShortDate = (dateKey: string) => {
  const date = new Date(`${dateKey}T12:00:00`);
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
};

export const getEventTone = (typeId: string) => {
  if (typeId === 'fer') return 'bg-rose-500';
  if (typeId === 'fac') return 'bg-orange-500';
  if (typeId === 'com') return 'bg-amber-500';
  if (typeId === 'ped') return 'bg-emerald-500';
  if (typeId === 'fin') return 'bg-violet-500';
  return 'bg-blue-600';
};

export const getEventType = (eventTypes: EventType[], typeId: string) =>
  eventTypes.find((type) => type.id === typeId)?.label || 'Compromisso';

export const formatTimeAgo = (dateStr: string, now: Date) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / DAY_IN_MS);

  if (diffMins < 1) return 'Agora';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays === 1) return 'Ontem';
  return `${diffDays}d`;
};
