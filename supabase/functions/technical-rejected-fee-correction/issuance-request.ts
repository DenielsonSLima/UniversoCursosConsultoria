import type { RejectedFeeRpcClient } from "./contract.ts";
import { record } from "./contract.ts";
export const resolveRejectedFeeRequest = async (
  admin: RejectedFeeRpcClient,
  input: { receivableId: string; cycleRequestId: string; defaultRequestId: string; internalRecovery: boolean },
): Promise<string> => {
  const response = await admin.rpc("resolve_rejected_fee_request_service", {
    p_receivable_id: input.receivableId, p_cycle_request_id: input.cycleRequestId,
  });
  if (response.error) throw new Error("REJECTED_FEE_REQUEST_RESOLUTION_FAILED");
  const row = record(response.data);
  if (row.required === false) return input.defaultRequestId;
  if (row.required !== true || input.internalRecovery || row.receivableId !== input.receivableId ||
    row.cycleRequestId !== input.cycleRequestId || row.requiresManagerConsent !== true ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(row.requestId))) {
    throw new Error("REJECTED_FEE_AUTHENTICATED_MANAGER_REQUIRED");
  }
  return String(row.requestId);
};
