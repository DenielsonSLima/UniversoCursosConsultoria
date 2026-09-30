export const sanitizeCurrencyInput = (value: string, previousValue = '') => {
  if (value === '') return '';
  const normalized = value.trim().replace(/^R\$\s*/i, '');
  if (normalized.length > 24 || !/^[0-9.,+-]*$/.test(normalized)) return previousValue;
  return normalized;
};

const MAX_CENTS = 9_000_000_000_000_000;

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

  const integerPart = Math.floor(cents / 100).toLocaleString('pt-BR', {
    maximumFractionDigits: 0,
    useGrouping: true,
  });
  const decimalPart = String(cents % 100).padStart(2, '0');

  return `${integerPart},${decimalPart}`;
};

export interface ManualSettlementAdjustmentValues {
  interestValue: string;
  penaltyValue: string;
  discountValue: string;
  additionValue: string;
}

export interface ManualSettlementBreakdown {
  principalCents: number;
  interestCents: number;
  penaltyCents: number;
  discountCents: number;
  additionCents: number;
  adjustmentCents: number;
  receivedCents: number;
  inputsValid: boolean;
  inputValidity: {
    interestValue: boolean;
    penaltyValue: boolean;
    discountValue: boolean;
    additionValue: boolean;
  };
  discountIsValid: boolean;
}

export const calculateManualSettlementBreakdown = (
  principalValue: number,
  values: ManualSettlementAdjustmentValues,
): ManualSettlementBreakdown => {
  const principalCents = Math.max(0, Math.round(Number(principalValue || 0) * 100));
  const parsed = {
    interestCents: currencyInputToCents(values.interestValue),
    penaltyCents: currencyInputToCents(values.penaltyValue),
    discountCents: currencyInputToCents(values.discountValue),
    additionCents: currencyInputToCents(values.additionValue),
  };
  const inputValidity = {
    interestValue: parsed.interestCents !== null,
    penaltyValue: parsed.penaltyCents !== null,
    discountValue: parsed.discountCents !== null,
    additionValue: parsed.additionCents !== null,
  };
  const inputsValid = Object.values(inputValidity).every(Boolean);
  const interestCents = parsed.interestCents ?? 0;
  const penaltyCents = parsed.penaltyCents ?? 0;
  const discountCents = parsed.discountCents ?? 0;
  const additionCents = parsed.additionCents ?? 0;
  const grossCents = principalCents + interestCents + penaltyCents + additionCents;
  const adjustmentCents = interestCents + penaltyCents + additionCents - discountCents;

  return {
    principalCents,
    interestCents,
    penaltyCents,
    discountCents,
    additionCents,
    adjustmentCents,
    receivedCents: Math.max(0, grossCents - discountCents),
    inputsValid,
    inputValidity,
    discountIsValid: discountCents < grossCents,
  };
};

export const calculateManualSettlementTotal = (
  principalValue: number,
  values: ManualSettlementAdjustmentValues,
) => {
  const breakdown = calculateManualSettlementBreakdown(principalValue, values);
  return breakdown.receivedCents / 100;
};
