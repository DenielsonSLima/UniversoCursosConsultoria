const MAX_CENTS = 9_000_000_000_000_000;

export const formatCentsAsCurrencyInput = (cents: number) => {
  const integerPart = Math.floor(cents / 100).toLocaleString('pt-BR', {
    maximumFractionDigits: 0,
    useGrouping: true,
  });
  const decimalPart = String(cents % 100).padStart(2, '0');

  return `${integerPart},${decimalPart}`;
};

export const sanitizeCurrencyInput = (value: string, previousValue = '') => {
  if (value === '') return '';

  const digits = value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  if (!digits) return previousValue;

  const cents = Number(digits);
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) return previousValue;
  if (cents === 0 && previousValue !== '' && value.length < previousValue.length) return '';

  return formatCentsAsCurrencyInput(cents);
};

const strictGroupedInteger = (value: string, separator: '.' | ',') => {
  const escapedSeparator = separator === '.' ? '\\.' : ',';
  return new RegExp(`^[1-9][0-9]{0,2}(?:${escapedSeparator}[0-9]{3})+$`).test(value);
};

export const currencyInputToCents = (value: string) => {
  const raw = value.trim();
  if (!raw) return 0;
  if (!/[0-9]/.test(raw)) return null;
  if (!/^[0-9.,]+$/.test(raw)) return null;

  const commaCount = (raw.match(/,/g) || []).length;
  const dotCount = (raw.match(/\./g) || []).length;
  let normalized: string;

  if (commaCount > 0 && dotCount > 0) {
    const decimalSeparator = raw.lastIndexOf(',') > raw.lastIndexOf('.') ? ',' : '.';
    const groupingSeparator = decimalSeparator === ',' ? '.' : ',';
    const decimalCount = decimalSeparator === ',' ? commaCount : dotCount;
    if (decimalCount !== 1) return null;

    const [groupedInteger, decimals = ''] = raw.split(decimalSeparator);
    if (!decimals || decimals.length > 2 || !/^[0-9]{1,2}$/.test(decimals)) return null;
    if (!groupedInteger || (groupedInteger.includes(groupingSeparator)
      ? !strictGroupedInteger(groupedInteger, groupingSeparator)
      : !/^[0-9]+$/.test(groupedInteger))) return null;
    normalized = `${groupedInteger.replace(/[.,]/g, '')}.${decimals.padEnd(2, '0')}`;
  } else if (commaCount > 0) {
    if (commaCount !== 1) return null;
    const [integer = '', decimals = ''] = raw.split(',');
    if (!decimals || decimals.length > 2 || !/^[0-9]*$/.test(integer) || !/^[0-9]{1,2}$/.test(decimals)) return null;
    normalized = `${integer || '0'}.${decimals.padEnd(2, '0')}`;
  } else if (dotCount > 1) {
    if (!strictGroupedInteger(raw, '.')) return null;
    normalized = raw.replace(/\./g, '');
  } else if (dotCount === 1) {
    const [integer = '', decimals = ''] = raw.split('.');
    if (!decimals) return null;
    if (decimals.length === 3) {
      if (!strictGroupedInteger(raw, '.')) return null;
      normalized = `${integer}${decimals}`;
    } else {
      if (decimals.length > 2 || !/^[0-9]*$/.test(integer) || !/^[0-9]{1,2}$/.test(decimals)) return null;
      normalized = `${integer || '0'}.${decimals.padEnd(2, '0')}`;
    }
  } else {
    normalized = raw;
  }

  const [integerPart, decimalPart = ''] = normalized.split('.');
  const integer = Number(integerPart || '0');
  const cents = integer * 100 + Number(decimalPart.padEnd(2, '0') || '0');

  return Number.isSafeInteger(cents) && cents <= MAX_CENTS ? cents : null;
};

export const formatCurrencyInput = (value: string) => {
  const cents = currencyInputToCents(value);
  if (cents === null) return value;

  return formatCentsAsCurrencyInput(cents);
};

