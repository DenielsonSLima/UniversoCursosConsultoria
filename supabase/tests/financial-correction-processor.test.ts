import test from "node:test";
import assert from "node:assert/strict";
import {
  cancelCorrectionItem, manifestFingerprint, manifestCanonicalText,
  type Identity, type Manifest, type Claim,
  type CorrectionStore, type CorrectionBank,
} from "../functions/technical-financial-correction/processor.ts";

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function fixture() {
  const events: string[] = [];
  const item: Identity = {
    receivableId: id(1), enrollmentId: id(2), classId: id(3),
    environment: "sandbox", convenio: "123", nossoNumero: "123456789",
    amountCents: 27990, dueDate: "2026-10-05", agency: "123",
    payerDocument: "00000000000", digitableLine: "1".repeat(47),
    barcode: "2".repeat(44), financialTerms: { discount: 0 },
  };
  const operationId = id(4);
  const fingerprint = await manifestFingerprint(operationId, [item]);
  const manifest: Manifest = {
    operationId, fingerprint, canonicalText: manifestCanonicalText(operationId, [item]),
    purpose: "FINANCIAL_CORRECTION_CANCEL_ONLY",
    state: "APPROVED", items: [item],
  };
  const claim: Claim = {
    operationId, manifestFingerprint: fingerprint, item: globalThis.structuredClone(item),
    leaseToken: id(5), mode: "CANCEL_ALLOWED",
  };
  const bankResult = (alreadyCanceled = false) => ({
    convenio: item.convenio, nossoNumero: item.nossoNumero,
    situationCode: 5, remoteStatus: "CANCELED", alreadyCanceled,
    mutationAttempted: !alreadyCanceled, raw: { situation: 5 },
    proof: { strictEffectivePayments: true, paymentsCount: 0,
      identityValidated: true, termsValidated: true } as const,
  });
  const store: CorrectionStore = {
    async authorizeAndLoad() { events.push("authorize"); return manifest; },
    async claim() { events.push("claim"); return claim; },
    async recheckAndMarkIntent() { events.push("intent"); },
    async complete(_claim, evidence) {
      assert.match(evidence.evidenceFingerprint, /^[a-f0-9]{64}$/);
      events.push("complete");
    },
    async review(_claim, reason) { events.push(`review:${reason}`); },
  };
  const bank: CorrectionBank = {
    async cancel(_environment, input) {
      assert.equal(input.strictEffectivePayments, true);
      assert.equal(input.expectedAmount, 279.9);
      assert.equal(input.expectedDueDate, item.dueDate);
      assert.equal(input.expectedPayerDocument, item.payerDocument);
      events.push("GET");
      await input.onMutationStart();
      events.push("PUT", "GET");
      return bankResult();
    },
    async confirmOnly() { events.push("GET_ONLY"); return bankResult(true); },
  };
  const request = { operationId, receivableId: item.receivableId, manifestFingerprint: fingerprint };
  const run = () => cancelCorrectionItem(request, { store, bank });
  return { events, item, manifest, claim, store, bank, request, run, bankResult };
}

test("exact item cancellation awaits durable intent before PUT and confirms before local completion", async () => {
  const f = await fixture();
  assert.deepEqual(await f.run(), { state: "COMPLETE", replayed: false });
  assert.deepEqual(f.events, ["authorize", "claim", "GET", "intent", "PUT", "GET", "complete"]);
});

test("authorization denial blocks claims and remote work", async () => {
  const f = await fixture();
  f.store.authorizeAndLoad = async () => { throw Error("forbidden"); };
  await assert.rejects(f.run, /forbidden/);
  assert.deepEqual(f.events, []);
});

test("request cannot supply an actor or arbitrary extra bank instructions", async () => {
  const f = await fixture();
  Object.assign(f.request, { actorId: id(9) });
  await assert.rejects(f.run, /INVALID_REQUEST/);
  assert.deepEqual(f.events, []);
});

test("target outside immutable manifest never claims or calls bank", async () => {
  const f = await fixture(); f.request.receivableId = id(10);
  await assert.rejects(f.run, /ITEM_OUTSIDE_MANIFEST/);
  assert.deepEqual(f.events, ["authorize"]);
});

test("changed manifest values invalidate approval", async () => {
  const f = await fixture(); f.manifest.items[0].amountCents++;
  await assert.rejects(f.run, /MANIFEST_CHANGED/);
  assert.deepEqual(f.events, ["authorize"]);
});

test("stale client fingerprint blocks operation", async () => {
  const f = await fixture(); f.request.manifestFingerprint = "0".repeat(64);
  await assert.rejects(f.run, /STALE_APPROVAL/);
  assert.deepEqual(f.events, ["authorize"]);
});

test("claim cannot substitute another title", async () => {
  const f = await fixture(); f.claim.item.nossoNumero = "987654321";
  await assert.rejects(f.run, /CLAIM_SCOPE_MISMATCH/);
  assert.deepEqual(f.events, ["authorize", "claim"]);
});

test("completed replay still checks authorization and does no bank work", async () => {
  const f = await fixture(); f.claim.mode = "COMPLETE";
  assert.deepEqual(await f.run(), { state: "COMPLETE", replayed: true });
  assert.deepEqual(f.events, ["authorize", "claim"]);
});

test("paid or partial bank evidence blocks before mutation", async () => {
  const f = await fixture();
  f.bank.cancel = async () => { f.events.push("GET_PAID"); throw Error("paid"); };
  await assert.rejects(f.run, /REMOTE_OR_GUARD_REVIEW/);
  assert.deepEqual(f.events, ["authorize", "claim", "GET_PAID", "review:REMOTE_OR_GUARD_REVIEW"]);
});

test("local concurrent payment or expired lease blocks awaited mutation callback", async () => {
  const f = await fixture();
  f.store.recheckAndMarkIntent = async () => { throw Error("CAS_OR_PAYMENT_CHANGED"); };
  await assert.rejects(f.run, /REMOTE_OR_GUARD_REVIEW/);
  assert.equal(f.events.includes("PUT"), false);
  assert.equal(f.events.includes("complete"), false);
});

test("failure after PUT is ambiguous and cannot complete local cancellation", async () => {
  const f = await fixture();
  f.bank.cancel = async (_environment, input) => {
    await input.onMutationStart(); f.events.push("PUT"); throw Error("timeout");
  };
  await assert.rejects(f.run, /REMOTE_AMBIGUOUS/);
  assert.equal(f.events.at(-1), "review:REMOTE_AMBIGUOUS");
  assert.equal(f.events.includes("complete"), false);
});

test("ambiguous retry uses only GET and no repeat PUT", async () => {
  const f = await fixture(); f.claim.mode = "CONFIRM_ONLY";
  await f.run();
  assert.deepEqual(f.events, ["authorize", "claim", "GET_ONLY", "complete"]);
});

test("ambiguous retry remaining pending stays review and never reissues", async () => {
  const f = await fixture(); f.claim.mode = "CONFIRM_ONLY";
  f.bank.confirmOnly = async () => ({ ...f.bankResult(true), situationCode: 2, remoteStatus: "PENDING" });
  await assert.rejects(f.run, /REMOTE_OR_GUARD_REVIEW/);
  assert.equal(f.events.includes("complete"), false);
});

test("confirm-only dependency cannot request mutation intent", async () => {
  const f = await fixture(); f.claim.mode = "CONFIRM_ONLY";
  f.bank.confirmOnly = async (_environment, input) => {
    await input.onMutationStart(); return f.bankResult();
  };
  await assert.rejects(f.run, /REMOTE_OR_GUARD_REVIEW/);
  assert.equal(f.events.includes("intent"), false);
});

test("remote success plus local failure is held for synchronization, not repeated blindly", async () => {
  const f = await fixture();
  f.store.complete = async () => { throw Error("database unavailable"); };
  await assert.rejects(f.run, /LOCAL_SYNC_AFTER_REMOTE/);
  assert.equal(f.events.at(-1), "review:LOCAL_SYNC_AFTER_REMOTE");
});

test("audit failure is explicit and never reported as completion", async () => {
  const f = await fixture();
  f.bank.cancel = async () => { throw Error("preflight"); };
  f.store.review = async () => { throw Error("db unavailable"); };
  await assert.rejects(f.run, /AUDIT_WRITE_FAILED/);
});

test("forged callback-free mutation result never completes", async () => {
  const f = await fixture(); f.bank.cancel = async () => f.bankResult();
  await assert.rejects(f.run, /REMOTE_OR_GUARD_REVIEW/);
  assert.equal(f.events.includes("complete"), false);
});

test("duplicate bank identity across distinct receivables is rejected", async () => {
  const f = await fixture();
  f.manifest.items.push({ ...f.item, receivableId: id(11) });
  f.manifest.fingerprint = await manifestFingerprint(f.request.operationId, f.manifest.items);
  f.request.manifestFingerprint = f.manifest.fingerprint;
  await assert.rejects(f.run, /INVALID_MANIFEST_ITEM/);
  assert.deepEqual(f.events, ["authorize"]);
});

test("calendar-impossible date is rejected", async () => {
  const f = await fixture(); f.manifest.items[0].dueDate = "2026-02-30";
  f.manifest.fingerprint = await manifestFingerprint(f.request.operationId, f.manifest.items);
  f.request.manifestFingerprint = f.manifest.fingerprint;
  await assert.rejects(f.run, /INVALID_MANIFEST_ITEM/);
});

test("completed operation never permits another bank attempt", async () => {
  const f = await fixture(); f.manifest.state = "COMPLETE";
  await assert.rejects(f.run, /COMPLETED_OPERATION_REOPENED/);
  assert.deepEqual(f.events, ["authorize", "claim"]);
});

test("already canceled at bank still passes completion race/CAS guard", async () => {
  const f = await fixture(); f.bank.cancel = async () => f.bankResult(true);
  f.store.complete = async () => { throw Error("LOCAL_PAYMENT_CHANGED"); };
  await assert.rejects(f.run, /LOCAL_SYNC_AFTER_REMOTE/);
  assert.equal(f.events.includes("intent"), false);
  assert.equal(f.events.at(-1), "review:LOCAL_SYNC_AFTER_REMOTE");
});
