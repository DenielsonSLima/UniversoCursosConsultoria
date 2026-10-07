export const formatMoney = (value: string) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
}).format(Number(value));

export const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR');

export const formatPercent = (value: string) => `${new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
}).format(Number(value))}%`;

