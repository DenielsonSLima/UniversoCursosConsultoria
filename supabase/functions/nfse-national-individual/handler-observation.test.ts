import assert from "node:assert/strict";
import {
  type CancellationRow,
  createIndividualHandler,
  type IndividualDependencies,
  type IndividualRow,
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
const reference = { requestId: id(4), previewId: id(5), cancelPreviewId: id(6) };
const issue: IndividualRow = {
  previewId: reference.previewId,
  expiresAt: "2027-01-01T00:00:00Z",
  state: "PROCESSING",
  dispatch: false,
  snapshot: { private: "PRIVATE_SNAPSHOT" },
  series: "49998",
  number: "1",
  issuedAt: "2026-11-12T12:00:00-03:00",
  dpsId: "PRIVATE_DPS_ID",
  fiscalInput: { private: "PRIVATE_FISCAL_INPUT" },
  signedDpsXml: "PRIVATE_SIGNED_DPS",
  result: null,
  configurationVersion: 1,
  certificateFingerprint: "PRIVATE_FINGERPRINT",
  authorizedXml: "PRIVATE_AUTHORIZED_XML",
};
const cancellation: CancellationRow = {
  previewId: reference.previewId,
  cancelPreviewId: reference.cancelPreviewId,
  expiresAt: issue.expiresAt,
  state: "PROCESSING",
  dispatch: false,
  accessKey: "0".repeat(50),
  number: "1",
  reasonCode: "1",
  justification: "Justificativa exclusivamente sintética.",
  eventReferenceId: "PRIVATE_EVENT_ID",
  occurredAt: issue.issuedAt,
  issuerCnpj: "PRIVATE_ISSUER",
  eventInput: { private: "PRIVATE_EVENT_INPUT" },
  signedEventXml: "PRIVATE_SIGNED_EVENT",
  result: null,
};
function request(action: string, overrides: Record<string, unknown> = {}) {
  return new Request("https://synthetic.invalid/individual", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scope,
      action,
      requestId: reference.requestId,
      previewId: reference.previewId,
      ...(action === "OBSERVE_CANCEL" ? { cancelPreviewId: reference.cancelPreviewId } : {}),
      ...overrides,
    }),
  });
}
function harness(state: string, overrides: Partial<IndividualDependencies> = {}) {
  const calls: string[] = [];
  const unexpected = async () => {
    assert.fail("Observation cannot recalculate, execute, prepare, or mutate.");
  };
  const dependencies: IndividualDependencies = {
    authorize: async () => {
      calls.push("AUTHORIZE");
      return actor;
    },
    rateLimited: () => false,
    respond: (_request, body, status) => Response.json(body, { status }),
    ledger: async (command, authenticatedActor, action) => {
      assert.equal(action, "READ");
      assert.equal(authenticatedActor, actor);
      assert.deepEqual(command.scope, scope);
      assert.equal(command.requestId, reference.requestId);
      assert.equal(command.previewId, reference.previewId);
      calls.push("ISSUE_READ");
      return { ...issue, state };
    },
    cancellation: async (command, authenticatedActor, action) => {
      assert.equal(action, "READ");
      assert.equal(authenticatedActor, actor);
      assert.deepEqual(command.scope, scope);
      for (const [key, value] of Object.entries(reference)) {
        assert.equal(command[key as keyof typeof reference], value);
      }
      calls.push("CANCEL_READ");
      return { ...cancellation, state };
    },
    payload: () => ({ amount: "1.00", recipientName: "Destinatário sintético" }),
    prepare: unexpected,
    execute: unexpected,
    prepareCancellation: unexpected,
    executeCancellation: unexpected,
    capability: unexpected,
    ...overrides,
  };
  return { handler: createIndividualHandler(dependencies), calls };
}

Deno.test("issue observation reads canonical snapshots in every state without contacting the fiscal service", async () => {
  for (const state of ["PREVIEWED", "PROCESSING", "AWAITING_CONFIRMATION", "AUTHORIZED", "REJECTED", "BLOCKED"]) {
    const { handler, calls } = harness(state);
    const response = await handler(request("OBSERVE"));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.data.state, state === "PROCESSING" ? "AWAITING_CONFIRMATION" : state);
    assert.equal(result.data.previewId, reference.previewId);
    assert.deepEqual(result.scope, scope);
    assert.deepEqual(calls, ["AUTHORIZE", "ISSUE_READ"]);
    assert(!JSON.stringify(result).includes("PRIVATE_"));
  }
});

Deno.test("cancellation observation returns pending, analysis, terminal and preview snapshots without another fiscal action", async () => {
  for (const state of ["PREVIEWED", "PROCESSING", "CANCELLATION_PENDING", "AWAITING_ANALYSIS", "CANCELLED", "CANCELLATION_REJECTED", "BLOCKED"]) {
    const { handler, calls } = harness(state);
    const response = await handler(request("OBSERVE_CANCEL"));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.data.state, state === "PROCESSING" ? "CANCELLATION_PENDING" : state);
    assert.equal(result.data.previewId, reference.previewId);
    assert.equal(result.data.cancelPreviewId, reference.cancelPreviewId);
    assert.deepEqual(calls, ["AUTHORIZE", "CANCEL_READ"]);
    assert(!JSON.stringify(result).includes("PRIVATE_"));
  }
});

Deno.test("observation rejects invalid references and dispatch confirmation fields before authorization", async () => {
  for (const action of ["OBSERVE", "OBSERVE_CANCEL"]) {
    for (const extra of [{ previewId: "invalid" }, { confirmed: true }, { requestId: "invalid" }]) {
      const { handler, calls } = harness("PROCESSING");
      assert.equal((await handler(request(action, extra))).status, 400);
      assert.deepEqual(calls, []);
    }
  }
  const { handler, calls } = harness("PROCESSING");
  assert.equal((await handler(request("OBSERVE_CANCEL", { cancelPreviewId: "invalid" }))).status, 400);
  assert.deepEqual(calls, []);
});

Deno.test("observation requires authorization and preserves a ledger reference denial", async () => {
  for (const action of ["OBSERVE", "OBSERVE_CANCEL"]) {
    const denied = harness("PROCESSING", { authorize: async () => { throw new Error("Denied"); } });
    assert.equal((await denied.handler(request(action))).status, 403);
    assert.deepEqual(denied.calls, []);

    const outside = async () => {
      throw Object.assign(new Error("Wrong reference"), { code: "INDIVIDUAL_OPERATION_SCOPE_DENIED" });
    };
    const invalid = harness("PROCESSING", { ledger: outside, cancellation: outside });
    assert.equal((await invalid.handler(request(action))).status, 403);
    assert.deepEqual(invalid.calls, ["AUTHORIZE"]);
  }
});
