const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const parseLiberacaoDate = (liberacaoDate?: string | null) => {
  const [monthStr, dayStr] = String(liberacaoDate || '03-01').split('-');
  const month = Number.parseInt(monthStr, 10);
  const day = Number.parseInt(dayStr, 10);

  return {
    month: Number.isFinite(month) && month >= 1 && month <= 12 ? month : 3,
    day: Number.isFinite(day) && day >= 1 && day <= 31 ? day : 1,
  };
};

export const getIrpfReleaseDate = (calendarYear: number, liberacaoDate?: string | null) => {
  const { month, day } = parseLiberacaoDate(liberacaoDate);
  return new Date(calendarYear + 1, month - 1, day);
};

export const isIrpfYearReleased = (
  calendarYear: number,
  liberacaoDate?: string | null,
  now = new Date()
) => now.getTime() >= getIrpfReleaseDate(calendarYear, liberacaoDate).getTime();

export const formatIrpfReleaseDate = (calendarYear: number, liberacaoDate?: string | null) => {
  const { month, day } = parseLiberacaoDate(liberacaoDate);
  return `${String(day).padStart(2, '0')} de ${MONTH_NAMES[month - 1]} de ${calendarYear + 1}`;
};

export const getDefaultIrpfCalendarYear = (liberacaoDate?: string | null, now = new Date()) => {
  const previousYear = now.getFullYear() - 1;
  return isIrpfYearReleased(previousYear, liberacaoDate, now) ? previousYear : previousYear - 1;
};

export const getIrpfCalendarYearOptions = (
  liberacaoDate?: string | null,
  now = new Date(),
  yearsBack = 10
) => {
  const currentYear = now.getFullYear();
  return Array.from({ length: yearsBack + 1 }, (_, index) => currentYear - index).map((year) => ({
    year,
    released: isIrpfYearReleased(year, liberacaoDate, now),
    releaseLabel: formatIrpfReleaseDate(year, liberacaoDate),
  }));
};
