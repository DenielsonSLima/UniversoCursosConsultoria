import assert from "node:assert/strict";
import { ActivationError, type ActivationContext, type ActivationDependencies,
  type ActivationRequest, parseActivationRequest } from "./contract.ts";
import { runActivation } from "./orchestrator.ts";
import type { GatewayChargeResult } from "../gateways/router.ts";
import { RENEGOTIATION_RECEIPT_INSTRUCTION } from "../banese/internal/renegotiation-billing.ts";

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const request: ActivationRequest = {
  agreementId: id(1), requestId: id(2), expectedVersion: 2,
  expectedFingerprint: "a".repeat(64), confirm: true,
};
const makeContext = (): ActivationContext => ({
  operationId: id(3), agreementId: id(1), requestId: id(2), leaseToken: id(4),
  state: "CANCELING_SOURCES", courseType: "TECNICO",
  identity: { alunoId: id(5), matriculaId: id(6), turmaId: id(7), poloId: id(8) },
  payerDocument: "12345678901",
  sources: [9, 10].map((n) => ({ receivableId: id(n), kind: "LOCAL", state: "PENDING",
    attemptKey: id(n + 100), sourceFingerprint: "a".repeat(64), bankSnapshot: null })),
  replacements: [],
  replacementPlan: [1, 2].map((sequence) => ({ sequence, kind: "INSTALLMENT", dueDate: "2027-01-01", amountCents: 10000,
    financialTerms: { nominalAmount: 100, dueDate: "2027-01-01" },
    collectionPolicy: { daysAfterDue: 60, instruction: RENEGOTIATION_RECEIPT_INSTRUCTION } })),
  runtime: { routeId: id(19), credentialId: id(20), issuerPoloId: id(21), environment: "production", convenio: "1234",
    agency: "033", account: "12345678", metadata: {}, metadataFingerprint: "c".repeat(64) },
});
const harness = () => {
  const context = makeContext();
  const calls: string[] = [];
  const dependencies: ActivationDependencies = {
    start: async () => { calls.push("authorize"); return { operationId: context.operationId }; },
    claim: async () => { calls.push("claim"); return context; },
    preflight: async () => { calls.push("preflight"); },
    markCancelIntent: async (_c, source) => { calls.push(`intent:${source.receivableId}`); },
    cancelSource: async (_c, source, intent) => {
      await intent(); calls.push(`cancel:${source.receivableId}`);
      return { kind: "LOCAL", situationCode: null, identityVerified: true,
        paymentsVerified: false, paymentCount: 0, evidenceFingerprint: "b".repeat(64), confirmedAt: new Date().toISOString() };
    },
    confirmSource: async (_c, source) => { calls.push(`confirm:${source.receivableId}`); },
    prepareReplacements: async (ctx) => {
      calls.push("prepare");
      assert.equal(ctx.sources.every((row) => row.state === "CANCELED_CONFIRMED"), true);
      ctx.replacements = [11, 12].map((n) => ({ receivableId: id(n), attemptKey: id(n + 100),
        state: "PENDING", financialTerms: { nominalAmount: 100, dueDate: "2027-01-01" } }));
      return ctx;
    },
    issueReplacement: async (_c, item) => { calls.push(`issue:${item.receivableId}`); return {} as GatewayChargeResult; },
    confirmReplacement: async (_c, item) => { calls.push(`persist:${item.receivableId}`); },
    finish: async () => { calls.push("finish"); },
    release: async () => { calls.push("release"); },
    fail: async (_c, error) => { calls.push(`fail:${error.code}`); },
  };
  return { dependencies, context, calls };
};

Deno.test("activation request rejects absent confirmation, stale/extra amount inputs and coerced identity", () => {
  assert.deepEqual(parseActivationRequest(request), request);
  for (const changes of [{ confirm: false }, { amount: 1 }, { expectedVersion: "2" },
    { agreementId: [request.agreementId] }, { expectedFingerprint: "f" }, { requestId: "" }]) {
    assert.throws(() => parseActivationRequest({ ...request, ...changes }), /inválida/);
  }
});
Deno.test("activation authorizes before claim, cancels all sources before any replacement and persists before ACTIVE", async () => {
  const h = harness();
  const result = await runActivation(request, h.dependencies);
  assert.equal(result.success, true);
  assert.equal(result.state, "ACTIVE");
  assert.equal(result.sourcesCanceled, 2);
  assert.equal(result.replacementsIssued, 2);
  assert.deepEqual(h.calls.slice(0, 3), ["authorize", "claim", "preflight"]);
  assert.ok(h.calls.indexOf("prepare") > h.calls.indexOf(`confirm:${id(10)}`));
  assert.equal(h.calls.at(-1), "finish");
  const publicResult = JSON.stringify(result);
  assert.equal(/financialTerms|bankSnapshot|pixPayload|leaseToken/.test(publicResult), false);
});
Deno.test("authorization failure never claims an operation or calls bank", async () => {
  const h = harness();
  h.dependencies.start = async () => { throw new ActivationError("DENIED", "Negado", false, 403); };
  await assert.rejects(() => runActivation(request, h.dependencies), /Negado/);
  assert.deepEqual(h.calls, []);
});
Deno.test("preflight failure does not cancel the first source", async () => {
  const h = harness();
  h.dependencies.preflight = async () => { throw new ActivationError("CONFIG", "Configuração indisponível"); };
  const result = await runActivation(request, h.dependencies);
  assert.equal(result.state, "REVIEW_REQUIRED");
  assert.equal(h.calls.some((call) => call.startsWith("cancel:")), false);
});
Deno.test("second source failure preserves first confirmation and never prepares or emits", async () => {
  const h = harness();
  const cancel = h.dependencies.cancelSource;
  h.dependencies.cancelSource = async (ctx, source, intent) => {
    if (source.receivableId === id(10)) throw new Error("network error with private upstream response");
    return await cancel(ctx, source, intent);
  };
  const result = await runActivation(request, h.dependencies);
  assert.equal(result.sourcesCanceled, 1);
  assert.equal(result.retryable, true);
  assert.equal(result.state, "CANCELING_SOURCES");
  assert.equal(h.calls.includes("prepare"), false);
  assert.equal(result.message.includes("private"), false);
});
Deno.test("lost persistence after new POST does not issue next title or mark ACTIVE", async () => {
  const h = harness();
  h.dependencies.confirmReplacement = async () => { throw new ActivationError("PERSISTENCE", "Resposta não confirmada", true); };
  const result = await runActivation(request, h.dependencies);
  assert.equal(result.state, "ISSUING_REPLACEMENTS");
  assert.equal(result.success, false);
  assert.equal(h.calls.filter((call) => call.startsWith("issue:")).length, 1);
  assert.equal(h.calls.includes("finish"), false);
});
Deno.test("terminal ACTIVE replay needs no lease or bank call", async () => {
  const h = harness();
  h.context.state = "ACTIVE";
  h.context.leaseToken = "";
  h.context.sources.forEach((item) => { item.state = "CANCELED_CONFIRMED"; });
  h.context.replacements = [11, 12].map((n) => ({ receivableId: id(n), attemptKey: id(n + 100), state: "ISSUED",
    financialTerms: h.context.replacementPlan[0].financialTerms }));
  const result = await runActivation(request, h.dependencies);
  assert.equal(result.success, true);
  assert.deepEqual(h.calls, ["authorize", "claim"]);
});
Deno.test("budget boundary releases lease and preserves the same request", async () => {
  const h = harness();
  let now = 0;
  h.dependencies.now = () => { now += 50_000; return now; };
  const result = await runActivation(request, h.dependencies);
  assert.equal(result.requestId, request.requestId);
  assert.equal(result.success, false);
  assert.equal(h.calls.includes("release"), true);
  assert.equal(h.calls.some((call) => call.startsWith("cancel:")), false);
});
Deno.test("cross-agreement context is rejected before preflight or mutation", async () => {
  const h = harness();
  h.context.agreementId = id(888);
  await assert.rejects(() => runActivation(request, h.dependencies), /não corresponde/);
  assert.deepEqual(h.calls, ["authorize", "claim"]);
});
