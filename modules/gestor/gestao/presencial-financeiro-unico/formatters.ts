export const formatCurrencyBRL = (value: number) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(Number.isFinite(value) ? value : 0);

export const formatPercentageBR = (value: number) => new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(Number.isFinite(value) ? value : 0);

export const formatDateBR = (value: string) => {
  if (!value) return 'Não informado';
  const normalized = value.slice(0, 10);
  const [year, month, day] = normalized.split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
};
