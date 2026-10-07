import test from "node:test";
import assert from "node:assert/strict";
import { createCorrectionStore } from "../functions/technical-financial-correction/store.ts";
import type { Claim } from "../functions/technical-financial-correction/processor.ts";

const claim = {
  operationId: "11111111-1111-4111-8111-111111111111",
  manifestFingerprint: "a".repeat(64), leaseToken: "22222222-2222-4222-8222-222222222222",
  item: { receivableId: "33333333-3333-4333-8333-333333333333" },
} as Claim;

test("store intent transmits exact operation/item/hash/lease without actor impersonation", async () => {
  const calls: unknown[] = [];
  const store = createCorrectionStore({ rpc: async (name, args) => {
    calls.push({ name, args }); return { data: { started: true }, error: null };
  } });
  await store.recheckAndMarkIntent(claim);
  assert.deepEqual(calls, [{ name: "start_financial_correction_service", args: {
    p_operation_id: claim.operationId, p_receivable_id: claim.item.receivableId,
    p_fingerprint: claim.manifestFingerprint, p_lease_token: claim.leaseToken,
  } }]);
});

test("negative acknowledgement never counts as successful intent", async () => {
  const store = createCorrectionStore({ rpc: async () => ({ data: { started: false }, error: null }) });
  await assert.rejects(() => store.recheckAndMarkIntent(claim), /INTENT_NOT_CONFIRMED/);
});

test("database error is sanitized and cannot disclose private content", async () => {
  const store = createCorrectionStore({ rpc: async () => ({ data: null, error: { message: "private-bank-content" } }) });
  await assert.rejects(() => store.authorizeAndLoad(claim.operationId), error => {
    assert.equal(String(error).includes("private-bank-content"), false);
    assert.match(String(error), /CORRECTION_STORE_GUARD_FAILED/);
    return true;
  });
});

test("service cannot fall back to global worker or forge authorization after error", async () => {
  const names: string[] = [];
  const store = createCorrectionStore({ rpc: async name => {
    names.push(name); return { data: null, error: "not approved" };
  } });
  await assert.rejects(() => store.claim(claim.operationId, claim.item.receivableId, claim.manifestFingerprint));
  assert.deepEqual(names, ["claim_financial_correction_service"]);
});
