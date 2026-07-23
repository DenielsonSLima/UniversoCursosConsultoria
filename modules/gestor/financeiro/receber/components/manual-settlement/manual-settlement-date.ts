const MACEIO_TIME_ZONE = 'America/Maceio';

export const formatMaceioIsoDate = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MACEIO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;
  const year = part('year');
  const month = part('month');
  const day = part('day');
  if (!year || !month || !day) {
    throw new Error('Não foi possível obter a data local de Maceió.');
  }
  return `${year}-${month}-${day}`;
};

export const todayInMaceio = () => formatMaceioIsoDate(new Date());
