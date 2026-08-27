import { getMaceioDateKey } from '../conciliacao-bancaria/conciliacao-bancaria.utils.ts';

export type ResumoPeriodPreset = 'TODAY' | 'CURRENT_MONTH' | 'CUSTOM';

export interface ResumoPeriodRange {
  start: string;
  end: string;
}

export interface ResumoMonthlyPeriod extends ResumoPeriodRange {
  mes: string;
  ano: number;
  mesNome: string;
}

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const utcDateFromKey = (dateKey: string) => {
  if (!DATE_KEY_PATTERN.test(dateKey)) throw new Error('Data financeira inválida.');
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    throw new Error('Data financeira inválida.');
  }
  return date;
};

const dateKeyFromUtcDate = (date: Date) => [
  date.getUTCFullYear(),
  String(date.getUTCMonth() + 1).padStart(2, '0'),
  String(date.getUTCDate()).padStart(2, '0'),
].join('-');

export const shiftResumoDateKey = (dateKey: string, days: number) => {
  const date = utcDateFromKey(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return dateKeyFromUtcDate(date);
};

export const getResumoMonthRange = (dateKey: string): ResumoPeriodRange => {
  const date = utcDateFromKey(dateKey);
  const year = date.getUTCFullYear();
  const monthIndex = date.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0, 12));
  return {
    start: `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`,
    end: dateKeyFromUtcDate(lastDay),
  };
};

export const getResumoPresetRange = (
  preset: Exclude<ResumoPeriodPreset, 'CUSTOM'>,
  reference: Date = new Date(),
): ResumoPeriodRange => {
  const today = getMaceioDateKey(reference);
  return preset === 'TODAY'
    ? { start: today, end: today }
    : getResumoMonthRange(today);
};

export const getResumoOverdueRange = (reference: Date = new Date()): ResumoPeriodRange => ({
  start: '1970-01-01',
  end: shiftResumoDateKey(getMaceioDateKey(reference), -1),
});

export const getResumoThreeMonthPeriods = (
  reference: Date = new Date(),
): ResumoMonthlyPeriod[] => {
  const today = utcDateFromKey(getMaceioDateKey(reference));
  const formatter = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    timeZone: 'UTC',
  });

  return [-2, -1, 0].map((offset) => {
    const month = new Date(Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth() + offset,
      1,
      12,
    ));
    const monthRange = getResumoMonthRange(dateKeyFromUtcDate(month));
    const monthName = formatter.format(month);
    return {
      ...monthRange,
      mes: String(month.getUTCMonth() + 1).padStart(2, '0'),
      ano: month.getUTCFullYear(),
      mesNome: monthName.charAt(0).toUpperCase() + monthName.slice(1),
    };
  });
};

export const validateResumoCustomRange = (range: ResumoPeriodRange) => {
  if (!range.start || !range.end) return 'Informe as datas inicial e final.';
  try {
    utcDateFromKey(range.start);
    utcDateFromKey(range.end);
  } catch {
    return 'Informe datas válidas.';
  }
  if (range.start > range.end) return 'A data inicial não pode ser posterior à data final.';
  return null;
};

export const formatResumoDate = (dateKey: string) => {
  const date = utcDateFromKey(dateKey);
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
};

export const formatResumoRange = (range: ResumoPeriodRange) => (
  range.start === range.end
    ? formatResumoDate(range.start)
    : `${formatResumoDate(range.start)} a ${formatResumoDate(range.end)}`
);
