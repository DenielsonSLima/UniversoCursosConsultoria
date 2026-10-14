export type RpcClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: any; error: any }>;
};
export type Claim = {
  mode: 'CANCEL_ALLOWED' | 'CONFIRM_ONLY' | 'LOCAL' | 'COMPLETE' | 'BUSY';
  leaseToken?: string;
  receivable?: Record<string, any>;
  payerDocument?: string;
  transactionId?: string;
};
export type CancellationEvidence = {
  remoteStatus: 'CANCELED' | 'LOCAL';
  situationCode: 5 | null;
  confirmedAt: string;
  evidenceFingerprint: string;
  strictEffectivePayments: true;
  identityValidated: true;
  termsValidated: true;
  paymentsCount: 0;
  mutationAttempted: boolean;
  alreadyCanceled: boolean;
  convenio: string | null;
  nossoNumero: string | null;
};
export interface CancellationStore {
  claim(operationId: string, receivableId: string): Promise<Claim>;
  start(operationId: string, receivableId: string, leaseToken: string): Promise<void>;
  complete(operationId: string, receivableId: string, leaseToken: string, evidence: CancellationEvidence): Promise<void>;
  review(operationId: string, receivableId: string, leaseToken: string, reason: string): Promise<void>;
}

const rpc = async (admin: RpcClient, name: string, args: Record<string, unknown>) => {
  const { data, error } = await admin.rpc(name, args);
  if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('CANCELLATION_STORE_GUARD_FAILED');
  }
  return data;
};
const args = (operationId: string, receivableId: string, leaseToken?: string) => ({
  p_operation_id: operationId, p_receivable_id: receivableId,
  ...(leaseToken ? { p_lease_token: leaseToken } : {}),
});

export const createCancellationStore = (admin: RpcClient): CancellationStore => ({
  claim: async (operationId, receivableId) =>
    await rpc(admin, 'claim_other_credit_cancellation', args(operationId, receivableId)),
  async start(operationId, receivableId, leaseToken) {
    const result = await rpc(admin, 'start_other_credit_cancellation', args(operationId, receivableId, leaseToken));
    if (result.started !== true) throw new Error('CANCELLATION_INTENT_NOT_SAVED');
  },
  async complete(operationId, receivableId, leaseToken, evidence) {
    const result = await rpc(admin, 'complete_other_credit_cancellation', {
      ...args(operationId, receivableId, leaseToken), p_evidence: evidence,
    });
    if (result.completed !== true) throw new Error('CANCELLATION_COMPLETION_NOT_SAVED');
  },
  async review(operationId, receivableId, leaseToken, reason) {
    const result = await rpc(admin, 'review_other_credit_cancellation', {
      ...args(operationId, receivableId, leaseToken), p_reason: reason,
    });
    if (result.reviewed !== true) throw new Error('CANCELLATION_REVIEW_NOT_SAVED');
  },
});
