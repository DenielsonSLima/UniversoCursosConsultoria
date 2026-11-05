import { supabase } from '../../../../lib/supabase';
import { validReversalReason } from './other-credit-reversal.model';

export async function reverseOtherCredit(input: {
  receivableId: string; requestId: string; reason: string; confirmed: boolean;
}) {
  if (!input.confirmed || !validReversalReason(input.reason)) {
    throw new Error('Informe o motivo e confirme o estorno do lançamento.');
  }
  const { data, error } = await supabase.rpc('estornar_outro_credito_secure', {
    p_receivable_id: input.receivableId,
    p_request_id: input.requestId,
    p_reason: input.reason.trim(),
    p_confirm: input.confirmed,
  });
  if (error) throw new Error(error.message || 'Não foi possível estornar o lançamento.');
  if (data?.success !== true || data?.status !== 'ESTORNADO') {
    throw new Error('O estorno não foi confirmado. Atualize a listagem antes de tentar novamente.');
  }
  return data as { success: true; status: 'ESTORNADO'; replayed: boolean };
}

export { canReverseOtherCredit } from './other-credit-reversal.model';
