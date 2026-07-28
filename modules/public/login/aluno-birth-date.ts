const PUBLIC_ALUNO_MINIMUM_AGE_YEARS = 10;

const toLocalIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseIsoDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);

  if (
    parsed.getFullYear() !== year
    || parsed.getMonth() !== month - 1
    || parsed.getDate() !== day
  ) {
    return null;
  }

  parsed.setHours(0, 0, 0, 0);
  return parsed;
};

const getStrictAgeCutoff = (referenceDate = new Date()) => {
  const cutoff = new Date(
    referenceDate.getFullYear() - PUBLIC_ALUNO_MINIMUM_AGE_YEARS,
    referenceDate.getMonth(),
    referenceDate.getDate(),
  );
  cutoff.setHours(0, 0, 0, 0);
  return cutoff;
};

export const getPublicAlunoBirthDateMax = (referenceDate = new Date()) => {
  const maximumDate = getStrictAgeCutoff(referenceDate);
  maximumDate.setDate(maximumDate.getDate() - 1);
  return toLocalIsoDate(maximumDate);
};

export const isPublicAlunoOlderThanTen = (
  value: string,
  referenceDate = new Date(),
) => {
  const birthDate = parseIsoDate(value);
  return Boolean(birthDate && birthDate < getStrictAgeCutoff(referenceDate));
};
