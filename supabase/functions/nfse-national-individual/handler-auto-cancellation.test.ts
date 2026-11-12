import assert from "node:assert/strict";
import {
  type CancellationRow,
  createIndividualHandler,
  type IndividualDependencies,
} from "./handler.ts";

const id = (value: number) =>
  `00000000-0000-0000-0000-${String(value).padStart(12, "0")}`;
const actor = id(1);
const scope = {
  contextKey: id(2),
  poloId: id(3),
  environment: "PRODUCAO" as const,
  month: "2026-11",
};
const reference = {
  requestId: id(4),
  previewId: id(5),
  cancelPreviewId: id(6),
};
const analysis: CancellationRow = {
  previewId: reference.previewId,
  cancelPreviewId: reference.cancelPreviewId,
  expiresAt: "2027-01-01T00:00:00Z",
  state: "AWAITING_ANALYSIS",
  dispatch: false,
  accessKey: "0".repeat(50),
  number: "1",
  reasonCode: "1",
  justification: "Justificativa exclusivamente sintética.",
  eventReferenceId: "SYNTHETIC_EVENT",
  occurredAt: "2026-11-12T12:00:00-03:00",
  issuerCnpj: "SYNTHETIC_ISSUER",
  eventInput: {},
  signedEventXml: "SYNTHETIC_SIGNED_EVENT",
  result: { message: "Em análise." },
};
function request(action: string, overrides: Record<string, unknown> = {}) {
  return new Request("https://synthetic.invalid/individual", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scope,
      ...reference,
      action,
      ...(action === "CANCEL" || action === "RETRY_CANCEL"
        ? { confirmed: true }
        : {}),
      ...(action === "RETRY_CANCEL" ? { retryRequestId: id(7) } : {}),
      ...overrides,
    }),
  });
}
function harness(overrides: Partial<IndividualDependencies> = {}) {
  const calls: string[] = [];
  let row = globalThis.structuredClone(analysis);
  const unexpected = async () => {
    assert.fail("Automatic cancellation recovery cannot prepare or issue.");
  };
  const dependencies: IndividualDependencies = {
    authorize: async () => {
      calls.push("AUTHORIZE");
      return actor;
    },
    rateLimited: () => false,
    respond: (_request, body, status) => Response.json(body, { status }),
    cancellation: async (command, authenticatedActor, action, input) => {
      assert.equal(authenticatedActor, actor);
      assert.deepEqual(command.scope, scope);
      for (const [field, value] of Object.entries(reference)) {
        assert.equal(command[field as keyof typeof reference], value);
      }
      assert(["READ", "FINISH"].includes(action), "No dispatch lease is allowed.");
      calls.push(action);
      if (action === "FINISH") {
        const result = input as Record<string, unknown>;
        row = { ...row, state: String(result.state), result };
      }
      return row;
    },
    executeCancellation: async (command, authenticatedActor, cancellation, reconcile) => {
      assert.equal(authenticatedActor, actor);
      assert.equal(command.action, "RECONCILE_CANCEL");
      assert.equal(reconcile, true, "Recovery must use GET-only reconciliation.");
      assert.equal(cancellation.cancelPreviewId, reference.cancelPreviewId);
      assert.equal(cancellation.signedEventXml, analysis.signedEventXml);
      calls.push("GET_EVENT");
      return { state: "CANCELLED", accessKey: analysis.accessKey };
    },
    ledger: unexpected,
    prepare: unexpected,
    execute: unexpected,
    prepareCancellation: unexpected,
    capability: unexpected,
    payload: () => ({}),
    ...overrides,
  };
  return { handler: createIndividualHandler(dependencies), calls };
}

Deno.test("analysis cancellation automatically reconciles the same event without another dispatch", async () => {
  const { handler, calls } = harness();
  const response = await handler(request("RECONCILE_CANCEL"));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.data.state, "CANCELLED");
  assert.equal(result.data.previewId, reference.previewId);
  assert.equal(result.data.cancelPreviewId, reference.cancelPreviewId);
  assert.deepEqual(calls, ["AUTHORIZE", "READ", "GET_EVENT", "FINISH"]);
});

Deno.test("analysis cancellation cannot be resent by CANCEL or RETRY_CANCEL", async () => {
  for (const action of ["CANCEL", "RETRY_CANCEL"]) {
    const { handler, calls } = harness();
    const response = await handler(request(action));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.state, "AWAITING_ANALYSIS");
    assert.deepEqual(calls, ["AUTHORIZE", "READ"]);
  }
});

Deno.test("automatic cancellation reconciliation validates IDs before authorization and denies an unauthorized scope", async () => {
  const invalid = harness();
  const bad = await invalid.handler(request("RECONCILE_CANCEL", { cancelPreviewId: "invalid" }));
  assert.equal(bad.status, 400);
  assert.deepEqual(invalid.calls, []);

  const denied = harness({ authorize: async () => { throw new Error("Denied"); } });
  const response = await denied.handler(request("RECONCILE_CANCEL"));
  assert.equal(response.status, 403);
  assert.deepEqual(denied.calls, []);
});

Deno.test("an operation reference rejected by the ledger never reaches fiscal reconciliation", async () => {
  const { handler, calls } = harness({ cancellation: async () => {
    throw Object.assign(new Error("Wrong reference"), { code: "INDIVIDUAL_OPERATION_SCOPE_DENIED" });
  } });
  const response = await handler(request("RECONCILE_CANCEL"));
  assert.equal(response.status, 403);
  assert.deepEqual(calls, ["AUTHORIZE"]);
});
