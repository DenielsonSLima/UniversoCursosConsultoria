export const EAD_MAX_CARD_INSTALLMENTS = 21;

const CARD_FIXED_FEE = 0.49;
const PIX_OR_BOLETO_FIXED_FEE = 1.99;

export const clampEadInstallments = (value: number) =>
  Math.max(1, Math.min(EAD_MAX_CARD_INSTALLMENTS, Math.floor(value || 1)));

export const resolveEadCardFeeRate = (installments: number) => {
  if (installments <= 1) return 0.0299;
  if (installments <= 6) return 0.0349;
  if (installments <= 12) return 0.0399;
  return 0.0429;
};

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const formatEadMoney = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const buildEadFinancialSimulation = (courseValue: number, installments: number) => {
  const value = Math.max(0, roundMoney(courseValue || 0));
  const installmentCount = clampEadInstallments(installments);
  if (value <= 0) {
    return {
      value: 0,
      installmentCount,
      cardRate: resolveEadCardFeeRate(installmentCount),
      cardFixedFee: CARD_FIXED_FEE,
      pixOrBoletoFixedFee: PIX_OR_BOLETO_FIXED_FEE,
      pixOrBoletoNet: 0,
      withoutPass: {
        customerPays: 0,
        institutionReceives: 0,
        fee: 0,
        anticipatedEstimate: 0,
      },
      withPass: {
        customerPays: 0,
        institutionReceives: 0,
        fee: 0,
        anticipatedEstimate: 0,
      },
    };
  }

  const cardRate = resolveEadCardFeeRate(installmentCount);
  const cardFeeWithoutPass = roundMoney(CARD_FIXED_FEE + value * cardRate);
  const cardNetWithoutPass = roundMoney(Math.max(0, value - cardFeeWithoutPass));
  const cardGrossWithPass = roundMoney((value + CARD_FIXED_FEE) / (1 - cardRate));
  const cardFeeWithPass = roundMoney(CARD_FIXED_FEE + cardGrossWithPass * cardRate);
  const cardNetWithPass = roundMoney(Math.max(0, cardGrossWithPass - cardFeeWithPass));
  const anticipationRate = installmentCount > 1 ? 0.017 : 0.0125;
  const averageMonths = installmentCount > 1 ? (installmentCount + 1) / 2 : 1;
  const anticipatedWithoutPass = roundMoney(Math.max(0, cardNetWithoutPass - cardNetWithoutPass * anticipationRate * averageMonths));
  const anticipatedWithPass = roundMoney(Math.max(0, cardNetWithPass - cardNetWithPass * anticipationRate * averageMonths));

  return {
    value,
    installmentCount,
    cardRate,
    cardFixedFee: CARD_FIXED_FEE,
    pixOrBoletoFixedFee: PIX_OR_BOLETO_FIXED_FEE,
    pixOrBoletoNet: roundMoney(Math.max(0, value - PIX_OR_BOLETO_FIXED_FEE)),
    withoutPass: {
      customerPays: value,
      institutionReceives: cardNetWithoutPass,
      fee: cardFeeWithoutPass,
      anticipatedEstimate: anticipatedWithoutPass,
    },
    withPass: {
      customerPays: cardGrossWithPass,
      institutionReceives: cardNetWithPass,
      fee: cardFeeWithPass,
      anticipatedEstimate: anticipatedWithPass,
    },
  };
};
