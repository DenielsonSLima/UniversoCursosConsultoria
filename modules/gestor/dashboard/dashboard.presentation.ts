import type { CalendarEvent, EventType } from '../calendario/calendario.types';

export interface DashboardDaySummary {
  dateKey: string;
  label: string;
  dayNumber: string;
  events: CalendarEvent[];
  isToday: boolean;
}

export type DashboardQuickActionMode = 'partner' | 'student-finance';
export type DashboardPartnerForm = 'aluno' | 'professor' | 'responsavel' | 'pf' | 'pj';

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

export const getDashboardCompetencia = (date: Date) => (
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
);

export const formatDashboardCanonicalCurrency = (value: string) => {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return 'R$ 0,00';
  const [integerPart, fractionPart = ''] = value.split('.');
  const groupedInteger = new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 0,
  }).format(BigInt(integerPart));
  return `R$ ${groupedInteger},${fractionPart.padEnd(2, '0')}`;
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

const isCivilDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

export const formatTimeAgo = (dateStr: string, now: Date) => {
  const unavailable = 'Data não informada';
  if (typeof dateStr !== 'string') return unavailable;
  const dateKey = dateStr.slice(0, 10);
  if (!isCivilDate(dateKey)) return unavailable;

  // Uma data financeira não representa um instante nem muda com o fuso do navegador.
  if (dateStr === dateKey) {
    const [year, month, day] = dateKey.split('-');
    return `${day}/${month}/${year}`;
  }

  // Somente timestamps com offset explícito podem produzir uma duração.
  const timestamp = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
  if (!timestamp.test(dateStr)) return unavailable;
  const diffMs = now.getTime() - new Date(dateStr).getTime();
  if (!Number.isFinite(diffMs)) return unavailable;

  const elapsed = Math.abs(diffMs);
  const minutes = Math.floor(elapsed / 60_000);
  const hours = Math.floor(elapsed / 3_600_000);
  const days = Math.floor(elapsed / DAY_IN_MS);
  if (minutes < 1) return diffMs < 0 ? 'em instantes' : 'Agora';
  const [amount, unit] = minutes < 60
    ? [minutes, minutes === 1 ? 'minuto' : 'minutos']
    : hours < 24
      ? [hours, hours === 1 ? 'hora' : 'horas']
      : [days, days === 1 ? 'dia' : 'dias'];
  return `${diffMs < 0 ? 'em' : 'há'} ${amount} ${unit}`;
};
