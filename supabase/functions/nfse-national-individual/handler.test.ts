import assert from "node:assert/strict";
import {
  type CancellationRow,
  createIndividualHandler,
  type IndividualDependencies,
  type IndividualRow,
} from "./handler.ts";
const id = (n: number) =>
  `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const scope = {
  contextKey: id(10),
  poloId: id(1),
  environment: "PRODUCAO" as const,
  month: "2026-11",
};
const command = {
  scope,
  action: "PREVIEW",
  requestId: id(50),
  partnerId: id(30),
  modelId: id(20),
  modelVersion: 1,
  amount: "1.00",
  competenceDate: "2026-01-01",
  serviceDate: "2026-01-01",
};
const baseRow: IndividualRow = {
  previewId: id(90),
  expiresAt: "2027-01-01T00:00:00Z",
  state: "PREVIEWED",
  dispatch: false,
  snapshot: { private: "SNAPSHOT_SENTINEL" },
  series: "49998",
  number: "1",
  issuedAt: "2026-11-10T12:00:00-03:00",
  dpsId: "DPS_PRIVATE",
  fiscalInput: { private: "IDENTITY_SENTINEL" },
  signedDpsXml: null,
  result: null,
  configurationVersion: 1,
  certificateFingerprint: "FINGERPRINT_SENTINEL",
  authorizedXml: null,
};
const baseCancellation: CancellationRow = {
  previewId: id(90),
  cancelPreviewId: id(91),
  expiresAt: "2027-01-01T00:00:00Z",
  state: "PREVIEWED",
  dispatch: false,
  accessKey: "0".repeat(50),
  number: "1",
  reasonCode: "1",
  justification: "Erro no valor informado.",
  eventReferenceId: "PRE_PRIVATE",
  occurredAt: "2026-11-10T12:00:00-03:00",
  issuerCnpj: "ISSUER_PRIVATE",
  eventInput: { private: "EVENT_SENTINEL" },
  signedEventXml: null,
  result: null,
};
const request = (action = "PREVIEW", extra: Record<string, unknown> = {}) =>
  new Request("https://local.test/individual", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer synthetic",
    },
    body: JSON.stringify(
      action === "PREVIEW" ? { ...command, ...extra } : {
        scope,
        action,
        requestId: id(50),
        previewId: id(90),
        ...(action === "ISSUE" || action === "CANCEL" || action === "RETRY_CANCEL"
          ? { confirmed: true }
          : {}),
        ...(action === "CANCEL_PREVIEW"
          ? { reasonCode: "1", justification: "Erro no valor informado." }
          : {}),
        ...(action === "CANCEL" || action === "RECONCILE_CANCEL" || action === "RETRY_CANCEL"
          ? { cancelPreviewId: id(91) }
          : {}),
        ...extra,
      },
    ),
  });
function harness(
  overrides: Partial<IndividualDependencies> = {},
  initial: Partial<IndividualRow> = {},
  cancelInitial: Partial<CancellationRow> = {},
) {
  const calls: { action: string; reconcile?: boolean; input?: unknown }[] = [];
  let row = { ...globalThis.structuredClone(baseRow), ...initial };
  let cancellation = {
    ...globalThis.structuredClone(baseCancellation),
    ...cancelInitial,
  };
  const deps: IndividualDependencies = {
    authorize: async () => id(11),
    capability: async () => ({ available: true, reason: null }),
    payload: () => ({ amount: "1.00", modelId: id(20) }),
    ledger: async (_c, _a, action, input) => {
      calls.push({ action, input });
      if (action === "PREPARE") {
        row = { ...row, signedDpsXml: "SIGNED_DPS_SENTINEL" };
      }
      if (action === "CLAIM") {
        row = { ...row, state: "PROCESSING", dispatch: true };
      }
      if (action === "FINISH") {
        row = {
          ...row,
          state: String((input as Record<string, unknown>).state),
          result: input as Record<string, unknown>,
        };
      }
      return row;
    },
    cancellation: async (_c, _a, action, input) => {
      calls.push({ action: `CANCEL_${action}`, input });
      if (action === "PREPARE") {
        cancellation = {
          ...cancellation,
          signedEventXml: "SIGNED_EVENT_SENTINEL",
        };
      }
      if (action === "CLAIM") {
        cancellation = { ...cancellation, state: "PROCESSING", dispatch: true };
      }
      if (action === "RETRY_CLAIM") cancellation = { ...cancellation, dispatch: true, retryUsed: true };
      if (action === "FINISH") {
        cancellation = {
          ...cancellation,
          state: String((input as Record<string, unknown>).state),
          result: input as Record<string, unknown>,
        };
      }
      return cancellation;
    },
    prepare: async () => {
      calls.push({ action: "PREPARE_XML" });
      return {
        fiscalInput: { private: "SECRET" },
        dpsId: "DPS_PRIVATE",
        signedDpsXml: "SIGNED_DPS_SENTINEL",
      };
    },
    execute: async (_c, _a, _r, reconcile) => {
      calls.push({ action: "EXECUTE", reconcile });
      return {
        state: "AWAITING_CONFIRMATION",
        signedDpsXml: "SIGNED_DPS_SENTINEL",
      };
    },
    prepareCancellation: async () => {
      calls.push({ action: "PREPARE_EVENT" });
      return {
        eventInput: { private: "SECRET" },
        eventReferenceId: "PRE_PRIVATE",
        signedEventXml: "SIGNED_EVENT_SENTINEL",
      };
    },
    executeCancellation: async (_c, _a, _r, reconcile) => {
      calls.push({ action: "EXECUTE_CANCEL", reconcile });
      return {
        state: "CANCELLATION_PENDING",
        signedEventXml: "SIGNED_EVENT_SENTINEL",
      };
    },
    respond: (_req, body, status) => Response.json(body, { status }),
    rateLimited: () => false,
    ...overrides,
  };
  return { handler: createIndividualHandler(deps), calls };
}
Deno.test("individual rejects homologation, arbitrary fiscal data and invalid dates before authorization", async () => {
  const h = harness();
  for (
    const extra of [
      { scope: { ...scope, environment: "HOMOLOGACAO" } },
      { fiscalInput: {} },
      { amount: "0.00" },
      { competenceDate: "2026-02-30" },
    ]
  ) {
    assert.equal((await h.handler(request("PREVIEW", extra))).status, 400);
  }
  assert.equal(h.calls.length, 0);
});
Deno.test("individual scope denial never reaches ledger and sanitizes errors", async () => {
  const h = harness({
    authorize: async () => {
      throw new Error("PRIVATE_KEY_SENTINEL");
    },
  });
  const response = await h.handler(request());
  assert.equal(response.status, 403);
  assert.equal(h.calls.length, 0);
  assert.equal((await response.text()).includes("SENTINEL"), false);
});
Deno.test("individual preview only exposes selected public snapshot fields", async () => {
  const h = harness();
  const response = await h.handler(request());
  const envelope = await response.json();
  assert.deepEqual(envelope.scope, scope);
  assert.equal(envelope.data.previewId, id(90));
  assert.equal(envelope.data.payload.amount, "1.00");
  assert.equal(
    /SENTINEL|fiscalInput|fingerprint|signedDpsXml|authorizedXml/.test(
      JSON.stringify(envelope),
    ),
    false,
  );
});
Deno.test("individual persists prepared bytes before claiming the one dispatch", async () => {
  const h = harness();
  const response = await h.handler(request("ISSUE"));
  assert.equal(response.status, 200);
  assert.deepEqual(h.calls.map((c) => c.action), [
    "READ",
    "PREPARE_XML",
    "PREPARE",
    "CLAIM",
    "EXECUTE",
    "FINISH",
  ]);
  assert.equal(h.calls.find((c) => c.action === "EXECUTE")?.reconcile, false);
  assert.equal((await response.text()).includes("SENTINEL"), false);
});
Deno.test("individual lease replay and reconcile execute GET only, including an uncertain blocked result", async () => {
  const h = harness({
    execute: async (_c, _a, _r, reconcile) => {
      assert.equal(reconcile, true);
      return { state: "BLOCKED", code: "UNKNOWN" };
    },
  }, {
    state: "PROCESSING",
    dispatch: false,
    signedDpsXml: "SIGNED_DPS_SENTINEL",
  });
  const response = await h.handler(request("ISSUE"));
  assert.equal((await response.json()).data.state, "AWAITING_CONFIRMATION");
  assert.deepEqual(h.calls.map((c) => c.action), ["READ", "FINISH"]);
});
Deno.test("individual terminal reconciliation returns canonical snapshot without executing", async () => {
  const h = harness({}, {
    state: "AUTHORIZED",
    result: { number: "1", accessKey: "0".repeat(50), message: "Autorizada." },
    authorizedXml: "XML_SENTINEL",
  });
  const envelope = await (await h.handler(request("RECONCILE"))).json();
  assert.equal(envelope.data.state, "AUTHORIZED");
  assert.equal(envelope.data.payload.amount, "1.00");
  assert.deepEqual(h.calls.map((c) => c.action), ["READ"]);
  assert.equal(JSON.stringify(envelope).includes("SENTINEL"), false);
});
Deno.test("individual cannot dispatch when the current capability is unavailable", async () => {
  const h = harness({
    capability: async () => ({
      available: false,
      reason: "SCHEMA_NOT_CONFIRMED",
    }),
  });
  const envelope = await (await h.handler(request("ISSUE"))).json();
  assert.equal(envelope.data.capability.available, false);
  assert.deepEqual(h.calls.map((c) => c.action), ["READ"]);
});
Deno.test("cancellation preview accepts only reason 1 on an opaque own operation", async () => {
  const h = harness();
  assert.equal(
    (await h.handler(request("CANCEL_PREVIEW", { accessKey: "0".repeat(50) })))
      .status,
    400,
  );
  assert.equal(
    (await h.handler(request("CANCEL_PREVIEW", { reasonCode: "9" }))).status,
    400,
  );
  const envelope = await (await h.handler(request("CANCEL_PREVIEW"))).json();
  assert.equal(envelope.data.cancelPreviewId, id(91));
  assert.equal(JSON.stringify(envelope).includes("EVENT_SENTINEL"), false);
});
Deno.test("selected cancellation preview accepts only model reference and factual detail; no browser prefix or reason", async () => {
  const h = harness();
  const body = { scope, action: "CANCEL_PREVIEW", requestId: id(50), previewId: id(90),
    cancellationModel: { id: "SYSTEM:SERVICE_NOT_PROVIDED", version: 1 }, detail: "Operação sintética não realizada." };
  const send = (value: unknown) => h.handler(new Request("https://local.test/individual", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value) }));
  assert.equal((await send(body)).status, 200);
  assert.deepEqual(h.calls[0].input, { cancellationModel: body.cancellationModel, detail: body.detail });
  for (const patch of [{ justification: "Prefixo divergente da seleção." }, { reasonCode: "2" },
    { detail: "{{detalhe}}" }, { cancellationModel: { ...body.cancellationModel, name: "Não canônico" } }]) {
    assert.equal((await send({ ...body, ...patch })).status, 400);
  }
});
Deno.test("manual retry probes by GET, claims an additional lease and uses the same prepared event explicitly", async () => {
  const sequence: string[] = [];
  const pending = { ...baseCancellation, state: "CANCELLATION_PENDING", signedEventXml: "SIGNED_EVENT_SENTINEL" };
  const h = harness({
    cancellation: async (_c, _a, action, input) => {
      sequence.push(action);
      if (action === "RETRY_CLAIM") {
        const proof = input as Record<string, unknown>;
        assert.equal(proof.retryRequestId, id(99)); assert.equal(proof.httpStatus, 404);
        assert.match(String(proof.signedEventSha256), /^[a-f0-9]{64}$/);
        return { ...pending, dispatch: true, retryUsed: true };
      }
      return pending;
    },
    executeCancellation: async (_c, _a, row, reconcile) => {
      sequence.push(reconcile ? "GET_PROBE" : "EXPLICIT_SEND");
      assert.equal(row.cancelPreviewId, id(91)); assert.equal(row.signedEventXml, "SIGNED_EVENT_SENTINEL");
      return { state: "CANCELLATION_PENDING", code: "REGISTERED_EVENT_NOT_FOUND", diagnostics: {
        execution: "RECONCILE_CANCEL", postAttemptedInThisExecution: false, consult: { phase: "RECONCILE", httpStatus: 404 } } };
    },
  }, {}, pending);
  const response = await h.handler(request("RETRY_CANCEL", { retryRequestId: id(99) }));
  assert.equal(response.status, 200); assert.deepEqual(sequence, ["READ", "GET_PROBE", "RETRY_CLAIM", "EXPLICIT_SEND", "FINISH"]);
  assert.equal((await response.text()).includes("SENTINEL"), false);
});
Deno.test("manual retry without a validated missing-event GET never claims or dispatches", async () => {
  const h = harness({ executeCancellation: async (_c, _a, _row, reconcile) => {
    assert.equal(reconcile, true); return { state: "CANCELLATION_PENDING", code: "UNKNOWN" };
  } }, {}, { state: "CANCELLATION_PENDING", signedEventXml: "SIGNED_EVENT_SENTINEL" });
  assert.equal((await h.handler(request("RETRY_CANCEL", { retryRequestId: id(99) }))).status, 200);
  assert.deepEqual(h.calls.map(call => call.action), ["CANCEL_READ", "CANCEL_FINISH"]);
  assert.equal((await h.handler(request("RETRY_CANCEL", { retryRequestId: id(99), confirmed: false }))).status, 400);
});
Deno.test("replay of the extra retry lease performs GET-only recovery instead of another POST", async () => {
  const executions: boolean[] = [];
  const pending = { ...baseCancellation, state: "CANCELLATION_PENDING", signedEventXml: "SIGNED_EVENT_SENTINEL", retryUsed: true };
  const h = harness({ cancellation: async () => ({ ...pending, dispatch: false }),
    executeCancellation: async (_c, _a, _row, reconcile) => {
      executions.push(reconcile); assert.equal(reconcile, true);
      return { state: "CANCELLATION_PENDING", code: "REGISTERED_EVENT_NOT_FOUND", diagnostics: {
        execution: "RECONCILE_CANCEL", postAttemptedInThisExecution: false, consult: { phase: "RECONCILE", httpStatus: 404 } } };
    } }, {}, pending);
  assert.equal((await h.handler(request("RETRY_CANCEL", { retryRequestId: id(99) }))).status, 200);
  assert.deepEqual(executions, [true, true]);
});
Deno.test("local blockage during the additional dispatch preserves the original uncertain cancellation", async () => {
  const h = harness({ executeCancellation: async (_c, _a, _row, reconcile) => reconcile
    ? { state: "CANCELLATION_PENDING", code: "REGISTERED_EVENT_NOT_FOUND", diagnostics: {
      execution: "RECONCILE_CANCEL", postAttemptedInThisExecution: false, consult: { phase: "RECONCILE", httpStatus: 404 } } }
    : { state: "BLOCKED", code: "PREPARED_EVENT_SIGNATURE_MISMATCH" },
  }, {}, { state: "CANCELLATION_PENDING", signedEventXml: "SIGNED_EVENT_SENTINEL" });
  const result = await (await h.handler(request("RETRY_CANCEL", { retryRequestId: id(99) }))).json();
  assert.equal(result.data.state, "CANCELLATION_PENDING");
  assert.equal(h.calls.find(call => call.action === "CANCEL_FINISH")?.input &&
    (h.calls.find(call => call.action === "CANCEL_FINISH")?.input as Record<string, unknown>).state, "CANCELLATION_PENDING");
});
Deno.test("cancellation persists event before one claim and never exposes signed bytes", async () => {
  const h = harness();
  const response = await h.handler(request("CANCEL"));
  assert.equal(response.status, 200);
  assert.deepEqual(h.calls.map((c) => c.action), [
    "CANCEL_READ",
    "PREPARE_EVENT",
    "CANCEL_PREPARE",
    "CANCEL_CLAIM",
    "EXECUTE_CANCEL",
    "CANCEL_FINISH",
  ]);
  assert.equal(
    h.calls.find((c) => c.action === "EXECUTE_CANCEL")?.reconcile,
    false,
  );
  assert.equal((await response.text()).includes("SENTINEL"), false);
});
Deno.test("cancellation recovery is GET only and terminal proof is returned without another execution", async () => {
  const h = harness(
    {
      executeCancellation: async (_c, _a, _r, reconcile) => {
        assert.equal(reconcile, true);
        return { state: "BLOCKED" };
      },
    },
    {},
    {
      state: "PROCESSING",
      dispatch: false,
      signedEventXml: "SIGNED_EVENT_SENTINEL",
    },
  );
  const envelope = await (await h.handler(request("RECONCILE_CANCEL"))).json();
  assert.equal(envelope.data.state, "CANCELLATION_PENDING");
  const terminal = harness({}, {}, {
    state: "CANCELLED",
    result: { message: "Cancelada.", eventXml: "PRIVATE_SENTINEL" },
  });
  const response = await terminal.handler(request("RECONCILE_CANCEL"));
  assert.equal((await response.json()).data.state, "CANCELLED");
  assert.deepEqual(terminal.calls.map((c) => c.action), ["CANCEL_READ"]);
});

Deno.test("public issue and cancellation preserve bounded fiscal codes without exposing provider text or artifacts", async () => {
  const result = {
    message: "Retorno preservado.",
    codes: ["E0120", "X_123", {}, "not a code", "<secret>", "A".repeat(33)],
    rawMessage: "PROVIDER_PERSONAL_TEXT",
    signedDpsXml: "PRIVATE_XML",
    eventXml: "PRIVATE_EVENT",
  };
  const issued = harness({}, { state: "REJECTED", result });
  const envelope = await (await issued.handler(request("RECONCILE"))).json();
  assert.deepEqual(envelope.data.codes, ["E0120", "X_123"]);
  assert.equal(
    /PROVIDER_PERSONAL_TEXT|PRIVATE_XML|rawMessage|eventXml/.test(
      JSON.stringify(envelope),
    ),
    false,
  );
  const cancel = harness({}, {}, { state: "CANCELLATION_REJECTED", result });
  const response = await (await cancel.handler(request("RECONCILE_CANCEL")))
    .json();
  assert.deepEqual(response.data.codes, ["E0120", "X_123"]);
  const bounded = harness({}, {
    state: "REJECTED",
    result: { codes: Array(120).fill("E0120") },
  });
  assert.equal(
    (await (await bounded.handler(request("RECONCILE"))).json()).data.codes
      .length,
    100,
  );
});

Deno.test('out-of-scope ledger failure is 403 and never suggests uncertain dispatch', async () => {
  const denied = Object.assign(new Error('PRIVATE_SQL_DETAIL'), { code: 'INDIVIDUAL_OPERATION_SCOPE_DENIED' });
  const h = harness({ ledger: async () => { throw denied; } });
  const response = await h.handler(request('RECONCILE'));
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'INDIVIDUAL_OPERATION_SCOPE_DENIED' });
  assert.equal(h.calls.some(call => call.action === 'EXECUTE'), false);
});
