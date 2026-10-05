import { supabase } from '../../../../lib/supabase';

import { buildEadRefundResolution, type EadPaymentReview, type EadRefundCandidate } from './ead-payment-review.model';
export type { EadPaymentReview, EadRefundCandidate } from './ead-payment-review.model';
export const eadPaymentReviewKeys = {
  all: ['ead-payment-reviews'] as const,
  list: () => ['ead-payment-reviews', 'authorized-polos'] as const,
  refunds: (reviewId: string) => ['ead-payment-reviews', reviewId, 'refund-candidates'] as const,
};

const rpcList = <T,>(data: unknown): T[] => {
  if (!Array.isArray(data)) throw new Error('A consulta de pagamentos EAD retornou dados incompletos.');
  return data as T[];
};

export const eadPaymentReviewService = {
  async list(): Promise<EadPaymentReview[]> {
    const { data, error } = await supabase.rpc('ead_list_payment_reviews_secure', { p_polo_id: null });
    if (error) throw error;
    return rpcList<EadPaymentReview>(data);
  },
  async refundCandidates(reviewId: string): Promise<EadRefundCandidate[]> {
    const { data, error } = await supabase.rpc('ead_list_refund_candidates_secure', { p_review_id: reviewId });
    if (error) throw error;
    return rpcList<EadRefundCandidate>(data);
  },
  async refundEvidenceUrl(candidate: EadRefundCandidate): Promise<string> {
    const reference = candidate.comprovanteRef || '';
    const separator = reference.indexOf('/');
    if (separator < 1) throw new Error('Esta devolução não possui um comprovante anexado.');
    const { data, error } = await supabase.storage.from(reference.slice(0, separator))
      .createSignedUrl(reference.slice(separator + 1), 60);
    if (error || !data?.signedUrl) throw new Error('Não foi possível abrir o comprovante autorizado da devolução.');
    return data.signedUrl;
  },
  async resolveRefund(input: Parameters<typeof buildEadRefundResolution>[0]) {
    const { data, error } = await supabase.rpc('ead_resolve_payment_review_secure', buildEadRefundResolution(input));
    if (error) throw error;
    if (data?.state !== 'RESOLVED' || data?.resolution !== 'LINK_CONFIRMED_REFUND') {
      throw new Error('A devolução aguarda confirmação do vínculo financeiro. Atualize a revisão.');
    }
    return data;
  },
};
