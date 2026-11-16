import { supabase } from '../../../../lib/supabase';
import { FinancialPaymentError } from '../settlements/financial-payment.service';
import type {
  FinancialPaymentConfirmation, FinancialPaymentInput, FinancialPaymentPreview,
  FinancialPaymentResult, FinancialPaymentSourceKind,
} from '../settlements/financial-payment.types';

export interface ExpenseEstimatePaymentMetadata {
  realAmount: string;
  version: number;
}

export const hasExpenseEstimatePayment = (input: FinancialPaymentInput) =>
  Object.prototype.hasOwnProperty.call(input, 'expenseEstimate');

export function getExpenseEstimatePayment(input: FinancialPaymentInput): ExpenseEstimatePaymentMetadata {
  const metadata = (input as FinancialPaymentInput & { expenseEstimate?: ExpenseEstimatePaymentMetadata }).expenseEstimate;
  if (!metadata || typeof metadata.realAmount !== 'string'
    || !/^\d{1,12}\.\d{2}$/.test(metadata.realAmount) || Number(metadata.realAmount) <= 0
    || !Number.isSafeInteger(metadata.version) || metadata.version < 0) {
    throw new FinancialPaymentError('O valor real da conta não foi confirmado. Feche e abra novamente o lançamento.');
  }
  return metadata;
}

const errorForEstimate = (error: { message?: string }, confirming = false) => {
  const message = error.message || '';
  const safeToEdit = /PAYMENT_(ESTIMATE_VERSION_CHANGED|ESTIMATE_NOT_PENDING|PREVIEW_STALE)/.test(message);
  const known: Array<[RegExp, string]> = [
    [/PAYMENT_ESTIMATE_VERSION_CHANGED/, 'A previsão mudou. Feche e abra o lançamento para conferir o valor atual.'],
    [/PAYMENT_ESTIMATE_NOT_PENDING/, 'O valor desta conta já foi confirmado. Feche e abra o lançamento para consultar o saldo atual.'],
    [/PAYMENT_ESTIMATE_HISTORY_LOCKED/, 'Esta conta já possui pagamentos. Consulte o histórico antes de alterar seu valor.'],
    [/PAYMENT_ESTIMATE_CONFIRMATION_REQUIRED/, 'Informe o valor real da conta antes de registrar o pagamento.'],
    [/PAYMENT_ESTIMATE_INVALID_VALUE/, 'Informe um valor real da conta maior que zero.'],
    [/PAYMENT_(PREVIEW_STALE|EXCEEDS_REMAINING)/, 'O saldo mudou ou o pagamento supera o saldo. Confira os valores da baixa.'],
    [/PAYMENT_ACCOUNT_UNAVAILABLE/, 'Escolha uma conta ativa e disponível neste polo.'],
    [/PAYMENT_UNAUTHORIZED/, 'Seu acesso a esta operação ou ao polo não está autorizado.'],
    [/PAYMENT_(INVALID_AMOUNT|INVALID_COMPONENT|INVALID_INPUT)/, 'Confira a data, as contas e os valores informados.'],
    [/PAYMENT_CHARGES_EXCEED_PAYMENT/, 'O pagamento precisa cobrir os encargos e reduzir o saldo da conta.'],
    [/PAYMENT_TITLE_NOT_OPEN/, 'Este lançamento não está mais em aberto. Consulte o histórico.'],
    [/PAYMENT_REQUEST_REUSED/, 'Esta tentativa já existe com outros dados. Retome a solicitação original.'],
  ];
  const fallback = confirming
    ? 'Pagamento não confirmado. Confira a mesma tentativa para consultar o resultado.'
    : 'Não foi possível conferir o valor real e o pagamento desta conta.';
  return new FinancialPaymentError(known.find(([pattern]) => pattern.test(message))?.[1] || fallback, safeToEdit);
};

export async function previewEstimatedExpensePayment(
  sourceKind: FinancialPaymentSourceKind, input: FinancialPaymentInput, automaticAmount = false,
): Promise<FinancialPaymentPreview> {
  if (sourceKind !== 'EXPENSE') throw new Error('A confirmação de estimativa exige uma despesa.');
  const metadata = getExpenseEstimatePayment(input);
  const { data, error } = await supabase.rpc('preview_estimated_expense_payment_secure', {
    p_despesa_id: input.sourceId, p_valor_real: metadata.realAmount, p_versao: metadata.version,
    p_input: automaticAmount ? { ...input, automaticAmount: true } : input,
  });
  if (error) throw errorForEstimate(error);
  if (!data || typeof data.fingerprint !== 'string' || !Array.isArray(data.components)
    || !data.estimatedExpense || typeof data.estimatedExpense.realBase !== 'string') {
    throw new Error('A prévia do valor real e do pagamento não foi confirmada.');
  }
  return data as FinancialPaymentPreview;
}

export async function confirmEstimatedExpensePayment(
  params: FinancialPaymentConfirmation,
): Promise<FinancialPaymentResult> {
  const metadata = getExpenseEstimatePayment(params.input);
  const { data, error } = await supabase.rpc('confirm_estimated_expense_payment_secure', {
    p_despesa_id: params.input.sourceId, p_valor_real: metadata.realAmount, p_versao: metadata.version,
    p_input: { ...params.input, fingerprint: params.fingerprint },
  });
  if (error) throw errorForEstimate(error, true);
  if (!data?.success || typeof data.paymentId !== 'string' || !data.preview) {
    throw new Error('Resultado do pagamento incompleto. Confira esta mesma tentativa.');
  }
  return data as FinancialPaymentResult;
}
