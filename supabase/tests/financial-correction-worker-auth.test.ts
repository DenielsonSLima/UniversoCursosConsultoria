import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

// Execute the actual deployed-worker HTTP boundary with dependencies stubbed.
// Bank processing is deliberately never executed by this boundary-only test.
async function workerHarness() {
  const source = await readFile(new URL("../functions/technical-manual-cycle-recovery-worker/index.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    transformers: { before: [context => root => ts.visitEachChild(root,
      node => ts.isImportDeclaration(node) ? context.factory.createEmptyStatement() : node,
      context)] },
  }).outputText;
  let handler: (request: Request) => Promise<Response>;
  const calls: string[] = [];
  const secret = "synthetic-worker-secret-for-boundary-only";
  const bindings = {
    createClient: () => ({ rpc: async () => ({ data: secret, error: null }) }),
    safeEqual: (a: string, b: string) => a === b,
    CORRECTION_ACTION: "cancel_approved_financial_correction_item",
    CLASS_RULE_ACTION: "apply_approved_financial_correction_class_rule",
    runApprovedClassRule: async () => { calls.push("class-rule"); return { success: true }; },
    runApprovedCorrectionItem: async () => { calls.push("cancel-only"); return { success: true, reissued: false }; },
    parseInternalCycleWorkerRequest: () => { calls.push("legacy"); throw Error("legacy must not run"); },
    CorrectionBlocked: class extends Error {},
    InternalCycleRecoveryRequestError: class extends Error {},
    IssuanceHttpError: class extends Error {},
    errorMessage: () => "sanitized",
    Deno: {
      env: { get: (name: string) => name === "SUPABASE_URL" ? "https://example.invalid" : "synthetic-service-key" },
      serve: (fn: typeof handler) => { handler = fn; },
    },
  };
  // Imports removed by TS AST, not a text rewrite of auth or handler logic.
  new Function(...Object.keys(bindings), compiled.replace(/export\s*\{\s*\};?\s*$/, ""))(...Object.values(bindings));
  return { handler: handler!, calls, secret };
}

test("worker denies unauthenticated cancel-only request before dispatch", async () => {
  const h = await workerHarness();
  const response = await h.handler(new Request("https://example.invalid", {
    method: "POST", body: JSON.stringify({ action: "cancel_approved_financial_correction_item" }),
  }));
  assert.equal(response.status, 401);
  assert.deepEqual(h.calls, []);
});

test("worker denies wrong secret before correction dispatch", async () => {
  const h = await workerHarness();
  const response = await h.handler(new Request("https://example.invalid", {
    method: "POST", headers: { "X-Banese-Worker-Token": "invalid" },
    body: JSON.stringify({ action: "cancel_approved_financial_correction_item" }),
  }));
  assert.equal(response.status, 401);
  assert.deepEqual(h.calls, []);
});

test("authorized correction action returns without calling legacy resume/reissue", async () => {
  const h = await workerHarness();
  const response = await h.handler(new Request("https://example.invalid", {
    method: "POST", headers: { "X-Banese-Worker-Token": h.secret },
    body: JSON.stringify({ action: "cancel_approved_financial_correction_item" }),
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(h.calls, ["cancel-only"]);
  assert.equal((await response.json()).reissued, false);
});
