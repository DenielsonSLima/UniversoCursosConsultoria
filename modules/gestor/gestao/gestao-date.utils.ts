export interface CivilDateParts {
  year: number;
  month: number;
  day: number;
}

export const parseCivilDate = (value?: string | null): CivilDateParts | null => {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const reference = new Date(Date.UTC(year, month - 1, day));

  if (
    reference.getUTCFullYear() !== year
    || reference.getUTCMonth() + 1 !== month
    || reference.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
};

export const formatCivilDate = (value?: string | null, fallback = '—') => {
  const parts = parseCivilDate(value);
  if (!parts) return fallback;

  return `${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}/${parts.year}`;
};
