export const formatPatrimonioCurrency = (value: number) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
}).format(value || 0);

export const formatPatrimonioDate = (value?: string | null) => {
  if (!value) return 'Não informada';
  return new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR');
};

export const formatPatrimonioQuantity = (value: number) => new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 3,
}).format(value || 0);
