import { supabase } from '../../../../lib/supabase';

export type OtherCreditCancellationResult = {
  receivableId: string;
  status: 'CANCELED' | 'REVIEW_REQUIRED' | 'FAILED' | 'PROCESSING';
  message?: string;
};
export type OtherCreditCancellationResponse = {
  operationId: string;
  results: OtherCreditCancellationResult[];
};

export async function cancelOtherCredits(input: {
  receivableIds: string[]; reason: string; idempotencyKey: string;
}): Promise<OtherCreditCancellationResponse> {
  const { data, error } = await supabase.functions.invoke<OtherCreditCancellationResponse>('gestor-other-credit-cancellation', {
    body: input,
  });
  if (error) {
    const context = (error as { context?: Response }).context;
    const body = context instanceof Response ? await context.json().catch(() => null) : null;
    throw new Error(body?.error || 'Cancelamento não confirmado. Retome a mesma solicitação para consultar o resultado.');
  }
  const ids = new Set(input.receivableIds.map(id => id.toLowerCase()));
  if (!data || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.operationId) || !Array.isArray(data.results) ||
    data.results.length !== ids.size || new Set(data.results.map(item => item.receivableId)).size !== ids.size ||
    data.results.some(item => !ids.has(item.receivableId) ||
      !['CANCELED', 'REVIEW_REQUIRED', 'FAILED', 'PROCESSING'].includes(item.status))) {
    throw new Error('Resultado incompleto. Retome a mesma solicitação para confirmar cada crédito.');
  }
  return data;
}
