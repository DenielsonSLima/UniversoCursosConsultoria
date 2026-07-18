export const PORTAL_ACCESS_TIME_ZONE = 'America/Maceio';

export interface PortalScheduleRestriction {
  dias: number[];
  horario_inicio: string;
  horario_fim: string;
  ativo: boolean;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const getZonedParts = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PORTAL_ACCESS_TIME_ZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    day: dayMap[values.weekday],
    time: `${values.hour}:${values.minute}`,
  };
};

export const isPortalScheduleBlocked = (
  restriction: PortalScheduleRestriction | null | undefined,
  now = new Date(),
): boolean => {
  if (!restriction?.ativo) return false;

  const days = Array.isArray(restriction.dias)
    ? [...new Set(restriction.dias.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))]
    : [];
  const start = String(restriction.horario_inicio || '');
  const end = String(restriction.horario_fim || '');

  // Regra ativa malformada deve falhar fechada, nunca liberar acesso por engano.
  if (days.length === 0 || !TIME_PATTERN.test(start) || !TIME_PATTERN.test(end)) return true;

  const { day, time } = getZonedParts(now);
  if (day === undefined) return true;

  if (start <= end) {
    return !days.includes(day) || time < start || time > end;
  }

  // Expedientes que atravessam a meia-noite: ex. segunda 22:00 ate terça 02:00.
  if (time >= start) return !days.includes(day);
  if (time <= end) return !days.includes((day + 6) % 7);
  return true;
};
