import { supabase } from '../../../../lib/supabase';
import type {
  FinancialPaymentHistory, FinancialPaymentInput, FinancialPaymentPreview,
  FinancialPaymentResult, FinancialPaymentSourceKind,
} from './financial-payment.types';
export type * from './financial-payment.types';

export class FinancialPaymentError extends Error {
  constructor(message: string, readonly safeToEdit = false) { super(message); }
}

const errorMessage = async (error: unknown, fallback: string) => {
  const context = (error as { context?: Response })?.context;
  if (context instanceof Response) {
    const body = await context.json().catch(() => null);
    if (typeof body?.error === 'string') return body.error;
  }
  const message = (error as { message?: string })?.message;
  const known: Array<[RegExp, string]> = [
    [/PAYMENT_(PREVIEW_STALE|PREVIEW_CHANGED|EXCEEDS_REMAINING)/, 'O saldo mudou ou o pagamento supera o saldo. Confira os valores e atualize a prévia.'],
    [/PAYMENT_CHARGES_EXCEED_PAYMENT/, 'O valor recebido precisa cobrir os encargos e reduzir o saldo.'],
    [/PAYMENT_ACCOUNT_UNAVAILABLE/, 'Escolha uma conta ativa e disponível neste polo.'],
    [/PAYMENT_UNAUTHORIZED/, 'Seu acesso a esta operação ou ao polo não está autorizado.'],
    [/PAYMENT_(INVALID_AMOUNT|INVALID_COMPONENT|INVALID_INPUT)/, 'Confira a data, as contas e os valores informados.'],
    [/PAYMENT_TITLE_NOT_OPEN/, 'Este lançamento não está mais em aberto. Confira o histórico.'],
    [/PAYMENT_(REQUEST_REUSED|REQUEST_CONFLICT)/, 'Esta tentativa já existe com outros dados. Retome a solicitação original.'],
    [/PAYMENT_SPECIALIZED_FLOW_REQUIRED/, 'Este lançamento deve ser tratado no fluxo de convênio ou empréstimo.'],
    [/PAYMENT_EVENT_ALREADY_REVERSED/, 'Este pagamento já foi estornado. Confira o histórico.'],
    [/PAYMENT_.*REQUIRES_REVIEW/, 'Este lançamento precisa de revisão financeira antes de continuar.'],
  ];
  const friendly = known.find(([pattern]) => pattern.test(message ?? ''));
  if (friendly) return friendly[1];
  return message && !/JWT|token|SQL|PostgREST|PAYMENT_|constraint|permission denied/i.test(message) ? message : fallback;
};

export async function previewFinancialPayment(sourceKind: FinancialPaymentSourceKind,
  input: FinancialPaymentInput,
  automaticAmount = false,
): Promise<FinancialPaymentPreview> {
  const { data, error } = await supabase.rpc('preview_financial_payment_secure', {
    p_source_kind: sourceKind, p_source_id: input.sourceId,
    p_input: automaticAmount ? { ...input, automaticAmount: true } : input,
  });
  if (error) throw new Error(await errorMessage(error, 'Não foi possível calcular o pagamento.'));
  if (!data || typeof data.fingerprint !== 'string' || !Array.isArray(data.components)) {
    throw new Error('A prévia do pagamento não foi confirmada.');
  }
  return data as FinancialPaymentPreview;
}

export async function confirmFinancialPayment(sourceKind: FinancialPaymentSourceKind,
  input: FinancialPaymentInput, fingerprint: string,
): Promise<FinancialPaymentResult> {
  const payload = { ...input, fingerprint };
  const response = sourceKind === 'RECEIVABLE'
    ? await supabase.functions.invoke('financial-receivable-payment', { body: payload })
    : await supabase.rpc('confirm_expense_payment_secure', {
      p_source_kind: sourceKind, p_source_id: input.sourceId, p_input: payload,
    });
  if (response.error) {
    const context = (response.error as { context?: Response }).context;
    const body = context instanceof Response ? await context.clone().json().catch(() => null) : null;
    const safeToEdit = sourceKind === 'RECEIVABLE' ? body?.safeToEdit === true :
      /PAYMENT_PREVIEW_STALE|PAYMENT_EXCEEDS_REMAINING/.test(String(response.error.message ?? ''));
    throw new FinancialPaymentError(await errorMessage(response.error,
      'Pagamento não confirmado. Retome a mesma tentativa para consultar o resultado.'), safeToEdit);
  }
  if (!response.data?.success || typeof response.data.paymentId !== 'string' || !response.data.preview) {
    throw new Error('Resultado do pagamento incompleto. Retome a mesma tentativa.');
  }
  if (response.data.academicSyncWarning) {
    throw new FinancialPaymentError('Pagamento já registrado. Apenas a ativação acadêmica está pendente. Retome este mesmo pedido para sincronizar, sem registrar outro pagamento.');
  }
  return response.data as FinancialPaymentResult;
}

export async function getFinancialPaymentHistory(sourceKind: FinancialPaymentSourceKind,
  sourceId: string,
): Promise<FinancialPaymentHistory> {
  const { data, error } = await supabase.rpc('get_financial_payment_history_secure', {
    p_source_kind: sourceKind, p_source_id: sourceId,
  });
  if (error) throw new Error(await errorMessage(error, 'Não foi possível consultar os recebimentos.'));
  if (!data?.summary || !Array.isArray(data.events)) throw new Error('Histórico financeiro indisponível.');
  return data as FinancialPaymentHistory;
}

export async function reverseFinancialPayment(
  kind: Exclude<FinancialPaymentSourceKind, 'RECEIVABLE'>, sourceId: string,
  paymentId: string, requestId: string, reason: string,
): Promise<{ success: true; paymentId: string; replayed: boolean }> {
  const { data, error } = await supabase.rpc('reverse_expense_payment_secure', {
    p_source_kind: kind, p_source_id: sourceId, p_payment_id: paymentId,
    p_request_id: requestId, p_reason: reason,
  });
  if (error) throw new Error(await errorMessage(error, 'Estorno não confirmado. Retome a mesma solicitação.'));
  if (!data?.success || data.paymentId !== paymentId) throw new Error('Estorno não confirmado. Retome a mesma solicitação.');
  return data;
}
