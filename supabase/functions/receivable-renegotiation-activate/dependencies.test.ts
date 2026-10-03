import assert from "node:assert/strict";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ActivationError, type CancellationEvidence } from "./contract.ts";
import { createActivationDependencies, startActivation } from "./dependencies.ts";
import { fixtureId, syntheticContext, syntheticReplacement } from "./test-fixtures.ts";

const evidence: CancellationEvidence = { kind: "BANESE", situationCode: 5, paymentsVerified: true,
  paymentCount: 0, identityVerified: true, evidenceFingerprint: "a".repeat(64), confirmedAt: "2030-01-01T00:00:00Z" };
const setup = (response: unknown, error: unknown = null) => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const admin = { rpc: async (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args }); return { data: response, error };
  } } as unknown as SupabaseClient;
  return { calls, admin, dependencies: createActivationDependencies({ admin,
    supabaseUrl: "http://localhost", start: async () => ({ operationId: fixtureId(1) }) }) };
};

Deno.test("source confirmation requires persisted canonical context and item state", async () => {
  const context = syntheticContext();
  const missing = setup({ success: true });
  await assert.rejects(() => missing.dependencies.confirmSource(context, context.sources[0], evidence));
  const notConfirmed = setup(structuredClone(context));
  await assert.rejects(() => notConfirmed.dependencies.confirmSource(context, context.sources[0], evidence), /não foi persistida/);
  const saved = structuredClone(context); saved.sources[0].state = "CANCELED_CONFIRMED";
  const positive = setup(saved);
  await positive.dependencies.confirmSource(context, context.sources[0], evidence);
  assert.deepEqual(positive.calls[0], { name: "confirm_receivable_renegotiation_source_cancel_secure", args: {
    p_operation_id: context.operationId, p_lease_token: context.leaseToken,
    p_receivable_id: context.sources[0].receivableId, p_attempt_key: context.sources[0].attemptKey,
    p_evidence: evidence,
  } });
  const wrongOperation = setup({ ...saved, operationId: fixtureId(77) });
  await assert.rejects(() => wrongOperation.dependencies.confirmSource(context, context.sources[0], evidence), /não corresponde/);
});

Deno.test("finish cannot acknowledge ACTIVE without every persisted replacement", async () => {
  const context = syntheticContext();
  context.state = "ISSUING_REPLACEMENTS"; context.sources[0].state = "CANCELED_CONFIRMED";
  context.replacements = [{ ...syntheticReplacement(), receivableId: fixtureId(22), state: "ISSUED" }];
  const incomplete = setup({ ...context, state: "ACTIVE", replacements: [] });
  await assert.rejects(() => incomplete.dependencies.finish(context), /conclusão do acordo/);
  const unconfirmed = setup(context);
  await assert.rejects(() => unconfirmed.dependencies.finish(context), /não foi confirmado/);
  const positive = setup({ ...context, state: "ACTIVE", leaseToken: null });
  await positive.dependencies.finish(context);
  assert.equal(positive.calls[0].name, "finish_receivable_renegotiation_activation_secure");
});

Deno.test("release and review require explicit acknowledgements", async () => {
  const context = syntheticContext();
  const missing = setup({});
  await assert.rejects(() => missing.dependencies.release(context), /não foi confirmado/);
  await assert.rejects(() => missing.dependencies.fail(context, new ActivationError("INVALID", "Review")), /não foi confirmado/);
  await setup({ released: true }).dependencies.release(context);
  await setup({ state: "REVIEW_REQUIRED" }).dependencies.fail(context, new ActivationError("INVALID", "Review"));
});

Deno.test("start RPC forwards explicit consent; absent consent defaults false; authorization remains in SQL", async () => {
  const request = { agreementId: fixtureId(2), requestId: fixtureId(3), expectedVersion: 3,
    expectedFingerprint: "a".repeat(64), confirm: true as const };
  const positive = setup({ operationId: fixtureId(1) });
  for (const consent of [undefined, false, true]) {
    await startActivation(positive.admin, { ...request, approveCustomTerms: consent });
    const call = positive.calls.at(-1);
    assert.ok(call);
    assert.equal(call.args.p_approve_custom_terms, consent ?? false);
    assert.equal(call.args.p_expected_version, 3);
    assert.equal(call.name, "start_receivable_renegotiation_activation_secure");
    assert.equal(Object.keys(call.args).some((key) => /role|perfil|permission/i.test(key)), false);
  }
  const conflict = setup(null, { code: "40001", message: "RENEGOTIATION_REPLACEMENT_CHANGED" });
  await assert.rejects(() => startActivation(conflict.admin, request), (error) =>
    error instanceof ActivationError && error.code === "ACTIVATION_SNAPSHOT_CONFLICT" && !error.retryable);
});

Deno.test("only pending Pix requests bank recovery cooldown; cooldown is explicit and safe", async () => {
  const context = syntheticContext();
  const pending = setup({ released: true });
  await pending.dependencies.fail(context, new ActivationError("BANESE_PIX_PENDING", "Pending", true));
  assert.equal(pending.calls[0].args.p_retry_code, "BANESE_PIX_PENDING");
  const network = setup({ released: true });
  await network.dependencies.fail(context, new ActivationError("BANK_TEMPORARILY_UNAVAILABLE", "Network", true));
  assert.equal(network.calls[0].args.p_retry_code, null);
  const cooldown = setup(null, { code: "55P03", message: "BANESE_PIX_COOLDOWN" });
  await assert.rejects(() => cooldown.dependencies.claim(context.operationId), (error) =>
    error instanceof ActivationError && error.code === "BANESE_PIX_COOLDOWN" && error.retryable &&
    /Aguarde o intervalo/.test(error.message));
  const busy = setup(null, { code: "55P03", message: "Lease temporarily held" });
  await assert.rejects(() => busy.dependencies.claim(context.operationId), (error) =>
    error instanceof ActivationError && error.code === "ACTIVATION_PERSISTENCE_UNCONFIRMED" && error.retryable);
});
