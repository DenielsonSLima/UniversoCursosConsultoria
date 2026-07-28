export const normalizePage = (page: number) =>
  Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;

export const getPageRange = (page: number, pageSize: number) => {
  const normalizedPage = normalizePage(page);
  const normalizedSize = Math.min(100, Math.max(1, Math.floor(pageSize || 25)));
  const from = (normalizedPage - 1) * normalizedSize;
  return { from, to: from + normalizedSize - 1, page: normalizedPage, pageSize: normalizedSize };
};

const addUtcDays = (date: string, days: number) => {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
};

export const getMaceioDateBounds = (dataInicio?: string, dataFim?: string) => ({
  from: dataInicio ? `${dataInicio}T00:00:00-03:00` : undefined,
  toExclusive: dataFim ? `${addUtcDays(dataFim, 1)}T00:00:00-03:00` : undefined,
});

export const maskCpf = (value?: string | null) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 11) return value || '—';
  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
};

export const normalizeEnrollmentStatus = (value?: string | null) =>
  String(value || 'PENDENTE').trim().toUpperCase();
