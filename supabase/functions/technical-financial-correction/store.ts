import { CorrectionBlocked, type Claim, type CorrectionStore, type Manifest } from "./processor.ts";

export type RpcClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

const rpc = async (admin: RpcClient, name: string, args: Record<string, unknown>) => {
  const { data, error } = await admin.rpc(name, args);
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    // Do not leak database error details, banking data or any RPC secrets.
    throw new CorrectionBlocked("CORRECTION_STORE_GUARD_FAILED");
  }
  return data as Record<string, unknown>;
};

const scope = (claim: Claim) => ({
  p_operation_id: claim.operationId,
  p_receivable_id: claim.item.receivableId,
  p_fingerprint: claim.manifestFingerprint,
  p_lease_token: claim.leaseToken,
});

/**
 * Used only inside the existing worker's established secret-authenticated
 * boundary. RPCs are service-only and default-deny every operation until an
 * exact private manifest is approved and enabled through reviewed maintenance.
 * There is no actor supplied by this client and no auth.uid() impersonation.
 */
export const createCorrectionStore = (admin: RpcClient): CorrectionStore => ({
  async authorizeAndLoad(operationId) {
    return await rpc(admin, "load_financial_correction_service", {
      p_operation_id: operationId,
    }) as unknown as Manifest;
  },
  async claim(operationId, receivableId, fingerprint) {
    return await rpc(admin, "claim_financial_correction_service", {
      p_operation_id: operationId,
      p_receivable_id: receivableId,
      p_fingerprint: fingerprint,
    }) as unknown as Claim;
  },
  async recheckAndMarkIntent(claim) {
    const result = await rpc(admin, "start_financial_correction_service", scope(claim));
    if (result.started !== true) throw new CorrectionBlocked("INTENT_NOT_CONFIRMED");
  },
  async complete(claim, evidence) {
    const result = await rpc(admin, "complete_financial_correction_service", {
      ...scope(claim), p_evidence: evidence,
    });
    if (result.completed !== true) throw new CorrectionBlocked("COMPLETION_NOT_CONFIRMED");
  },
  async review(claim, reason) {
    const result = await rpc(admin, "review_financial_correction_service", {
      ...scope(claim), p_reason: reason,
    });
    if (result.reviewed !== true) throw new CorrectionBlocked("REVIEW_NOT_CONFIRMED");
  },
});
