import { useMemo, useState } from 'react';
import { generateSafeUuid } from '../../../../../../lib/randomUuid';
import { todayInMaceio } from './manual-settlement-date';

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

export const sanitizeCurrencyInput = (value: string) => value
  .replace(/[^0-9.,]/g, '')
  .slice(0, 24);

const hasPositiveCurrencyInput = (value: string) => /[1-9]/.test(value);

export const useManualSettlementForm = (principalValue: number, initialAccountId = '') => {
  const [idempotencyKey] = useState(generateSafeUuid);
  const [accountId, setAccountId] = useState(initialAccountId);
  const [paymentMethod, setPaymentMethod] = useState<ManualSettlementPaymentMethod>('DINHEIRO');
  const [paymentDate, setPaymentDate] = useState(todayInMaceio);
  const [receivedValue, setReceivedValue] = useState(() => formatInitialCurrency(principalValue));
  const [interestValue, setInterestValue] = useState('');
  const [penaltyValue, setPenaltyValue] = useState('');
  const [discountValue, setDiscountValue] = useState('');
  const [additionValue, setAdditionValue] = useState('');

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

  return {
    accountId,
    additionValue,
    discountValue,
    interestValue,
    paymentDate,
    paymentMethod,
    penaltyValue,
    receivedValue,
    payload,
    canSubmit: Boolean(accountId && paymentDate && hasPositiveCurrencyInput(receivedValue)),
    setAccountId,
    setAdditionValue,
    setDiscountValue,
    setInterestValue,
    setPaymentDate,
    setPaymentMethod,
    setPenaltyValue,
    setReceivedValue,
  };
};
