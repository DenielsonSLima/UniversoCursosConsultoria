const REPORT_TIME_ZONE = 'America/Maceio';

export const currentCompetenciaInMaceio = (reference = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: REPORT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(reference);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  if (!year || !month) throw new Error('Não foi possível determinar a competência atual.');
  return `${year}-${month}`;
};

export const formatCompetenciaInput = (value: string) => {
  const canonical = value.match(/^(\d{4})-(\d{2})$/);
  if (canonical) return `${canonical[2]}/${canonical[1]}`;

  const digits = value.replace(/\D/g, '').slice(0, 6);
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}/${digits.slice(2)}`;
};

export const parseCompetenciaInput = (value: string) => {
  const match = value.match(/^(0[1-9]|1[0-2])\/(\d{4})$/);
  return match ? `${match[2]}-${match[1]}` : null;
};
