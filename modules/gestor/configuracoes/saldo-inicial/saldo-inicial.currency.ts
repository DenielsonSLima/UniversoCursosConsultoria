const brlInputFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatBRLInput = (value: number): string =>
  brlInputFormatter.format(Number.isFinite(value) ? value : 0);

export const formatBRLCurrency = (value: number): string =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number.isFinite(value) ? value : 0);

export const parseBRLInput = (value: string): number | null => {
  const clean = value
    .trim()
    .replace(/\s/g, '')
    .replace(/^R\$/, '')
    .replace(/[^\d.,-]/g, '');

  if (!clean || clean === '-') return null;

  const negative = clean.startsWith('-');
  const unsigned = clean.replace(/-/g, '');
  const lastComma = unsigned.lastIndexOf(',');
  const lastDot = unsigned.lastIndexOf('.');
  const dotFractionLength = lastDot >= 0 ? unsigned.length - lastDot - 1 : 0;
  const decimalIndex = lastComma >= 0
    ? lastComma
    : lastDot >= 0 && dotFractionLength !== 3
      ? lastDot
      : -1;

  let normalized: string;

  if (decimalIndex >= 0) {
    const integerPart = unsigned.slice(0, decimalIndex).replace(/[.,]/g, '') || '0';
    const decimalPart = unsigned.slice(decimalIndex + 1).replace(/[.,]/g, '');
    normalized = `${integerPart}.${decimalPart}`;
  } else {
    normalized = unsigned.replace(/[.,]/g, '');
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;

  const signed = negative ? -parsed : parsed;
  return Math.round((signed + Number.EPSILON) * 100) / 100;
};

export const normalizeBRLInput = (value: string): string => {
  const parsed = parseBRLInput(value);
  return parsed === null ? '' : formatBRLInput(parsed);
};
