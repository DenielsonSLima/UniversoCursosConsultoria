import { createCorrectionBank } from "./bank.ts";
import { cancelCorrectionItem } from "./processor.ts";
import { parseCorrectionRequest } from "./request.ts";
import { createCorrectionStore, type RpcClient } from "./store.ts";

/** Called AFTER the existing recovery worker has authenticated its request. */
export async function runApprovedCorrectionItem(admin: RpcClient, body: unknown) {
  const input = parseCorrectionRequest(body);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const result = await cancelCorrectionItem(input, {
      store: createCorrectionStore(admin),
      bank: createCorrectionBank({ rpc: async (name, args) =>
        await admin.rpc(name, args ?? {}) }, controller.signal),
    });
    return {
      success: true,
      operationId: input.operationId,
      receivableId: input.receivableId,
      ...result,
      // Cancellation does not create any title or authorize a replacement.
      reissued: false,
    };
  } finally { clearTimeout(timer); }
}
