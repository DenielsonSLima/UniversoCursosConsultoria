export const formatPatrimonioCurrency = (value: number | string) => {
  if (typeof value === 'string') {
    const cents = parsePatrimonioCurrencyToCents(value);
    return cents === null ? 'R$ 0,00' : formatPatrimonioCents(cents);
  }

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0);
};

export const PATRIMONIO_MAX_QUANTITY = 2_147_483_647;
export const PATRIMONIO_MAX_UNIT_CENTS = 99_999_999_999_999n;
export const PATRIMONIO_MAX_TOTAL_CENTS = 9_999_999_999_999_999n;

const normalizeCurrencyParts = (value: string) => {
  if (value.includes('-')) return null;
  const clean = value
    .trim()
    .replace(/^R\$\s*/i, '')
    .replace(/\s/g, '')
    .replace(/[^\d.,]/g, '');

  if (!clean || !/\d/.test(clean)) return null;

  const lastComma = clean.lastIndexOf(',');
  const lastDot = clean.lastIndexOf('.');
  const dotFractionLength = lastDot >= 0 ? clean.length - lastDot - 1 : 0;
  const decimalIndex = lastComma >= 0
    ? lastComma
    : lastDot >= 0 && dotFractionLength > 0 && dotFractionLength !== 3
      ? lastDot
      : -1;
  const integerDigits = (decimalIndex >= 0 ? clean.slice(0, decimalIndex) : clean)
    .replace(/\D/g, '') || '0';
  const fractionDigits = decimalIndex >= 0
    ? clean.slice(decimalIndex + 1).replace(/\D/g, '')
    : '';

  if (fractionDigits.length > 2) return null;

  return {
    integerDigits: integerDigits.replace(/^0+(?=\d)/, ''),
    fractionDigits: fractionDigits.padEnd(2, '0'),
  };
};

export const parsePatrimonioCurrencyToCents = (value: string): bigint | null => {
  const parts = normalizeCurrencyParts(value);
  if (!parts) return null;

  try {
    return BigInt(parts.integerDigits) * 100n + BigInt(parts.fractionDigits || '0');
  } catch {
    return null;
  }
};

const formatGroupedInteger = (value: bigint) => new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 0,
}).format(value);

export const formatPatrimonioCents = (cents: bigint) => {
  const safeCents = cents >= 0n ? cents : 0n;
  const integer = safeCents / 100n;
  const fraction = (safeCents % 100n).toString().padStart(2, '0');
  return `R$ ${formatGroupedInteger(integer)},${fraction}`;
};

export const formatPatrimonioCurrencyInput = (value: string) => {
  if (!value.trim()) return '';
  const cents = parsePatrimonioCurrencyToCents(value);
  if (cents === null) return '';
  return formatPatrimonioCents(cents).replace(/^R\$\s/, '');
};

export const formatPatrimonioCurrencyTyping = (value: string, previousValue: string) => {
  if (value.includes('-')) return previousValue;
  const cleaned = value
    .replace(/^R\$\s*/i, '')
    .replace(/\s/g, '')
    .replace(/[^\d,.]/g, '');
  if (!cleaned) return '';

  const formatInteger = (digits: string) => {
    const normalized = digits.replace(/^0+(?=\d)/, '') || '0';
    return normalized.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };
  const commaCount = (cleaned.match(/,/g) || []).length;
  if (commaCount > 1) return previousValue;

  if (commaCount === 1) {
    const [integerPart, fractionPart = ''] = cleaned.split(',');
    const fractionDigits = fractionPart.replace(/\D/g, '');
    if (fractionDigits.length > 2) return previousValue;
    return `${formatInteger(integerPart.replace(/\D/g, ''))},${fractionDigits}`;
  }

  const dotCount = (cleaned.match(/\./g) || []).length;
  if (dotCount === 1) {
    const [integerPart, fractionPart = ''] = cleaned.split('.');
    const previousUsesGroupedDot = previousValue.includes('.') && !previousValue.includes(',');
    const appendedToGroupedInteger = previousUsesGroupedDot && cleaned.startsWith(previousValue);
    const looksLikeDecimal = !appendedToGroupedInteger && fractionPart.length <= 2;

    if (looksLikeDecimal) {
      return `${formatInteger(integerPart.replace(/\D/g, ''))},${fractionPart.replace(/\D/g, '')}`;
    }
  }

  return formatInteger(cleaned.replace(/\D/g, ''));
};

export const parsePatrimonioQuantity = (value: string): number | null => {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > PATRIMONIO_MAX_QUANTITY) return null;
  return parsed;
};

export const calculatePatrimonioTotalCents = (
  quantity: number,
  unitCents: bigint,
): bigint | null => {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > PATRIMONIO_MAX_QUANTITY) return null;
  if (unitCents < 0n || unitCents > PATRIMONIO_MAX_UNIT_CENTS) return null;
  const total = BigInt(quantity) * unitCents;
  return total <= PATRIMONIO_MAX_TOTAL_CENTS ? total : null;
};

export const formatPatrimonioDate = (value?: string | null) => {
  if (!value) return 'Não informada';
  return new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR');
};

export const formatPatrimonioQuantity = (value: number) => new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 3,
}).format(value || 0);
