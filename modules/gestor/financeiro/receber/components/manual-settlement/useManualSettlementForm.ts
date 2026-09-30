import { useMemo, useState } from 'react';
import { generateSafeUuid } from '../../../../../../lib/randomUuid';
import { todayInMaceio } from './manual-settlement-date';
import { calculateManualSettlementBreakdown } from './manual-settlement-calculation';

export {
  calculateManualSettlementTotal,
  sanitizeCurrencyInput,
} from './manual-settlement-calculation';
export type { ManualSettlementAdjustmentValues } from './manual-settlement-calculation';

export type ManualSettlementPaymentMethod = 'PIX' | 'BOLETO' | 'CARTAO' | 'DINHEIRO';

export interface ManualSettlementPayload {
  idempotencyKey: string;
  contaBancariaId: string;
  valorPago: string;
  valorJuros: string;
  valorMulta: string;
  valorDesconto: string;
  valorAcrescimo: string;
  dataPagamento: string;
  formaPagamento: ManualSettlementPaymentMethod;
}

const formatInitialCurrency = (value: number) => Number(value || 0).toLocaleString('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const useManualSettlementForm = (principalValue: number, initialAccountId = '') => {
  const [idempotencyKey] = useState(generateSafeUuid);
  const [accountId, setAccountId] = useState(initialAccountId);
  const [paymentMethod, setPaymentMethod] = useState<ManualSettlementPaymentMethod>('DINHEIRO');
  const [paymentDate, setPaymentDate] = useState(todayInMaceio);
  const [interestValue, setInterestValue] = useState('');
  const [penaltyValue, setPenaltyValue] = useState('');
  const [discountValue, setDiscountValue] = useState('');
  const [additionValue, setAdditionValue] = useState('');

  const amounts = useMemo(() => {
    const breakdown = calculateManualSettlementBreakdown(principalValue, {
      interestValue,
      penaltyValue,
      discountValue,
      additionValue,
    });

    return {
      principal: breakdown.principalCents / 100,
      interest: breakdown.interestCents / 100,
      penalty: breakdown.penaltyCents / 100,
      discount: breakdown.discountCents / 100,
      addition: breakdown.additionCents / 100,
      adjustmentCents: breakdown.adjustmentCents,
      received: breakdown.receivedCents / 100,
      inputsValid: breakdown.inputsValid,
      inputValidity: breakdown.inputValidity,
      discountIsValid: breakdown.discountIsValid,
    };
  }, [additionValue, discountValue, interestValue, penaltyValue, principalValue]);
  const receivedValue = formatInitialCurrency(amounts.received);

  const payload = useMemo<ManualSettlementPayload>(() => ({
    idempotencyKey,
    contaBancariaId: accountId,
    valorPago: receivedValue,
    valorJuros: interestValue || '0',
    valorMulta: penaltyValue || '0',
    valorDesconto: discountValue || '0',
    valorAcrescimo: additionValue || '0',
    dataPagamento: paymentDate,
    formaPagamento: paymentMethod,
  }), [
    accountId,
    additionValue,
    discountValue,
    idempotencyKey,
    interestValue,
    paymentDate,
    paymentMethod,
    penaltyValue,
    receivedValue,
  ]);

  const compositionError = !amounts.inputsValid
    ? 'Revise os ajustes: use valores em reais com no máximo duas casas decimais, como 10,50.'
    : amounts.discountIsValid
      ? null
      : 'O desconto deve ser menor que o valor da cobrança somado aos encargos.';

  return {
    accountId,
    additionValue,
    amounts,
    compositionError,
    discountValue,
    interestValue,
    paymentDate,
    paymentMethod,
    penaltyValue,
    receivedValue,
    payload,
    canSubmit: Boolean(accountId && paymentDate && amounts.received > 0 && !compositionError),
    setAccountId,
    setAdditionValue,
    setDiscountValue,
    setInterestValue,
    setPaymentDate,
    setPaymentMethod,
    setPenaltyValue,
  };
};
