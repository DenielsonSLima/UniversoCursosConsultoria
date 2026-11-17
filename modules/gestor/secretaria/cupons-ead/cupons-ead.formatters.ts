const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const percent = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

export const formatCupomMoney = (value: number) => Number.isFinite(value) ? currency.format(value) : 'Indisponível';
export const formatCupomPercent = (value: number) => `${percent.format(value)}%`;
export const formatCupomDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data indisponível' : dateTime.format(date);
};
