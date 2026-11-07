import { currencyInputToCents } from '../../../../../shared/utils/currency-input.ts';

export {
  currencyInputToCents,
  formatCurrencyInput,
  sanitizeCurrencyInput,
} from '../../../../../shared/utils/currency-input.ts';

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
