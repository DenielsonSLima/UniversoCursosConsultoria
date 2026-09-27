const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const BRAZILIAN_DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const BRAZILIAN_MONTH_YEAR_PATTERN = /^(\d{2})\/(\d{4})$/;
const ISO_MONTH_YEAR_PATTERN = /^(\d{4})-(\d{2})$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T/;
const CARTEIRINHA_TIME_ZONE = 'America/Maceio';

const isValidDateParts = (year: number, month: number, day: number) => {
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year
    && probe.getUTCMonth() === month - 1
    && probe.getUTCDate() === day;
};

const isValidMonth = (month: number) => month >= 1 && month <= 12;

/**
 * Formata datas apenas na fronteira de apresentação da carteirinha. O valor
 * canônico continua intacto no payload e no registro de emissão.
 */
export const formatCarteirinhaDate = (value: unknown): string => {
  const raw = String(value ?? '').trim();
  if (!raw) return raw;

  const dateOnly = DATE_ONLY_PATTERN.exec(raw);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return isValidDateParts(Number(year), Number(month), Number(day))
      ? `${day}/${month}/${year}`
      : raw;
  }

  if (BRAZILIAN_DATE_PATTERN.test(raw)) return raw;

  if (ISO_TIMESTAMP_PATTERN.test(raw)) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return new Intl.DateTimeFormat('pt-BR', {
        timeZone: CARTEIRINHA_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(parsed);
    }
  }

  return raw;
};

/** Competências e validades sem dia são exibidas como MM/AAAA. */
export const formatCarteirinhaMonthYear = (value: unknown): string => {
  const formattedDate = formatCarteirinhaDate(value);
  const brazilianDate = BRAZILIAN_DATE_PATTERN.exec(formattedDate);
  if (brazilianDate) return `${brazilianDate[2]}/${brazilianDate[3]}`;

  const isoMonthYear = ISO_MONTH_YEAR_PATTERN.exec(formattedDate);
  if (isoMonthYear && isValidMonth(Number(isoMonthYear[2]))) {
    return `${isoMonthYear[2]}/${isoMonthYear[1]}`;
  }

  const brazilianMonthYear = BRAZILIAN_MONTH_YEAR_PATTERN.exec(formattedDate);
  if (brazilianMonthYear && isValidMonth(Number(brazilianMonthYear[1]))) {
    return formattedDate;
  }

  return formattedDate;
};
