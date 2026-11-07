/** Presentation only: canonical amounts and totals are supplied by the backend. */
export const formatNfseMoney = (amount: string | null | undefined): string => {
  if (amount == null) return '—';
  const [whole, cents] = amount.split('.');
  return `R$ ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${cents || '00'}`;
};

export const formatNfseDate = (value?: string | null): string => {
  if (!value) return '—';
  const date = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.split('-').reverse().join('/') : '—';
};
