export type RpcClient = { rpc(name: string, parameters: Record<string, unknown>): PromiseLike<{ data: any; error: unknown }> };
export type Claim = {
  mode: 'CANCEL_ALLOWED' | 'CONFIRM_ONLY' | 'LOCAL' | 'COMPLETE' | 'BUSY' | 'FAILED_SAFE';
  leaseToken?: string; receivable?: Record<string, any>; payerDocument?: string;
  transactionId?: string; result?: any;
};
export type PaymentEvidence = {
  remoteStatus: 'LOCAL' | 'CANCELED'; situationCode: 5 | null; confirmedAt: string;
  evidenceFingerprint: string; strictEffectivePayments: true; identityValidated: true;
  termsValidated: true; paymentsCount: 0; mutationAttempted: boolean; alreadyCanceled: boolean;
  convenio: string | null; nossoNumero: string | null;
};
export interface PaymentStore {
  claim(id: string): Promise<Claim>;
  start(id: string, lease: string): Promise<void>;
  complete(id: string, lease: string, evidence: PaymentEvidence): Promise<any>;
  review(id: string, lease: string, reason: string): Promise<{ safeToEdit: boolean }>;
}
export const createPaymentStore = (admin: RpcClient): PaymentStore => {
  const call = async (name: string, parameters: Record<string, unknown>) => {
    const { data, error } = await admin.rpc(name, parameters);
    if (error) throw new Error('PAYMENT_STATE_NOT_CONFIRMED');
    return data;
  };
  return {
    claim: id => call('claim_receivable_payment_service', { p_attempt_id: id }),
    start: async (id, lease) => {
      const data = await call('start_receivable_payment_service', { p_attempt_id: id, p_lease_token: lease });
      if (data?.started !== true) throw new Error('PAYMENT_INTENT_NOT_PERSISTED');
    },
    complete: (id, lease, evidence) => call('complete_receivable_payment_service', {
      p_attempt_id: id, p_lease_token: lease, p_evidence: evidence,
    }),
    review: async (id, lease, reason) => {
      const data = await call('review_receivable_payment_service', {
        p_attempt_id: id, p_lease_token: lease, p_reason: reason,
      });
      return { safeToEdit: data?.reviewed === true && data?.state === 'FAILED_SAFE' && data?.safeToEdit === true };
    },
  };
};
